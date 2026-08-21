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

## Typeface: why not VT323

VT323 was the original pick for period flavour. It lost on the actual criterion
— legibility of digits and short imperatives at arm's length on an additive
display:

- it ships **`regular` only**, so stroke weight cannot be raised, and on a
  see-through display thin strokes wash out against a bright background;
- it is bitmap-derived with a low x-height, which is exactly wrong at distance.

**JetBrains Mono** replaced it: the highest x-height of the monospace
candidates, glyphs drawn specifically to disambiguate `0/O`, `1/l/I`, `5/S`
(which matters for `NN/NN` and `MM:SS`), a weight axis up to 800, and monospace
advance so a counting-down timer does not jitter. Both fonts are in the project;
`VisualConfig.font` is the one field that swaps them.

## Enabled / disabled state

| Object | State |
|---|---|
| `HUDRoot` + ALL descendants (incl. `MainMenu`, `BootIntro`) | **disabled** |
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
| `PH_Icon.mat` | **the only material that can show an icon** — ENABLE_BASE_TEX baked on |
| `JetBrainsMono` | HUD typeface (OFL). Replaced VT323 on legibility grounds — see below |
| `VT323.ttf` | kept in the project; swap it back via `VisualConfig.font` if you want the CRT look |
| `Assets/Icons/*_sharp.png` | Material Symbols, Sharp. Named only in `VisualConfig` |

### Generated assets (P12 batch — props, holograms, SFX, CRT shaders)

| Asset | Use |
|---|---|
| `GeneratedMeshes/FirewoodLog.glb` | Training prop, 45 x 24 x 25 cm, long axis **X** (the stacking snap axis). Authored geometry: faceted octagonal bark, inset cut ends, one branch stub. **Untextured, ONE material slot (`FirewoodLog_Flat`), flat-shaded** — recolour by editing that one material. Regenerate with `node Tools/make-prop-meshes.js` (deterministic). |
| `GeneratedMeshes/KindlingBundle.glb` | Training prop, 11 x 24 x 11 cm. Seven splayed sticks + cord band, one material slot (`KindlingBundle_Flat`). |
| `GeneratedMeshes/TentStake.glb` | Training prop, 9 x 18.5 x 8 cm. Head / shaft / pyramid tip silhouette, one material slot (`TentStake_Flat`). |
| `GeneratedSFX/geiger-click.wav` | Survey sampling tick, 30 ms mono, dry on purpose (fires many times per survey). Wired: `Systems/SfxService`, rate-limited off `surveyProgress`. |
| `GeneratedSFX/confirm-blip.wav` | Local acknowledgement, 90 ms. Wired: SfxService — `menuSelected`, checklist tick, safety confirm. |
| `GeneratedSFX/error-buzz.wav` | Request failure / safety rejection, 450 ms. Wired: SfxService — `safetyRejected`, request ERROR. |
| `GeneratedSFX/crt-power-on.wav` | Boot cue, 2.5 s stereo. Wired: SfxService — `introStateChanged {active:true}`. |
| `GeneratedSFX/survey-ping.wav` | One per placed site marker, single sonar note, 1.15 s. Wired: SfxService — staggered on `surveyComplete`. |
| `GeneratedSFX/completion-sting.wav` | `lessonCompleted`, ascending bell arpeggio, 1.8 s. Wired: SfxService. |
| `CRT_Phosphor.graphShader` | **The phosphor CRT shader family's single pass.** Code-node graph: screen-space scanlines, floored phosphor flicker, and a boot scanline wipe normalized against the mesh's own local AABB (`wipeProgress` 0→1, `wipeAxis` 0 = local Y for holograms, 1 = local Z for XZ-native plane meshes). Every knob is a material property. |
| `CRT_HologramWire.mat` | CRT pass tuned for the hologram line work — cyan, glow 1.8, scanlines 0.30. Assigned to **all nine** hologram stage visuals, so `baseColor` here is the ONE field that re-tints the whole hologram. |
| `CRT_PanelGlow.mat` | CRT pass tuned as the guide panel's translucent backing — dim green glow, stronger scanlines, `wipeAxis` 1. Assigned to `GuidePanel/BackingPlate` only. |
| `PH_HologramWire.mat` | The **rollback** for the hologram: a PH_Cyan clone that exists so the hologram keeps a single shared material even off the CRT shader. Swap `CRT_HologramWire` → this in nine Inspector slots to retire the CRT look; never tint `PH_Cyan` itself (zones and survey share it). |

