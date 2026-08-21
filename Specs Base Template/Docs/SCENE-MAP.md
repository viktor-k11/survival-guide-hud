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
| `Headlock` component on `HUDRoot` | **DISABLED 2026-08-21 — replaced by `Systems/HudFollower`. Kept in the scene so rollback is a checkbox** (disable HudFollower's object, tick Headlock). Why replaced: SIK Headlock's smoothing step is `pos += (target−pos) · easing · dt/0.033` — a dt-scaled lerp that DIVERGES once `easing·dt/0.033 > 2`, i.e. any frame over ~0.26 s at our tuned easing 0.25. Preview tool calls produce such frames routinely (measured runaway: ×30/s off to 1e19 cm; this one bug was every "HUD vanished / did not follow yaw / boot intro invisible / HUD lost after teleport" symptom). Also: Headlock only ever wrote POSITION — HUDRoot's rotation was whatever the last recenter left, so the panel went edge-on after a large yaw. |
| `HudFollower` component (on `Systems/HudFollower`) | **ENABLED — the follow.** Same tuned feel (distance 120, buffers 6 cm / 3° / 3°; a buffer leaves up to its own width of rest offset, ~6 cm at 3°/120 cm — same as Headlock, measured), but unconditionally stable: per-axis `alpha = 1 − exp(−dt/tau)` ∈ (0,1) for ANY dt (tau 0.13 s ≈ the old easing at 60 fps), dt clamped at 0.1 s, non-finite camera poses held-and-logged, and rotation derived from the same smoothed angles so the panel keeps facing the wearer. Verified 2026-08-21: 10.3 m walk (tether held, max 7 cm lag), 93° keyboard yaw (settled 1.5 s), −30° pitch with ground content at 3 m in frame, and a soak with provoked frame times of 0.8 s / 3.3 s / 7.3 s / **30.4 s** — excursion 0 cm at every 1 Hz sample, drift-guard NEVER fired (a fire is a maths bug, not a tuning knob — see the component header). |
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

`HUDRoot` is placed every frame by **`Systems/HudFollower`** (our own
component — see the enabled/disabled table above for why SIK's `Headlock`,
still on HUDRoot as the rollback, was retired). All follow behaviour is
Inspector-tunable on HudFollower: `distanceCm`, per-axis `tau*` (seconds to
close ~63% of the gap — NOT a raw lerp coefficient), the dead-zone buffers,
the dt clamp and the drift-guard threshold. Local origin sits 120 cm in front
of the user.

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
| `HUDRoot/MainMenu/FooterChips/Chip_SetCamp,Chip_Trail,Chip_FollowTrail` | The camp/trail footer chips (collider + SIK Interactable each) — pinch twins of "set camp" / "leaving camp" / "follow the trail". FOLLOW TRAIL shows only once a trail exists; Chip_Trail flips to "● REC" while recording | `menuChipSelected` (emit), `trailStateChanged` |
| `HUDRoot/MainMenu/FooterChips/Chip_Log` | "[ LOG ]" — opens the session journal. Pinch twin of "show the log" / "log" / debug key **V**; all three emit `menuChipSelected {chip:"journal"}` | `menuChipSelected` (emit) |
| `HUDRoot/CompletionCard` | **The end-of-lesson card** — shown in COMPLETE, retired on ANY exit from it. `TitleLine` ("TASK COMPLETE · <TITLE>"), `NextLine` (the next-step suggestion as ONE amber chevron line, collider + SIK Interactable — pinch = accept), `HintLine` (dim). A plan without a suggestion simply has no next line and holds the shorter dwell. **Nothing auto-starts**: accept is voice ("yes"/"do it"/"next", matched locally in the engine) or pinch; declining ("no"/"not now") or the dwell ending returns to IDLE | `lessonCompleted`, `modeChanged`; emits `suggestionAccepted` |
| `HUDRoot/Journal` | **The session log** — `Title`, `Row_1..8` (hard cap 8, same pattern as Checklist; most recent kept, newest at top), `CloseChip` (collider + Interactable). A VIEW over bus events that already exist — no new engine state. The menu yields the screen while it is open (`journalStateChanged`, boot-intro pattern); any mode change away from IDLE closes it. Timestamps are wall-clock HH:MM from the runtime `Date` when the clock claims a plausible present (year ≥ 2024 — preview and device both do), else honest session-relative `T+MM:SS`; the source in use is logged at boot | `surveyComplete`, `hazardsDetected`, `lessonCompleted`, `campChanged`, `trailStateChanged` (edges), `distanceWarning`, `menuChipSelected` |
| `HUDRoot/GuidePanel/DegradationNote` | **Honest degradation, on screen**: "STEP N · WIDGET UNAVAILABLE", shown when the validator dropped this step's companion (carried on the step as `companionDegraded`, emitted in `stepChanged`). DIM (`dimColor`), never warning colour — the step still works; this is information, not an error | `stepChanged` |
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
| `WorldRoot/HologramRoot` | Container for staged blueprint holograms. **Driven by `Systems/HologramPresenter` since 2026-08-21** — before that `hologramStage` was emitted and nobody subscribed, so the nine baked stage groups had never once been enabled during a lesson | `hologramStage` |
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
| `WorldRoot/HazardMarker_1..3` | **The "do NOT camp here" pool, hard cap 3** — warning-coloured X of two crossed stakes (`Cross_A`/`Cross_B`) + a `Label` carrying the REASON with its number ("STEEP 31°", "COLLECTS WATER", "BROKEN GROUND"), deliberately not the site-marker language so the two verdicts separate at a glance. A hazard the user cannot interpret is decoration | `hazardsDetected`, `surveyStarted` (clear) |
| `WorldRoot/TrailContainer/Crumb_01..24` | **The trail stake pool, hard cap 24** — vertical ~1.5 m stakes, not ground discs (the frustum limit is ANGULAR: floor content is invisible to a wearer facing the horizon, and a walker looks ahead, not down). When the pool fills, the controller DECIMATES (every second mark, spacing doubled) — coverage stays complete on a finite pool; measured live: 25th mark → 13 marks @ 300 cm | `trailStateChanged`, `navigateUpdated` (passed marks dim) |
| `WorldRoot/CampStake` | The camp point marker: `Pole` (2 m, amber — same visual language as the crumbs, larger and distinct) + yaw-billboarded `Label` ("CAMP") | `campChanged` |
| `WorldRoot/CompassRose/Disc,Arrow(Shaft/Tip),DistanceLabel` | The ONE bearing display, floated ahead of the user below eye level while navigating. Bearing SOURCE is the `navigateUpdated` event — SOS will later feed the same payload at the most open direction. **Do not fork this presenter.** `lastKnown` recolours everything warning-red | `navigateUpdated` |

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
| `Systems/NavigationController` | `Engine/NavigationController.ts` — owns the camp point, the trail recorder (explicit "LEAVING CAMP" start; marks auto-drop per spacing; decimation on pool overflow) and the navigation loop. Pure maths in `NavMath.ts`. `useFixtureTrail` + `Assets/Survey/fixtures/camp-trail-demo.json` (regenerate: `python3 Tools/make-trail-fixture.py`) is the deterministic path — SHIPS OFF. Debug keys **7** set camp / **8** start trail / **9** follow trail / **0** simulate tracking loss. |
| `Systems/TrailPresenter` | `Widgets/TrailPresenter.ts` — maps `trailStateChanged.marksCm` onto the Crumb pool, dims passed marks while following, places the camp stake. |
| `Systems/CompassRosePresenter` | `Widgets/CompassRosePresenter.ts` — the one bearing display (see the CompassRose row above). |
| `Systems/HudRecenter` | `Engine/HudRecenter.ts` — `recenterRequested` (voice "recenter", debug key **5**) force-places HUDRoot in front of the user; the escape hatch for a tracking hiccup. Root placement = engine-side, like ModeRouter. Its 400 cm drift guard stays as the OUTER belt-and-braces; with HudFollower's stable maths it should never fire. |
| `Systems/HologramPresenter` | `Widgets/HologramPresenter.ts` — **the subscriber `hologramStage` never had.** Enables exactly one stage group (whole ancestor chain), anchors it, spins it slowly, runs the stage transition, and announces the first appearance. See the hologram section below for the family rule and the measured placement. |
| `Systems/CompletionCardPresenter` | `Widgets/CompletionCardPresenter.ts` — the completion card (see the CompletionCard row). Relays a pinch on the next line as `suggestionAccepted`; the ENGINE owns what acceptance means. |
| `Systems/JournalPresenter` | `Widgets/JournalPresenter.ts` — the session log (see the Journal row). Debug key **V** toggles via the same `menuChipSelected` the chip and voice use. |
| `Systems/HudFollower` | `Engine/HudFollower.ts` — **owns HUDRoot's transform every frame** (replaced SIK Headlock 2026-08-21 — see the enabled/disabled table). Unconditionally stable smoothing (`1 − exp(−dt/tau)`), dt clamp, NaN rejection, Headlock-feel dead-zones, own inner drift guard against its own target, `settled N s` log lines. On `recenterRequested` it drops state and re-seeds from the live camera so it never fights HudRecenter. `logIntervalSec` > 0 turns on a 1 Hz distance-from-target diagnostic (ships 0). |
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
`menuSelected` · `campChanged` · `introStateChanged` · `menuChipSelected` ·
`trailStateChanged` · `navigateRequested` · `navigateUpdated` · `campReached` ·
`recenterRequested` · `hazardsDetected` · `suggestionAccepted` ·
`journalStateChanged` · `hologramShown`

### next_suggestion — SHIPPED as its own call (2026-08-21, second attempt)

The reverted attempt below diagnosed the problem precisely: adding the field
perturbed the tasks WITHOUT a few-shot example while the anchored ones returned
their examples verbatim. The fix was therefore not a better prompt but a
**separate call**, which cannot perturb a lesson plan at all.

- `Assets/AI/next-step-prompt.txt` (a third entry in `prompts.generated.json`
  alongside `lesson` and `qa`): given the finished task's title and its final
  step, return at most six words naming the next task, or `NONE`.
- `LessonPlanner.requestNextStep()` — temperature 0, `thinkingBudget: 0`
  (2.5-flash draws thinking tokens from `maxOutputTokens`; leaving it on is
  what once reduced an answer to the word "If"), cap 60 tokens, far above six
  words on purpose. `cleanSuggestion()` strips quotes/full stops and refuses
  anything over seven words or 60 characters.
- **GW_BACKGROUND**, fired by `LessonCoordinator` on `lessonCompleted` while
  the user reads the card. A user request calls `gatewayDropPending` and bins
  it; a `suggestionId` generation counter drops anything that lands after the
  card is gone. Failure, timeout, drop, empty and `NONE` are all "no line".
- The card gains the line late (`nextStepSuggested` → `CompletionCardPresenter`
  adds it; the engine arms `pendingSuggestion` so "yes"/pinch still accept it).
  Three dwells: `suggestionDwellSec` 14 s once a line is on the card,
  `suggestionWaitSec` 11 s while one may still arrive, `completeReturnDelaySec`
  4 s when the answer is a definite none — a failed call costs no extra wait.
- **`LessonSchema.ts` and `lesson-system-prompt.txt` remain byte-identical to
  HEAD**, verified with `git diff` before the commit.

Measured live: "Pitch a Tent" → *"Gather firewood for the night"* (dispatched
after 6.5 s of queue, 10.3 s call); "Purify Water" → *"Find more water
sources"*. Four-phrase gate re-run and **passed** — see the log entry.

> **The queue is the thing to watch, not the model.** A suggestion fired while
> the boot TTS pre-warms are still running waited **20.6 s** for the slot and
> arrived long after the card had gone (correctly dropped by the generation
> counter). On the live path this does not happen, because a lesson request
> already drops pending background work before it runs — but it is why the
> wait window exists and why the suggestion must never be something the card
> depends on.

### next_suggestion — the FIRST attempt, reverted at the wire (kept for the record)

The plan-level `next_suggestion` field (a short phrase that reads as a
suggestion AND works verbatim as a request) was added to the schema + prompt +
both few-shots, and the five-phrase regression gate was run against the
recorded baseline. **It failed**: "help me purify water" lost its final
checklist step (5→4) and "how do I treat a burn" grew a step and dropped every
companion (1→3 degradations). A CONTROL run with the untouched prompt
reproduced the baseline **byte-for-byte** on both phrases in the same session,
so the shift is attributable to the change, not to model drift — and the
prompt/schema were reverted per the gate's own rule. (The control also showed
"how do I signal for rescue" drifting from baseline with NO change at all —
that phrase is unstable upstream and cannot gate anything.)

