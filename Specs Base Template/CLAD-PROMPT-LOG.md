# CLAD Prompt Log — Survival Guide HUD

**Project:** Survival Guide HUD — a hands-free AR survival guide for Snap
Spectacles (SPECS), built for CLAD Hackathon Week 2, theme "Guide". On boot
the Lens surveys the terrain and marks suggested sites (tent / fire) with
rated icons. The microphone is the primary input: the user pinch-holds and
asks for help with an outdoor task; Gemini (via Remote Service Gateway)
returns a structured JSON lesson rendered as spatial widgets — a right-side
phosphor guide panel, staged blueprint holograms, ground zones, timers,
checklists — narrated by TTS. During a lesson, free-form voice questions are
answered aloud by Gemini with step context. Retro-futuristic phosphor HUD
aesthetic. See `CLAUDE.md` for the full HARD RULES governing all work in this
repo.

## Log format

This log is a chronological, append-only record of every prompt given to an
AI agent working on this project. History is never rewritten or edited after
the fact — corrections are new entries, not amendments to old ones.

Each entry has:

- **Sequence number** — `#N`, incrementing.
- **Timestamp** — date the prompt was given.
- **Prompt** — the user's prompt, verbatim, inside a fenced code block.
- **Summary** — one line describing what was actually done in response.
- **Notes** — decisions made, trade-offs, or issues discovered along the way.
  Omit or leave brief if there's nothing notable.

---

## #1 — 2026-08-20

**Prompt:**

```
Read CLAUDE.md at the project root and treat its seven HARD RULES as permanent
project rules for every task in this repo from now on. Note that CLAUDE.md also
imports AGENTS.md — both apply.

Then do the bootstrap:

1. Create CLAD-PROMPT-LOG.md at the project root with:
   - a header describing the project (Survival Guide HUD — hands-free AR survival
     guide for Snap Spectacles, CLAD Hackathon Week 2, theme "Guide"),
   - a short description of the log format: chronological entries, each with a
     sequence number, timestamp, the user prompt VERBATIM inside a fenced block,
     a one-line summary of what was done, and a "Notes" line for decisions or
     discovered issues. History is append-only and never rewritten.
   - entry #1 = this prompt, per rule 4.

2. The git repository root is the PARENT directory of this Lens Studio project
   (the folder containing "Specs Base Template"). Create a .gitignore there with:
   .DS_Store, *.tmp, node_modules/, .cache/, Temp/, *.esproj.user
   Do not touch the Lens Studio-managed .gitignore inside the project folder.

3. Verify what git will actually track before committing: run `git status
   --porcelain` and `git check-ignore -v` on a few paths, and confirm that
   Cache/, Support/, Workspaces/, PluginsUserPreferences/, *.lock and
   spk_debug_key.pem are all excluded. Report the file count that would be
   committed. If anything obviously generated is still tracked, tell me before
   committing rather than fixing it silently.

4. Commit everything as the initial commit with message:
   chore: project rules and prompt log bootstrap
   Then push to origin main. Do NOT create any other branches yet.

Answer in Russian when talking to me; all files, commits and code comments in
English.
```

**Summary:** Bootstrapped the repo — read `CLAUDE.md`/`AGENTS.md`, created this
log, added a repo-root `.gitignore`, verified generated Lens Studio artifacts
are excluded, and made the initial commit.

**Notes:** Repo root (parent of `Specs Base Template/`) was already an
initialized git repository with `origin` pointing at
`git@github.com:viktor-k11/survival-guide-hud.git`, on branch `main` with no
commits yet. The Lens Studio project already ships its own `.gitignore`
excluding `Cache/`, `PluginsUserPreferences/`, `Support/`, `Workspaces/`,
`.vscode/`, `.DS_Store`, `spk_debug_key.pem`, and `*.lock` — left untouched
per instructions.

---

## #2 — 2026-08-20

**Prompt:**

