/**
 * SfxService — the ONE owner of non-speech audio cues.
 *
 * The P12 batch generated six WAVs into Assets/GeneratedSFX/ and deliberately
 * did not touch NarrationService; until now nothing owned them. This service
 * carries ONE AudioComponent, subscribes to the EventBus, and maps events to
 * cues. It is SEPARATE from NarrationService, which keeps sole ownership of
 * the speech channel — the two never share a component and never will.
 *
 * ## The mapping
 *
 *   crt-power-on     -> introStateChanged {active:true} (boot)
 *   confirm-blip     -> menuSelected · checklist item checked · safety confirmed · prop placed
 *   error-buzz       -> safetyRejected · request ERROR state
 *   survey-ping      -> surveyComplete, once per placed marker, staggered
 *   geiger-click     -> surveyProgress, RATE-LIMITED — ambience, not per point
 *   completion-sting -> lessonCompleted
 *
 * ## The guard rules, same as audio is guarded everywhere here
 *
 * - A cue that cannot play (unwired track, missing component, a throw from
 *   play()) is SILENCE PLUS A LOG LINE — never an exception on the bus.
 * - A cue never talks over narration: while NarrationService reports speaking,
 *   cues are SKIPPED (logged), not queued. The one exception is the boot cue,
 *   which by construction fires before any speech exists.
 */
import { eventBus, Events } from "./EventBus";
import { MenuSelectedPayload, RequestStatePayload } from "./RequestTypes";
import { SurveyCompletePayload } from "./SurveyTypes";

@component
export class SfxService extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Cues — Assets/GeneratedSFX</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Unwired slot = that cue is silence plus a log line. Nothing throws.</span>')

  @input @allowUndefined @hint("crt-power-on.wav — boot") private cuePowerOn: AudioTrackAsset;
  @input @allowUndefined @hint("confirm-blip.wav — local acknowledgement") private cueConfirm: AudioTrackAsset;
  @input @allowUndefined @hint("error-buzz.wav — rejection / failure") private cueError: AudioTrackAsset;
  @input @allowUndefined @hint("survey-ping.wav — one per placed marker") private cueSurveyPing: AudioTrackAsset;
  @input @allowUndefined @hint("geiger-click.wav — survey ambience") private cueGeiger: AudioTrackAsset;
  @input @allowUndefined @hint("completion-sting.wav — lesson complete") private cueCompletion: AudioTrackAsset;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Pacing</span>')

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.05))
  @hint("Minimum seconds between geiger clicks. The click is ambience for the survey, not a counter of accepted points.")
  private geigerMinIntervalSec: number = 0.12;

  @input
  @widget(new SliderWidget(0.1, 1.5, 0.05))
  @hint("Stagger between the per-marker pings on surveyComplete.")
  private pingSpacingSec: number = 0.4;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Playback volume for every cue.")
  private volume: number = 0.8;

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private audio: AudioComponent | null = null;
  /** Narration owns the air. While it speaks (or is about to), cues skip. */
  private narrationBusy: boolean = false;
  private lastGeigerAt: number = -1;
  /** Pings still owed from the last surveyComplete. */
  private pingsPending: number = 0;
  private pingClock: number = 0;

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

    // --- boot ------------------------------------------------------------
    eventBus.subscribe(Events.introStateChanged, (p: { active: boolean }) => {
      if (p && p.active) this.play(this.cuePowerOn, "crt-power-on", true);
    });

    // --- confirmations ---------------------------------------------------
    eventBus.subscribe(Events.menuSelected, (_p: MenuSelectedPayload) => {
      this.play(this.cueConfirm, "confirm-blip");
    });
    eventBus.subscribe(Events.menuChipSelected, () => {
      this.play(this.cueConfirm, "confirm-blip");
    });
    // The camp point landing gets its own blip — voice/auto sets have no chip.
    eventBus.subscribe(Events.campChanged, (p: { source: string }) => {
      if (p && p.source !== "fixture") this.play(this.cueConfirm, "confirm-blip");
    });
    eventBus.subscribe(Events.checklistUpdated, (p: { justChecked: number }) => {
      if (p && p.justChecked >= 0) this.play(this.cueConfirm, "confirm-blip");
    });
    // A prop snapping into its slot is a local acknowledgement, same family
    // as a checklist tick.
    eventBus.subscribe(Events.propPlaced, () => {
      this.play(this.cueConfirm, "confirm-blip");
    });
    eventBus.subscribe(Events.safetyPending, (p: { pending: boolean }) => {
      if (p && p.pending === false) this.play(this.cueConfirm, "confirm-blip");
    });

    // --- failures --------------------------------------------------------
    // OVER narration, deliberately: on a safety step the instruction and the
    // warning are almost always still being spoken, so a skipped buzz means a
    // refused "next" produces NO feedback at all — the strip was already up,
    // nothing changes visually. Found walking the gate end to end (P14).
    eventBus.subscribe(Events.safetyRejected, () => {
      this.play(this.cueError, "error-buzz", true);
    });
    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      if (p && p.state === "ERROR") this.play(this.cueError, "error-buzz");
    });

    // --- survey ----------------------------------------------------------
    eventBus.subscribe(Events.surveyProgress, () => {
      const now = getTime();
      if (this.lastGeigerAt >= 0 && now - this.lastGeigerAt < this.geigerMinIntervalSec) return;
      this.lastGeigerAt = now;
      this.play(this.cueGeiger, "geiger-click");
    });
    eventBus.subscribe(Events.surveyComplete, (p: SurveyCompletePayload) => {
      this.pingsPending = p && p.sites ? p.sites.length : 0;
      this.pingClock = this.pingSpacingSec; // first ping lands immediately
    });

    // --- completion ------------------------------------------------------
    eventBus.subscribe(Events.lessonCompleted, () => {
      this.play(this.cueCompletion, "completion-sting");
    });
    // Making it back to camp earns the same sting as finishing a lesson.
    eventBus.subscribe(Events.campReached, () => {
      this.play(this.cueCompletion, "completion-sting");
    });

    this.log(
      "ready. tracks: powerOn=" + !!this.cuePowerOn + " confirm=" + !!this.cueConfirm +
        " error=" + !!this.cueError + " ping=" + !!this.cueSurveyPing +
        " geiger=" + !!this.cueGeiger + " sting=" + !!this.cueCompletion
    );
  }

  /** Staggers the per-marker pings so three markers read as three pings. */
  private onUpdate(): void {
    if (this.pingsPending <= 0) return;
    this.pingClock += getDeltaTime();
    if (this.pingClock < this.pingSpacingSec) return;
    this.pingClock = 0;
    this.pingsPending--;
    this.play(this.cueSurveyPing, "survey-ping");
  }

  /**
   * The one play path. `overNarration` is true only for the boot cue.
   * Everything that can go wrong lands as a log line, never a throw.
   */
  private play(track: AudioTrackAsset | undefined, name: string, overNarration: boolean = false): void {
    if (!track) {
      this.log(name + ": no track wired — silence");
      return;
    }
    if (!this.audio) {
      this.log(name + ": no AudioComponent — silence");
      return;
    }
    if (this.narrationBusy && !overNarration) {
      this.log(name + ": narration has the air — skipped");
      return;
    }
    try {
      this.audio.audioTrack = track;
      this.audio.volume = this.volume;
      this.audio.play(1);
    } catch (e) {
      this.log(name + ": play() threw — " + e);
    }
  }
}