What shipped from that attempt: the ENTIRE downstream pipeline — validator
parse, engine COMPLETE handling with local accept/decline phrases, the
completion card, the `suggestionAccepted` seam — live but dormant. **It is no
longer dormant: the separate call above feeds it**, and the schema path is
still supported (a plan carrying `nextSuggestion` skips the call). It is exercised end-to-end by
`Assets/AI/fixtures/lesson-campfire-DOCTORED-next-suggestion.json` (the
campfire envelope with the field hand-injected — clearly named, wired to debug
key C), and accepting the fixture's suggestion fires a REAL Gemini lesson for
the suggested phrase. Re-enabling for live lessons is one schema line + prompt
rule 7 + few-shot tails (see the note in `LessonSchema.ts`) — and the SAME
five-phrase gate must pass first.

Fixture note, same batch: debug key H now loads
`lesson-help-me-purify-water-DEGRADES-step1-checklist.raw.json` (the
deterministic degradation) instead of the clean water fixture, so the
DegradationNote is one keypress to demo.

### Two scorers, one cloud — the hazard split

`SiteSelection.ts` answers "where SHOULD you camp"; `HazardScoring.ts` answers
"where should you NOT" (steepness / hollows-that-collect-water / broken
ground). Both are PURE, both run over the SAME cloud in the SAME pass
(`SurveyController.runScorers`), and they deliberately do not import each
other. Hazards reach the site scorer only as GENERIC penalty zones
(`SiteSelectionOptions.penaltyZones`, `weightHazardPenalty` = **0.25**):
a full-severity zone costs a candidate at most 25% of its score. **A PENALTY,
never a veto** — a veto could silently empty the site list, and "no campsite
found" is a worse answer than "here, but watch the slope". A selected site
still overlapping a hazard is surfaced through the EXISTING `distanceWarning`
strip plus a spoken line, not a new mechanism.

