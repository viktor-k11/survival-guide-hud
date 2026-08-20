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
