# SCENE-MAP

The design-time object tree. **Every later prompt should read this first.**
Paths here are stable contracts — renaming an object breaks the code that
looks it up, so treat these names as API.

## Ground rules this tree encodes

- **Hard rule 1 — design-time first.** Every visual object below already exists
  and is **disabled**. Runtime code only *enables, populates and positions*
  them. Nothing here may be instantiated at runtime.
- **Hard rule 2 — additive display.** Every placeholder material uses
  `blendMode: Add`. On the waveguide, black is transparent; there are no dark
  fills, no backing plates that darken, no shadow planes. "Translucent panel"
  = a dim additive glow (`PH_PanelGlow`), never a darkening plate.
- **Hard rule 3 — engine/presentation split.** The "Driven by" column names the
  `EventBus` event that will drive each object. Widgets subscribe; engine code
  emits. Engine never touches these objects directly.

## Enabled / disabled state

| Object | State |
|---|---|
| `HUDRoot` + all 34 descendants | **disabled** |
| `WorldRoot` + all 34 descendants | **disabled** |
| `Headlock` component on `HUDRoot` | **disabled** (component, not object) |
| `VisualConfig` | **enabled** — config holder, draws nothing |
| `RSG Smoke Test [TEMP]` | **enabled** — throwaway diagnostic, untouched |
| `Camera Object`, `Lighting`, `SpectaclesInteractionKit` | enabled — stock |

> **To see a placeholder in the viewport you must enable its whole ancestor
> chain**, e.g. `HUDRoot` → `GuidePanel` → `BackingPlate`. Ticking a leaf alone
> shows nothing because its parents are still off. `HUDRoot` and `WorldRoot`
> are the two master switches.

## Placeholder assets

Bright, saturated, additive. Real visuals replace these later; the names are
`PH_` prefixed so they are easy to find and delete.

| Asset | Use |
|---|---|
| `PH_Plane.mesh` `PH_Box.mesh` `PH_Disc.mesh` `PH_Torus.mesh` `PH_Cylinder.mesh` | placeholder geometry |
| `PH_PhosphorGreen.mat` | primary phosphor — default HUD chrome |
| `PH_Amber.mat` | accent — counters, active stage, fire markers |
| `PH_Warning.mat` | warnings, flame |
| `PH_Cyan.mat` | holograms, zones, survey |
| `PH_Magenta.mat` | spare (unused; reserved for props) |
| `PH_PanelGlow.mat` | the translucent guide-panel glow — dim additive green |
| `PH_GridDim.mat` | survey ground tint, kept dim so it does not blow out the scene |
| `VT323.ttf` | HUD typeface — OFL licensed, no third-party IP (hard rule 7) |

> **Geometry gotcha, cost us a rebuild:** `PlaneMeshPreset`, `DiscMeshPreset`
> and `TorusMeshPreset` are all **XZ-native (they lie flat)**. To face the user
> a plane/disc/torus needs `rotation = [90, 0, 0]` (or `[-90,0,0]`); to lie on
> the ground it needs `rotation = [0, 0, 0]`. A flat plane viewed head-on is
> invisible, which looks exactly like a broken material. Scale a plane as
> `[width, 1, height]`, not `[width, height, 1]`.

---

## HUDRoot — head-locked, lazy-follow

`HUDRoot` carries SIK's `Headlock` component (disabled). Its easing inputs are
the lazy-follow behaviour; enable the component and tune
`xzEasing` / `yEasing` / `pitchEasing` / `yawEasing` in the Inspector.
Local origin sits 60 cm in front of the user.

| Path | What it is | Driven by |
|---|---|---|
| `HUDRoot` | Head-locked HUD container; the master switch for all 2D-ish chrome | `modeChanged` |
| `HUDRoot/StatusBar` | Top strip: persistent state + the always-available voice affordance | `modeChanged` |
| `HUDRoot/StatusBar/MicIcon` | Mic state indicator — idle / listening / thinking | `modeChanged` |
| `HUDRoot/StatusBar/HintText` | `"PINCH & HOLD — ASK FOR HELP"`; the standing instruction in IDLE | `modeChanged` |
| `HUDRoot/StatusBar/ExampleTicker` | Rotating example prompts so the user learns what they can ask | `modeChanged` |
| `HUDRoot/StatusBar/LessonTitle` | Title of the active lesson; empty in IDLE | `lessonStarted`, `lessonCompleted` |
| `HUDRoot/StatusBar/WarningStrip` | Full-width alert bar for safety gates and range warnings | `safetyPending`, `distanceWarning` |
| `HUDRoot/GuidePanel` | **Right-side** phosphor guide panel — the primary lesson surface | `lessonStarted`, `stepChanged` |
| `HUDRoot/GuidePanel/BackingPlate` | Translucent emissive glow behind the panel. **Additive glow, never a dark plate** | `lessonStarted` (+ `VisualConfig.panelOpacity`) |
| `HUDRoot/GuidePanel/IconSlot` | Per-step pictogram slot | `stepChanged` |
| `HUDRoot/GuidePanel/StepCounter` | `"NN/NN"` progress readout | `stepChanged` |
| `HUDRoot/GuidePanel/InstructionText` | Step instruction text, anchored to the panel bottom | `stepChanged` |
| `HUDRoot/Checklist` | Container for the six pre-made checklist rows | `checklistUpdated` |
| `HUDRoot/Checklist/ChecklistItem_1..6` | One row each. **Six is the hard cap** — no runtime instantiation (hard rule 1). Lessons with fewer items leave the surplus rows disabled | `checklistUpdated` |
| `HUDRoot/Checklist/ChecklistItem_N/CheckIndicator` | The tick box for that row | `checklistUpdated` |
| `HUDRoot/Checklist/ChecklistItem_N/Label` | The row's text | `checklistUpdated` |
| `HUDRoot/GaugeTimer` | Radial countdown for timed steps (steeping, boiling, curing) | `timerTick` |
| `HUDRoot/GaugeTimer/Track` | Static full ring — the 100% reference | `timerTick` |
| `HUDRoot/GaugeTimer/Fill` | Progress ring, scaled/swept against `Track` | `timerTick` |
| `HUDRoot/GaugeTimer/Label` | `"MM:SS"` remaining | `timerTick` |