> **Hologram stage geometry is baked by `Systems/HologramGeometry`**
> (`Widgets/HologramGeometry.ts`): line-topology MeshBuilder wireframes written
> into the EXISTING nine stage RenderMeshVisuals at OnStart (hard rule 1 —
> populate, never instantiate). Stages are cumulative: S3 contains S1+S2+S3.
> All dimensions are @inputs on that component.

> **Props are pre-made disabled children of `WorldRoot/PropsContainer`:**
> `Prop_Log_1..6`, `Prop_Kindling`, `Prop_Stake` — instantiated from the GLB
> prefabs at DESIGN time. Every level of each prop's chain ships disabled
> (including the GLB-import inner `Scenes/Scene/geometry_0` nodes), so an
> enabler must walk the chain. P14 only enables, positions and snaps these.
> The log-cabin budget is exactly six logs.

> **GLB-reimport gotcha, cost a debugging loop:** replacing a GLB's content on
> disk keeps the prefab id (instances survive) but the OLD subresource ids
> (baked materials, textures) die — and instantiated instances keep referencing
> them, which renders as the pink missing-material pattern. After regenerating
> a GLB, re-point every instance's RMV at the new material by id.

> **World-space Text anchoring gotcha, cost a layout pass:** with
> `horizontalOverflow: Overflow`, a **Left-aligned Text starts its glyphs at
> the LEFT EDGE of its layoutRect — 7.5 × scale to the left of the object's
> position** — and a Right-aligned Text ends at +7.5 × scale. Placing a
> Left-aligned label "at" its intended left edge therefore pushes the actual
> glyphs ~31 cm further left (at scale 4.2), straight off the display. Every
> aligned Text in `MainMenu` compensates: `anchor_x = intended_edge ±
> 7.5 × scale`. Measured char advance for JetBrains Mono at `size 20` is
> ~0.26 cm per scale unit.

> **ASR blacks out the Preview:** starting a real transcription session cuts
> the Preview's simulated camera feed to black (the "ASR disables camera frame
> access" rule, applied to the simulation). Any screenshot of live-mic UI is a
> black frame. Use VoiceInput's debug key **M** (scripted capture) instead.

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
| `HUDRoot/StatusBar/KeyboardToggle` | `"TYPE"` — tap to open the AR keyboard. The demo's fallback when voice misbehaves. **Moved to local (28, −50) = HUD (28, −26)** — its old spot (28, −18 = HUD +6) sat inside the main menu's StatusBlock | `modeChanged` (shown by StatusBarPresenter) |
| `HUDRoot/MainMenu` | **The two-column terminal menu. IDLE *is* the menu** — no menu mode exists; MainMenuPresenter shows it in IDLE (and hides it while a request is COMPILING), ModeRouter still owns HUDRoot itself | `modeChanged`, `requestStateChanged` |
| `HUDRoot/MainMenu/Frame` | Corner brackets + top/bottom rules; `TitleText` ("SURVIVAL GUIDE") and `SubTitleText` ("FIELD TERMINAL v1.0") sit ON the top rule, interrupting it | — (static chrome) |
| `HUDRoot/MainMenu/Row_1..6` | The six rows, hard cap, same pattern as Checklist. Each carries a **box ColliderComponent (30 × 4.6 × 6 cm, `fitVisual` off) + SIK `Interactable`** at design time, and children `Label`, `Value` (right-aligned state column) and `ActiveDot` (the small filled "active/set" square). Row 6 (`BACK TO CAMP`, live distance in `Value`) shows ONLY once a camp point is set | `menuSelected`, `campChanged`, `surveyComplete` |
| `HUDRoot/MainMenu/Highlight` | The single moving highlight marker: `EdgeBar` + four corner `Tick*` bars, amber. Hover/gaze moves it; there is always exactly one highlighted row (default row 1) so the description panel is never empty | hover (SIK), `menuSelected` |
| `HUDRoot/MainMenu/DetailPane/StatusBlock` | Bordered panel: mic state / camp SET-UNSET / trail line (`Body` text + `Border_N,S,E,W`) | `voiceStateChanged`, `campChanged` |
| `HUDRoot/MainMenu/DetailPane/DescriptionBlock` | Body copy for the CURRENTLY HIGHLIGHTED row — the menu's real job | hover, `menuSelected` |
| `HUDRoot/MainMenu/DetailPane/AskWidget` | The always-available voice affordance: pulsing `MicGlyph`, `TitleText` ("ASK ME ANYTHING"), `PromptLine` ("> " + blinking caret; the LIVE interim transcript types here during a pinch-hold) and `ExampleLine` cycling prompts **deliberately outside the six rows** | `voiceStateChanged`, `voiceInterim` |
| `HUDRoot/BootIntro` | The boot intro surface — shown once at boot for ~3.9 s, then disabled for the session | `introStateChanged` (emitted by its presenter) |
| `HUDRoot/BootIntro/Wipe` | Full-menu-sized plate carrying a clone of `CRT_PanelGlow`; the presenter animates the shader's own `wipeProgress` 0→1 — the scanline wipe is a material property, not new geometry | — |
| `HUDRoot/BootIntro/Line1` | "SURVIVAL GUIDE — FIELD TERMINAL v1.0", typed with the typewriter machinery | — |
| `HUDRoot/BootIntro/Line2` | "VOICE INTERFACE ONLINE — PINCH AND HOLD TO ASK" (amber) — the product's thesis, in the first thing the user ever sees | — |
| `HUDRoot/AssemblingLesson` | **Placeholder VFX** shown only while a lesson is compiling. Swap the contents, keep the path | `requestStateChanged` |
| `HUDRoot/AssemblingLesson/Ring` | Spinning amber torus | `requestStateChanged` |
| `HUDRoot/AssemblingLesson/Core` | Counter-pulsing green disc | `requestStateChanged` |

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