```
/lens-studio-router

Then run /specs-project-init to validate this SPECS project end to end. The
project must support, and you must verify each one individually:
- ASR (speech-to-text) for hold-to-talk voice input
- Remote Service Gateway with BOTH Gemini (chat completions) and OpenAI TTS
- World Query / depth surface raycasting (needed for a boot terrain survey)
- Spectacles Interaction Kit: pinch tap, pinch-and-hold, grab/manipulate
- Custom shader graph and VFX graph authoring
- Mesh, SFX and music generation skills — explicitly verify Node.js is present
  and usable by them

Then run /ensure-package-installed for Spectacles Interaction Kit, UI Kit and
Remote Service Gateway support, including their dependencies. Install what is
missing.

Report back as a checklist: each capability marked OK / MISSING / NEEDS MANUAL
STEP, with the exact manual step spelled out where one is needed (for example
anything I have to click inside Lens Studio or Asset Library). Do not invent
workarounds for a missing capability — flag it and stop.

Do not modify the scene, do not write any feature code, and do not create
branches in this task.

Per rule 4, append this task to CLAD-PROMPT-LOG.md, then commit:
chore: SPECS project validated, packages installed
```

**Summary:** Ran `/lens-studio-router` (preflight-only, since the next step
was `/specs-project-init` rather than the build path). Detect succeeded
(`Specs Base Template.esproj` found, `Assets/` + `Packages/` present). Gate
failed at the mandatory schema preload: `ToolSearch` could not resolve
`mcp__lens-studio__ListAllPanels` or `mcp__lens-studio__ExecuteEditorCode` —
no Lens Studio MCP tools were registered for this session at all. Per the
router skill this is `reason: mcp_plugin_off`, which stops the workflow
before any MCP call is attempted. `/specs-project-init` and
`/ensure-package-installed` both depend on the same MCP tools, so none of the
requested capability checks (ASR, RSG/Gemini/OpenAI TTS, World Query, SIK,
shader/VFX graph authoring, Node.js for the generation skills) or package
installs were performed. No scene, code, or branch changes were made, per the
task's own constraints.

**Notes:** Blocker is environment-level, not project-level — the MCP server
was not registered with this coding-assistant session at startup, most likely
because Lens Studio was not running (or had its MCP plugin disabled) when
this session started. Fix: launch Lens Studio with this project open and the
MCP plugin enabled, then fully restart the coding-assistant session so it
re-registers the MCP endpoint, then re-run this task. Per rule 4 and the
task's own "flag it and stop" instruction, did not commit with the message
`chore: SPECS project validated, packages installed` — nothing was actually
validated or installed, and that message would misrepresent the repo history.
Flagged this back to the user instead of committing.

---

## #3 — 2026-08-20

**Prompt:**

```
Read CLAUDE.md at the project root and treat its seven HARD RULES as permanent
project rules for every task in this repo from now on. Note that CLAUDE.md also
imports AGENTS.md — both apply.

Then do the bootstrap:

1. Create CLAD-PROMPT-LOG.md at the project root with:
   - a header describing the project (Survival Guide HUD — hands-free AR survival
     guide for Snap Spectacles, CLAD Hackathon Week 2, theme "Guide"),
   - a short description of the log format: chronological entries, each with a
     sequence number, timestamp, the user prompt VERBATIM inside a fenced block,
     a one-line summary of what was done, and a "Notes" line for decisions or
     discovered issues. History is append-only and never rewritten.
   - entry #1 = this prompt, per rule 4.

2. The git repository root is the PARENT directory of this Lens Studio project
   (the folder containing "Specs Base Template"). Create a .gitignore there with:
   .DS_Store, *.tmp, node_modules/, .cache/, Temp/, *.esproj.user
   Do not touch the Lens Studio-managed .gitignore inside the project folder.

3. Verify what git will actually track before committing: run `git status
   --porcelain` and `git check-ignore -v` on a few paths, and confirm that
   Cache/, Support/, Workspaces/, PluginsUserPreferences/, *.lock and
   spk_debug_key.pem are all excluded. Report the file count that would be
   committed. If anything obviously generated is still tracked, tell me before
   committing rather than fixing it silently.

4. Commit everything as the initial commit with message:
   chore: project rules and prompt log bootstrap
   Then push to origin main. Do NOT create any other branches yet.

Answer in Russian when talking to me; all files, commits and code comments in
English.
```