Regression contract (the demo depends on it, re-verified with the penalty on).
**The invariants are exactly these, and nothing more:** `survey-open-clearing`
→ 3 sites (2 tents + 1 fire), fire clear of the nearest tent by ≥ 3 m, no
warning, 0 hazards; `survey-cramped-camp` → `distanceWarning` raised (measured
at 1.03 m, bit-identical to the pre-penalty baseline) plus 3 steep hazards
(64-70°) off the rubble ring. **Point counts are NOT an invariant**: the
fixture's time-based reveal makes the accepted-point tally vary with frame
timing — measured 344-387 across sessions (the "381 points" in older log
entries is one session's reading, not a contract). Never assert an exact
count in a test; assert the site/warning/hazard outcomes above.

### Holograms — family inference, and the measured placement

**The plan never says tent or fire.** It carries `{stage:int}` and nothing
else, and that is deliberate: `lesson-system-prompt.txt` + `LessonSchema.ts`
stay byte-identical to HEAD. `HologramPresenter` therefore infers the family
ONCE per lesson at `lessonStarted`, from the **originating request text plus
the plan's title**, by calling `inferLessonKind()` — the VALIDATOR'S OWN
function, not a copy, because the validator already used it to decide which
stage range to accept. A private reimplementation could disagree with the
range check that already ran and draw a fire stage inside a tent lesson.

- Neither matches → **no hologram at all**, plus a log line. A confidently
  wrong blueprint is worse than none — the same rule as degrading a broken
  companion to null.
- An out-of-range stage is **dropped, never clamped**.
- The request text is **consumed** at `lessonStarted`. Leaving it set let the
  next lesson inherit it: measured live, loading the purify-water fixture
  straight after a campfire lesson inferred `fire` and would have drawn a fire
  blueprint over a water lesson.

**Placement is measured, not guessed** (`logMeasurements` prints the world AABB
and the angle it subtends every time a stage appears; the wireframes are
MeshBuilder output, so editor-side bounds report only the placeholder mesh and
the measurement has to be taken from inside the Lens). The display is a
RECTANGLE, so the test is per-axis against ±16-18°, not a Euclidean cone.

| Stage (tent) | AABB at scale 1.3 | yaw | pitch | verdict at 6.05 m |
|---|---|---|---|---|
| S1 footprint | 117 x 1 x 143 cm | ±7.0° | −13.0..−10.0° | fits |
| S3 canopy | 173 x 81 x 157 cm | ±9.4° | −13.0..−3.3° | fits |
| **S4 stakes (widest)** | **232 x 81 x 244 cm** | **±13.6°** | **−14.1..−3.1°** | **fits — the binding case** |
| S5 complete | 224 x 92 x 205 cm | ±12.7° | −13.6..−2.3° | fits |

The first pair tried (550 cm / scale 1.4) FAILED on S4 at ±18.0° yaw. Pushing
the distance out beats shrinking, because distance improves the yaw **and** the
ground-plane pitch, while shrinking at a fixed distance leaves the pitch where
it was. Shipping pair: **600 cm, scale 1.3**, worst axis ~14° with ~2° of
margin, confirmed in `hologram-tent-stage1/3/5.jpg` at level gaze.

**The anchored case deliberately breaks that budget.** A lesson started from a
site marker anchors to the surveyed position (~3.6 m in the fixtures), which at
1.2 m eye height sits ~18° below a level gaze — outside the window. That is the
correct trade (the blueprint belongs on the ground the survey rated) and it is
exactly what the announcement exists for: `hologramShown` puts
`LOOK DOWN · BLUEPRINT ON YOUR SITE` on the StatusBar's second line for
`holoCueHoldSec`. Keep that copy under ~34 characters — the first draft was 46
and ran off both edges of the display.

**Transitions are timeboxed and have an explicit off switch.** A stage change
runs the CRT shader's own `wipeProgress` 0→1 (wipeAxis 0 = local Y, so the
blueprint redraws from the ground up) plus a glow surge decaying over the same
window — the same machinery the boot intro uses, no new geometry.
`enableTransitions` off = hard stage switching, which is a complete shippable
behaviour. Fire's last stage additionally runs a flame loop: the shared
material goes warm amber with a pulsing glow (`hologram-fire-flame-stage4.jpg`).