> **Each `SiteMarker_*` also carries a `ColliderComponent` (sphere, r = 30 cm,
> `fitVisual` off) and SIK's `Interactable`, both added at DESIGN time.** They
> are what makes a marker pinch-tappable. `fitVisual` must stay off: the marker
> root has no visual of its own, so fitting would collapse the collider to
> nothing and the marker would silently stop responding to pinches.
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
| `Systems/VoiceInput` | `Engine/VoiceInput.ts` — hold-to-talk capture. Pinch, or hold the debug key (SPACE). Emits `voiceStateChanged` / `voiceInterim` / `userRequest`. Debug key **M** plays a SCRIPTED capture through the same setState/onTranscription funnel and ends with an empty final (nothing delivered, no Gemini) — exists because a REAL capture blacks out the Preview's simulated camera feed, making the live-transcript UI unverifiable on a desk. |
| `Systems/LessonEngine` | `Engine/LessonEngine.ts` — the state machine. Subscribes to `userRequest`, routes it, owns mode/step/checklist/timer/safety. Deterministic: no Gemini, no TTS, no widget references. Debug keys C/H (load), N/B/K/O (nav), R (self-test). |
| `Systems/ModeRouter` | `Engine/ModeRouter.ts` — **the only owner of HUDRoot/WorldRoot visibility**, driven by `modeChanged`. Engine-side because it makes a decision. |
| `Systems/StatusBarPresenter` | `Widgets/StatusBarPresenter.ts` — StatusBar's two faces: idle (pulsing mic, hint, rotating ticker) and lesson (title, mic state, warning strip). |
| `Systems/GuidePanelPresenter` | `Widgets/GuidePanelPresenter.ts` — icon, `NN/NN`, wrapped instruction, additive backing plate. |
| `Systems/ChecklistPresenter` | `Widgets/ChecklistPresenter.ts` — six rows, sequential highlight, shows only as many as the step needs. |
| `Systems/GaugeTimerPresenter` | `Widgets/GaugeTimerPresenter.ts` — countdown ring + MM:SS on `timerTick`. |
| `Systems/CompanionRouter` | `Widgets/CompanionRouter.ts` — the single `companionChanged` handler; switches Zone/Timer/Checklist/Compass and hides all four on `type: null`. |
| `Systems/NarrationService` | `Engine/NarrationService.ts` — **the only thing that produces speech.** Consumes `narrationRequested` / `narrationPrefetch` / `speakRequested`, caches tracks by text, pre-warms fixed phrases. Carries the `AudioComponent`. |
| `Systems/QaService` | `Engine/QaService.ts` — answers `qaRequested` from the `qa` prompt at temperature 0.4, publishes `qaAnswered` and queues the answer for speech. |
| `Systems/KeyboardInput` | `Engine/KeyboardInput.ts` — the AR keyboard, emitting the SAME `userRequest` event `VoiceInput` emits. Debug keys I (open) / U (submit canned text). |
| `Systems/LessonCoordinator` | `Engine/LessonCoordinator.ts` — **the only thing that calls Gemini for a lesson.** Owns `lessonRequested`/`siteSelected` -> planner -> validator -> `engine.loadLesson()`, plus every failure path. |
| `Systems/AssemblingLessonPresenter` | `Widgets/AssemblingLessonPresenter.ts` — enables and animates `HUDRoot/AssemblingLesson` while `requestStateChanged.state === "COMPILING"`. |
| `Systems/SurveyController` | `Engine/SurveyController.ts` — the **on-demand** survey (menu row 1; boot auto-start removed). Casts World Query rays, accumulates a point cloud, calls the pure selector, emits `surveyStarted` / `surveyProgress` / `surveyComplete` / `distanceWarning`. Debug keys P (restart) / G (finish now). |
| `Systems/SfxService` | `Engine/SfxService.ts` — **the ONE owner of non-speech audio cues.** One AudioComponent, subscribes to the bus, maps events to the six GeneratedSFX WAVs (power-on / confirm / error / survey-ping / geiger / completion-sting). Separate from NarrationService (speech). A cue that cannot play is silence + a log line; cues skip while narration has the air. |
| `Systems/BootIntroPresenter` | `Widgets/BootIntroPresenter.ts` — the boot intro: CRT scanline wipe + two typed lines (~3.9 s), skippable by pinch (the same pinch that starts a capture, observed via `voiceStateChanged`). `runIntro` @input off = no intro and the done edge fires immediately. Emits `introStateChanged`; NO audio calls of its own (SfxService plays the power-on cue), no narration — no baked track exists and live TTS at boot is forbidden (6.5-18.6 s of opening silence). |
| `Systems/MainMenuPresenter` | `Widgets/MainMenuPresenter.ts` — drives `HUDRoot/MainMenu`: row copy/state, the moving highlight, description + status panels, the ask widget's caret/interim/example ticker, row 6's live distance. Emits `menuSelected` on pinch. Debug keys J (cycle highlight) / L (activate). |
| `Systems/SurveyGridPresenter` | `Widgets/SurveyGridPresenter.ts` — drives `WorldRoot/SurveyGrid` from `surveyProgress`: follows the sampled bounds, grows, spins, rides a brightness wave. |
| `Systems/SiteMarkerPresenter` | `Widgets/SiteMarkerPresenter.ts` — places the three markers on `surveyComplete`, labels them `FLATNESS NN%`, pulses the best one, and emits `siteSelected` on pinch or debug key T / Y / F. |
| `RSG Smoke Test [TEMP]` | Throwaway diagnostics. Carries **two** ScriptComponents: `RsgSmokeTest.ts` (now **disabled** — it passed, and it cost ~18s of API calls per boot) and `LessonProbe.ts` (the lesson-planner proving run). Delete the object and both scripts when done — see `TOKENS.md`. |