## WorldRoot — world-anchored

Origin is at floor level, 120 cm below eye height. Everything under here is
placed against real terrain, not the head.

| Path | What it is | Driven by |
|---|---|---|
| `WorldRoot` | World-anchored container; master switch for all terrain content | `surveyComplete` |
| `WorldRoot/SurveyGrid` | Ground-projected scan grid shown while the terrain survey runs | `surveyProgress`, `surveyComplete` |
| `WorldRoot/SiteMarker_Tent_A` | Best-rated tent site | `surveyComplete` |
| `WorldRoot/SiteMarker_Tent_B` | Runner-up tent site — gives the user a real choice | `surveyComplete` |
| `WorldRoot/SiteMarker_Fire` | Suggested fire site | `surveyComplete` |
| `WorldRoot/SiteMarker_*/Icon` | The site's pictogram | `surveyComplete` |
| `WorldRoot/SiteMarker_*/RatingLabel` | Score readout, e.g. `"FLATNESS 94%"` | `surveyComplete` |
| `WorldRoot/SiteMarker_*/PulseRing` | Ground ring that pulses to draw attention / signal range | `surveyComplete`, `distanceWarning` |
| `WorldRoot/ZoneWidget` | Ground outline marking a work area. **Supports both forms** — enable exactly one child | `stepChanged`, `propPlaced` |
| `WorldRoot/ZoneWidget/ZoneCircle` | Circular form (ring) | `stepChanged` |
| `WorldRoot/ZoneWidget/ZoneRect` | Rectangular form; group of four edges | `stepChanged` |
| `WorldRoot/ZoneWidget/ZoneRect/Edge_N,_S,_E,_W` | The four sides of the rect outline | `stepChanged` |
| `WorldRoot/CompassRose` | Ground compass for orientation and "walk that way" cues | `distanceWarning` |
| `WorldRoot/HologramRoot` | Container for staged blueprint holograms | `hologramStage` |
| `WorldRoot/HologramRoot/HologramTent` | Tent blueprint. Stage groups are **mutually exclusive** — enable one, disable the rest | `hologramStage` |
| `…/HologramTent/S1_Footprint` | Stage 1 — ground footprint | `hologramStage` |
| `…/HologramTent/S2_Poles` | Stage 2 — pole frame | `hologramStage` |
| `…/HologramTent/S3_Canopy` | Stage 3 — canopy over the frame | `hologramStage` |
| `…/HologramTent/S4_Stakes` | Stage 4 — staking out | `hologramStage` |
| `…/HologramTent/S5_Complete` | Stage 5 — finished tent | `hologramStage`, `lessonCompleted` |
| `WorldRoot/HologramRoot/HologramFire` | Fire-lay blueprint, same mutually-exclusive staging | `hologramStage` |
| `…/HologramFire/S1_ClearedSpot` | Stage 1 — cleared ground | `hologramStage` |
| `…/HologramFire/S2_Tinder` | Stage 2 — tinder bundle | `hologramStage` |
| `…/HologramFire/S3_LogCabin` | Stage 3 — log-cabin stack | `hologramStage` |
| `…/HologramFire/S4_Flame` | Stage 4 — lit flame | `hologramStage`, `lessonCompleted` |
| `WorldRoot/PropsContainer` | Empty container for training props. **The only object here with no visual** — props get parented under it, but they must be pre-made children, never runtime-instantiated | `propPlaced` |

## Outside the two roots