**One material, nine stages.** The presenter clones `CRT_HologramWire` once and
assigns the clone to all nine visuals, so the runtime wipe/glow/flame writes
cannot bleed into anything else while the "one field re-tints the whole
hologram" property survives.

**`ModeRouter` now shows WorldRoot in COMPLETE** so the finished blueprint
stays standing under the completion card instead of being blanked at the exact
moment the lesson succeeds (`hologram-complete-standing.jpg`).

> **A real "pitch a tent" plan uses exactly ONE hologram step (stage 3).** The
> full 1→5 walk, the back-step check and the stage 1/3/5 captures are therefore
> driven by `Assets/AI/fixtures/lesson-tent-STAGING-TEST-stages-1-5.json` — a
> hand-built STAGING TEST INPUT, not demo content, and not wired to a debug key
> by default. Campfire plans use three (stages 2, 3, 4), so a live fire lesson
> does reach the flame on its own.

### NAVIGATE — a mode, not a companion

Two return modes, and they are NOT redundant: a straight line to camp is not
always walkable (a ravine or a stream may sit between you and it). **BEARING
TO CAMP** says "that way" — bearing + distance, available whenever camp is
set. **FOLLOW TRAIL** says "this way, you have already walked it" — mark by
mark, only if a trail exists. Entry: menu row 6 (bearing), the FOLLOW TRAIL
chip / "follow the trail" (trail). Exit: "stop", or arrival (`campReached` →
the engine decides IDLE, same single-owner rule as the survey). There is NO
GPS anywhere in this: geolocation does not work in Preview and there is no
device here to test it on — camp is a world position in the same centimetre
space the site markers use, and bearing/distance are pure maths in
`Engine/NavMath.ts` (LEAF exercises them without Lens Studio).