> **Do not put permanent plumbing inside a `[TEMP]` object.** Token installation
> used to live in `RsgSmokeTest.ts`; disabling that component silently broke
> every Gemini call with `Proxy error: Parameter value for api-token cannot be
> empty`. That is why `Systems/RsgBootstrap` exists.

> **Resolved:** `StatusBarPresenter` no longer touches `HUDRoot`.
> `Systems/ModeRouter` owns root visibility per mode, and it is the only thing
> that may enable or disable `HUDRoot` / `WorldRoot`. Presenters own only what
> is *inside* the tree they drive.

### Enabling a widget means enabling its whole chain

Everything under `HUDRoot` / `WorldRoot` ships disabled (hard rule 1), **including
leaf children**. Enabling `ChecklistItem_3` alone leaves an empty row, because
its `Label` and `CheckIndicator` are still off. This cost a debugging cycle: the
presenter reported six rows collected and rendered them, and the screen stayed
blank. A presenter must enable every level it wants visible.

### Icon materials need ENABLE_BASE_TEX

`PH_*.mat` are `UnlitMaterialPreset` clones where `baseTex` is gated behind the
`ENABLE_BASE_TEX` shader define. Assigning a texture to one of them **silently
does nothing** — no error, just a blank shape. Icon slots must clone
**`PH_Icon.mat`**, which has the define baked on. `WidgetUtils.adoptMaterial()`
is the helper for that. Always clone: the PH_ materials are shared, so tinting
one in place recolours every object using it.

## Event vocabulary

Declared in `Assets/Scripts/Engine/EventBus.ts` as `Events`:

