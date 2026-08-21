#!/usr/bin/env python3
"""
Scene hygiene guard.

Lists every root-level SceneObject in Assets/Scene.scene and flags anything not
in Tools/scene-roots-allowlist.json.

Why: package installs and MCP tools inject root objects into the scene as a side
effect, silently. Twice now something that would have shipped in the Lens made
it as far as `git add` (the RemoteServiceGateway examples prefab, and
AiPreviewAgent Handler). Nothing errors - the object just rides along.

Reads the .scene file directly, so it needs no Lens Studio running and works in
a pre-commit hook or CI.

Usage:
    python3 Tools/check-scene-roots.py            # check, exit 1 if dirty
    python3 Tools/check-scene-roots.py --list     # just print the roots, always exit 0

Exit codes: 0 = clean, 1 = unexpected root found, 2 = could not parse.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
SCENE = os.path.join(PROJECT, "Assets", "Scene.scene")
ALLOWLIST = os.path.join(HERE, "scene-roots-allowlist.json")

SCENE_HEADER = re.compile(r"^- !<Scene/[0-9a-fA-F-]+>\s*$")
OWN_REF = re.compile(r"^\s*- !<own> ([0-9a-fA-F-]+)\s*$")
OBJECT_HEADER = re.compile(r"^- !<SceneObject/([0-9a-fA-F-]+)>\s*$")
NAME_FIELD = re.compile(r"^\s{2}Name: (.*)$")
ENABLED_FIELD = re.compile(r"^\s{2}Enabled: (\w+)\s*$")


CHILDREN_HEADER = re.compile(r"^\s{2}Children:\s*$")
SECTION_HEADER = re.compile(r"^\s{2}\w+:")


def parse_scene(path):
    """Return (ordered root uuids, {uuid: [name, enabled, [child uuids]]})."""
    with open(path, "r", encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    # Root uuids: the `objects:` list inside the top-level Scene node. Only that
    # first list counts - nested objects live under their own SceneObject nodes.
    roots = []
    in_scene = False
    in_objects = False
    for line in lines:
        if SCENE_HEADER.match(line):
            in_scene = True
            continue
        if in_scene and line.strip() == "objects:":
            in_objects = True
            continue
        if in_objects:
            m = OWN_REF.match(line)
            if m:
                roots.append(m.group(1))
                continue
            break  # list ended

    # Resolve uuid -> [name, enabled, children]
    objects = {}
    current = None
    in_children = False
    for line in lines:
        m = OBJECT_HEADER.match(line)
        if m:
            current = m.group(1)
            objects[current] = [None, None, []]
            in_children = False
            continue
        if not current:
            continue

        if CHILDREN_HEADER.match(line):
            in_children = True
            continue
        if in_children:
            c = OWN_REF.match(line)
            if c:
                objects[current][2].append(c.group(1))
                continue
            # `Components:` uses the same `- !<own>` shape, so leave the
            # Children list as soon as any other section starts.
            if SECTION_HEADER.match(line) or line.strip() == "[]":
                in_children = False

        n = NAME_FIELD.match(line)
        if n and objects[current][0] is None:
            raw = n.group(1).strip()
            # Names containing YAML-special characters (e.g. the brackets in
            # "RSG Smoke Test [TEMP]") are emitted quoted. Unquote them so
            # allowlist entries can be written as plain names.
            if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ("'", '"'):
                raw = raw[1:-1]
            objects[current][0] = raw
            continue
        e = ENABLED_FIELD.match(line)
        if e and objects[current][1] is None:
            objects[current][1] = e.group(1) == "true"

    return roots, objects


def collect_enabled(objects, uid, path, out):
    """Walk a subtree, recording the path of every object left enabled."""
    entry = objects.get(uid)
    if not entry:
        return
    name, enabled, children = entry
    here = f"{path}/{name}" if path else name
    if enabled:
        out.append(here)
    for child in children:
        collect_enabled(objects, child, here, out)


def main():
    list_only = "--list" in sys.argv

    if not os.path.exists(SCENE):
        print(f"FAIL: scene not found at {SCENE}", file=sys.stderr)
        return 2
    if not os.path.exists(ALLOWLIST):
        print(f"FAIL: allowlist not found at {ALLOWLIST}", file=sys.stderr)
        return 2

    with open(ALLOWLIST, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    allowed = set(config["allowed"])
    must_be_disabled = config.get("must_be_disabled_trees", [])
    must_be_disabled_roots = config.get("must_be_disabled_roots", [])

    roots, objects = parse_scene(SCENE)
    if not roots:
        print("FAIL: parsed zero root objects - the .scene format may have "
              "changed. Fix this checker rather than ignoring it.", file=sys.stderr)
        return 2

    print(f"Root-level SceneObjects in Assets/Scene.scene ({len(roots)}):")
    unexpected = []
    for uid in roots:
        name, enabled = objects.get(uid, [f"<unresolved {uid}>", None, []])[:2]
        ok = name in allowed
        state = "enabled" if enabled else "disabled"
        print(f"  {'ok ' if ok else 'BAD'}  {name}  ({state})")
        if not ok:
            unexpected.append(name)

    # A name in the allowlist that is gone is fine (things get deleted), but
    # worth surfacing so the allowlist does not rot.
    present = {objects.get(u, [None])[0] for u in roots}
    stale = sorted(allowed - present)
    if stale:
        print(f"\nnote: allowlisted but not in scene: {', '.join(stale)}")

    # Hard rule 1: these trees ship disabled. Runtime code enables them.
    # This drifts silently — ticking a checkbox in the Objects panel to look at
    # something is enough to break it, and nothing complains.
    left_enabled = []
    for tree_name in must_be_disabled:
        for uid in roots:
            if objects.get(uid, [None])[0] == tree_name:
                collect_enabled(objects, uid, "", left_enabled)

    if left_enabled:
        print(f"\nEnabled objects inside design-time-disabled trees ({len(left_enabled)}):")
        for p in left_enabled:
            print(f"  BAD  {p}")

    # Roots whose own Enabled flag must be off at commit time (children may stay
    # enabled — the root is the one switch). This exists for preview-only
    # content like DEMO_ENV: nothing structural keeps it out of a Lens build,
    # so the pre-commit hook is the tripwire.
    roots_left_enabled = []
    for tree_name in must_be_disabled_roots:
        for uid in roots:
            entry = objects.get(uid)
            if entry and entry[0] == tree_name and entry[1]:
                roots_left_enabled.append(tree_name)

    if roots_left_enabled:
        print(f"\nPreview-only roots left ENABLED ({len(roots_left_enabled)}):")
        for p in roots_left_enabled:
            print(f"  BAD  {p}")

    if list_only:
        return 0

    if roots_left_enabled:
        print(
            "\nFAIL: the root(s) above are preview-only content and must be\n"
            "DISABLED before a commit (they would ship enabled in a Lens build\n"
            "made from this commit - nothing else keeps them off a device).\n"
            "Untick the root object in the Objects panel, save, and re-run.\n"
            "Roots enforced: " + ", ".join(must_be_disabled_roots),
            file=sys.stderr,
        )
        return 1

    if left_enabled:
        print(
            "\nFAIL: the object(s) above are inside a tree that must ship disabled\n"
            "(hard rule 1: runtime code only enables what already exists).\n"
            "Usually this is just a checkbox ticked in the Objects panel while\n"
            "inspecting the scene. Untick it, save, and re-run.\n"
            "Trees enforced: " + ", ".join(must_be_disabled),
            file=sys.stderr,
        )
        return 1

    if unexpected:
        print(
            "\nFAIL: unexpected root object(s): "
            + ", ".join(repr(n) for n in unexpected)
            + "\n\nSomething added these to the scene - usually a package install or an\n"
              "MCP tool doing it as a side effect. Decide which:\n"
              "  - Not yours? Delete it in Lens Studio, save, and re-run. It would\n"
              "    otherwise ship inside the published Lens.\n"
              "  - Deliberate? Add it to Tools/scene-roots-allowlist.json WITH a note\n"
              "    saying what it is and who owns it.\n"
              "See 'known_offenders' in the allowlist for ones already seen.",
            file=sys.stderr,
        )
        return 1

    print("\nOK: scene roots clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