Camp ownership: the automatic path (siteSelected, as shipped in 9cffd4f) may
move an automatic camp but NEVER overwrites a camp set BY HAND; manual SET
CAMP always overwrites. Honest degradation: drift leaves bearing/distance
coarser but valid; a lost pose (NaN, or debug key 0 to simulate) freezes the
readout at the LAST KNOWN bearing and every surface SAYS so.

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

> Those captures were taken while nothing followed the head (Headlock was
> disabled at the time). Since `Systems/HudFollower` (2026-08-21) the HUD DOES
> follow a pitch change: `hudfollower-pitch-level.jpg` /
> `hudfollower-pitch-down-30.jpg` show the menu staying in frame at level gaze
> AND at −30 °, with the 3 m footprint visible in the second. The frustum
> numbers above are unchanged — only the HUD's behaviour differs.

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

## DEMO_ENV [PREVIEW ONLY] — the desk diorama

A root-level tree of ordinary opaque geometry: a 240 m grass plane, a river
band, a dirt clearing, 25 generated trees, bushes, grass tufts, boulders and a
pitched camp tent. Meshes come from `GenerateFast3DAssets` into
`Assets/DemoEnv/`; the three flat colours are `DEMO_Grass` / `DEMO_Water` /
`DEMO_Dirt` (`SimplePBRMaterialPreset`).