`modeChanged` · `lessonStarted` · `stepChanged` · `companionChanged` ·
`hologramStage` · `timerTick` · `checklistUpdated` · `safetyPending` ·
`propPlaced` · `lessonCompleted` · `surveyStarted` · `surveyProgress` ·
`surveyComplete` · `siteSelected` · `distanceWarning` · `stopRequested` ·
`requestStateChanged` · `lessonAnchorChanged` · `speakRequested` ·
`narrationStateChanged` · `qaAnswered` · `keyboardRequested` ·
`menuSelected` · `campChanged` · `introStateChanged`

### `menuSelected` is the siteSelected trick generalised

Emitted by `MainMenuPresenter` (pinch, debug keys J/L) AND by `LessonEngine`
(voice — numerals "one".."six"/digits first, then natural forms, matched
LOCALLY per hard rule 6). Each row's behaviour is owned by its subscriber:

| Row | Owner | What it does |
|---|---|---|
| 1 SCAN THIS AREA | `SurveyController` | `beginSurvey()` — **the survey is on-demand now; there is no boot auto-start** |
| 2-5 shelter/fire/water/hurt | `LessonCoordinator` | fixed phrase (`tentPhrase`/`firePhrase`/`waterPhrase`/`burnPhrase`) through the SAME generative Gemini path a marker tap uses. No fixtures |
| 6 BACK TO CAMP | `LessonEngine` | speaks a navigation cue (`speakRequested`); the row's live distance readout is the visual half |

NO menu selection may reach Gemini directly — rows 2-5 become fixed phrases in
the coordinator, and everything else never leaves the device.

### `campChanged` — who owns the camp point

`LessonEngine` records the position of any `siteSelected` as THE camp point and
emits `campChanged`. Menu row 6 exists only after this has fired; the presenter
renders the live camera-to-camp distance in its value column.

Request-chain payload shapes live in `Engine/RequestTypes.ts`, alongside
`SurveyTypes.ts`, for the same reason: presenters render this state and must not
import the coordinator to do it.

### `stopRequested` exists because `setMode` is a no-op on no change

"Stop" spoken while a request is compiling has to cancel the Gemini call — but
the engine is sitting in `IDLE` at that moment, so `setMode("IDLE")` changes
nothing and `modeChanged` never fires. `LessonEngine.stop()` therefore emits
`stopRequested` unconditionally, before it resets. Without it the cancelled
request runs to completion and loads a lesson the user dismissed ten seconds
earlier — which on stage looks like the Lens acting on its own.

Survey payload shapes live in `Engine/SurveyTypes.ts` — a types-only module both
sides import, so the presenters never import `SurveyController` (which would
drag `WorldQueryModule` into a widget) and the engine never imports a presenter.
**Positions on the bus are CENTIMETRES**, ready for `setWorldPosition`.

### Who owns `mode` during a survey

`SurveyController` does NOT set the mode. It reports facts — started, complete —
and `LessonEngine` decides those mean `SURVEY` and `IDLE`. Same rule as
`ModeRouter` owning root visibility: one owner, or it becomes a race about who
set what. `ModeRouter` now shows `WorldRoot` in **IDLE as well as SURVEY**, so
the markers stay standing after the survey hands back to idle.

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

`Systems/NarrationService` implements both. The engine is still complete
without it: it advances on user input regardless of whether audio ever plays,
which is exactly the property that keeps a slow or failed TTS from freezing the
lesson. A synthesis that fails, times out, or lands after the user has moved on
produces **silence and a log line** — never a stalled step, never the wrong
sentence read over the right step.

**The cache is keyed by TEXT, not step index.** "back" and "repeat" ask for
words the user has already heard, so they are free. Keyed by index they would
also be free, right up until a second lesson reused index 2 for different words
and the guide confidently said the wrong sentence.

**Fixed phrases have two routes in**, in priority order: `bakedPhrases` +
`bakedTracks` (recorded audio wired in the Inspector — free forever, works
offline, the shipping path) and `prewarmPhrases` (synthesized once at boot, the
path that works today with no recording session).

> **Warm-ups run STRICTLY ONE AT A TIME, chained on completion.** The first
> version fired one every `prewarmGapSec` on a timer; since each call takes
> 6-18 s that put six requests in flight at once, and the measured result was
> DNS resolution failures, `Network is unreachable`, three of six phrases
> failing, and a 15 s outlier on an unrelated Gemini call running alongside.
> **Concurrent RSG calls degrade each other.** Nothing waits on a warm-up, so it
> has no business competing with anything.