| Path | What it is |
|---|---|
| `VisualConfig` | `VisualConfig.ts` — theme `@input`s only: `primaryPhosphor`, `accentAmber`, `warningColor`, `glowIntensity`, `panelOpacity`, `font`. No logic, no subscriptions. Enabled so it is editable in the Inspector. |
| `Systems` | **Enabled** container for runtime controllers. Has to be enabled: `HUDRoot` and `WorldRoot` ship disabled, so something already running must turn them on. |
| `Systems/RsgBootstrap` | `Engine/RsgBootstrap.ts` — installs the RSG tokens in `onAwake`. **Permanent.** Must stay enabled and must run before anything that calls Gemini/OpenAI. |
| `Systems/VoiceInput` | `Engine/VoiceInput.ts` — hold-to-talk capture. Pinch, or hold the debug key. Emits `voiceStateChanged` / `voiceInterim` / `userRequest`. |
| `Systems/LessonEngine` | `Engine/LessonEngine.ts` — the state machine. Subscribes to `userRequest`, routes it, owns mode/step/checklist/timer/safety. Deterministic: no Gemini, no TTS, no widget references. Debug keys C/W/N/B/K/D/R. |
| `Systems/StatusBarPresenter` | `Widgets/StatusBarPresenter.ts` — drives `StatusBar`. Subscribes to the bus, enables existing children, writes text. No logic. |
| `RSG Smoke Test [TEMP]` | Throwaway diagnostics. Carries **two** ScriptComponents: `RsgSmokeTest.ts` (now **disabled** — it passed, and it cost ~18s of API calls per boot) and `LessonProbe.ts` (the lesson-planner proving run). Delete the object and both scripts when done — see `TOKENS.md`. |

> **Do not put permanent plumbing inside a `[TEMP]` object.** Token installation
> used to live in `RsgSmokeTest.ts`; disabling that component silently broke
> every Gemini call with `Proxy error: Parameter value for api-token cannot be
> empty`. That is why `Systems/RsgBootstrap` exists.

> `StatusBarPresenter` currently enables `HUDRoot` on start, because something
> has to and no mode router exists yet. **That ownership moves to the mode
> router** when it lands — a presenter should not be deciding that the HUD is
> visible.

## Event vocabulary

Declared in `Assets/Scripts/Engine/EventBus.ts` as `Events`:

`modeChanged` · `lessonStarted` · `stepChanged` · `companionChanged` ·
`hologramStage` · `timerTick` · `checklistUpdated` · `safetyPending` ·
`propPlaced` · `lessonCompleted` · `surveyProgress` · `surveyComplete` ·
`distanceWarning`

### `companionChanged` is a ROUTER event, not a surface

It has **no object of its own and must never get one.** It carries a companion
*type* — `zone` | `timer` | `checklist` | `compass` — and its only job is to
enable the corresponding widget that already exists in this tree:

| Payload type | Enables |
|---|---|
| `zone` | `WorldRoot/ZoneWidget` (then one of `ZoneCircle` / `ZoneRect`) |
| `timer` | `HUDRoot/GaugeTimer` |
| `checklist` | `HUDRoot/Checklist` |
| `compass` | `WorldRoot/CompassRose` |

A handler for this event switches among those four; it does **not** create
anything. If a future step seems to need a fifth companion, the object for it
must be added to this tree at design time first (hard rule 1) and documented
here — never instantiated in response to the event.

## The narration seam

**The engine must never block on audio.** This is an architectural constraint,
not an optimisation, and it is why the seam is shaped this way from the start.

Measured cold latencies: **~11-15 s** for a lesson plan from Gemini, **~7.5 s**
for one word of TTS. Done naively — ask, wait for the plan, wait for speech,
then speak — the user stares at a static HUD for the better part of twenty
seconds. Retrofitting the fix later would mean rewriting the state machine,
because "wait for audio" tends to get baked into the step transition.

So `LessonEngine` emits **two** events on every step entry and waits for
neither:

| Event | Payload | Meaning |
|---|---|---|
| `narrationRequested` | `{stepIndex, text}` | Speak this now. |
| `narrationPrefetch` | `{stepIndex + 1, text}` | Warm the next step's audio while this one plays. |

`narrationPrefetch` is **not** emitted on the last step — there is nothing to
warm. A future narration service is expected to keep a small cache keyed by
step text, so that by the time the user says "next" the audio is already in
hand and the transition is instant.

`repeat` re-emits `narrationRequested` for the current step **only** — no
`stepChanged`, no companion rebuild, no prefetch. Repeating is an audio
operation, not a state transition.

Nothing implements either event yet. The engine is complete without them: it
advances on user input regardless of whether audio ever plays, which is exactly
the property that keeps a slow or failed TTS from freezing the lesson.

## Scene hygiene guard

Package installs and MCP tools have twice injected a root-level object that
would have shipped in the Lens (`RemoteServiceGatewayExamples`,
`AiPreviewAgent Handler`). Nothing errors when this happens — the object just
rides along into the commit.

```
python3 Tools/check-scene-roots.py          # check; exit 1 if a stray root exists
python3 Tools/check-scene-roots.py --list   # just list the roots
```

The known-good set lives in `Tools/scene-roots-allowlist.json`, which also
records the offenders already seen. A `pre-commit` hook (`Tools/pre-commit`)
runs the check automatically whenever `Assets/Scene.scene` is staged. Install
it in a fresh clone with:

```
ln -sf "../../Specs Base Template/Tools/pre-commit" .git/hooks/pre-commit
```

**Adding a name to the allowlist is a deliberate act** — do it with a note
saying what the object is and who owns it, never just to silence the check.
