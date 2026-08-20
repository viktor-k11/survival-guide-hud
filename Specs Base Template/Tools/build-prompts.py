#!/usr/bin/env python3
"""
Generate Assets/AI/prompts.generated.json from the .txt system prompts.

Why this exists: Lens Studio imports a .txt file as a `BinAsset`, which exposes
no way to read its contents from a script — only `JsonAsset.getString()` works.
So the prompts a human edits (.txt) cannot be the ones the Lens loads (.json).

The .txt files are the SINGLE SOURCE OF TRUTH. The .json is generated, and
`--check` fails when it is stale, so the two cannot silently drift.

Usage:
    python3 Tools/build-prompts.py           # regenerate
    python3 Tools/build-prompts.py --check   # exit 1 if stale (used by pre-commit)
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
AI_DIR = os.path.join(PROJECT, "Assets", "AI")
OUT = os.path.join(AI_DIR, "prompts.generated.json")

SOURCES = {
    "lesson": "lesson-system-prompt.txt",
    "qa": "qa-system-prompt.txt",
}


def build():
    payload = {
        "_generated": "Built by Tools/build-prompts.py. DO NOT EDIT. "
                      "Edit the .txt sources and re-run.",
        "_sources": SOURCES,
    }
    for key, filename in SOURCES.items():
        path = os.path.join(AI_DIR, filename)
        if not os.path.exists(path):
            print(f"FAIL: missing source {path}", file=sys.stderr)
            return None
        with open(path, "r", encoding="utf-8") as fh:
            payload[key] = fh.read()
    return payload


def main():
    check_only = "--check" in sys.argv
    payload = build()
    if payload is None:
        return 2

    rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    if check_only:
        if not os.path.exists(OUT):
            print(f"FAIL: {OUT} does not exist. Run: python3 Tools/build-prompts.py",
                  file=sys.stderr)
            return 1
        with open(OUT, "r", encoding="utf-8") as fh:
            current = fh.read()
        if current != rendered:
            print(
                "FAIL: Assets/AI/prompts.generated.json is stale — a .txt prompt "
                "changed but the generated mirror was not rebuilt.\n"
                "The Lens loads the .json, so shipping this would run the OLD prompt.\n"
                "Fix: python3 Tools/build-prompts.py && git add Assets/AI/prompts.generated.json",
                file=sys.stderr,
            )
            return 1
        print("OK: prompts.generated.json is up to date.")
        return 0

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(rendered)
    sizes = ", ".join(f"{k}={len(payload[k])}ch" for k in SOURCES)
    print(f"Wrote {OUT} ({sizes})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