## THE DISPLAY FRUSTUM IS MUCH SMALLER THAN THE HUD WAS AUTHORED FOR

Found 2026-08-20 by looking at a Preview **panel** screenshot instead of an
orthographic runtime capture. Everything in this project had been verified with
`CaptureRuntimeViewTool`, which frames whatever you point it at and **does not
respect the device frustum**. It will happily show you a HUD that a wearer
cannot see.

Measured against the SPECS 27 preview: content is only on the display within
roughly **±16-18° of the view centre**. At the original `HUDRoot` distance of
60 cm that is a window of about ±19 cm. The authored HUD spanned x ∈ [-45, +50]
and y ∈ [-34, +38] cm — so **the StatusBar, the GuidePanel, the Checklist and
the GaugeTimer were all outside the display**, all of the time. The idle hint,
the example ticker and the whole lesson panel were invisible on device.

The fix keeps the composition and moves it into the frustum:

| Object | Was | Now | Why |
|---|---|---|---|
| `HUDRoot` | `z = -60` | `z = -120` | Halves every angular offset at a stroke. The layout is unchanged; it is simply further away, so it subtends half as much. |
| `HUDRoot/StatusBar` | `y = 30` | `y = 24` | `LessonTitle` sits at `+8` above it and was clipping the top edge. |
| `HUDRoot/GuidePanel` | `x = 36` | `x = 18` | Its plate is 28 cm wide, so the right half was off-display. Still the right-side panel. |
| `HUDRoot/Checklist` | `x = -36` | `x = -20` | Mirrors the panel. |
| `HUDRoot/GaugeTimer` | `y = -26` | `y = -20` | Ring radius 8 cm; the bottom was clipped. |

**The budget, for anyone moving these again:** at `z = -120`, keep every drawn
pixel within **±34 cm of the HUD origin**, edges included — not centres. A
28 cm-wide plate centred at x = 20 has its edge at 34 and is already at the
limit.

> **Verify HUD layout with `PreviewPanelTool screenshot`, never with
> `CaptureRuntimeViewTool`.** The ortho capture is for reading text and checking
> content; only the preview panel tells you whether the wearer can see it.

### The frustum limit is ANGULAR, not a minimum distance — corrected 2026-08-21

The last batch recorded that "floor content nearer than ~5.7 m is outside the
device frustum, so P13 must anchor holograms 5-6 m out". **The 5.7 m number is
real but the conclusion drawn from it was too strong**, and it is the same
mistake shape as the camera claim above: a measurement taken at ONE head pose
(gaze level) was written down as a property of the content.

What ±16-18 ° constrains is the angle between the gaze direction and the
content — so *looking down* moves the window, and 5.7 m is only the threshold
**for a wearer staring at the horizon**.

Measured with `S1_Footprint` at 3 m, eye 1.73 m above the floor (a 30 °
depression angle), pitching the tracked camera and capturing the preview panel:

| Gaze pitch | Floor content at 3 m | Screenshot |
|---|---|---|
| 0 ° (level) | **not visible** | `Docs/screens/frustum-3m-level-gaze.jpg` |
| −15 ° | just clipping in at the bottom edge | `Docs/screens/frustum-3m-look-down-15.jpg` |
| −30 ° | comfortably in frame | `Docs/screens/frustum-3m-look-down-30.jpg` |

Predicted threshold, and it matches: content sits 30 ° down, the half-FOV is
~17 °, so it enters the view at about **−13 °** of pitch.

**Design consequence.** Ground content at conversational distance is fine *if*
the user is looking at it — which is exactly what someone pitching a tent is
doing. Two things follow, and they matter more than a fixed anchor distance:

- Anchoring holograms 5-6 m out is the right default only for content the user
  should see **without being asked to look down**.
- Anything placed closer needs the HUD to *say so* — a "look down" cue — because
  a wearer at level gaze sees nothing and has no way to know content exists.
  Silence is the failure mode, not the placement.

> `HUDRoot`'s `Headlock` component ships **disabled**, so the HUD does not
> follow a pitch change: in the −30 ° capture the head-locked chrome has left
> the view entirely while the world-locked footprint is centred. On device with
> Headlock enabled the HUD would follow the head. Do not read those captures as
> evidence about HUD placement.

## Where the fixed ~7 s per call goes

Measured 2026-08-20. Every remote call pays a floor unrelated to payload size,
so the question was whether that floor is the network, the gateway, or the
model — and whether a throwaway warm-up call at boot would absorb it.

