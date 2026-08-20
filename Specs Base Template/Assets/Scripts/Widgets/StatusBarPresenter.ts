/**
 * StatusBar presenter — two faces, switched by modeChanged.
 *
 * IDLE   : pulsing mic, standing hint, and a rotating example ticker.
 * LESSON : lesson title, mic state, and a warning strip that appears on
 *          safetyPending and clears on confirm.
 *
 * Hard rule 3: subscribes to the EventBus, contains no logic, decides nothing.
 * Hard rule 1: enables and populates objects that already exist; creates none.
 *
 * The ticker is not decoration. It is the only thing on screen that says this
 * is a platform rather than two hardcoded lessons, so it is readable copy on a
 * slow, legible cycle rather than a fast scroll.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import {
  formatClock,
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
  @hint("Rotating idle examples. These teach the user the system takes any request, not two.")
  @widget(new TextAreaWidget())
  private tickerPrompts: string[] = [
    '"help me build a campfire"',
    '"help me purify water"',
    '"how do I signal for rescue"',
    '"help me pitch a tent"',
    '"how do I treat a burn"',
  ];

  @input
  @widget(new SliderWidget(1.0, 8.0, 0.5))
  @hint("Seconds each example stays up.")
  private tickerIntervalSec: number = 2.5;

  private micVisual: RenderMeshVisual;
  private micMat: Material;
  private stripVisual: RenderMeshVisual;
  private stripMat: Material;

  private mode: string = "IDLE";
  private voiceState: string = "idle";
  private tickerIndex: number = 0;
  private tickerElapsed: number = 0;
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
    eventBus.subscribe(Events.distanceWarning, (p: { message: string }) => {
      this.rangeWarning = p && p.message ? p.message : "";
      this.applyWarning();
    });
    // A fresh survey re-measures the terrain, so last survey's verdict is void.
    eventBus.subscribe(Events.surveyStarted, () => {
      this.rangeWarning = "";
      this.applyWarning();
    });

    this.applyFace();
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
      this.showTicker();
    }

    this.applyVoice();
    this.applyWarning();
  }

  private applyVoice(): void {
    const theme = this.theme;
    const listening = this.voiceState === "listening";

    setEnabled(this.micIcon, true);

    if (this.voiceState === "listening") setText(this.hintText, this.listeningHint);
    else if (this.voiceState === "finalizing") setText(this.hintText, this.finalizingHint);
    else setText(this.hintText, this.mode === "IDLE" ? this.idleHint : "");

    if (theme) {
      setTextColor(this.hintText, listening ? theme.accentAmber : theme.primaryPhosphor, theme.glowIntensity);
    }
  }

  /** Safety gates outrank range warnings: one blocks the step, the other advises. */
  private activeWarning(): string {
    if (this.safetyWarning.length > 0) return this.safetyWarning;
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
    } else {
      setText(this.tickerText, "");
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

    // Mic pulse: breathing in IDLE, faster and amber while listening.
    if (this.micMat && this.theme) {
      const hz = this.voiceState === "listening" ? this.theme.pulseHz * 2.0 : this.theme.pulseHz;
      const t = pulse01(getTime(), hz);
      const base = this.voiceState === "listening" ? this.theme.accentAmber : this.theme.primaryPhosphor;
      // Never fully dark: on an additive display 0 means "gone", and a mic that
      // vanishes reads as broken rather than idle.
      const level = (0.45 + 0.55 * t) * this.theme.glowIntensity;
      setColor(this.micMat, base, level);
    }
  }
}
