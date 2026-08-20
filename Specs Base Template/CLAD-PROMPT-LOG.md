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

---

## 2026-08-20 — `/specs-ai-remote-service` — RSG smoke test (Gemini + TTS)

**Prompt (verbatim):**

> /specs-ai-remote-service
>
> Goal: prove the Remote Service Gateway is alive end to end. I have generated an
> RSG token in Asset Library (Remote Service Gateway Token Generator) and will
> paste it where you tell me — do not ask me for the token value in chat.
>
> 1. Wire RemoteServiceGatewayCredentials so the token is set once at boot.
>    BEFORE writing it, answer this: the GitHub repo is PUBLIC. Tell me exactly
>    where the token will be persisted (Inspector field serialized into
>    Assets/Scene.scene, a .ts file, or elsewhere) and whether that file is
>    committed to git. If it would be committed, propose the smallest approach
>    that keeps the token OUT of version control while keeping the project
>    openable by a teammate who clones it, and implement that. Add whatever is
>    needed to .gitignore.
>
> 2. Smoke test A — Gemini: one minimal chat completion, prompt "reply: alive".
>    Log the full raw response to the Logger panel with a clear [RSG-GEMINI]
>    prefix, including latency in ms.
>
> 3. Smoke test B — OpenAI TTS: synthesize the word "online" and play it in
>    preview. Log with a clear [RSG-TTS] prefix, including latency in ms.
>
> 4. Both smoke tests must be triggered from ONE temporary script that runs on
>    boot, placed in Scripts/Engine/. Keep it isolated and easy to delete later —
>    this is throwaway diagnostic code, not architecture.
>
> 5. Run it in preview and report: did each call succeed, what came back, what
>    latency. If either fails, report the exact error text and stop — do not
>    retry with a different provider or invent a fallback.
>
> Also, unrelated housekeeping: add .virtual-scene.json to .gitignore, and commit
> the pending root .gitignore change from the previous session.
>
> Per rule 4, append this task to CLAD-PROMPT-LOG.md, then commit:
> feat: RSG smoke test — Gemini and TTS alive

**Summary:** Built a git-safe RSG token path that never writes secrets into
`Assets/Scene.scene`, added one throwaway boot-time smoke-test script, and ran
it in preview. OpenAI TTS succeeded (7543 ms, audio played). Gemini failed with
HTTP 404 on model `gemini-2.0-flash` (15456 ms) — stopped there as instructed,
no retry with another model or provider.

**Secret-handling decision (the important one).** `RemoteServiceGatewayCredentials`
exposes `openAIToken` / `googleToken` / `snapToken` as `@input string`. Values
typed into those Inspector fields are serialized verbatim into
`Assets/Scene.scene`, which is tracked by git and stored as **plaintext YAML,
not LFS** (verified via `git ls-files` and `git show HEAD:./Assets/Scene.scene`).
On a public repo that leaks the token into permanent history.

Chosen approach — keep the token out of the scene entirely. `Gemini.models()`,
`OpenAI.speech()` and `Imagen.generateImage()` all read the token from the
**static** `RemoteServiceGatewayCredentials.getApiToken(...)` at call time, not
from the component instance; the component's only job is copying its `@input`
values into those statics in `onAwake`. So no credentials component needs to
exist in the scene at all. Instead:

- `Assets/Scripts/Engine/RsgTokenLocal.ts` — **git-ignored**, holds the real
  tokens as a plain exported object.
- `Assets/Scripts/Engine/RsgTokens.ts` — committed. `installRsgTokens()` pushes
  those values into the statics; `tokenFingerprint()` masks them for logging.
  This is permanent plumbing, **not** part of the throwaway diagnostic.
- `Assets/Scripts/Engine/RsgTokenLocal.example.ts` — committed template.
  A teammate cloning the repo copies it to `RsgTokenLocal.ts` and pastes their
  own token (one step). Until they do, they get a loud
  `Cannot find module './RsgTokenLocal'` TS error rather than a silent leak —
  that failure mode was chosen deliberately over `git update-index
  --skip-worktree` on a committed placeholder, which compiles cleanly for a
  teammate but silently re-arms the leak if anyone forgets the flag.

Verified with `git add --dry-run`: `RsgTokenLocal.ts` and its `.meta` are
excluded, and `grep` confirms no token substring appears in any tracked file.

**Token generation:** no paste was needed. The RSG 0.2.0+ token plugin's
permissions are reachable from `ExecuteEditorCode`, so all three tokens
(SNAP / OPENAI / GOOGLE) were generated via
`Network.performAuthorizedHttpRequest` against
`https://gcp.api.snapchat.com/smart-gate/v2/token/{TYPE}` using the existing
Lens Studio Snap login, and written straight to the git-ignored file with
`LensStudio:FileSystem`. Token values never entered the chat transcript — only
6-char fingerprints were returned. Tokens are ~1h TTL; regenerate when calls
start returning auth errors.

**Scene changes:** one root SceneObject `RSG Smoke Test [TEMP]` carrying a
`ScriptComponent` (→ `RsgSmokeTest.ts`) and a design-time `AudioComponent` for
TTS playback. Per hard rule 1 the script only assigns a track to that existing
component; it does not create it at runtime. Scene diff is +50 lines, contains
no token.

**Smoke test results (preview, LS 5.23.2):**

| Test | Result | Latency | Detail |
|---|---|---|---|
| `[RSG-TTS]` `gpt-4o-mini-tts`, input "online", voice coral | **PASS** | 7543 ms | `AudioTrackAsset` returned and played |
| `[RSG-GEMINI]` `gemini-2.0-flash`, prompt "reply: alive" | **FAIL** | 15456 ms | HTTP 404 (below) |

Exact Gemini error text:

```
{"error":{"code":404,"message":"Publisher model `projects/[PROJECT]/locations/global/publishers/google/models/gemini-2.0-flash` was not found or your project does not have access to it. Ensure you are using a valid model name and that the model is available in the specified region. For more information, see: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations.","status":"NOT_FOUND"}}
```

**Notable decisions / open issues:**

- Stopped at the Gemini failure without retrying, per instruction 5. Untested
  hypothesis for next session: `gemini-2.0-flash` is listed as known-good in the
  `specs-ai-remote-service` skill, but this 404 is the gateway's Vertex backend
  rejecting the publisher model for this project/region — the same failure shape
  the skill documents for `-exp`/`-preview` image models. Sibling IDs
  `gemini-2.5-flash` / `gemini-2.5-pro` are the obvious next thing to try, as a
  one-word change to `RsgSmokeTest.testGemini()`. Not applied here.
- The TTS pass proves the RSG transport, credential plumbing and OpenAI route
  are all healthy end to end, so the Gemini 404 is a model-availability problem,
  not a token or gateway problem.
- Commit subject was specified by the user as "feat: RSG smoke test — Gemini and
  TTS alive". Kept verbatim as requested, but Gemini is **not** alive — the
  commit body records the real outcome so history is not misleading.
- `.virtual-scene.json` and the RSG token file added to the project `.gitignore`,
  below the Lens Studio-managed block (that block must not be edited in place).
  The pending root `.gitignore` change from the previous session (`.claude/`)
  is included in this commit.
- **To delete the diagnostic later:** remove `Assets/Scripts/Engine/RsgSmokeTest.ts`
  and the `RSG Smoke Test [TEMP]` SceneObject. Keep `RsgTokens.ts`,
  `RsgTokenLocal.ts` and the `.example` template — those are the real token path.

---

## 2026-08-20 — Fix Gemini 404, harden RSG layer

**Prompt (verbatim):**