| Phase | Measurement | Result |
|---|---|---|
| A. Raw HTTPS to a host **outside** the gateway, x3 | 559 ms, 115 ms, 112 ms (repeat run: 650, 1076, 287) | First request pays ~0.5 s of TLS/connection setup; after that ~115 ms. |
| B. Minimal Gemini call (5-token cap), x4 | 6070, 15036\*, 3009, 5868 ms | Huge variance, and **the first call is not the slowest**. |
| C. One-word TTS, x3 | 7103, 7013, 6550 ms | Tight, consistent, and again **no first-call penalty**. |

\* the 15 s outlier coincided with six concurrent TTS warm-ups — see below.

**Conclusion: the floor is NOT connection setup.** Raw HTTPS to an unrelated
host completes in ~115 ms once the socket is warm and ~0.5 s cold, so at most
half a second of the ~7 s is network. The remaining ~6.5 s is gateway proxy plus
model start, and it is charged **per call, not per session**.

**Verdict on warming: not worth it, and it is not kept.** Across both providers
the first call is not consistently slower than the third or fourth; the TTS
series varies by 550 ms across three identical calls with the first in the
middle of the range. There is no per-session cost for a warm-up to absorb.

> **A warm-up call is worse than neutral — it is actively harmful.** The one
> thing that DID reliably inflate latency was concurrency: six overlapping TTS
> warm-ups produced `DNS resolution failed`, `Network is unreachable`, three of
> six phrases failing, and a 15 s outlier on an unrelated Gemini call running at
> the same time. Requests to the gateway degrade each other. Anything
> speculative must be strictly sequential and must never overlap a request the
> user is waiting on.

## The COMPILING state

A lesson takes **10.8-14.8 s** and nothing in the project can shorten it. The
wait is therefore designed rather than hidden:

1. `StatusBarPresenter` **types the request back** into `HintText`, character by
   character with a blinking caret, so the first answer the user gets is "yes, I
   heard you".
2. `ExampleTicker` then **cycles status lines** (`SURVEYING KNOWLEDGE`,
   `DRAFTING STEPS`, `CHECKING SAFETY`, `PLACING WIDGETS`) every
   `compilingLineSec`, each with a **working ticker** advancing at
   `workingTickHz` (3 Hz default).
3. `HUDRoot/AssemblingLesson` spins and pulses for the duration.

The rule the settings exist to guarantee: **something visibly changes at least
once a second.** Eleven seconds of an unchanging frame reads as a crash whatever
the frame says. The 3 Hz ticker is the floor even when a status line is holding.

## The Preview panel CAN feed a survey — corrected 2026-08-21

> **This section was wrong, and the way it was wrong is the lesson.** The
> original text below concluded "the simulated device camera is pinned at the
> origin". What was actually measured was **one MCP tool** (`MovePreviewCamera`)
> and a set of *rotation* commands. What was written down was a claim about
> **the platform**. Measuring a tool and concluding about the platform is the
> mistake class; it cost the project a fixture pipeline it may not have needed.
>
> Re-measured with `Engine/CameraTrackProbe.ts` reading the TRACKED camera's
> own `getWorldPosition()` from inside the Lens:
>
> | Claim (old) | Measurement (new) |
> |---|---|
> | "the simulated device camera is pinned at the origin" | **False.** Holding `W` moved it 6.00 m, then 19.44 m, continuously and monotonically. |
> | "`MovePreviewCamera` moves the editor viewport, not the tracked camera" | **False.** `getPose` returned the tracked camera's exact pose; `reset` teleported the TRACKED camera to (0,0,0). They are the same camera. |
> | "the Lens-side camera stayed at (0,0,0) through every pan" | It stayed at (0,0,0) because *reset* put it there, and because `orbit`/`rotate` change rotation only. Rotation-only commands were read as evidence about translation. |
>
> **Keyboard drive is available to the agent, not just to a human.** The
> `specs-preview-interaction` skill is hands-only (Pinch/Poke/Drag — no key
> action), which is what made "a human must press the keys" look true. A
> *different* tool, **`InjectPreviewGesture`**, sends keys:
> `{type:"key", key:"W", state:"start"}` presses and holds, `state:"end"`
> releases. Injected keys reach both the preview camera AND the Lens's own
> `KeyPressEvent`.
>
> **DEBUG KEYS MUST STAY OFF W/A/S/D, Q/E AND THE ARROWS** — those are
> Interactive Preview movement, so a walking capture would silently drive the
> engine. Fixed 2026-08-21: water fixture `W`→**H** (as in H₂O), done/check
> `D`→**O** (dOne), survey restart `S`→**P** (re-Ping). Any future debug key
> follows the same rule: right-hand cluster, no movement keys.