| Path | What it is |
|---|---|
| `DEMO_ENV [PREVIEW ONLY]` | Master switch. **Always committed DISABLED** (guard-enforced); tick it on transiently while shooting a demo, untick before committing. |
| `…/Terrain/Ground` | 240 x 240 m plane at y = -120 — the same floor level as `WorldRoot`, so stakes, zones and markers stand on visible grass instead of void |
| `…/Terrain/River` | 160 m x 4.2 m water band at z = -19 m, yawed 8°. Context for the water lesson |
| `…/Terrain/Clearing` | 9 m dirt disc under the user — the camp clearing |
| `…/TreeLine/Pine_*, Broadleaf_*, Front_*` | 25 trees. `Front_*` is a deliberate arc at 17-35 m across ±50°, placed to sit ON THE HORIZON inside the display frustum |
| `…/Undergrowth/Bush_*, Grass_*, Boulder_*` | Scatter. Boulders sit on the river banks, not in the water |
| `…/CampProps/CampTent` | Pitched tent at 16 m, 25° yaw — reads as "camp is set" for the navigation scenario |

> **THIS IS NOT LENS CONTENT AND CANNOT BECOME LENS CONTENT.** It must be
> disabled before any device run or publish — and NOTHING structural keeps it
> out of a build: an enabled DEMO_ENV ships. Since 2026-08-21 the scene-roots
> guard enforces this (`must_be_disabled_roots` in the allowlist): a commit
> with the root enabled fails the pre-commit check. Only the ROOT's flag is
> checked — its children stay enabled on purpose, so showing the diorama for a
> capture stays a one-checkbox act. It also costs real frame time in Preview
> (measured 2026-08-21: disabling it took idle frames from ~400 ms to
> ~150-250 ms), so leave it off unless a capture needs it.

### Why a demo diorama exists at all, and what it cannot do

The Preview ships six Interactive scenes — `Plane`, `Sunlit Outdoor`,
`Evening Outdoor`, `Sunlit Room`, `Evening Room`, `Colorful Home`. Both
"outdoor" ones are a **city plaza with palm trees and shopfronts**, and custom
environments cannot be imported. So a wilderness backdrop can only come from
geometry we draw ourselves.

Two hard limits, both measured on 2026-08-21, both visible in
`Docs/screens/demoenv-v1-sunlit.jpg`:

1. **Additive display — measured, not assumed.** Opaque PBR geometry rendered
   by the Lens comes out TRANSLUCENT in the stereo preview: the plaza
   buildings read straight through a 240 m ground plane and through every tree.
   This is hard rule 2 arriving from the other direction — the waveguide adds
   light, so nothing the Lens draws can occlude the world. A believable solid
   forest is not achievable **in principle**, not just unpolished.
2. **The display frustum clips it.** The diorama is cut off by the same
   rectangle that clips the HUD (see the frustum section above). The ground
   band ends in a straight horizontal line partway down the frame — that edge
   is the waveguide, not the mesh.

What survives both limits is worth having: against the neutral grey of `Plane`,
the ground band, the river and a horizon treeline turn the backdrop from a grey
void into a legible outdoor setting, and the HUD stays fully readable on top
(`demoenv-v4-treeline.jpg`). That is the whole job. Anything more ambitious —
"make the preview look like a real forest" — is spent effort.

**Two capture modes, and they answer different questions.**

- `PreviewPanelTool screenshot` — what the wearer sees. HUD over the diorama,
  clipped to the frustum. This is the one that proves visibility.
- `CaptureRuntimeViewTool` (scene mode, `center: {x:0,y:0,z:-1500}`,
  `distance: 7000`) — the wide orthographic diorama shot, ignoring the frustum
  entirely. Good for a README hero image or an establishing frame; it is NOT
  evidence about what a wearer can see. **It returns an image, not a file** —
  there is no `outputPath`, so a run of it cannot be filed in `Docs/screens/`.
  Anything that has to be reviewable later must come from
  `PreviewPanelTool screenshot`, which does take a path.

> `CaptureRuntimeViewTool` re-injects the `AiPreviewAgent Handler` root every
> time it runs. It did on this pass. Run `python3 Tools/check-scene-roots.py`
> before committing and delete it again.

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
