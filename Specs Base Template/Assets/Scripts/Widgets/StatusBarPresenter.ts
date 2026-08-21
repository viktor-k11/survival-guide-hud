/**
 * StatusBar presenter — three faces now, switched by modeChanged and
 * requestStateChanged.
 *
 * IDLE      : pulsing mic, standing hint, and a rotating example ticker.
 * COMPILING : the request typed back to the user, then cycling status lines.
 * LESSON    : lesson title, mic state, and a warning strip that appears on
 *             safetyPending and clears on confirm.
 *
 * ## COMPILING is a feature, not a spinner
 *
 * A lesson takes 10.9-15 s to come back and that cannot be shortened, so the
 * wait has to read as deliberate work rather than a hang. Two rules follow:
 *
 * 1. **The request is typed back**, character by character, in the user's own
 *    words. It answers "did it hear me?" before it answers anything else, and
 *    it fills the first second and a half with motion.
 * 2. **Something changes at least three times a second.** The status line
 *    cycles every couple of seconds, but between cycles the working ticker
 *    advances at workingTickHz. Eleven seconds of an unchanging frame reads as
 *    a crash no matter what the frame says.
 *
 * Hard rule 3: subscribes to the EventBus, contains no logic, decides nothing.
 * Hard rule 1: enables and populates objects that already exist; creates none.
 *
 * The ticker is not decoration. It is the only thing on screen that says this
 * is a platform rather than two hardcoded lessons, so it is readable copy on a
 * slow, legible cycle rather than a fast scroll.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { eventBus, Events } from "../Engine/EventBus";
import { NavigateUpdatePayload } from "../Engine/NavTypes";
import { RequestStatePayload } from "../Engine/RequestTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import {
  formatClock,
  wrapText,
  adoptMaterial,
  isolateMaterial,
  pulse01,
  setColor,
  setEnabled,
  setFont,
  setIcon,
  setText,
  setTextColor,
} from "./WidgetUtils";

@component
export class StatusBarPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">All exist at design time. This script never creates any of them, and it no longer touches HUDRoot — ModeRouter owns that.</span>')

  @input private theme: VisualConfig;

  @input @hint("HUDRoot/StatusBar") private statusBar: SceneObject;
  @input @hint("HUDRoot/StatusBar/MicIcon") private micIcon: SceneObject;
  @input @hint("HUDRoot/StatusBar/HintText") private hintText: Text;
  @input @hint("HUDRoot/StatusBar/ExampleTicker") private tickerText: Text;
  @input @hint("HUDRoot/StatusBar/LessonTitle") private lessonTitle: Text;
  @input @hint("HUDRoot/StatusBar/WarningStrip") private warningStrip: SceneObject;

  @input
  @allowUndefined
  @hint("HUDRoot/StatusBar/KeyboardToggle — tap to open the AR keyboard. The demo's safety net when voice misbehaves.")
  private keyboardToggle: SceneObject;

  @input
  @allowUndefined
  @hint("PH_Plane.mesh — MicIcon's placeholder is a disc, which maps an icon texture unreadably. A quad makes the glyph legible.")
  private quadMesh: RenderMesh;

  @input
  @allowUndefined
  @hint("PH_Icon.mat — an unlit additive material with ENABLE_BASE_TEX baked on. The other PH_ materials gate baseTex behind that define, so assigning a texture to them silently does nothing.")
  private iconMaterial: Material;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Idle copy</span>')

  @input private idleHint: string = "PINCH & HOLD — ASK FOR HELP";
  @input private listeningHint: string = "LISTENING… RELEASE WHEN DONE";
  @input private finalizingHint: string = "THINKING…";

  @input
  @hint("Rotating idle examples. These teach the user the system takes any request — so they must stay OUTSIDE the six main-menu rows, or they prove the opposite.")
  @widget(new TextAreaWidget())
  private tickerPrompts: string[] = [
    '"how do I signal for rescue"',
    '"which way is north, no compass"',
    '"how do I keep food from bears"',
    '"how do I read incoming weather"',
  ];

  @input
  @widget(new SliderWidget(1.0, 8.0, 0.5))
  @hint("Seconds each example stays up.")
  private tickerIntervalSec: number = 2.5;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Compiling — the 12-second wait</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Gemini takes 10.9-15 s and that will not change. These settings are what stops the wait reading as a crash.</span>')

  @input
  @widget(new SliderWidget(6, 80, 1))
  @hint("Typewriter speed for echoing the request back, characters per second.")
  private typewriterCharsPerSec: number = 26;

  @input
  @hint("Status lines cycled while the guide is thinking. Short, active, and honest about what is happening.")
  @widget(new TextAreaWidget())
  private compilingLines: string[] = [
    "SURVEYING KNOWLEDGE",
    "DRAFTING STEPS",
    "CHECKING SAFETY",
    "PLACING WIDGETS",
  ];

  @input
  @widget(new SliderWidget(0.8, 6.0, 0.1))
  @hint("Seconds each status line holds.")
  private compilingLineSec: number = 2.2;

  @input
  @widget(new SliderWidget(1.0, 8.0, 0.5))
  @hint("How often the working ticker advances, Hz. This is the guarantee that SOMETHING moves every second.")
  private workingTickHz: number = 3.0;

  @input
  @hint("Frames of the working ticker, cycled at workingTickHz.")
  private workingFrames: string[] = ["·", "··", "···"];

  @input
  @widget(new SliderWidget(0.5, 6.0, 0.5))
  @hint("How long the 'still working' notice stays up when a second request is ignored.")
  private busyHoldSec: number = 2.5;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">In-lesson Q&amp;A</span>')

  @input
  @widget(new SliderWidget(2, 20, 1))
  @hint("How long a spoken answer stays up AFTER its voice has finished. The clock does not start while the answer is still being synthesized or spoken — otherwise the text expires before the sentence is said.")
  private qaHoldSec: number = 9;

  @input
  @hint("Characters per line for the answer. World-space Text has no width to wrap against.")
  private qaWrapChars: number = 46;

  @input @hint("Copy shown on the keyboard affordance.") private keyboardToggleLabel: string = "TYPE";

  @input
  @widget(new SliderWidget(2, 20, 1))
  @hint("How long the hologram's 'look down' cue holds. World content outside a level gaze is only allowed if this line appears — see Docs/SCENE-MAP.md.")
  private holoCueHoldSec: number = 7;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Waiting for the voice</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Synthesis measures 6.5-18.6 s. The step is readable the instant it arrives — text has never waited on audio — but the line under it used to sit blank for that whole window, which reads as "it did not hear me". This is what fills it.</span>')

  @input
  @hint("Shown in a lesson while the current step's audio is still being synthesized. Cleared the moment it speaks.")
  private voicePendingHint: string = "VOICE INCOMING";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Navigate</span>')

  @input @hint("Hint line in NAVIGATE, bearing mode.") private navBearingHint: string = "FOLLOW THE ARROW — SAY STOP TO EXIT";
  @input @hint("Hint line in NAVIGATE, trail mode.") private navTrailHint: string = "FOLLOW THE STAKES — SAY STOP TO EXIT";
  @input @hint("Distance readout. {D} = metres.") private navLineFormat: string = "CAMP {D} M";
  @input @hint("Appended while tracking is lost — the readout must SAY it is last known.") private navLastKnownSuffix: string = " · LAST KNOWN BEARING";

  private micVisual: RenderMeshVisual;
  private micMat: Material;
  private stripVisual: RenderMeshVisual;
  private stripMat: Material;

  private mode: string = "IDLE";
  private voiceState: string = "idle";
  private requestState: string = "IDLE";
  private requestText: string = "";
  private requestError: string = "";
  private compileElapsed: number = 0;
  private busyMessage: string = "";
  private busyRemaining: number = 0;
  private qaAnswer: string = "";
  private qaRemaining: number = 0;
  /** The hologram's first-appearance cue, and how long it still has to run. */
  private holoCue: string = "";
  private holoRemaining: number = 0;
  private speaking: boolean = false;
  /** The user is owed a voice line that has not arrived yet. */
  private narrationPending: boolean = false;
  private pendingElapsed: number = 0;
  private tickerIndex: number = 0;
  private tickerElapsed: number = 0;
  private nav: NavigateUpdatePayload | null = null;
  private safetyWarning: string = "";
  /**
   * Range warnings (currently: the survey's fire-too-close guard) live in their
   * own field rather than sharing safetyWarning, because the two have different
   * lifetimes. A safety gate is cleared by mode; a range warning is a statement
   * about the terrain that must survive SURVEY -> IDLE, or it would blink out
   * at the exact moment the markers appear.
   */
  private rangeWarning: string = "";

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    setEnabled(this.statusBar, true);

    if (this.micIcon) {
      this.micVisual = this.micIcon.getComponent("Component.RenderMeshVisual");
      if (this.micVisual && this.quadMesh) this.micVisual.mesh = this.quadMesh;
      const t = this.micIcon.getTransform();
      t.setLocalRotation(quat.fromEulerAngles(Math.PI / 2, 0, 0));
      t.setLocalScale(new vec3(7, 1, 7));
      this.micMat = this.iconMaterial
        ? adoptMaterial(this.micVisual, this.iconMaterial)
        : isolateMaterial(this.micVisual);
      setIcon(this.micMat, this.theme ? this.theme.icon("mic") : null);
    }
    if (this.warningStrip) {
      this.stripVisual = this.warningStrip.getComponent("Component.RenderMeshVisual");
      this.stripMat = isolateMaterial(this.stripVisual);
    }

    const font = this.theme ? this.theme.font : null;
    setFont(this.hintText, font);
    setFont(this.tickerText, font);
    setFont(this.lessonTitle, font);

    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      this.mode = p ? p.to : "IDLE";
      this.applyFace();
    });
    eventBus.subscribe(Events.voiceStateChanged, (p: { state: string }) => {
      this.voiceState = p ? p.state : "idle";
      this.applyVoice();
    });
    eventBus.subscribe(Events.voiceInterim, (p: { text: string }) => {
      // Live transcript takes over the ticker line while the user is speaking.
      if (this.mode === "IDLE") setText(this.tickerText, p ? p.text : "");
    });
    eventBus.subscribe(Events.lessonStarted, (p: { title: string }) => {
      setText(this.lessonTitle, p ? p.title : "");
    });
    eventBus.subscribe(Events.safetyPending, (p: { pending: boolean; warning: string }) => {
      this.safetyWarning = p && p.pending && p.warning ? p.warning : "";
      this.applyWarning();
    });
    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => this.onRequestState(p));

    eventBus.subscribe(Events.qaAnswered, (p: { answer: string }) => {
      this.qaAnswer = p && p.answer ? wrapText(p.answer, this.qaWrapChars) : "";
      this.qaRemaining = this.qaHoldSec;
    });
    // A step change retires the previous answer: it was about the old step.
    eventBus.subscribe(Events.stepChanged, () => {
      this.qaAnswer = "";
      this.qaRemaining = 0;
    });
    // "Look down" — the one line that keeps ground content from being invisible
    // by silence. Held long enough to read, then it gets out of the way.
    eventBus.subscribe(Events.hologramShown, (p: { text: string }) => {
      this.holoCue = p && p.text ? p.text : "";
      this.holoRemaining = this.holoCue.length > 0 ? this.holoCueHoldSec : 0;
      this.applyWarning();
    });
    eventBus.subscribe(Events.narrationStateChanged, (p: { speaking: boolean; pending: boolean }) => {
      this.speaking = !!(p && p.speaking);
      const pending = !!(p && p.pending);
      if (pending !== this.narrationPending) this.pendingElapsed = 0;
      this.narrationPending = pending;
      this.applyVoice();
    });
    eventBus.subscribe(Events.distanceWarning, (p: { message: string }) => {
      this.rangeWarning = p && p.message ? p.message : "";
      this.applyWarning();
    });
    // A fresh survey re-measures the terrain, so last survey's verdict is void.
    eventBus.subscribe(Events.surveyStarted, () => {
      this.rangeWarning = "";
      this.applyWarning();
    });
    // The boot intro owns the screen; the bar joins when it is done. This is
    // the bar's own contents, not HUDRoot — ModeRouter still owns the roots.
    eventBus.subscribe(Events.introStateChanged, (p: { active: boolean }) => {
      setEnabled(this.statusBar, !(p && p.active));
    });
    // NAVIGATE: the ticker line becomes the distance readout. Honest
    // degradation is part of the copy — a lost pose SAYS "last known".
    eventBus.subscribe(Events.navigateUpdated, (p: NavigateUpdatePayload) => {
      this.nav = p && p.active ? p : null;
      if (this.mode !== "NAVIGATE") return;
      this.applyVoice();
      if (this.nav && this.activeWarning().length === 0) {
        const d = this.nav.distanceM >= 10 ? Math.round(this.nav.distanceM) : this.nav.distanceM;
        setText(this.tickerText, this.navLineFormat.replace("{D}", "" + d) + (this.nav.lastKnown ? this.navLastKnownSuffix : ""));
        if (this.theme) {
          setTextColor(this.tickerText, this.nav.lastKnown ? this.theme.warningColor : this.theme.accentAmber, this.theme.glowIntensity);
        }
      }
    });

    this.wireKeyboardToggle();
    this.applyFace();
  }

  /**
   * The keyboard affordance. Relaying a tap is not logic — this presenter does
   * not decide what typing means, it only says that the user asked for it.
   */
  private wireKeyboardToggle(): void {
    if (!this.keyboardToggle) return;
    setEnabled(this.keyboardToggle, true);
    const label = this.keyboardToggle.getComponent("Component.Text") as Text;
    if (label) {
      setText(label, this.keyboardToggleLabel);
      setFont(label, this.theme ? this.theme.font : null);
      if (this.theme) setTextColor(label, this.theme.dimColor, this.theme.glowIntensity * 2.0);
    }
    const interactable = this.keyboardToggle.getComponent(Interactable.getTypeName()) as Interactable;
    if (interactable) {
      interactable.onTriggerEnd.add(() => {
        eventBus.emit(Events.keyboardRequested, { source: "statusBar" });
      });
    }
  }

  // ------------------------------------------------------------------ faces

  private applyFace(): void {
    const idle = this.mode === "IDLE";

    setEnabled(this.hintText ? this.hintText.sceneObject : null, true);
    setEnabled(this.tickerText ? this.tickerText.sceneObject : null, true);
    setEnabled(this.lessonTitle ? this.lessonTitle.sceneObject : null, !idle);

    if (idle) {
      this.safetyWarning = "";
      // rangeWarning is deliberately NOT cleared here: the survey ends by
      // returning to IDLE, and that is precisely when the warning matters.
      this.tickerElapsed = 0;
      setText(this.lessonTitle, "");
      // Do not stamp an example prompt over a request that is mid-compile.
      if (this.requestState === "IDLE") this.showTicker();
    }

    this.applyVoice();
    this.applyWarning();
  }

  private applyVoice(): void {
    const theme = this.theme;
    const listening = this.voiceState === "listening";

    setEnabled(this.micIcon, true);

    // While compiling, the hint line IS the typewriter. Leave it alone.
    if (this.requestState === "COMPILING") return;

    if (this.voiceState === "listening") setText(this.hintText, this.listeningHint);
    else if (this.voiceState === "finalizing") setText(this.hintText, this.finalizingHint);
    else if (this.mode === "NAVIGATE")
      setText(this.hintText, this.nav && this.nav.navMode === "trail" ? this.navTrailHint : this.navBearingHint);
    else if (this.mode === "IDLE") setText(this.hintText, this.idleHint);
    // In a lesson the hint line is otherwise empty, so it is free to carry the
    // one thing the user cannot see for themselves: that the voice is coming.
    // onUpdate animates the trailing frame; this sets the first one so the line
    // is never blank for a frame before the clock ticks.
    else if (this.narrationPending) setText(this.hintText, this.voicePendingHint + " " + this.workingFrame());
    else setText(this.hintText, "");

    if (theme) {
      const warm = listening || (this.narrationPending && this.mode !== "IDLE");
      setTextColor(this.hintText, warm ? theme.accentAmber : theme.primaryPhosphor, theme.glowIntensity);
    }
  }

  /**
   * Priority: a safety gate blocks the step, a request error means the thing
   * the user just asked for did not happen, and a range warning is advice.
   * In that order.
   */
  private activeWarning(): string {
    if (this.safetyWarning.length > 0) return this.safetyWarning;
    if (this.requestError.length > 0) return this.requestError;
    return this.rangeWarning;
  }

  private applyWarning(): void {
    const warning = this.activeWarning();
    const showing = warning.length > 0;
    setEnabled(this.warningStrip, showing);

    if (showing) {
      setText(this.tickerText, warning);
      if (this.theme) {
        setTextColor(this.tickerText, this.theme.warningColor, this.theme.glowIntensity);
        setColor(this.stripMat, this.theme.warningColor, this.theme.glowIntensity);
      }
    } else if (this.mode === "IDLE") {
      this.showTicker();
    } else if (this.qaRemaining > 0 && this.qaAnswer.length > 0) {
      setText(this.tickerText, this.qaAnswer);
      if (this.theme) setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
    } else if (this.holoRemaining > 0 && this.holoCue.length > 0) {
      // Below a Q&A answer on purpose: an answer to a question the user just
      // asked outranks a cue about something already on the ground.
      setText(this.tickerText, this.holoCue);
      if (this.theme) setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
    } else {
      setText(this.tickerText, "");
    }
  }

  // -------------------------------------------------------------- compiling

  private onRequestState(p: RequestStatePayload): void {
    if (!p) return;
    const previous = this.requestState;

    if (p.state === "BUSY") {
      // Not a state change — the coordinator is still compiling. Only the
      // second line changes, and only for a moment.
      this.busyMessage = p.message;
      this.busyRemaining = this.busyHoldSec;
      return;
    }

    this.requestState = p.state;
    this.requestText = (p.requestText || "").toUpperCase();

    if (p.state === "COMPILING") {
      // Restart the typewriter on entry, but NOT on the retry: re-typing the
      // request halfway through the wait would read as the Lens starting over.
      if (previous !== "COMPILING") this.compileElapsed = 0;
      this.requestError = "";
      this.busyRemaining = 0;
    } else if (p.state === "ERROR") {
      this.requestError = p.message;
      this.busyRemaining = 0;
    } else {
      // IDLE. A message here is a cancellation notice, not an error.
      this.requestError = "";
      this.busyRemaining = 0;
      this.compileElapsed = 0;
      if (p.message.length > 0) {
        this.busyMessage = p.message;
        this.busyRemaining = this.busyHoldSec;
      }
    }

    this.applyFace();
    this.applyWarning();
  }

  /** The typed-so-far request, with a blinking caret while it is still typing. */
  private typedRequest(): string {
    const full = this.requestText;
    const shown = Math.min(full.length, Math.floor(this.compileElapsed * this.typewriterCharsPerSec));
    const body = full.substring(0, shown);
    if (shown >= full.length) return body;
    // Blink at 2.5 Hz so the caret itself is one of the things that moves.
    return body + (Math.floor(this.compileElapsed * 5) % 2 === 0 ? "_" : " ");
  }

  private workingFrame(clock?: number): string {
    if (!this.workingFrames || this.workingFrames.length === 0) return "";
    const t = typeof clock === "number" ? clock : this.compileElapsed;
    const i = Math.floor(t * this.workingTickHz) % this.workingFrames.length;
    return this.workingFrames[i];
  }

  private compilingLine(): string {
    if (this.busyRemaining > 0 && this.busyMessage.length > 0) return this.busyMessage;
    if (!this.compilingLines || this.compilingLines.length === 0) return "WORKING";
    // Lines start only after the request has finished typing, so the two
    // motions never compete for the same beat.
    const typingSec = this.requestText.length / Math.max(1, this.typewriterCharsPerSec);
    const since = Math.max(0, this.compileElapsed - typingSec);
    const i = Math.floor(since / Math.max(0.1, this.compilingLineSec)) % this.compilingLines.length;
    return this.compilingLines[i] + " " + this.workingFrame();
  }

  private renderCompiling(): void {
    setText(this.hintText, this.typedRequest());
    setText(this.tickerText, this.compilingLine());
    if (this.theme) {
      setTextColor(this.hintText, this.theme.accentAmber, this.theme.glowIntensity);
      setTextColor(this.tickerText, this.theme.primaryPhosphor, this.theme.glowIntensity);
    }
  }

  // ----------------------------------------------------------------- ticker

  private showTicker(): void {
    if (!this.tickerPrompts || this.tickerPrompts.length === 0) return;
    const idx = this.tickerIndex % this.tickerPrompts.length;
    setText(this.tickerText, this.tickerPrompts[idx]);
    if (this.theme) {
      setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
    }
  }

  private onUpdate(): void {
    const dt = getDeltaTime();

    if (this.busyRemaining > 0) this.busyRemaining -= dt;

    // Hold the answer while its voice is still coming or still talking. The
    // countdown is a tail AFTER the sentence, not a race against it: synthesis
    // takes 6-18 s, so a hold that starts when the TEXT arrives runs out before
    // the audio even begins, and the user hears an answer with nothing to read.
    if (this.qaAnswer.length > 0 && (this.narrationPending || this.speaking)) {
      this.qaRemaining = Math.max(this.qaRemaining, this.qaHoldSec);
    }

    if (this.qaRemaining > 0) {
      this.qaRemaining -= dt;
      if (this.mode === "LESSON" && this.activeWarning().length === 0) {
        setText(this.tickerText, this.qaRemaining > 0 ? this.qaAnswer : "");
        if (this.theme) setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
      }
    }

    // The hologram cue runs on its own clock, and yields to a warning or a
    // live Q&A answer rather than fighting them for the line.
    if (this.holoRemaining > 0) {
      this.holoRemaining -= dt;
      const clear = this.activeWarning().length === 0 && !(this.qaRemaining > 0 && this.qaAnswer.length > 0);
      if (this.mode === "LESSON" && clear) {
        setText(this.tickerText, this.holoRemaining > 0 ? this.holoCue : "");
        if (this.theme) setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
      }
    }

    // COMPILING repaints every frame. That is the point: the typewriter, the
    // caret and the working ticker are all functions of this clock.
    if (this.requestState === "COMPILING") {
      this.compileElapsed += dt;
      this.renderCompiling();
      return;
    }

    // Waiting for the voice. Same rule as COMPILING: something has to move, or
    // a wait that can run to 18 s reads as a freeze. The instruction itself is
    // already up on the guide panel and does not move — that is the point.
    if (this.narrationPending && !this.speaking && this.mode !== "IDLE" && this.voiceState === "idle") {
      this.pendingElapsed += dt;
      setText(this.hintText, this.voicePendingHint + " " + this.workingFrame(this.pendingElapsed));
      if (this.theme) setTextColor(this.hintText, this.theme.accentAmber, this.theme.glowIntensity);
    }

    // A cancellation / notice line survives a moment after returning to IDLE.
    if (this.busyRemaining > 0 && this.busyMessage.length > 0 && this.mode === "IDLE") {
      setText(this.tickerText, this.busyMessage);
      if (this.theme) setTextColor(this.tickerText, this.theme.accentAmber, this.theme.glowIntensity);
      return;
    }

    // Ticker: only in IDLE, and never while it is showing a live transcript
    // or a warning.
    if (this.mode === "IDLE" && this.activeWarning().length === 0 && this.voiceState === "idle") {
      this.tickerElapsed += dt;
      if (this.tickerElapsed >= this.tickerIntervalSec) {
        this.tickerElapsed = 0;
        this.tickerIndex++;
        this.showTicker();
      }
    }

    // Mic pulse: breathing in IDLE, faster and amber while listening, and
    // steady amber while the guide is talking — the one on-screen sign that
    // audio is playing at all, which matters on a display with no speaker icon.
    if (this.micMat && this.theme) {
      const hz =
        this.voiceState === "listening"
          ? this.theme.pulseHz * 2.0
          : this.narrationPending
          ? this.theme.pulseHz * 1.5
          : this.theme.pulseHz;
      const t = this.speaking ? 1.0 : pulse01(getTime(), hz);
      const base =
        this.voiceState === "listening" || this.speaking || this.narrationPending
          ? this.theme.accentAmber
          : this.theme.primaryPhosphor;
      // Never fully dark: on an additive display 0 means "gone", and a mic that
      // vanishes reads as broken rather than idle.
      const level = (0.45 + 0.55 * t) * this.theme.glowIntensity;
      setColor(this.micMat, base, level);
    }
  }
}