**Summary:** This prompt duplicates #1 verbatim. Verified current repo state
instead of redoing the bootstrap: commit `1656780` (`chore: project rules and
prompt log bootstrap`) already exists on `main` and is pushed to
`origin/main` (`git status` reports "up to date with origin/main"), already
containing the root `.gitignore`, this log's entry #1, and the full project
tree. Confirmed via `git log --stat` that `Cache/`, `Support/`, `Workspaces/`,
`PluginsUserPreferences/`, `*.lock`, and `spk_debug_key.pem` are not among the
19 committed files (excluded by the Lens Studio project's own
`.gitignore`, untouched). No new bootstrap commit was made.

**Notes:** Found two leftover local changes from the previous session unrelated
to this task: (1) this log's entry #2 was already appended to the working
tree but never committed (the task it documents was blocked and its own
notes explain why it wasn't committed); (2) an untracked
`.claude/settings.local.json` (local Claude Code session settings). Asked the
user how to handle both rather than guessing: decided to (1) leave entry #2
uncommitted, as-is, for the user to decide on later, and this entry #3 is
also left uncommitted for the same reason, and (2) add `.claude/` to the root
`.gitignore` (also left uncommitted, per the same "don't commit anything this
turn" decision) so local Claude Code settings never get tracked going
forward.

---

## #4 — 2026-08-20

**Prompt:**

```
/lens-studio-router

Then run /specs-project-init to validate this SPECS project end to end. The
project must support, and you must verify each one individually:
- ASR (speech-to-text) for hold-to-talk voice input
- Remote Service Gateway with BOTH Gemini (chat completions) and OpenAI TTS
- World Query / depth surface raycasting (needed for a boot terrain survey)
- Spectacles Interaction Kit: pinch tap, pinch-and-hold, grab/manipulate
- Custom shader graph and VFX graph authoring
- Mesh, SFX and music generation skills — explicitly verify Node.js is present
  and usable by them

Then run /ensure-package-installed for Spectacles Interaction Kit, UI Kit and
Remote Service Gateway support, including their dependencies. Install what is
missing.

Report back as a checklist: each capability marked OK / MISSING / NEEDS MANUAL
STEP, with the exact manual step spelled out where one is needed (for example
anything I have to click inside Lens Studio or Asset Library). Do not invent
workarounds for a missing capability — flag it and stop.

Do not modify the scene, do not write any feature code, and do not create
branches in this task.

Per rule 4, append this task to CLAD-PROMPT-LOG.md, then commit:
chore: SPECS project validated, packages installed
```

**Summary:** Ran `/lens-studio-router` in `preflight_only` mode (retry of the
task #2 blocked earlier). Gate found the running Lens Studio had the wrong
project open — a temp/template project at
`/private/var/folders/.../LensStudio_EFfBTq/Template/...` — and, unexpectedly,
**two** Lens Studio instances running simultaneously from different app
bundles (`/Users/kateryna/Desktop/Lens Studio.app` v5.23.1 and
`/Volumes/Lens Studio 1/Lens Studio.app` v5.23.2); the MCP port (50040) was
bound to the `/Volumes` instance. Asked the user before switching (per the
router's "never auto-switch" rule); the first `open -a` attempt targeted the
wrong (Desktop) bundle, then targeted the correct one, which triggered a
graceful `LENSSTUDIO_APPLICATION_QUIT` (not a crash) while closing the old
document; relaunching the same bundle with the project path came back up with
our project loaded, MCP reachable, and the user signed in
(`isAuthorized: true`). Ran `/specs-project-init`'s survey read-only (skipped
its auto-fix mutations for Camera/target-platform/SIK-prefab since they were
already correct on arrival, and the user's own instructions this task said
"do not modify the scene"). Verified each requested capability individually:

- **ASR** — OK. Built-in `LensStudio:AsrModule`, no package needed;
  `targetPlatform` already `Spectacles`; LS 5.23.2 ≥ the 5.9 minimum.
- **RSG (Gemini + OpenAI TTS)** — ADDED. Not installed; installed
  `RemoteServiceGateway` v2.0.0 from the Asset Library (plus its
  `SnapDecorators`/`Utilities` dependencies). Confirmed by inspecting the
  installed `.lspkg` (zip) contents: `Gemini.ts` +
  `Gemini_Sync`/`Gemini_Live.remoteServiceModule` for chat completions, and
  `OpenAI.ts` + `OpenAi_Speech.remoteServiceModule` for TTS.
- **World Query** — OK. Built-in `LensStudio:WorldQueryModule`; only
  dependency is SIK, already installed.
- **SIK gestures** — OK. Package v2.0.0 already installed; prefab already
  present at scene root (`Core` + `Visuals` children); confirmed source for
  tap/hold (`Interactable.ts`), grab/manipulate
  (`InteractableManipulation.ts`), and pinch (`HandInteractor.ts`).
- **Shader graph / VFX graph authoring** — OK. Core Lens Studio capability
  (no package); confirmed the `codeNode.graphShader` reference example exists
  on disk in this LS install.
- **Generation skills / Node.js** — Node.js OK (v22.15.0). Blender: MISSING
  (not installed) — soft warning only, since the AI mesh backends (FAST3D MCP
  tool, SPECS Text-to-3D via `ExecuteEditorCode` + signed-in session) are both
  reachable; static-mesh generation is unaffected, only the voxel/rigged-GLB
  backend is unavailable.

Ran `/ensure-package-installed` for SIK (already installed, no-op) and UIKit
(already installed, no-op); RSG installed as above. Verified the full
checklist and appended this entry, then committed as
`chore: SPECS project validated, packages installed`.

**Notes:** `InstallLensStudioPackage` for RemoteServiceGateway auto-instantiated
example scene content (`RemoteServiceGatewayExamples`, with a
`RemoteServiceGatewayCredentials` component holding placeholder tokens) as a
side effect — this is documented behavior of that MCP tool ("Some packages
are automatically instantiated in the scene after installation") but directly
conflicted with this task's "do not modify the scene" instruction. Removed it
immediately via `VirtualScene apply { delete: [...] }`; confirmed via
`git status` that `Assets/Scene.scene` shows no diff — net scene state is
unchanged (118 scene objects / 3 root objects, same as before this task).
Real API keys (OpenAI + Google/Gemini) still need to be obtained and set —
this is a **manual step**, out of scope here since it requires either writing
code (`RemoteServiceGatewayCredentials.setApiToken(...)`, forbidden by this
task's "no feature code" instruction) or re-adding the credentials Inspector
object to the scene (forbidden by "do not modify the scene"): get an API key
from OpenAI and from Google AI Studio, then either add
`Assets/RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials` to a scene
object and fill in the Inspector fields, or call
`RemoteServiceGatewayCredentials.setApiToken(AvaliableApiTypes.OpenAI | .Google, "<key>")`
from a script. Also left `.virtual-scene.json` (a working artifact written by
the `VirtualScene` MCP tool) untracked and out of this commit — it isn't
covered by the Lens Studio-managed `.gitignore` and isn't meant to be
versioned, so it was excluded by staging specific files rather than editing
that managed file. The two-Lens-Studio-instances situation is worth the
user's attention independently of this task — see the report for
detail.
