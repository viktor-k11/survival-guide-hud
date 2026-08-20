@AGENTS.md

# CLAUDE.md — Survival Guide HUD
## CLAD Hackathon Week 2 — theme "Guide"

A hands-free AR survival guide for SPECS (Snap Spectacles). On boot the Lens
surveys the terrain and marks suggested sites (tent / fire) with rated icons.
The microphone is always the primary input: the user pinch-holds and asks for
help with any outdoor task; Gemini (via Remote Service Gateway) returns a
structured JSON lesson rendered as spatial widgets — a right-side phosphor
guide panel, staged blueprint holograms, ground zones, timers, checklists —
narrated by TTS. During a lesson, free-form voice questions are answered
aloud by Gemini with step context. Retro-futuristic phosphor HUD aesthetic.

## HARD RULES for ALL work in this repo

1. **DESIGN-TIME FIRST.** Every visual object (widgets, panels, zones,
   markers, holograms, props containers) exists in the scene hierarchy from
   the start, disabled. Code only enables, populates and positions existing
   objects. Code NEVER instantiates visual objects at runtime. All visual
   parameters (colors, sizes, materials, timings, fonts) are exposed as
   @input in the Inspector so they can be edited without code.

2. **ADDITIVE DISPLAY.** The SPECS waveguide is additive: black/dark renders
   as transparent. All visuals use bright saturated emissive colors. No dark
   fills or dark backgrounds, ever. "Translucent panel" means translucent
   emissive glow, never a darkening plate.

3. **ENGINE / PRESENTATION SPLIT.** `Scripts/Engine/` holds logic (lesson
   state machine, survey scoring, voice routing, ASR/RSG/TTS wiring) and
   communicates with `Scripts/Widgets/` (thin presenters) ONLY via the
   EventBus. Widgets contain no logic. Engine code never references widget
   visuals directly.

4. **PROMPT LOG.** After completing each task, append to CLAD-PROMPT-LOG.md:
   the user prompt (verbatim), a one-line summary of what was done, and any
   notable decision or discovered issue. Chronological, never rewrite history.

5. **DETERMINISM FOR TESTS.** Everything testable runs from stored JSON
   fixtures (Assets/AI/fixtures/) without calling Gemini. AI non-determinism
   stays isolated at the integration boundary. Every raw Gemini response is
   saved as a fixture.

6. **VOICE ROUTING ORDER.** Transcripts are first matched against local
   navigation keywords (next / back / repeat / done / confirm / stop / check
   / sos and natural variants) with NO AI call. Only unmatched transcripts
   go to Gemini: as a new lesson request in IDLE mode, or as a contextual
   Q&A question during a LESSON.

7. **LICENSING.** No third-party IP: the visual style is "retro-futuristic
   phosphor HUD" — never reference or imitate specific franchise assets.
   All generated assets (meshes, SFX, music) come from CLAD generation
   skills or license-clean sources noted in the log.

## Communication

**SCREENSHOTS GO TO `Docs/screens/`.** Whenever a task asks for visual
verification, save the capture to a file and name it in the report. A screenshot
that exists only in the agent's context is invisible to the person who asked for
it — it cannot be reviewed, compared against the next run, or shown to anyone
else. JPEG is fine; these are review artefacts, not masters.

Two corollaries learned the hard way:

- **Verify HUD layout with `PreviewPanelTool screenshot`, not
  `CaptureRuntimeViewTool`.** The runtime capture frames whatever it is pointed
  at and ignores the device frustum, so it will happily show a HUD the wearer
  cannot see. Use the ortho capture to read text, the preview panel to prove
  visibility.
- **Say which capture is which** in the report, and keep the filenames stable
  across sessions so successive runs can be compared.