### What a walking survey actually collects

Measured 2026-08-21 in `Sunlit Outdoor`, 12 s boot survey, camera starting at
the origin each time:

| Run | Distance walked | points | usable | ground cells | sites |
|---|---|---|---|---|---|
| Head never moves (the old baseline) | 0 m | **3** | 0 | 0 | 0 |
| Holding `W`, straight line | 12.7 m | **30** | 30 | 24 | 0 |
| `W` + strafe attempt | 8.9 m | **17** | 17 | 11 | 0 |

Walking multiplies the yield about **10x**, and the count scales with distance
(~2.4 points per metre), not with path shape. The hit RATE also improves: ~8 %
of rays connect standing still, ~39 % while walking, because a moving origin
keeps presenting new surface to the ~±9 ° cone that actually resolves.

**But `sites` is still 0 in every live run.** The selector needs roughly 60
covered ground cells for a tent footprint; the best walk produced 24. A
straight-line walk sweeps a *line*, and a footprint needs *area*.

> **So `useFixtureCloud` is still required to demo markers on a desk, and it
> stays.** It is also the deterministic path for LEAF. What has changed is the
> reason: not "the camera cannot move" (it can), but "12 seconds of walking does
> not cover enough area to satisfy the site selector". If a live desk demo of
> the markers is ever wanted, the lever is a longer survey plus a deliberate
> area-covering walk — not a platform limitation.

### The original text, kept for the record

World Query **does** work in the Preview's Interactive simulation scenes and it
returns genuine surfaces:

| Interactive scene | What World Query returns |
|---|---|
| `Sunlit Outdoor` | a flat ground plane at y = -173 cm, normals exactly up |
| `Colorful Home` | real room geometry — walls with sideways normals, floor at several heights |
| `Plane` | the bare ground plane (project default) |

The problem is not the surfaces, it is how few taps resolve and that the head
never moves:

- Only the **centre of the ray fan** ever returns a hit. Of a 7 x 5 lattice
  spanning ±28° yaw and +6°..-42° pitch, hits came back for lattice cells
  16/17/18 only — a cone of about ±9°. Everything else returned `null`.
- The throttle is real: 944 rays cast over 12 s produced 81 hits (~9%, ≈7 Hz),
  matching the documented ~5 Hz resolve rate.
- ~~**The simulated device camera is pinned at the origin.**~~ **WRONG — see the
  correction above.** The camera translates under `W`/`A`/`S`/`D`/`Q`/`E`, and
  `MovePreviewCamera` drives that same tracked camera. What was true is only
  that *rotation-only* commands leave the position alone.

Net, corrected: **3 distinct points if the head never moves; 30 in a 12 s walk.**
A tent footprint needs ~60 covered cells, and a straight walk delivers 24 — so a
stored cloud is still what verifies markers, labels and the distance guard on a
desk, for a coverage reason rather than a tracking one.

### Stored terrain: `Assets/Survey/fixtures/`

Hard rule 5, applied to terrain instead of to Gemini. `SurveyController` has
`useFixtureCloud` + `cloudFixture`: with the toggle on, the survey sources its
points from a stored JSON cloud and never casts a ray. Everything else — the
timeline, `surveyProgress`, the early exit, scoring, markers, the warning strip
— runs identically, because both sources funnel through the same `acceptPoint`.

| Fixture | What it is for |
|---|---|
| `survey-open-clearing.json` | 6.4 x 6.4 m clearing ahead of the user. The good case: 2 tents + a fire clear by 3.01 m, no warning. |
| `survey-cramped-camp.json` | 3.2 m clearing ringed by rubble. The constraint case: 1 tent, fire 1.03 m away, `distanceWarning` raised. |

Both are generated by `python3 Tools/make-survey-fixtures.py` — deterministic,
so regenerating produces byte-identical files.

> **`useFixtureCloud` ships OFF.** On device the real World Query path is the
> point; a fixture would put markers on terrain that is not there, which is
> worse than no markers. Turn it on to demo or debug on a desk, and turn it
> back off before going to the glasses.

> The clouds only cover the arc **in front** of the user, because that is what a
> survey actually collects. An early version wrapped the user in ground and duly
> suggested a campsite behind their head.

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