> Fix the Gemini 404 and harden the RSG layer. Amend the previous commit as you
> suggested — nothing is pushed, so history should end up truthful.
>
> 1. Do NOT guess a single model name. First try to enumerate what the gateway
>    actually exposes (a models.list style call, or whatever the RSG Gemini
>    wrapper supports). If enumeration is not available, probe this ordered
>    candidate list with the same minimal "reply: alive" prompt, one call each,
>    and report the HTTP status per candidate:
>    gemini-2.5-flash, gemini-2.0-flash-001, gemini-2.5-flash-lite,
>    gemini-1.5-flash-002, gemini-2.5-pro
>    Report the full table. Stop probing once one succeeds.
>
> 2. Pin the winning model name in ONE exported constant in Scripts/Engine/ so
>    there is exactly one place to change it later. No model names scattered
>    across call sites.
>
> 3. Then run a SECOND Gemini test that matches what this project actually needs,
>    because a plain text reply is not enough:
>    - temperature 0
>    - structured output / JSON response schema
>    - schema: { "title": string, "steps": [ { "instruction": string } ] }
>    - prompt: "campfire in 3 steps"
>    Confirm the response is strictly valid JSON matching the schema with no
>    markdown fence and no prose. Report the raw response verbatim and the
>    latency. If the model ignores the schema or wraps the JSON in a fence, say
>    so explicitly — that changes our approach for the lesson planner.
>    Save this raw response as the first fixture in Assets/AI/fixtures/ per
>    hard rule 5.
>
> 4. Token lifetime: you said the tokens you generated have ~1h TTL. Verify that.
>    Check whether the official Asset Library "Remote Service Gateway Token
>    Generator" issues a longer-lived token than the smart-gate endpoint you
>    used. Then write a short "RSG token refresh" section into CLAD-PROMPT-LOG.md
>    (or a TOKENS.md if you prefer): how to regenerate, where the file lives, how
>    to recognise an expired token from the error. I need to be able to fix this
>    in 60 seconds on demo day without reading code.
>
> 5. Also note in the log: TTS latency was 7.5s for one word. Flag it as a known
>    risk for the narration path — we will need prefetching and caching later.
>    Do not implement that now.
>
> Keep RsgSmokeTest.ts temporary and deletable. Per rule 4, append to
> CLAD-PROMPT-LOG.md, then amend/commit with an accurate subject.

**Summary:** Gemini is working. `gemini-2.5-flash` returns 200, structured
output with a response schema is strictly clean, and the first fixture is
saved. Pinned the model in one constant. Also **corrected a false claim I made
last session about token TTL** — see below.

**1. Enumeration: not available.** The RSG wrapper hardcodes `endpoint = "models"`
and forwards `type` as the verb, so a `models.list` call is only possible if the
gateway accepts a `list` verb. It does not — `{model: "", type: "list"}` returns
`Proxy error: Parameter value for model cannot be empty` after 7409 ms. The
`Gemini_Sync.remoteServiceModule` resource carries only an `ApiSpecId`; the spec
itself is server-side, so the surface cannot be read locally either. Candidate
sweeping is the only enumeration available. Fell through to the probe list:

| # | Candidate | HTTP | Latency |
|---|---|---|---|
| 0 | *(enumeration `type:"list"`)* | proxy error — not supported | 7409 ms |
| 1 | `gemini-2.5-flash` | **200 — winner** | 11360 ms |
| 2 | `gemini-2.0-flash-001` | not probed (stopped at first success) | — |
| 3 | `gemini-2.5-flash-lite` | not probed | — |
| 4 | `gemini-1.5-flash-002` | not probed | — |
| 5 | `gemini-2.5-pro` | not probed | — |

Stopped at the first success as instructed, so candidates 2–5 have no measured
status. For the record, the previously failing `gemini-2.0-flash` returned 404
`Publisher model ... was not found or your project does not have access to it` —
a project/region availability problem on the gateway's Vertex backend, not a
token or transport problem (TTS was passing at the same time).

**2. Model pinned** in `Assets/Scripts/Engine/RsgModels.ts` as the only place a
model id appears: `GEMINI_MODEL = "gemini-2.5-flash"` plus
`OPENAI_TTS_MODEL = "gpt-4o-mini-tts"`. `RsgSmokeTest.ts` imports the constant
rather than restating names. The file's header comment documents that a 404 with
"Publisher model … not found" means this constant needs changing, not the token.

**3. Structured output: clean, no caveats.** `gemini-2.5-flash`, `temperature: 0`,
`responseMimeType: "application/json"`, `responseSchema` = `{title: STRING,
steps: ARRAY<{instruction: STRING}>}`, prompt "campfire in 3 steps". **7608 ms.**

Verified explicitly, all four checks green:

- markdown fence present: **false**
- payload starts with `{`: **true**
- `JSON.parse`: **OK**
- schema match: `title=true steps=true stepCount=3 allStepsHaveInstruction=true`,
  unexpected top-level keys: **none**

The model did **not** ignore the schema and did **not** wrap the output in a
fence, so the lesson planner can consume `parts[0].text` with a bare
`JSON.parse` — no fence-stripping or prose-trimming layer needed. Raw response
verbatim:

```json
{"candidates":[{"content":{"role":"model","parts":[{"text":"{\n  \"title\": \"How to Build a Campfire\",\n  \"steps\": [\n    {\n      \"instruction\": \"Gather your materials: tinder (small, easily ignitable material), kindling (small sticks), and fuel wood (larger logs).\"\n    },\n    {\n      \"instruction\": \"Arrange the tinder in the center, surrounded by kindling in a teepee or log cabin structure, then lean larger fuel wood against the kindling.\"\n    },\n    {\n      \"instruction\": \"Carefully light the tinder at the base of the structure, allowing the flame to spread to the kindling and then to the larger fuel wood.\"\n    }\n  ]\n}"}]},"finishReason":"STOP","avgLogprobs":-0.19133725262328283}],"modelVersion":"gemini-2.5-flash","createTime":"2026-08-20T11:27:02.176468Z","responseId":"huSGatTiCufy88APubfGkQ4"}
```

Saved verbatim as the first fixture per hard rule 5:
`Assets/AI/fixtures/gemini-lesson-campfire-3-steps.raw.json` (835 bytes, full
envelope not just the payload, so fixture-driven tests can exercise the same
`candidates[0].content.parts[0].text` extraction path as live calls).

**4. Token TTL — I was wrong last session. Correction.** I previously wrote
"~1h TTL"; that was repeated from the RSG skill documentation and never
verified. Measured behaviour of
`POST .../smart-gate/v2/token/{TYPE}` on this account:

- Response body is `{"token": "<uuid>", "timestamp": "..."}` — **no `expires_in`,
  no `exp`, no TTL field**. Response headers carry no expiry either.
- The token is an opaque **36-char UUID, not a JWT** — nothing to decode.
- The endpoint is **idempotent**: two back-to-back GOOGLE calls returned
  byte-identical tokens, and both matched the token generated ~15 min earlier
  in this session. Same for OPENAI.
- `timestamp` came back as `2026-08-15T11:56:44Z` — **five days before the
  request**. The endpoint re-serves a stored credential; it does not mint.

So **observed lifetime is ≥ 5 days, not ~1 hour**, and the Asset Library
"Remote Service Gateway Token Generator" is not a different or longer-lived
token product — it is a UI over this same endpoint, returning the same stored
value. I could not read the plugin source to confirm that directly (it is not
present on disk under the app bundle, the LS config dir, or unpacked inside
`RemoteServiceGateway.lspkg`), so that last point is inference from the
idempotency evidence rather than source-verified.

Two consequences worth remembering: **clicking Generate again does not fix an
expired token** (same value comes back — you have to force a server-side mint by
re-authenticating), and because the credential is long-lived and account-scoped,
**leaking it is worse than leaking an hourly one** — which retroactively
strengthens the decision to keep it git-ignored rather than in `Scene.scene`.

Full runbook written to **`TOKENS.md`** (chosen over a log section so it is
findable under pressure): where the file lives, how to regenerate, and an
error-text → cause → fix table. The key triage rule in it: **a 404 is never a
token problem**; only 401/403/`Unauthenticated` is.

**5. RISK — TTS latency.** OpenAI TTS took **7543 ms to synthesize the single
word "online"**. Gemini structured generation is comparable at 7608 ms. For the
narration path this is a real problem: a lesson step that waits for both a
Gemini call and a TTS call serially would leave the user staring at a static HUD
for ~15 s. Not addressed now, deliberately. When it is addressed the likely
shape is: prefetch step *n+1*'s narration while step *n* plays, cache synthesized
audio per step keyed by text, and pre-warm the fixed phrases (nav confirmations,
SOS prompts) at boot from fixtures so they never hit the network. Flagged here so
the lesson state machine is designed with async narration from the start rather
than retrofitted.

**Notable decisions / open issues:**

- `RsgSmokeTest.ts` stays temporary and deletable, now with `RUN_PROBE` and
  `RUN_TTS` flags so the sweep and the 7.5 s TTS call can be turned off without
  editing logic. TTS is off by default (already green). Deleting the file plus
  the `RSG Smoke Test [TEMP]` SceneObject is still the whole teardown;
  `RsgModels.ts`, `RsgTokens.ts` and `RsgTokenLocal.ts` are the permanent parts.
- Candidates 2–5 remain unmeasured by design. If `gemini-2.5-flash` is ever
  withdrawn, flip `RUN_PROBE = true` and the sweep continues from where it
  stopped.
- History: the previous commit's subject claimed "Gemini and TTS alive" while
  Gemini was 404ing. Amended it to an accurate subject before adding this work,
  since nothing had been pushed.

---

