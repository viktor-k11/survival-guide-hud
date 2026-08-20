/**
 * Hold-to-talk voice capture. Input plumbing only — no lesson logic, no AI
 * calls, no state machine.
 *
 * Two triggers, ONE code path:
 *   - pinch-and-hold on either hand (GestureModule) — the real Specs gesture
 *   - press-and-hold the debug trigger — for desktop testing in Preview
 * Both call beginCapture() / endCapture(). There is deliberately no separate
 * debug branch, so testing on desktop exercises the same code that ships.
 *
 * Output seam (hard rule 3): the final transcript leaves here two ways —
 *   - onUserRequest(text) — direct callback, for a single owner
 *   - EventBus `userRequest` — for everything else
 * Interim transcripts go out on `voiceInterim`; mic state on `voiceStateChanged`.
 * Nothing downstream should ever talk to AsrModule directly.
 */
import { eventBus, Events } from "./EventBus";

type VoiceState = "idle" | "listening" | "finalizing";

@component
export class VoiceInput extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Capture</span>')

  @input
  @hint("Milliseconds of silence before ASR marks a phrase final. Lower = snappier, more likely to cut the user off mid-sentence.")
  private silenceUntilTerminationMs: number = 1200;

  @input
  @hint("Trade accuracy against speed. 0 = HighAccuracy, 1 = Balanced, 2 = HighSpeed.")
  @widget(new ComboBoxWidget([new ComboBoxItem("HighAccuracy", 0), new ComboBoxItem("Balanced", 1), new ComboBoxItem("HighSpeed", 2)]))
  private accuracyMode: number = 0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Desktop debug trigger</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Hand pinch does not work in Lens Studio Preview. Click the Preview panel to focus it, then hold SPACE to record and release to stop. Runs the same code path as the pinch.</span>')

  @input
  @hint("Enable the hold-to-record debug key. Leave ON for desktop work; turn OFF before shipping.")
  private enableDebugTrigger: boolean = true;

  @input
  @hint("Which key holds to record. Space by default. Lens KeyPressEvent only sees A-Z, 0-9, Space, Backspace, arrows and modifiers.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Space", 0), new ComboBoxItem("V", 1), new ComboBoxItem("T", 2)]))
  private debugKeyChoice: number = 0;

  @ui.separator

  @input
  @hint("Print [ASR] breadcrumbs at every transition. Without these, 'voice does not work' is undiagnosable.")
  private enableLogging: boolean = true;

  /** Direct callback seam. Assign from an owner script; EventBus is the general path. */
  public onUserRequest: ((text: string) => void) | null = null;

  private asrModule: AsrModule = require("LensStudio:AsrModule");
  private gestureModule: GestureModule = require("LensStudio:GestureModule");

  private state: VoiceState = "idle";
  private latestTranscript: string = "";
  private releaseAtMs: number = 0;
  private finalDelivered: boolean = false;
  private activeSource: string = "";

  onAwake(): void {
    // Gesture subscriptions and any session setup must bind in OnStartEvent,
    // not onAwake — SIK/GestureModule are not guaranteed ready before start.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("OnDestroyEvent").bind(() => this.onDestroy());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[ASR] " + msg);
  }

  private nowMs(): number {
    return getTime() * 1000;
  }

  private onStart(): void {
    this.bindPinch();
    if (this.enableDebugTrigger) this.bindDebugTrigger();
    this.setState("idle");
    this.log(
      "ready. triggers: pinch(left+right)" +
        (this.enableDebugTrigger ? " + hold-" + this.debugKeyName() : "") +
        " | silence=" + this.silenceUntilTerminationMs + "ms mode=" + this.modeName()
    );
    this.log(
      "MIC PERMISSION: on device, Snap OS prompts once on the first capture. " +
        "The user must approve microphone access for the Lens. Note that using " +
        "ASR disables camera frame access unless Extended Permissions are granted."
    );
  }

  private modeName(): string {
    return this.accuracyMode === 2 ? "HighSpeed" : this.accuracyMode === 1 ? "Balanced" : "HighAccuracy";
  }

  private asrMode(): AsrModule.AsrMode {
    if (this.accuracyMode === 2) return AsrModule.AsrMode.HighSpeed;
    if (this.accuracyMode === 1) return AsrModule.AsrMode.Balanced;
    return AsrModule.AsrMode.HighAccuracy;
  }

  // ------------------------------------------------------------- triggers

  private bindPinch(): void {
    const hands = [GestureModule.HandType.Left, GestureModule.HandType.Right];
    const names = ["left", "right"];
    for (let i = 0; i < hands.length; i++) {
      const label = "pinch:" + names[i];
      try {
        this.gestureModule.getPinchDownEvent(hands[i]).add(() => this.beginCapture(label));
        this.gestureModule.getPinchUpEvent(hands[i]).add(() => this.endCapture(label));
      } catch (e) {
        this.log("could not bind " + label + ": " + e);
      }
    }
  }

  private debugKey(): Keys {
    if (this.debugKeyChoice === 1) return Keys.V;
    if (this.debugKeyChoice === 2) return Keys.T;
    return Keys.Space;
  }

  private debugKeyName(): string {
    return this.debugKeyChoice === 1 ? "V" : this.debugKeyChoice === 2 ? "T" : "SPACE";
  }

  /**
   * Desktop stand-in for the pinch: hold a key to record, release to stop.
   * Routes into the same beginCapture/endCapture as the pinch — deliberately
   * not a separate branch, so desktop testing exercises shipping code.
   *
   * Key auto-repeat fires KeyPressEvent many times while held; beginCapture()
   * ignores repeats because it only acts when state is "idle".
   */
  private bindDebugTrigger(): void {
    const wanted = this.debugKey();
    const label = "debug:" + this.debugKeyName();

    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === wanted) this.beginCapture(label);
    });
    this.createEvent("KeyReleaseEvent").bind((e: KeyReleaseEvent) => {
      if (e.key === wanted) this.endCapture(label);
    });
  }

  // -------------------------------------------------------- capture cycle

  /** Entry point for BOTH triggers. */
  private beginCapture(source: string): void {
    if (this.state !== "idle") {
      this.log("beginCapture(" + source + ") ignored — state=" + this.state);
      return;
    }
    this.activeSource = source;
    this.latestTranscript = "";
    this.finalDelivered = false;
    this.setState("listening");
    this.log("press [" + source + "] — starting capture");

    const opts = AsrModule.AsrTranscriptionOptions.create();
    opts.silenceUntilTerminationMs = this.silenceUntilTerminationMs;
    opts.mode = this.asrMode();

    opts.onTranscriptionUpdateEvent.add((e: AsrModule.TranscriptionUpdateEvent) => {
      this.onTranscription(e.text, e.isFinal);
    });
    opts.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) => {
      this.onAsrError(code);
    });

    try {
      this.asrModule.startTranscribing(opts);
      this.log("startTranscribing() called");
    } catch (e) {
      this.log("startTranscribing() threw: " + e);
      this.setState("idle");
    }
  }

  /** Exit point for BOTH triggers. */
  private endCapture(source: string): void {
    if (this.state !== "listening") {
      this.log("endCapture(" + source + ") ignored — state=" + this.state);
      return;
    }
    this.releaseAtMs = this.nowMs();
    this.setState("finalizing");
    this.log("release [" + source + "] — interim so far: \"" + this.latestTranscript + "\"");

    this.asrModule
      .stopTranscribing()
      .then(() => {
        this.log("stopTranscribing() resolved");
        // ASR may deliver its final AFTER stop resolves, or not at all if the
        // user released before speaking. Fall back to the last interim so a
        // request is never silently dropped.
        if (!this.finalDelivered) this.deliverFinal(this.latestTranscript, "fallback-on-stop");
      })
      .catch((e) => {
        this.log("stopTranscribing() rejected: " + e);
        if (!this.finalDelivered) this.deliverFinal(this.latestTranscript, "fallback-on-error");
      });
  }

  private onTranscription(text: string, isFinal: boolean): void {
    if (text && text.length > 0) this.latestTranscript = text;

    if (!isFinal) {
      this.log("interim: \"" + text + "\"");
      eventBus.emit(Events.voiceInterim, { text: text });
      return;
    }

    this.log("final from ASR: \"" + text + "\"");
    if (this.state === "listening") {
      // Silence terminated the phrase while the user is still holding. Keep the
      // text but do not deliver yet — release is what commits a request.
      this.log("final arrived while still held — holding until release");
      return;
    }
    this.deliverFinal(text, "asr-final");
  }

  private onAsrError(code: AsrModule.AsrStatusCode): void {
    let name = "Unknown(" + code + ")";
    if (code === AsrModule.AsrStatusCode.InternalError) name = "InternalError";
    else if (code === AsrModule.AsrStatusCode.Unauthenticated) name = "Unauthenticated";
    else if (code === AsrModule.AsrStatusCode.NoInternet) name = "NoInternet";
    else if (code === AsrModule.AsrStatusCode.Success) name = "Success";

    // Surfaced verbatim on purpose: each code maps to a different fix.
    // Unauthenticated = token/login; NoInternet = connectivity; InternalError =
    // mic permission not granted, or ASR unavailable on this platform.
    this.log("ERROR code=" + name);
    this.setState("idle");
  }

  /** Single delivery point, so the seam cannot be bypassed. */
  private deliverFinal(text: string, reason: string): void {
    if (this.finalDelivered) return;
    this.finalDelivered = true;

    const latencyMs = Math.round(this.nowMs() - this.releaseAtMs);
    const clean = (text || "").trim();
    this.setState("idle");

    if (clean.length === 0) {
      this.log("no speech captured (" + reason + ", " + latencyMs + "ms) — nothing emitted");
      return;
    }

    this.log("FINAL (" + reason + ") latency_release_to_final=" + latencyMs + "ms text=\"" + clean + "\"");

    eventBus.emit(Events.userRequest, { text: clean, latencyMs: latencyMs });
    if (this.onUserRequest) {
      try {
        this.onUserRequest(clean);
      } catch (e) {
        this.log("onUserRequest handler threw: " + e);
      }
    }
  }

  private setState(next: VoiceState): void {
    if (this.state === next) return;
    this.state = next;
    eventBus.emit(Events.voiceStateChanged, { state: next });
  }

  private onDestroy(): void {
    if (this.state === "listening") {
      this.asrModule.stopTranscribing();
    }
  }
}
