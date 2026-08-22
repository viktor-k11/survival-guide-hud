/**
 * SfxService — the ONE owner of non-speech audio cues.
 *
 * This service carries ONE AudioComponent, subscribes to the EventBus, and
 * maps events to cues. It is SEPARATE from NarrationService, which keeps sole
 * ownership of the speech channel — the two never share a component.
 *
 * ## The rule
 *
 * NOTHING THE USER CAUSES IS SILENT. If the app changed state because of
 * something the person did — a selection, a step, a grab, a refusal, an
 * arrival — it makes a sound. State the app changes on its own may be silent,
 * and mostly is (see "Deliberately silent" at the bottom).
 *
 * ## A VOCABULARY, not a catalogue — twelve cues, hard cap
 *
 * A terminal has a language. Cues are reused by MEANING, never by widget: the
 * same advance tick serves a menu highlight, a checklist row and a step
 * counter, because to the user those are the same kind of event. Roughly
 * thirty distinct events map onto these twelve sounds.
 *
 *   crt-power-on      boot
 *   panel-open        a surface appeared   (menu, keyboard, mic, journal,
 *                                          lesson, survey, props, navigation)
 *   panel-close       a surface went away  (the same two notes, reversed)
 *   nav-tick          ADVANCED             (step next, checklist row, menu
 *                                          highlight, hologram stage, grab,
 *                                          trail mark)
 *   nav-back          reversed             (step back — nav-tick's mirror)
 *   confirm-blip      ACCEPTED             (selection, request taken, prop
 *                                          seated, safety confirmed, camp set)
 *   error-buzz        REFUSED / hazard     (next refused, request failed,
 *                                          busy, warning raised, too close)
 *   completion-sting  ARRIVED              (lesson done, pattern complete,
 *                                          back at camp)
 *   survey-ping       one placed marker
 *   geiger-click      survey ambience
 *   sos-dot / sos-dash  the distress rhythm
 *
 * ### The eyes-closed test
 *
 * accepted / refused / advanced / arrived must be tellable apart with no
 * screen. Pitch and duration carry that, not volume:
 *
 *   advanced  45 ms   ~1.5-2.0 kHz  one rising tone      — short, high, up
 *   accepted  90 ms   ~0.5 kHz      one FM blip          — short, mid
 *   refused   450 ms  ~0.3 kHz      rough descending buzz — long, low, dirty
 *   arrived   1.77 s  bell arpeggio ascending, multi-note — long, tonal
 *
 * Each occupies a different corner of (duration x pitch), and the two that
 * share a corner-ish region — advanced and accepted, both short — sit a
 * musical eleventh apart with different timbres (triangle sweep vs FM blip).
 * nav-back is nav-tick's exact mirror: same voice, falling instead of rising
 * and an octave lower at the tail, so "went back" cannot be heard as "went
 * forward".
 *
 * ## Volume tiers
 *
 * A tick at the same level as a warning destroys the warning. Every cue
 * belongs to a tier and the tier sets the level:
 *
 *   AMBIENCE   geiger                          quietest
 *   TICK       nav-tick, nav-back              barely there
 *   SELECTION  confirm, panels, ping, sting    modest
 *   ALERT      error, SOS                      clearly above the rest
 *
 * ## Rate-limiting and coalescing
 *
 * Two disciplines, because the failure modes differ:
 *
 * - PER-CUE WINDOW. The same cue fired repeatedly inside its window plays
 *   once. Ticks get a long window (gaze drift across menu rows would otherwise
 *   machine-gun); everything else gets a short one, enough to swallow a chain
 *   reaction like "menu row chosen -> request accepted" without swallowing two
 *   deliberate taps.
 * - ONE CUE PER FRAME, HIGHEST RANK WINS. (Rank is normally the volume tier;
 *   an arrival ranks above other selections without being louder — see
 *   RANK_ARRIVAL.) Several events genuinely land in one
 *   frame — a prop completing a pattern also advances the step; entering a
 *   safety step both changes step and raises a warning. Markers already
 *   staggered themselves; this applies the same discipline generally, so a
 *   frame produces one sound and it is the most important one.
 *
 * Cues play IMMEDIATELY, inside the handler. An earlier version queued the
 * frame's winner and flushed it from UpdateEvent, which was wrong twice over:
 *
 *   - It logged a line for every LOSING cue. During a survey that is one
 *     print() per sampled point, several times a frame, which on its own is
 *     enough to blow the runtime's per-frame JavaScript budget. It did:
 *     `TimeoutError: Javascript execution has timed out`.
 *   - Once that fired, the UpdateEvent binding was gone — and with the only
 *     flush path dead, EVERY cue went silent for the rest of the session.
 *     A whole interface muted by one noisy log line.
 *
 * Playing inline removes both. Same-frame arbitration still works because a
 * later, higher-tier cue simply re-points the AudioComponent before the loser
 * has sounded a single sample; a later lower-tier one is dropped. Nothing but
 * the marker-ping stagger depends on UpdateEvent now, so if that binding ever
 * dies again it costs the stagger, not the whole vocabulary. And the rejection
 * paths do not log at all — the rate limiter has to be cheaper than the sound.
 *
 * ## Narration: duck, never talk across it
 *
 * Speech is the most important audio in this product and it is already slow.
 * Cues never interrupt it. But SKIPPING every cue under narration made half
 * the interface silent again during the exact stretch where the user is
 * pressing buttons — a lesson step is narrated for most of its life. So:
 *
 *   ALERT      plays at full level over narration. A warning that gets
 *              skipped is not a warning. (This generalises the exception the
 *              safety buzz already had.)
 *   TICK/SEL.  DUCKED to `narrationDuck` of their tier level, not skipped.
 *   AMBIENCE   skipped entirely — a stream of clicks under speech is the one
 *              case where quieter is not enough.
 *
 * ## Failure
 *
 * A cue that cannot play — unwired track, missing component, a throw from
 * play() — is SILENCE PLUS A LOG LINE. Never an exception on the bus.
 *
 * ## Deliberately silent
 *
 * App-driven or continuous state, and moments the voice already covers:
 * narration* / speakRequested / qaAnswered (the speech IS the feedback),
 * voiceInterim, userRequest (its routing outcome sounds instead),
 * modeChanged, companionChanged, timerTick, navigateUpdated, hologramShown,
 * lessonKindInferred, lessonAnchorChanged, hazardsDetected (rides with
 * surveyComplete), nextStepSuggested (a background call the user did not
 * make), propPlaced (the engine's echo of propSnapped, which already sounded),
 * sosStateChanged{active:true} (the spoken line and the prosign cover it, and
 * a cue there corrupts the first ···---···),
 * stepChanged{reason:"load"} (lessonStarted opens in the same frame),
 * the mic's "finalizing" hop, which the user did not cause, and
 * menuChipSelected, whose every effect announces itself more precisely than
 * the chip does (see the note in bindAcceptance).
 */