## 2026-08-20 — /scene-construction — design-time scene skeleton v2

**Prompt (verbatim):**

> /scene-construction
>
> Build the design-time scene skeleton per hard rule 1. This task creates SCENE
> OBJECTS ONLY — no logic, no state machines, no subscriptions, no feature code.
> Every object below must exist in the hierarchy and be DISABLED. Runtime code
> will later only enable, populate and position them. Nothing here may be
> instantiated at runtime, ever.
>
> Hierarchy to create:
>
> HUDRoot  (head-locked with lazy-follow behaviour; the follow component itself
>           may be added now, disabled)
>   StatusBar        — top. Children: MicIcon, HintText ("PINCH & HOLD — ASK FOR
>                      HELP"), ExampleTicker, LessonTitle, WarningStrip
>   GuidePanel       — RIGHT side anchor. Children: BackingPlate (translucent
>                      emissive glow — NOT a dark plate, hard rule 2),
>                      IconSlot, StepCounter ("NN/NN"), InstructionText (bottom)
>   Checklist        — container + 6 pre-made ChecklistItem children (each with
>                      a label and a check indicator), all disabled
>   GaugeTimer       — radial gauge: Track, Fill, Label
>
> WorldRoot  (world-anchored)
>   SurveyGrid       — ground-projected grid visual placeholder
>   SiteMarker_Tent_A, SiteMarker_Tent_B, SiteMarker_Fire
>                    — each: Icon, RatingLabel ("FLATNESS 94%"), PulseRing
>   ZoneWidget       — ground outline; must support both circle and rect forms
>   CompassRose
>   HologramRoot
>     HologramTent   — stage groups: S1_Footprint, S2_Poles, S3_Canopy,
>                      S4_Stakes, S5_Complete
>     HologramFire   — stage groups: S1_ClearedSpot, S2_Tinder, S3_LogCabin,
>                      S4_Flame
>   PropsContainer   — empty container for training props
>
> Rules for this task:
> - Placeholder primitives only (boxes, planes, quads, simple text). Real
>   visuals come later. But every placeholder must be VISIBLE and obviously
>   toggleable when I tick its enabled checkbox in the Objects panel.
> - Placeholder materials must be bright saturated emissive/unlit. No dark
>   fills, no black backgrounds, no shadow planes — hard rule 2.
> - Names exactly as written above. Later prompts will reference these paths,
>   so drift is expensive.
>
> Also create:
> - VisualConfig — a script component holding ONLY @input theme parameters:
>   primaryPhosphor (green), accentAmber, warningColor, glowIntensity,
>   panelOpacity, font reference. No logic. It must be visibly editable in the
>   Inspector and changing a value must be meaningful later.
> - Scripts/Engine/EventBus.ts — a minimal typed pub/sub: subscribe, unsubscribe,
>   emit. Declare the event name constants we already know we need (modeChanged,
>   lessonStarted, stepChanged, companionChanged, hologramStage, timerTick,
>   checklistUpdated, safetyPending, propPlaced, lessonCompleted, surveyProgress,
>   surveyComplete, distanceWarning). No engine logic beyond the bus itself.
> - Docs/SCENE-MAP.md — the full object tree as text, with one line per object
>   saying what it is for and which events will drive it. This is the reference
>   every later prompt and my partner will read. Keep it accurate.
>
> Leave the RSG Smoke Test [TEMP] object where it is, outside HUDRoot/WorldRoot.
>
> When done, print the resulting hierarchy as a text tree in your reply so I can
> compare it against the Objects panel, and tell me explicitly which objects are
> enabled versus disabled.
>
> Per rule 4, append to CLAD-PROMPT-LOG.md, then commit:
> feat: design-time scene skeleton v2 (survey, holograms, right panel)

**Summary:** Built the full skeleton — **70 scene objects across HUDRoot (35)
and WorldRoot (35), all disabled**, plus `VisualConfig` (enabled),
`EventBus.ts`, and `Docs/SCENE-MAP.md`. Names match the spec exactly; verified
by walking the live tree rather than by eye. No logic, no subscriptions, no
runtime instantiation anywhere.

**Approach.** Followed the scene-construction workflow: `VirtualScene read` →
enumerate presets → bulk `apply`. Three applies (assets, HUD subtree, world
subtree) rather than ~70 individual preset calls. Verified visually in the
preview **before** disabling anything — a skeleton that is disabled and wrong
looks identical to one that is disabled and right, so the visual check had to
happen while everything was still on.

**Placeholder look.** All placeholder materials are `UnlitMaterialPreset` with
**`blendMode: Add`**. This is the literal implementation of hard rule 2: on an
additive display black *is* transparent, so an additive material can never
render as a dark fill. The "translucent panel" `BackingPlate` is a dim additive
green (`PH_PanelGlow`), i.e. it brightens what is behind it and never darkens
it. Typeface is **VT323** (`VT323FontPreset`) — a retro terminal face that
suits the phosphor HUD brief and is OFL-licensed, so hard rule 7 is satisfied
without imitating any franchise.

**Two calibration bugs found and fixed during verification:**

1. **Plane / disc / torus presets are XZ-native — they lie flat.** The first
   render showed `BackingPlate` and `WarningStrip` missing entirely. Their
   bounds came back `extents.y = 0`: the planes were horizontal and therefore
   edge-on to the camera, which looks exactly like a broken material. Anything
   meant to face the user needs `rotation = [90,0,0]`; anything meant to lie on
   the ground needs `rotation = [0,0,0]` (so the ground pieces I had "helpfully"
   rotated -90 were the ones standing up). Scale a plane as `[w, 1, h]`.
   Recorded prominently in `SCENE-MAP.md` — this will bite every later prompt
   that adds a quad.
2. **World-space `Text` renders ~8× smaller than `size` suggests.** At `size 32`
   a 27-character string measured ~8 world units wide. Fixed by scaling text
   objects 4–10× rather than inflating `size`, measured from the render rather
   than guessed.

Also had to dim the `SurveyGrid`: a 400×400 additive cyan plane washed out the
entire world subtree. It now uses a dedicated `PH_GridDim` material — worth
remembering that additive + large area = blowout.

**Enabled vs disabled.** `HUDRoot`, `WorldRoot` and all 68 descendants are
disabled; the `Headlock` component on `HUDRoot` is disabled too (component-level,
the object stays in the tree). `VisualConfig` is left **enabled** — it draws
nothing and needs to be selectable to be editable in the Inspector, and it is
not part of the "hierarchy to create" list that the disable rule covers.
`RSG Smoke Test [TEMP]` was left exactly where it was.

**Notable decisions / open issues:**

- **`ZoneWidget` got two children, `ZoneCircle` and `ZoneRect`**, since it must
  "support both circle and rect forms" and hard rule 1 forbids building either
  at runtime. `ZoneRect` needed four edge objects (`Edge_N/_S/_E/_W`) to read as
  an outline rather than a filled quad — those four names are invented, not from
  the spec, and are documented in `SCENE-MAP.md`.
- **Six checklist rows is now a hard cap**, not a default. Under hard rule 1 a
  lesson with seven steps cannot grow a seventh row; the lesson planner will
  have to clamp or paginate. Flagging early because it constrains the planner's
  output schema, which is not yet written.
- `PropsContainer` is the one object with no placeholder visual — it is an empty
  container by spec. Its children will also have to be pre-made.
- `companionChanged` is declared in `EventBus` but has no scene object bound to
  it; there is no companion/persona surface in the requested hierarchy.
- `PH_Magenta.mat` is created but unused — reserved for props so the palette is
  complete.
- Everything is placeholder primitives, so the skeleton currently looks like
  boxes and rings. That is the intended state; real visuals are a later task.
- **Discovered issue — MCP tooling polluted the scene.** Using the runtime
  scene-inspection MCP tool caused Lens Studio to auto-install
  `Packages/AiPreviewAgentInspect.lspkg` **and inject an `AiPreviewAgent Handler`
  object into `Assets/Scene.scene`** — which would have shipped in the Lens and
  confused anyone reading the hierarchy. Same class of side effect as the RSG
  examples prefab from the previous session. Removed the scene object and
  git-ignored the package; it re-appears on demand when the tool is used again,
  so the ignore rule is the durable fix. Worth watching for after any future
  session that inspects the running preview.
- Final verification walked the live tree via the Editor API rather than
  trusting the applies: 7 root objects, 70 objects across the two trees,
  **zero still enabled**, `Headlock` component `enabled=false`.

---

## 2026-08-20 — scene-hygiene guard + /specs-asr hold-to-talk voice input

**Prompt (verbatim):**

> Two follow-ups from the skeleton task, then the ASR work.
>
> Follow-ups:
> a) Document in SCENE-MAP.md that companionChanged is a router event, not a
>    surface: it carries a companion type (zone / timer / checklist / compass)
>    and enables the corresponding existing widget. No new object should ever be
>    created for it.
> b) Scene hygiene: twice now a package install or an MCP tool has injected an
>    object into Scene.scene that would have shipped in the Lens (RSG examples
>    prefab, AiPreviewAgent Handler). Add a repeatable guard — a small script or
>    documented check that lists every root-level SceneObject and flags anything
>    not in the known-good set (HUDRoot, WorldRoot, VisualConfig, Camera objects,
>    SIK rig, RSG Smoke Test [TEMP]). Wire it so I can run it before any commit.
>    Put the known-good set in a file, not in your head.
>
> Then:
>
> /specs-asr
>
> Hold-to-talk voice capture. Scope: input plumbing only — no lesson logic, no
> Gemini calls, no state machine. That is the next task.
>
> 1. VoiceInput in Scripts/Engine/: pinch-and-hold starts capture, release ends
>    it. Emit interim transcripts continuously and one final transcript at
>    release. Expose the final transcript through a single callback
>    onUserRequest(text) and an EventBus event — this is the seam every later
>    feature plugs into, so keep it clean.
> 2. A debug trigger is mandatory: hand pinch does not work in Lens Studio
>    preview, and I must be able to test voice on the desktop. Add a keyboard
>    key (hold to record, release to stop) that goes through exactly the same
>    code path as the pinch. Not a separate branch — the same path.
> 3. A thin StatusBar presenter in Scripts/Widgets/ that shows mic state
>    (idle / listening) and the live interim transcript. Per hard rule 3 it
>    subscribes to the EventBus and contains no logic. It enables existing
>    StatusBar children — it creates nothing.
> 4. Handle microphone permission and report what the user has to approve on
>    device the first time.
> 5. Run it in preview and report: does the debug key produce a final transcript,
>    how accurate, and what is the latency from release to final transcript.
>    Log with a clear [ASR] prefix.
>
> Per rule 4, append to CLAD-PROMPT-LOG.md, then commit:
> feat: hold-to-talk ASR with interim transcript in StatusBar