import { eventBus, Events } from "./EventBus";
import { MenuSelectedPayload, RequestStatePayload } from "./RequestTypes";
import { SurveyCompletePayload } from "./SurveyTypes";
import { TrailStatePayload } from "./NavTypes";

/** Loudness AND arbitration rank. Higher wins the frame. */
const TIER_AMBIENCE = 0;
const TIER_TICK = 1;
const TIER_SELECTION = 2;
const TIER_ALERT = 3;

/** Two cues closer together than this are treated as landing in one frame. */
const SAME_FRAME_SEC = 0.005;

/**
 * Arbitration rank for an ARRIVAL, sitting between SELECTION and ALERT.
 *
 * Volume and importance are not the same axis. An arrival is quiet — it has no
 * business being as loud as a warning — but it must not be swallowed, and it
 * was: reaching camp fires campReached in the same frame as the navigation
 * surface opening and the trail recorder closing, all three at SELECTION, and
 * the arrival lost the tie to whichever asked first. "Arrived" is one of the
 * four meanings that must always come through.
 */
const RANK_ARRIVAL = 2.5;

@component
export class SfxService extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">The twelve cues — Assets/GeneratedSFX</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Hard cap of twelve. Reuse by MEANING, never by widget. Unwired slot = that cue is silence plus a log line. Nothing throws.</span>')

  @input @allowUndefined @hint("crt-power-on.wav — boot") private cuePowerOn: AudioTrackAsset;
  @input @allowUndefined @hint("panel-open.wav — a surface appeared: menu, keyboard, mic, journal, lesson loaded, survey started, props ready, navigation, recenter") private cuePanelOpen: AudioTrackAsset;
  @input @allowUndefined @hint("panel-close.wav — a surface went away: mic closed, journal closed, stop, trail stopped, SOS left. The same two notes as panel-open, reversed.") private cuePanelClose: AudioTrackAsset;
  @input @allowUndefined @hint("nav-tick.wav — ADVANCED: step next, checklist row, menu highlight, hologram stage, prop grabbed, trail mark") private cueNavTick: AudioTrackAsset;
  @input @allowUndefined @hint("nav-back.wav — reversed: step back. nav-tick's mirror, falling instead of rising.") private cueNavBack: AudioTrackAsset;
  @input @allowUndefined @hint("confirm-blip.wav — ACCEPTED: selection, request taken, question taken, prop seated, safety confirmed, camp marked") private cueConfirm: AudioTrackAsset;
  @input @allowUndefined @hint("error-buzz.wav — REFUSED / hazard: next refused, request failed, request ignored as busy, safety warning raised, distance warning") private cueError: AudioTrackAsset;
  @input @allowUndefined @hint("completion-sting.wav — ARRIVED: lesson complete, prop pattern complete, back at camp") private cueCompletion: AudioTrackAsset;
  @input @allowUndefined @hint("survey-ping.wav — one per placed marker, staggered") private cueSurveyPing: AudioTrackAsset;
  @input @allowUndefined @hint("geiger-click.wav — survey ambience, rate-limited") private cueGeiger: AudioTrackAsset;
  @input @allowUndefined @hint("sos-dot.wav — one short SOS pulse") private cueSosDot: AudioTrackAsset;
  @input @allowUndefined @hint("sos-dash.wav — one long SOS pulse") private cueSosDash: AudioTrackAsset;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Volume tiers</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">A tick at the same level as a warning destroys the warning. Alerts must sit clearly above everything else.</span>')

  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("Master level. Every tier is a fraction of this.")
  private volume: number = 0.8;

  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("AMBIENCE — the geiger click. Quietest thing in the mix.")
  private ambienceLevel: number = 0.3;

  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("TICK — advance / back. Barely there on purpose; these fire most often.")
  private tickLevel: number = 0.45;

  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("SELECTION — confirm, panels, marker pings, completion. Modest.")
  private selectionLevel: number = 0.75;

  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("ALERT — error buzz and SOS. Clearly above the rest, and the only tier that plays over narration.")
  private alertLevel: number = 1.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Pacing</span>')

  @input @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("How far ticks and selections are ducked while narration has the air. 0 = skipped entirely (the old behaviour), which leaves half the interface silent during a narrated step. Alerts ignore this.")
  private narrationDuck: number = 0.35;

  @input @widget(new SliderWidget(0.05, 1.0, 0.05))
  @hint("Minimum seconds between geiger clicks. The click is ambience for the survey, not a counter of accepted points.")
  private geigerMinIntervalSec: number = 0.12;

  @input @widget(new SliderWidget(0.05, 1.0, 0.05))
  @hint("Minimum seconds between two ticks of the SAME kind. Long, because a tick on every gaze drift across the menu rows is maddening.")
  private tickMinIntervalSec: number = 0.25;

  @input @widget(new SliderWidget(0.0, 0.6, 0.05))
  @hint("Coalescing window for every other cue: the same cue inside this window plays once. Swallows chain reactions (row chosen -> request accepted) without swallowing two deliberate taps.")
  private coalesceWindowSec: number = 0.15;

  @input @widget(new SliderWidget(0.1, 1.5, 0.05))
  @hint("Stagger between the per-marker pings on surveyComplete.")
  private pingSpacingSec: number = 0.4;

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private audio: AudioComponent | null = null;
  /** Narration owns the air. While it speaks (or is about to), cues duck. */
  private narrationBusy: boolean = false;

  /** Last play time per cue name, for the per-cue windows. */
  private lastPlayedAt: Map<string, number> = new Map();
  /** When the last cue sounded, and at what rank — the same-frame arbiter. */
  private lastCueAt: number = -1;
  private lastCueRank: number = -1;

  /** Pings still owed from the last surveyComplete. */
  private pingsPending: number = 0;
  private pingClock: number = 0;

  // Edge detection — the bus carries state, cues need transitions.
  private prevRequestState: string = "";
  private prevVoiceState: string = "";
  private prevTrailRecording: boolean = false;
  private prevTrailMarks: number = 0;
  private prevPropsActive: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[SFX] " + msg);
  }

  private onStart(): void {
    this.audio = this.sceneObject.getComponent("Component.AudioComponent") as AudioComponent;
    if (!this.audio) {
      this.log("no AudioComponent on this object — every cue will be silence");
    }

    eventBus.subscribe(Events.narrationStateChanged, (p: { speaking: boolean; pending: boolean }) => {
      this.narrationBusy = !!(p && (p.speaking || p.pending));
    });

    this.bindBoot();
    this.bindSurfaces();
    this.bindMovement();
    this.bindAcceptance();
    this.bindAlerts();
    this.bindArrivals();
    this.bindSurvey();
    this.bindSos();

    this.log(
      "ready. twelve cues wired: powerOn=" + !!this.cuePowerOn + " open=" + !!this.cuePanelOpen +
        " close=" + !!this.cuePanelClose + " tick=" + !!this.cueNavTick + " back=" + !!this.cueNavBack +
        " confirm=" + !!this.cueConfirm + " error=" + !!this.cueError + " sting=" + !!this.cueCompletion +
        " ping=" + !!this.cueSurveyPing + " geiger=" + !!this.cueGeiger +
        " sosDot=" + !!this.cueSosDot + " sosDash=" + !!this.cueSosDash
    );
  }

  // ------------------------------------------------------------ boot

  private bindBoot(): void {
    // SELECTION, not ALERT: the boot cue is a surface arriving, not a warning,
    // and it does not need the alert level to be heard — by construction it
    // fires before any speech exists, so nothing ducks it either way.
    eventBus.subscribe(Events.introStateChanged, (p: { active: boolean }) => {
      if (p && p.active) this.request(this.cuePowerOn, "crt-power-on", TIER_SELECTION, "boot");
    });
  }

  // ------------------------------------------- surfaces: open / close

  private bindSurfaces(): void {
    const open = (why: string) => this.request(this.cuePanelOpen, "panel-open", TIER_SELECTION, why);
    const close = (why: string) => this.request(this.cuePanelClose, "panel-close", TIER_SELECTION, why);

    // The mic. "finalizing" is the app deciding the phrase ended, not the
    // user doing anything, so only the two edges the user causes sound.
    eventBus.subscribe(Events.voiceStateChanged, (p: { state: string }) => {
      const next = p ? p.state : "";
      const prev = this.prevVoiceState;
      this.prevVoiceState = next;
      if (next === "listening" && prev !== "listening") open("mic opened");
      else if (next === "idle" && prev !== "idle" && prev !== "") close("mic closed");
    });

    eventBus.subscribe(Events.keyboardRequested, () => open("keyboard"));
    eventBus.subscribe(Events.journalStateChanged, (p: { open: boolean; refused: boolean }) => {
      if (p && p.refused) this.request(this.cueError, "error-buzz", TIER_ALERT, "journal refused");
      else if (p && p.open) open("journal");
      else close("journal");
    });
    // The plan landed after the 10-15 s COMPILING wait: the guide appears.
    eventBus.subscribe(Events.lessonStarted, () => open("lesson loaded"));
    eventBus.subscribe(Events.stopRequested, () => close("stop"));
    eventBus.subscribe(Events.surveyStarted, () => open("survey"));
    eventBus.subscribe(Events.navigateRequested, () => open("navigate"));
    // The HUD snapping back in front of the user is a surface arriving.
    eventBus.subscribe(Events.recenterRequested, () => open("recenter"));
    // Props becoming grabbable is a surface appearing; retiring is not a thing
    // the user did, so only the rising edge sounds.
    eventBus.subscribe(Events.propsStateChanged, (p: { active: boolean }) => {
      const active = !!(p && p.active);
      if (active && !this.prevPropsActive) open("props ready");
      this.prevPropsActive = active;
    });
  }

  // ------------------------------------------ movement: advance / back

  private bindMovement(): void {
    const tick = (why: string) => this.request(this.cueNavTick, "nav-tick", TIER_TICK, why);

    // Same tick for all of these — to the user they are one kind of event.
    eventBus.subscribe(Events.menuHighlightChanged, () => tick("menu highlight"));
    eventBus.subscribe(Events.hologramStage, () => tick("hologram stage"));
    eventBus.subscribe(Events.propGrabbed, () => tick("prop grabbed"));
    eventBus.subscribe(Events.checklistUpdated, (p: { justChecked: number }) => {
      if (p && p.justChecked >= 0) tick("checklist row");
    });

    eventBus.subscribe(Events.stepChanged, (p: { reason: string }) => {
      const reason = p ? p.reason : "";
      if (reason === "back") this.request(this.cueNavBack, "nav-back", TIER_TICK, "step back");
      else if (reason === "next") tick("step next");
      // reason "load" is silent: lessonStarted opens in the same breath.
    });

    // A mark drops every markSpacingCm of WALKING — the user's own doing.
    eventBus.subscribe(Events.trailStateChanged, (p: TrailStatePayload) => {
      const recording = !!(p && p.recording);
      const marks = p && typeof p.markCount === "number" ? p.markCount : 0;
      if (recording && !this.prevTrailRecording) {
        this.request(this.cuePanelOpen, "panel-open", TIER_SELECTION, "trail started");
      } else if (!recording && this.prevTrailRecording) {
        this.request(this.cuePanelClose, "panel-close", TIER_SELECTION, "trail stopped");
      } else if (recording && marks > this.prevTrailMarks) {
        tick("trail mark");
      }
      this.prevTrailRecording = recording;
      this.prevTrailMarks = marks;
    });
  }

  // ---------------------------------------------------- acceptance

  private bindAcceptance(): void {
    const ok = (why: string) => this.request(this.cueConfirm, "confirm-blip", TIER_SELECTION, why);

    eventBus.subscribe(Events.menuSelected, (_p: MenuSelectedPayload) => ok("menu row"));
    // NOTE: menuChipSelected deliberately has NO cue of its own. Every footer
    // chip's EFFECT already announces itself, and says more than the chip
    // does: setCamp -> campChanged (accepted), trailStart -> trailStateChanged
    // (a surface opened), followTrail -> navigateRequested (a surface opened),
    // journal -> journalStateChanged (opened / closed / REFUSED). Blipping the
    // chip as well flattened all of that: the blip landed in the same frame,
    // won the tie by arriving first, and made opening the journal sound
    // exactly like closing it — and made a REFUSED open sound like an
    // accepted one. Found walking the path end to end.
    eventBus.subscribe(Events.siteSelected, () => ok("site marker"));
    eventBus.subscribe(Events.suggestionAccepted, () => ok("next-step suggestion"));
    // The question was taken and is on its way to Gemini. The ANSWER is
    // spoken, so it needs no cue of its own.
    eventBus.subscribe(Events.qaRequested, () => ok("question taken"));
    // The camp point landing — voice/auto sets have no chip to blip.
    eventBus.subscribe(Events.campChanged, (p: { source: string }) => {
      if (p && p.source !== "fixture") ok("camp marked");
    });
    // A prop seated in its slot: accepted, same as any other acceptance.
    // The pattern COMPLETING is an arrival and sounds different.
    //
    // propSnapped (the CONTROLLER's fact), not propPlaced (the engine's record
    // of it): the engine only re-emits while a lesson is running, so a prop
    // seated outside one — the forced-props path — landed in silence. The
    // controller always reports, and carries the same placed/required counts.
    eventBus.subscribe(Events.propSnapped, (p: { placed: number; required: number }) => {
      const placed = p && typeof p.placed === "number" ? p.placed : 0;
      const required = p && typeof p.required === "number" ? p.required : 0;
      if (required > 0 && placed >= required) {
        this.request(this.cueCompletion, "completion-sting", TIER_SELECTION, "pattern complete", RANK_ARRIVAL);
      } else {
        ok("prop seated");
      }
    });
    eventBus.subscribe(Events.safetyPending, (p: { pending: boolean }) => {
      if (p && p.pending === false) ok("safety confirmed");
    });
  }

  // -------------------------------------------------------- alerts

  private bindAlerts(): void {
    // ALERT tier plays OVER narration, deliberately. On a safety step the
    // instruction and the warning are almost always still being spoken, so a
    // ducked-to-nothing buzz means a refused "next" produces no feedback at
    // all — the strip was already up, nothing changes visually.
    const alert = (why: string) => this.request(this.cueError, "error-buzz", TIER_ALERT, why);

    eventBus.subscribe(Events.safetyRejected, () => alert("next refused"));
    // Raising the gate is the same family as being stopped by it: the buzz
    // means "this is hot", whether you have pushed against it yet or not.
    eventBus.subscribe(Events.safetyPending, (p: { pending: boolean }) => {
      if (p && p.pending === true) alert("safety warning raised");
    });
    eventBus.subscribe(Events.distanceWarning, () => alert("distance warning"));

    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      const state = p ? p.state : "";
      const prev = this.prevRequestState;
      this.prevRequestState = state;
      if (state === prev) return;
      if (state === "ERROR") alert("request failed");
      // BUSY means a second request was IGNORED. The user did something and
      // nothing happened — exactly the case that must never be silent.
      else if (state === "BUSY") alert("request ignored, busy");
      // The machine took the request. Same meaning as any acceptance, and it
      // coalesces with the menu blip that caused it.
      else if (state === "COMPILING") {
        this.request(this.cueConfirm, "confirm-blip", TIER_SELECTION, "request accepted");
      }
    });
  }

  // ------------------------------------------------------ arrivals

  private bindArrivals(): void {
    eventBus.subscribe(Events.lessonCompleted, () =>
      this.request(this.cueCompletion, "completion-sting", TIER_SELECTION, "lesson complete", RANK_ARRIVAL)
    );
    // Making it back to camp earns the same sting as finishing a lesson.
    eventBus.subscribe(Events.campReached, () =>
      this.request(this.cueCompletion, "completion-sting", TIER_SELECTION, "back at camp", RANK_ARRIVAL)
    );
  }

  // -------------------------------------------------------- survey

  private bindSurvey(): void {
    eventBus.subscribe(Events.surveyProgress, () => {
      this.request(this.cueGeiger, "geiger-click", TIER_AMBIENCE, "survey sample");
    });
    eventBus.subscribe(Events.surveyComplete, (p: SurveyCompletePayload) => {
      this.pingsPending = p && p.sites ? p.sites.length : 0;
      this.pingClock = this.pingSpacingSec; // first ping lands immediately
    });
  }

  // ----------------------------------------------------------- SOS

  private bindSos(): void {
    eventBus.subscribe(Events.sosStateChanged, (p: { active: boolean }) => {
      // ENTERING is deliberately uncued. It is not silent — the engine speaks
      // the SOS line and the prosign rhythm starts within a beat — and a cue
      // here actively damaged the signal: an entry tone lands in the same
      // frame as the cycle's first element, wins the tie, and the first
      // ···---··· goes out starting on a dash. Verified in the log; the second
      // cycle was correct and the first was not. The rhythm announces itself.
      if (p && !p.active) {
        this.request(this.cuePanelClose, "panel-close", TIER_SELECTION, "SOS left");
      }
    });
    eventBus.subscribe(Events.sosPulse, (p: { kind: string }) => {
      const dash = !!(p && p.kind === "dash");
      this.request(dash ? this.cueSosDash : this.cueSosDot, dash ? "sos-dash" : "sos-dot", TIER_ALERT, "pulse");
    });
  }

  // ------------------------------------------------- frame arbitration

  /**
   * Offer a cue. It sounds now, or it does not sound at all.
   *
   * Two gates, cheapest first, and NEITHER logs — this runs several times per
   * frame during a survey, and a print() per rejection costs more frame time
   * than the sound it is describing (see the header).
   *
   *   1. The per-cue window. The same cue inside it plays once.
   *   2. One cue per frame, highest RANK wins. Several events genuinely land
   *      together — a prop completes a pattern AND advances the step; a step
   *      change AND its safety warning — and two sounds at once is noise. A
   *      tie goes to whoever asked first: within one rank the earliest event
   *      is the cause and the later ones are its consequences.
   *
   * `tier` sets the volume; `rank` settles the frame and defaults to the tier.
   * They differ only for arrivals — see RANK_ARRIVAL.
   */
  private request(
    track: AudioTrackAsset | undefined,
    name: string,
    tier: number,
    why: string = "",
    rank: number = -1
  ): void {
    if (rank < 0) rank = tier;
    const now = getTime();

    const last = this.lastPlayedAt.get(name);
    if (last !== undefined && now - last < this.windowFor(name, tier)) return;

    // getTime() holds still for the duration of a frame, so "same frame" is
    // "same timestamp". The epsilon is well under one frame at any rate the
    // hardware reaches and costs nothing but a hair of extra coalescing.
    if (this.lastCueAt >= 0 && now - this.lastCueAt < SAME_FRAME_SEC && rank <= this.lastCueRank) return;

    // The window is stamped on the ATTEMPT, not on the sound. A cue that is
    // ducked away, unwired or skipped must still wait its turn before trying
    // again — otherwise a geiger click that narration is suppressing calls
    // play() (and logs) on every single sampled point, which is the flood the
    // rate limiter exists to prevent.
    this.lastPlayedAt.set(name, now);

    if (!this.play(track ? track : null, name, tier)) return;

    // Only a cue that actually sounded claims the frame.
    this.lastCueAt = now;
    this.lastCueRank = rank;
    if (why) this.log(name + " <- " + why);
  }

  private tierLevel(tier: number): number {
    if (tier === TIER_ALERT) return this.alertLevel;
    if (tier === TIER_SELECTION) return this.selectionLevel;
    if (tier === TIER_TICK) return this.tickLevel;
    return this.ambienceLevel;
  }

  /** The per-cue coalescing window, in seconds. */
  private windowFor(name: string, tier: number): number {
    if (name === "geiger-click") return this.geigerMinIntervalSec;
    if (tier === TIER_TICK) return this.tickMinIntervalSec;
    return this.coalesceWindowSec;
  }

  /**
   * The ONLY thing left on the frame clock: staggering the per-marker pings so
   * three markers read as three pings rather than one thicker one. Everything
   * else plays inline, so this binding dying costs the stagger and nothing
   * more.
   */
  private onUpdate(): void {
    if (this.pingsPending <= 0) return;
    this.pingClock += getDeltaTime();
    if (this.pingClock < this.pingSpacingSec) return;
    this.pingClock = 0;
    this.pingsPending--;
    this.request(this.cueSurveyPing, "survey-ping", TIER_SELECTION, "marker placed");
  }

  /**
   * The one play path. Returns whether a sound actually left the speaker, so
   * a coalescing window is never started by a cue that stayed silent.
   * Everything that can go wrong lands as a log line, never a throw.
   */
  private play(track: AudioTrackAsset | null, name: string, tier: number): boolean {
    if (!track) {
      this.log(name + ": no track wired — silence");
      return false;
    }
    if (!this.audio) {
      this.log(name + ": no AudioComponent — silence");
      return false;
    }

    let level = this.volume * this.tierLevel(tier);
    if (this.narrationBusy && tier !== TIER_ALERT) {
      // Ambience under speech is the one case where quieter is not enough.
      if (tier === TIER_AMBIENCE) {
        this.log(name + ": narration has the air — ambience skipped");
        return false;
      }
      level *= this.narrationDuck;
      if (level <= 0.001) {
        this.log(name + ": narration has the air and duck is 0 — skipped");
        return false;
      }
      this.log(name + ": ducked under narration");
    }

    try {
      this.audio.audioTrack = track;
      this.audio.volume = level;
      this.audio.play(1);
    } catch (e) {
      this.log(name + ": play() threw — " + e);
      return false;
    }
    return true;
  }
}