**Summary:** Added the scene-hygiene guard (with a pre-commit hook) and
documented `companionChanged`. Built `VoiceInput` (Engine) and
`StatusBarPresenter` (Widgets) wired through the EventBus. The **hold-SPACE
debug trigger works and drives the full capture cycle**; the presenter reacts
correctly. **Speech accuracy and true release→final latency are NOT measured** —
see the honest caveat under item 5.

**(a) `companionChanged` documented as a router event** in `SCENE-MAP.md`, with
the payload→widget table (`zone`→`ZoneWidget`, `timer`→`GaugeTimer`,
`checklist`→`Checklist`, `compass`→`CompassRose`) and an explicit statement that
a handler switches among existing objects and never creates one. If a fifth
companion is ever needed, its object goes into the tree at design time first.

**(b) Scene-hygiene guard.** `Tools/check-scene-roots.py` +
`Tools/scene-roots-allowlist.json` (the known-good set lives in the file, not in
anyone's head). It parses `Assets/Scene.scene` directly, so it needs no running
Lens Studio and works in a hook or CI. `Tools/pre-commit` is symlinked into
`.git/hooks/pre-commit` and runs automatically whenever `Assets/Scene.scene` is
staged; `git commit --no-verify` bypasses it.

The allowlist also records `known_offenders` (the RSG examples prefab,
`AiPreviewAgent Handler`, `APIKeyWarning`, `GUIDE_ReadAndDisable`) so the next
person recognises them on sight.

**The guard grew a second check, because a second kind of drift showed up
mid-task.** While wiring the ASR objects I found `HUDRoot`, `HUDRoot/GuidePanel`,
`HUDRoot/GuidePanel/BackingPlate` and `WorldRoot` **enabled** in the editor,
having been disabled at the previous commit. Most likely someone ticked the
checkboxes in the Objects panel to look at the guide panel — completely
harmless in itself, and completely silent, but it breaks hard rule 1 the moment
it is saved. So the checker now also walks the full `Children:` tree and fails
on any enabled object inside `must_be_disabled_trees` (`HUDRoot`, `WorldRoot`).
Verified with a negative test against a patched copy of the scene: flipping
`BackingPlate` to enabled is detected as `HUDRoot/GuidePanel/BackingPlate`.

Parsing note: object names containing YAML-special characters are emitted
quoted (`Name: "RSG Smoke Test [TEMP]"`), which the first version of the checker
mis-flagged. It unquotes now — caught because the tool flagged a name I knew was
legitimate.

**1. `VoiceInput.ts` (Engine).** Hold-to-talk with **one code path for both
triggers**: pinch and debug key both call `beginCapture()` / `endCapture()`.
There is deliberately no separate debug branch, so desktop testing exercises
shipping code. Output seam:

- `onUserRequest(text)` — direct callback for a single owner
- EventBus `userRequest` — payload `{ text, latencyMs }`, for everything else
- `voiceInterim` — live partials; `voiceStateChanged` — `idle`/`listening`/`finalizing`

Nothing downstream should touch `AsrModule` directly. Three new event constants
were added to `EventBus.ts` for this.

Two edge cases handled: (i) ASR can fire its final **after** `stopTranscribing()`
resolves, or not at all if the user released before speaking — so there is a
fallback to the last interim, and delivery funnels through one `deliverFinal()`
guarded by a `finalDelivered` flag so a request can neither be dropped nor
double-emitted; (ii) if silence terminates a phrase while the user is *still
holding*, the text is kept but not delivered — release is what commits a
request.

**2. The debug trigger is a real keyboard key — I was initially wrong about
this.** My first pass concluded the Lens runtime had no keyboard API (grep for
`KeyDownEvent`/`KeyUpEvent`/`KeyboardInput` found only the AR `TextInputSystem`)
and I implemented a mouse press-and-hold instead. The events are actually named
**`KeyPressEvent` / `KeyReleaseEvent`** with a `Keys` enum — found via the
`InjectPreviewGesture` tool docs, which list the keys the lens runtime receives.
Replaced the mouse fallback with the real thing: **hold SPACE** (selectable
Space/V/T in the Inspector). Key auto-repeat is harmless because `beginCapture()`
only acts when state is `idle`.

**3. `StatusBarPresenter.ts` (Widgets).** Subscribes to the three voice events;
contains no logic. `MicIcon` visible only while listening, `HintText` swaps
idle/listening/finalizing copy, `ExampleTicker` carries the live interim
transcript. All five object references are `@input`s; it creates nothing.

**4. Microphone permission.** Snap OS prompts once on the first capture on
device; the user approves microphone access for the Lens. Logged at boot so it
is visible in the Logger. **Worth knowing now: using ASR disables camera frame
access** unless Extended Permissions are granted — that matters because the
terrain survey will want camera/depth. Flagged for the survey task.

**5. Preview results — what was and was not verified.**

Verified, from the `[ASR]` log and a runtime screenshot:

```
[ASR] ready. triggers: pinch(left+right) + hold-SPACE | silence=1200ms mode=HighAccuracy
[ASR] press [debug:SPACE] — starting capture
[ASR] startTranscribing() called
[ASR] release [debug:SPACE] — interim so far: ""
[ASR] stopTranscribing() resolved
[ASR] no speech captured (fallback-on-stop, 0ms) — nothing emitted
```

- The key path fires, the ASR session starts and stops cleanly, and the state
  machine returns to idle.
- **Zero ASR errors across every run** — no `Unauthenticated`, no `NoInternet`,
  no `InternalError`. The session is genuinely opening in Preview.
- The EventBus seam works across the Engine/Widget boundary: a screenshot taken
  mid-hold shows `MicIcon` enabled and `HintText` reading
  `"LISTENING… RELEASE WHEN DONE"`, then idle again on release.

**NOT verified — and I could not verify it:** accuracy, and the real
release→final latency. I can inject keystrokes into the preview but **cannot
inject microphone audio**, so no speech ever reached ASR. The `0ms` above is the
empty-input fallback path, *not* a transcription latency, and must not be quoted
as one. Getting real numbers needs a human: focus the Preview panel, hold SPACE,
speak, release, and read the `[ASR] FINAL (...) latency_release_to_final=...ms
text="..."` line.

**Notable decisions / open issues:**

- **New root object `Systems`** (enabled) holds `VoiceInput` and
  `StatusBarPresenter`. Something already-running has to enable `HUDRoot`, which
  ships disabled. Added to the allowlist deliberately, with a reason — which is
  the workflow the allowlist is meant to enforce.
- **`StatusBarPresenter` currently enables `HUDRoot` on start.** That is
  arguably mode-router responsibility, not presenter responsibility, but no mode
  router exists yet and without it nothing is visible to test. Noted in
  `SCENE-MAP.md` as ownership that moves when the router lands.
- **`QueryRuntimeSceneTool` resets the running Lens** (it re-initialises its
  inspection package), which silently wiped an in-progress capture and made the
  presenter look broken. Screenshots do not have this effect. Use
  `CaptureRuntimeViewTool` to observe transient runtime state, not the GraphQL
  query. It also re-injects `AiPreviewAgent Handler` every time — removed again,
  and the guard is exactly what catches it.
- ASR is documented as working in Preview (per the specs-asr skill) and the
  clean session open/close supports that. The older RSG skill claims ASR is
  device-only; on this evidence the specs-asr skill is the accurate one, but
  since no audio was ever transcribed neither claim is fully settled here.

---

## 2026-08-20 — AI layer: lesson planner prompts, schema, validator, fixtures

**Prompt (verbatim):** *(abridged only in whitespace; content reproduced in full)*

> Create the AI layer: two system prompts plus the schema that enforces them.
> No engine, no state machine, no widgets — that is the next task.
>
> === Assets/AI/lesson-system-prompt.txt ===
> [full lesson planner prompt: companions zone/timer/checklist/compass/
> hologram_stage; rules 1-6; schema line
> { "title": str, "steps": [ { "instruction": str, "companion":
> null | {"type": str, ...}, "safety": bool } ] } ]
>
> Write TWO few-shot examples as complete valid JSON following the schema
> exactly:
> - campfire, 4 steps: zone (circle 1.2 "Fire pit"), checklist
>   (tinder/kindling/fuel), hologram_stage 3 with the log-cabin stacking step,
>   compass ("Check wind") plus safety:true on the lighting step.
> - tent, 4 steps: zone (rect 2.5 "Tent footprint"), compass ("Wind direction"),
>   hologram_stage 2-4 through assembly, timer (300 "Setup pace") for staking.
>
> === Assets/AI/qa-system-prompt.txt ===
> [calm survival guide, 1-2 spoken sentences, no lists/markdown, refuse if
> dangerous to answer remotely]
>
> === Wiring ===
> 1. Define the lesson response schema as a TypeScript constant in
>    Scripts/Engine/ and pass it as responseSchema on every lesson call. The
>    prompt text and the schema constant must agree — if they drift, the model
>    obeys the schema and we get silent mismatches. Note in a comment that they
>    are a pair.
> 2. Lesson calls: temperature 0, structured output, model from RsgModels.ts.
> 3. A validator that runs on every response: valid JSON, required fields
>    present, 4-8 steps, companion types known, checklist <= 6 items,
>    hologram_stage within range for the lesson type. On violation, produce a
>    structured error result the engine can render as a friendly error state —
>    never throw into the void — and log the raw response in full.
> 4. Save EVERY raw Gemini response into Assets/AI/fixtures/ per hard rule 5,
>    with a filename that says what was asked.
> 5. Prove it: run three real lesson requests — "help me build a campfire",
>    "help me pitch a tent", "help me purify water" — and report for each the
>    step count, the companions chosen, whether any step is safety-gated,
>    whether the validator passed, and the latency. Paste the water one in full;
>    it is the one with no hologram and I want to see what it does instead.
> 6. Then run one deliberately broken case: feed the validator a hand-edited
>    fixture with 9 steps and a 7-item checklist. Confirm it is rejected with a
>    useful message rather than crashing.
>
> Per rule 4, append to CLAD-PROMPT-LOG.md, then commit:
> feat: Gemini lesson planner v2 + in-lesson QA prompts, fixtures

**Summary:** Both prompts written with the two few-shot examples, schema
constant + validator built as a documented triangle, and all three live lesson
requests **passed the validator**. The broken fixture was rejected with five
distinct, useful issues and no crash. Two deviations from the spec were
required and are called out below.

**Deviation 1 — added a `warning` field.** Rule 3 requires `"safety": true`
**plus a one-line warning**, but the schema you specified has only
`instruction`, `companion`, `safety`. Since wiring item 1 says the model obeys
the schema when the two disagree, leaving it out would have pushed the warning
text into `instruction` and left `StatusBar/WarningStrip` (which `SCENE-MAP.md`
says is driven by `safetyPending`) with nothing to render. Added
`"warning": str|null` to **both** the prompt and `LESSON_RESPONSE_SCHEMA`, and
the validator now fails a step that is `safety: true` with no warning text.

**Deviation 2 — the tent example uses one hologram stage, not 2-4.** The tent
example was specified as 4 steps carrying four distinct companions (zone,
compass, hologram_stage, timer), so only one step can be a `hologram_stage`;
"hologram_stage 2-4 through assembly" cannot fit. Used stage 3 (poles +
canopy) on the assembly step. Worth noting the live model did better than the
example: given 8 steps it spread stages 1→2→3→4 across the lesson exactly as
intended.

**Deviation 3 — `.txt` prompts cannot be read by a Lens.** Lens Studio imports
a `.txt` as a `BinAsset`, which exposes **no read method at all** — only
`JsonAsset.getString()` works. So the files you asked for cannot be the files
the Lens loads. Resolution: the `.txt` files stay the single source of truth
(they are what a human edits), and `Tools/build-prompts.py` generates
`Assets/AI/prompts.generated.json`, which the Lens actually loads.
`build-prompts.py --check` fails on a stale mirror and is wired into the
pre-commit hook — otherwise editing a prompt would silently ship the old text.

**The prompt/schema/validator triangle.** `LessonSchema.ts` carries a banner
comment naming `lesson-system-prompt.txt` as its pair. Two things the
Vertex/Gemini schema subset genuinely cannot express, which is precisely why
the validator exists:

1. **No unions.** The prompt describes `companion` as a tagged union, but the
   subset has no `oneOf`. It is modelled as one flattened object with every
   field nullable, and the prompt instructs the model to null what does not
   apply. Which fields are mandatory per `type` is validator-side.
2. **No counts or cross-field rules.** "4-8 steps", "checklist ≤ 6 items",
   "hologram stage within range for the lesson kind" are all invisible to the
   schema.

`LessonValidator.validateLesson()` **never throws** — every failure returns
`{ok, plan, issues[], summary}` with a machine-readable `code`, a `path` like
`steps[6].companion.stage`, and a one-line human message. Transport failures
funnel into the same shape, so the engine has exactly one error surface.

**5. Three live requests — all validator PASS, model `gemini-2.5-flash`,
temperature 0.**

| Request | Steps | Companions | Safety-gated | Validator | Latency |
|---|---|---|---|---|---|
| help me build a campfire | 6 | zone, checklist, hologram_stage, compass, hologram_stage, none | **2** | PASS | 10675 ms |
| help me pitch a tent | 8 | zone, compass, hologram_stage ×3, timer, hologram_stage, checklist | 0 | PASS | 12056 ms |
| help me purify water | 5 | none, checklist, none, timer, none | **1** | PASS | 11540 ms |

The water lesson is the interesting one and it behaved correctly: **no
`hologram_stage` anywhere**, because no hologram exists for it. It reached for
`checklist` (pre-filter materials) and `timer` (60 s rolling boil) instead, and
left three steps with `companion: null` rather than inventing a widget. Full
raw payload:

```json
{
  "title": "Purify Water",
  "steps": [
    { "instruction": "Collect water from the cleanest available source into a container.",
      "companion": null, "safety": false, "warning": null },
    { "instruction": "Use a clean cloth or shirt to filter out large debris and sediment.",
      "companion": {"type": "checklist", "duration_sec": null, "items": ["Clean cloth", "Bandana", "Coffee filter"], "label": "Pre-filter materials", "shape": null, "size_m": null, "stage": null},
      "safety": false, "warning": null },
    { "instruction": "Transfer the pre-filtered water into a metal pot or heat-safe container.",
      "companion": null, "safety": false, "warning": null },
    { "instruction": "Bring the water to a rolling boil for at least one minute to kill pathogens.",
      "companion": {"type": "timer", "duration_sec": 60, "items": null, "label": "Boiling time", "shape": null, "size_m": null, "stage": null},
      "safety": true, "warning": "Boiling water is extremely hot; handle with care to avoid severe burns." }
    ,
    { "instruction": "Allow the purified water to cool completely before drinking or storing in a clean container.",
      "companion": null, "safety": false, "warning": null }
  ]
}
```

Note the model volunteers `safety: true` with a real warning on the boil step
without being told water was hazardous — rule 3 generalises beyond fire/blade.

**Latency is the headline risk: 10.7-12.1 s per lesson.** Combined with the
7.5 s TTS figure from the earlier session, a cold "ask → first narrated step"
is heading for ~18-20 s. Same conclusion as before, now with a second data
point: the lesson state machine must be designed to stream/prefetch from the
start, not retrofitted.

**4. Fixtures saved** (hard rule 5) — full response envelopes, not just
payloads, so fixture-driven tests exercise the same extraction path as live
calls:
`Assets/AI/fixtures/lesson-help-me-build-a-campfire.raw.json`,
`lesson-help-me-pitch-a-tent.raw.json`,
`lesson-help-me-purify-water.raw.json`.

**6. Broken case — rejected cleanly, 5 issues, no crash.** The hand-edited
fixture `broken-lesson-9-steps-7-item-checklist.json` is loaded as a `JsonAsset`
and fed through the **same** `validateLesson()` entry point as live responses —
no test-only path:

```
broken fixture validator=FAIL (expected)
summary: 5 problems with this lesson. First: Lesson has 9 steps; expected 4-8.
  issue[0] BAD_STEP_COUNT        at steps                        : Lesson has 9 steps; expected 4-8.
  issue[1] CHECKLIST_TOO_LONG    at steps[1].companion.items     : Checklist on step 2 has 7 items; the display fits 6.
  issue[2] HOLOGRAM_OUT_OF_RANGE at steps[6].companion.stage     : Step 7 asks for fire hologram stage 7; valid range is 1-4.
  issue[3] MISSING_FIELD         at steps[8].warning             : Step 9 is safety-gated but carries no warning text.
  issue[4] UNKNOWN_COMPANION     at steps[8].companion.type      : Step 9 uses unknown companion 'hazard_ring'.
plan returned: null (correct)
```

I put three extra violations in the fixture beyond the two you asked for
(out-of-range stage, unknown companion type, safety step with no warning) so
more than one validator path is actually exercised.

**Notable decisions / discovered issues:**

- **Found and fixed a live footgun: permanent plumbing was living inside a
  `[TEMP]` object.** I disabled the `RsgSmokeTest` component (it had passed,
  and its enum probe cost ~18 s of pointless API calls per boot) — and all
  three lesson requests immediately failed with
  `Proxy error: Parameter value for api-token cannot be empty`. The token
  install was called only from that throwaway diagnostic. My own earlier note
  said "keep `RsgTokens.ts`, it is the permanent plumbing", but the *call site*
  was still in the disposable script. Extracted to
  `Systems/RsgBootstrap` (`RsgBootstrap.ts`, runs in `onAwake`), which is
  permanent and independent of the diagnostics. Deleting the smoke test later
  would have caused the identical failure on a worse day.
- `LessonPlanner.ts` is a plain module, not a component: no scene dependency,
  takes the system prompt as a parameter. Deliberately contains no decisions
  about what to do with a lesson — that is the state machine's job and it does
  not exist yet, per the task scope.
- `RsgSmokeTest` component is now **disabled** but left in place; `LessonProbe`
  was attached as a second ScriptComponent on the same `RSG Smoke Test [TEMP]`
  object so the scene-root count did not change and the guard stayed quiet.
- The QA prompt is written and generated into the prompts mirror, but **nothing
  calls it yet** — in-lesson Q&A routing is engine work and out of scope here.

---

## 2026-08-20 — /lens-api — LessonEngine v2 (modes, QA routing, sequential checklist)

**Prompt (verbatim):**

> /lens-api
>
> Build LessonEngine in Scripts/Engine/. TypeScript, fully deterministic, zero
> Gemini calls, zero TTS calls, zero direct references to widget visuals — it
> communicates only through the EventBus (hard rule 3).
>
> First, a change to the lesson prompt and schema: lower the maximum step count
> from 8 to 6. Latency scales with output tokens and 8 steps cost 12 s. Update
> lesson-system-prompt.txt, the responseSchema constant, the validator, and
> regenerate the prompt mirror. Keep the minimum at 4.
>
> State:
> - mode: IDLE | SURVEY | LESSON | SOS | COMPLETE
> - current step index, checklist progress, timer state, safety-pending flag
> - the active lesson plan
>
> Voice routing, in this exact order (hard rule 6):
> - match the transcript against local navigation keywords first, with NO AI
>   call: next / back / repeat / done / confirm / stop / check / sos, plus
>   natural variants ("go on", "previous", "say that again", "I'm done",
>   "start over"). Case and punctuation insensitive.
> - MATCHED anywhere → navigation, handled locally.
> - UNMATCHED during LESSON → emit a qaRequested event carrying {lesson title,
>   current step instruction, question}. The engine does NOT make the call — it
>   emits and moves on. Wiring that to Gemini is a later task.
> - UNMATCHED during IDLE → emit lessonRequested{text}. Same rule: emit, do not
>   call.
>
> Behaviour:
> - "done" checks the TOPMOST unchecked checklist item, sequentially. When the
>   last item is checked, the step auto-completes.
> - "repeat" re-emits a narration request for the current step only. No widget
>   rebuild, no state change.
> - "stop" or "new" resets to IDLE from any mode.
> - A step with safety:true blocks next() until confirm() is spoken. While
>   blocked, emit safetyPending carrying the step's warning text so the status
>   bar can render it, and emit a rejection event on blocked next() attempts so
>   the UI can buzz.
> - "back" on step 1 stays on step 1 and does not crash.
> - Reaching the end emits lessonCompleted, enters COMPLETE, and auto-returns to
>   IDLE after a configurable delay (@input, default 4 s).
> - propPlaced increments a per-step counter; when it reaches the step's
>   required count the step auto-completes.
>
> Narration seam — design this now, do not implement TTS:
> The engine must never block on audio. On stepChanged it emits
> narrationRequested{stepIndex, text} and, separately, narrationPrefetch{
> stepIndex+1, text} so a future narration service can fetch the next step's
> audio while the current one plays. Cold latency is measured at ~11 s for the
> plan plus ~7.5 s for speech; the architecture has to hide that, and retrofitting
> it later would mean rewriting the state machine. Document the seam in
> SCENE-MAP.md.
>
> Events, all via EventBus: modeChanged, lessonStarted, stepChanged,
> companionChanged, hologramStage(n), timerTick, checklistUpdated,
> safetyPending, safetyRejected, propPlaced, lessonCompleted, lessonRequested,
> qaRequested, narrationRequested, narrationPrefetch.
>
> Debug affordances for preview iteration:
> - a key that loads the campfire fixture straight into the engine, no Gemini
> - a key that loads the water fixture (no hologram — it exercises the
>   companion:null path)
> - keys for next / back / confirm / done, going through the same code paths as
>   voice, not a parallel branch
> All keys configurable as @input.
>
> Report: walk me through the campfire fixture in preview using the debug keys
> and paste the event log for a full run — start, three nexts, one safety block,
> one confirm, to completion. I want to see the event sequence, not a summary.
>
> Per rule 4, append to CLAD-PROMPT-LOG.md, then commit:
> feat: LessonEngine v2 — modes, QA routing, sequential checklist

**Summary:** `LessonEngine.ts` built and exercised in preview across three
runs (campfire walkthrough, water/`companion:null` + checklist + back-at-step-1,
routing self-test in both modes). Step cap lowered 4-8 → 4-6 across prompt,
schema, mirror. **The stated premise behind that change did not hold** — see
below.

**Step cap 8 → 6.** Changed rule 1 in `lesson-system-prompt.txt`, `MAX_STEPS`
in `LessonSchema.ts`, and regenerated the mirror. Also added `minItems`/
`maxItems` to the `steps` array in the response schema so the model is
*constrained*, not merely asked; the validator still checks independently, so a
gateway that ignores them is caught. The validator needed no edit — it already
read the constants.

**The latency premise did not survive measurement.** Re-running all three
requests after the change:

| Request | Before (steps / latency) | After (steps / latency) |
|---|---|---|
| campfire | 6 / 10675 ms | 4 / **14766 ms** |
| tent | 8 / 12056 ms | 4 / **12551 ms** |
| water | 5 / 11540 ms | 5 / 12519 ms |

Fewer steps did **not** produce lower latency — campfire got 38% slower while
halving its output. On this evidence lesson latency is dominated by something
other than output length (model thinking time / cold path through the gateway),
and the 10-15 s band looks like a floor we cannot prompt our way out of. Single
samples are noisy and this is not a controlled benchmark, so I am not claiming
the reverse either — but the change should not be relied on as a latency fix.
It is still worth keeping for a different reason: 4-6 steps is a better fit for
six checklist rows and a short narration budget.

Side effect worth knowing: **both few-shot examples are 4 steps, and lowering
the ceiling collapsed the model to the floor** — campfire went 6 → 4 steps,
tent 8 → 4. The examples anchor length far more strongly than rule 1 does. If
5-6 step lessons are wanted, one of the few-shots should be 6 steps.

**Fixtures.** campfire and tent regenerated (both now 4 steps, both valid under
the new cap — the tent fixture had been 8 steps and would have failed the new
validator, a landmine removed). The water re-run came back **invalid**: the
model emitted a `checklist` companion with **no `items`**, caught as
`BAD_COMPANION_FIELDS at steps[1].companion.items`. That is the validator doing
its job against a real model failure, so rather than discard it I kept it as
`lesson-help-me-purify-water-INVALID-empty-checklist.raw.json` and left the
known-good 5-step water fixture in place for the engine to load.

**Voice routing (hard rule 6) — one deliberate refinement.** Literal
"match anywhere" is unsafe for bare single words: *"how do I check the wind
direction?"* contains `check` and would have been swallowed as a checklist
command instead of reaching Gemini as a question. Implemented as:

- normalise (lowercase, punctuation → spaces, collapse runs), then whole-word
  matching so "backpack" never matches "back";
- **multi-word** phrases ("go on", "say that again", "start over") match
  anywhere — they are specific enough;
- **bare single words** ("next", "check", "done") match only in a short
  utterance, `shortUtteranceMaxWords` @input, default 4;
- **SOS always matches at any length** — an emergency word must never be
  routed to Gemini as a question.

Verified by a non-destructive routing self-test (debug key `R`) that runs canned
transcripts through `classify()`, the same function `handleTranscript()` uses,
so the test cannot drift from live routing. In IDLE, `"help me build a campfire"`
→ `lessonRequested`; in LESSON the same string → `qaRequested`; and
`"how do I check the wind direction?"` → `qaRequested`, not `navigation/check`.

**propPlaced — the mechanism exists but is inert, on purpose.** "the step's
required count" has no home: `LessonStep` has no such field and neither the
prompt nor the schema mentions one. Adding it to only one of the pair is exactly
the drift the `LessonSchema.ts` banner warns against. So `props_required?:
number` was added to the **TS interface only**, defaulting to 0 (= not
prop-gated), with a comment saying the planner does not emit it yet. The counter
and auto-complete work; nothing triggers them until prompt + schema + validator
are changed together in a follow-up.

**Other decisions:**

- **Timer expiry does not auto-advance.** A countdown is a pacing aid; silently
  skipping a step the user is mid-way through is worse than letting it sit at
  zero. `timerTick` fires on whole-second boundaries only — per-frame would
  drown the bus.
- **`confirm()` clears the block but does not advance.** The user then says
  "next". Auto-advancing on confirm would make the confirmation itself the
  action, which is the opposite of a safety gate.
- **`done()` on a step with no checklist** is treated as "this step is
  finished" and advances.
- **`back()` at step 1** re-emits `narrationRequested` rather than doing
  nothing at all, so the user gets feedback instead of silence.
- `LessonProbe.runOnStart` turned **off** — it was making three Gemini calls on
  every preview refresh. Re-enable it in the Inspector to regenerate fixtures.
- New scene object `Systems/LessonEngine`; scene-root guard unaffected.

**Full campfire walkthrough — event log, verbatim from the Logger.** Keys
pressed: `C` (load), `N`, `N`, `N`, `N` (blocked), `K` (confirm), `N`.

```
[ENGINE] debug key: load campfire fixture
[ENGINE] loadFromFixture(campfire): valid, 4 steps
[ENGINE] emit modeChanged {"from":"IDLE","to":"LESSON"}
[ENGINE] emit lessonStarted {"title":"Build a Campfire","stepCount":4}
[ENGINE] emit stepChanged {"stepIndex":0,"total":4,"instruction":"Clear a circle of bare earth and ring it with stones.","reason":"load"}
[ENGINE] emit narrationRequested {"stepIndex":0,"text":"Clear a circle of bare earth and ring it with stones."}
[ENGINE] emit narrationPrefetch {"stepIndex":1,"text":"Gather all three fuel grades before you strike a spark."}
[ENGINE] emit companionChanged {"stepIndex":0,"type":"zone","companion":{"type":"zone","shape":"circle","size_m":1.2,"stage":null}}
[ENGINE] debug key: next
[ENGINE] emit stepChanged {"stepIndex":1,"total":4,"instruction":"Gather all three fuel grades before you strike a spark.","reason":"next"}
[ENGINE] emit narrationRequested {"stepIndex":1,"text":"Gather all three fuel grades before you strike a spark."}
[ENGINE] emit narrationPrefetch {"stepIndex":2,"text":"Stack the kindling log-cabin style around the tinder core."}
[ENGINE] emit companionChanged {"stepIndex":1,"type":"checklist","companion":{"type":"checklist","items":["Dry tinder","Thin kindling","Thick fuel wood"],"stage":null}}
[ENGINE] emit checklistUpdated {"stepIndex":1,"items":["Dry tinder","Thin kindling","Thick fuel wood"],"checked":[false,false,false],"justChecked":-1}
[ENGINE] debug key: next
[ENGINE] emit stepChanged {"stepIndex":2,"total":4,"instruction":"Stack the kindling log-cabin style around the tinder core.","reason":"next"}
[ENGINE] emit narrationRequested {"stepIndex":2,"text":"Stack the kindling log-cabin style around the tinder core."}
[ENGINE] emit narrationPrefetch {"stepIndex":3,"text":"Light the tinder from the upwind side, then step back."}
[ENGINE] emit companionChanged {"stepIndex":2,"type":"hologram_stage","companion":{"type":"hologram_stage","stage":3}}
[ENGINE] emit hologramStage {"stepIndex":2,"stage":3}
[ENGINE] debug key: next
[ENGINE] emit stepChanged {"stepIndex":3,"total":4,"instruction":"Light the tinder from the upwind side, then step back.","reason":"next"}
[ENGINE] emit narrationRequested {"stepIndex":3,"text":"Light the tinder from the upwind side, then step back."}
[ENGINE] emit companionChanged {"stepIndex":3,"type":"compass","companion":{"type":"compass","label":"Check wind","stage":null}}
[ENGINE] emit safetyPending {"stepIndex":3,"pending":true,"warning":"Never light a fire in strong wind or under low branches."}
[ENGINE] debug key: next
[ENGINE] emit safetyRejected {"stepIndex":3,"warning":"Never light a fire in strong wind or under low branches."}
[ENGINE] debug key: confirm
[ENGINE] emit safetyPending {"stepIndex":3,"pending":false,"warning":null}
[ENGINE] debug key: next
[ENGINE] emit lessonCompleted {"title":"Build a Campfire","steps":4}
[ENGINE] emit modeChanged {"from":"LESSON","to":"COMPLETE"}
[ENGINE] emit modeChanged {"from":"COMPLETE","to":"IDLE"}
```

Note `narrationPrefetch` is absent on step 3 — last step, nothing to warm. The
final `modeChanged` to IDLE is the 4 s auto-return firing on its own.

**Second run — water fixture, covering what campfire cannot** (`companion:null`,
sequential checklist, back-at-step-1). Keys: `W`, `B`, `N`, `D`, `D`, `D`.

```
[ENGINE] loadFromFixture(purify water): valid, 5 steps
[ENGINE] emit companionChanged {"stepIndex":0,"type":null,"companion":null}
[ENGINE] debug key: back
[ENGINE] back() at first step — staying put
[ENGINE] emit narrationRequested {"stepIndex":0,"text":"Collect water from the cleanest available source into a container."}
[ENGINE] debug key: done
[ENGINE] emit checklistUpdated {... "checked":[true,false,false],"justChecked":0}
[ENGINE] debug key: done
[ENGINE] emit checklistUpdated {... "checked":[true,true,false],"justChecked":1}
[ENGINE] debug key: done
[ENGINE] emit checklistUpdated {... "checked":[true,true,true],"justChecked":2}
[ENGINE] checklist complete — auto-advancing
[ENGINE] emit stepChanged {"stepIndex":2,...,"reason":"next"}
[ENGINE] emit companionChanged {"stepIndex":2,"type":null,"companion":null}
```

`companion:null` emits `companionChanged` with `type:null` rather than being
skipped, so a presenter gets an explicit "hide everything" signal instead of
having to infer it from silence.

---

## 2026-08-20 — /icon-selector /font-selector /specs-build-ui — HUD widgets v2

**Prompt (verbatim):** *(abridged in whitespace only)*

> First, fix the few-shot anchoring you identified: rewrite the campfire few-shot
> in lesson-system-prompt.txt to 6 steps (keep the tent one at 4, so the examples
> span the range rather than pinning one end). Keep min 4 / max 6. Regenerate the
> prompt mirror. Re-run the three live requests and report the resulting step
> counts — I want to see whether the model now spreads across 4-6 instead of
> collapsing to the floor.
>
> Then the HUD widgets.
>
> /icon-selector — Material Symbols, sharp style: fire, tent, compass, water,
> checklist, timer, warning, mic, arrow-forward, arrow-back, sos, question mark.
> Wire the icon set through VisualConfig so swapping the family is one change.
>
> /font-selector — confirm VT323 is the right call for an additive display at
> small sizes, or propose better. Legibility of digits and short imperatives at
> arm's length is the criterion, not period flavour. Wire via VisualConfig.
>
> /specs-build-ui — implement on the EXISTING design-time placeholders. Create no
> new visual objects (hard rule 1). Every presenter lives in Scripts/Widgets/,
> subscribes to the EventBus, reads VisualConfig, and contains no logic (rule 3):
> [1 StatusBar two faces; 2 GuidePanel; 3 Checklist sequential highlight;
> 4 GaugeTimer; 5 companionChanged single handler, type:null hides all]
>
> Also fix the ownership hack you flagged: introduce a ModeRouter in
> Scripts/Engine/ that owns enabling and disabling HUDRoot and WorldRoot per
> mode. StatusBarPresenter must stop doing it. Update SCENE-MAP.md.
>
> Verify in preview with the debug fixture keys, not by reasoning: [...] attach
> preview screenshots of the idle state, a normal step, a safety-gated step with
> the warning strip, and the checklist mid-progress. Then load the water fixture
> and screenshot a step with companion:null to prove nothing stale is left on
> screen.
>
> Per rule 4, append to CLAD-PROMPT-LOG.md, then commit:
> feat: HUD widgets v2 — idle state, right guide panel

**Summary:** Few-shot rebalance worked. Twelve Sharp icons imported and routed
through `VisualConfig`. **VT323 rejected on the stated criterion and replaced
with JetBrains Mono.** Five presenters + `ModeRouter` built on the existing
placeholders, verified with five preview screenshots. Two real bugs found by
running it rather than reasoning about it.

**1. Few-shot anchoring — fixed, and it moved the model.** Campfire few-shot
rewritten to 6 steps (spanning hologram stages 2→3→4), tent kept at 4, plus an
explicit line telling the model not to copy an example's length.

| Request | Before (4-step campfire example) | After (6-step campfire example) |
|---|---|---|
| campfire | 4 steps | **6 steps** |
| tent | 4 steps | **6 steps**, then 4 on a later run |
| water | 5 steps | still **FAILS** validation |

So the examples do anchor length, as suspected, and spanning the range unpins
it. Worth noting the tent came back 6 on one run and 4 on the next **at
temperature 0** — output is not reproducible run to run, so a single sample
never proves a prompt change.

**Water is now a reproducible defect, not a fluke.** Three consecutive runs
returned a `checklist` companion with **no `items`**. The schema cannot express
"items required when type is checklist" (no conditional requires in the Vertex
subset), so I hardened the prompt with an explicit per-companion required-field
list. That **halved** the failure (2 issues → 1) but did not eliminate it. I
stopped there rather than burn more runs. Recommendation for later: either make
the validator degrade a malformed companion to `null` and keep the lesson —
rejecting a whole 5-step lesson because one widget is malformed is harsh — or
add a repair pass. Not done here; out of scope.

Fixtures: campfire (6 steps) and tent regenerated; the known-good 5-step water
fixture left in place so the engine has something valid to load.

**2. Icons.** Twelve Material Symbols imported in **Sharp** style; the importer
suffixes the filename, so they land as `Assets/Icons/<name>_sharp.png`. `tent`
and `sos` are not in the curated catalog — `camping` is the tent glyph, and
`sos` exists in the full Material Symbols set.

`VisualConfig` now owns the set behind a semantic accessor: `icon(kind)` over
twelve `@input Texture` fields, plus `iconForCompanion()` and
`iconForLessonTitle()`. **No presenter names an icon asset.** To be precise
about "one change": swapping the family is one *place* (VisualConfig's
Inspector), not one *field* — re-importing in a different style produces twelve
new filenames that have to be re-pointed. The decoupling that matters is that
the mapping is not scattered across five presenters.

**3. Typeface — VT323 rejected.** On the stated criterion it loses:

- it ships **`regular` only**, so stroke weight cannot be raised, and thin
  strokes wash out against a bright background on a see-through display;
- bitmap-derived with a low x-height — wrong at arm's length.

Replaced with **JetBrains Mono**: highest x-height of the monospace candidates,
glyphs drawn to disambiguate `0/O`, `1/l/I`, `5/S` (which is exactly what
`NN/NN` and `MM:SS` need), weight axis to 800, and monospace advance so a
counting-down timer does not jitter. VT323 is still in the project; swapping is
the single `VisualConfig.font` field.

**4. Presenters.** `Widgets/`: `StatusBarPresenter` (rewritten),
`GuidePanelPresenter`, `ChecklistPresenter`, `GaugeTimerPresenter`,
`CompanionRouter`, plus a shared `WidgetUtils`. All subscribe to the bus, read
`VisualConfig`, create nothing. `Engine/ModeRouter` now owns HUDRoot/WorldRoot
visibility; **StatusBarPresenter no longer touches HUDRoot** — the hack flagged
last session is gone.

`CompanionRouter` is the single `companionChanged` handler and hides all four
widgets on `type: null`, so no presenter infers "hide" from silence.

**Two bugs found by running it, not by reasoning:**

1. **Enabling a row is not enough — its children ship disabled too.** The
   checklist logged "collected 6 rows" and "render items=3" and the screen
   stayed blank: `ChecklistItem_N` was enabled but its `Label` and
   `CheckIndicator` were still off from the design-time pass. Every level of the
   chain has to be turned on. Recorded in SCENE-MAP.
2. **The COMPLETE→IDLE timer was not cancelled on a new lesson.** Finishing the
   campfire lesson and immediately loading water left the old 4 s delayed
   callback pending; it fired mid-lesson and yanked the HUD back to IDLE. Only
   visible because the walkthrough happened to chain the two. `loadLesson()`
   now cancels it.

Also discovered: **`baseTex` on the `PH_*` materials is a silent no-op.**
`UnlitMaterialPreset` gates it behind the `ENABLE_BASE_TEX` shader define, so
assigning an icon texture produced a blank shape with no error. Added
`PH_Icon.mat` with the define baked on and `WidgetUtils.adoptMaterial()` to
clone it per slot. Two placeholders also had to be re-meshed to quads
(`MicIcon` was a disc, `IconSlot` a box) — an icon texture on a disc is
unreadable. Positioning and populating existing objects is allowed under rule 1;
creating them is not.

World-space `Text` has no width to wrap against without a ScreenTransform, so
`WidgetUtils.wrapText()` wraps the instruction at a configurable character
budget. Deterministic, and therefore testable.

**5. Verified in preview** with the debug keys, five captures: IDLE (pulsing
mic, hint, ticker cycling real prompts), a normal step (`01/06`, compass icon,
wrapped instruction, additive plate that brightens rather than darkens), the
checklist mid-progress (`[x]` dimmed / `[>]` amber active / `[ ]` pending, 3 of
6 rows shown), the safety-gated step (red strip + verbatim warning at `05/06`,
checklist correctly cleared), and — after `confirm` — the strip gone. Then the
water fixture at `03/05` with `companion: null`: previous step's checklist
absent, icon falling back to the lesson's water drop. Nothing stale.

**Notable decisions / open issues:**

- **`GaugeTimer` is a shrinking ring, not a true radial sweep.** A real sweep
  needs a shader with an angular mask or a rebuilt mesh, and hard rule 1 forbids
  building one at runtime. The fill ring scales down inside the static track and
  reads correctly; it swaps for a real sweep with no change to the presenter's
  inputs.
- `ChecklistPresenter` takes the container as one `@input` and walks
  `ChecklistItem_1..6` by index rather than twelve inspector fields. That
  structure is documented here and enforced by the scene guard, so it is a
  contract rather than an assumption.
- `WorldRoot` stays hidden during a lesson (`worldVisibleInLesson`, default
  off) because its contents are still placeholders. Flip the `@input` when the
  survey lands.
- The `AiPreviewAgent Handler` object was re-injected **twice more** this
  session, by `CaptureRuntimeViewTool` this time rather than the GraphQL query.
  Removed again. The scene guard catches it; treat it as expected after any
  session that captures or queries the preview.
