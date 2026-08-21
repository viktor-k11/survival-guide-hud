/**
 * Boot intro — CRT scanline wipe, the power-on beat, and two typed lines of
 * terminal text. 3-4 seconds, skippable, and never in the way of iteration.
 *
 * Hard rule 1: `HUDRoot/BootIntro` and its children (`Wipe`, `Line1`, `Line2`)
 * exist in the scene, disabled. This enables, animates and disables them.
 *
 * ## What it says, and why
 *
 * The two lines are the first thing the user ever sees, so they establish the
 * product's thesis: line 1 names the system, line 2 says it LISTENS. Original
 * wording only — the retro-terminal look is the genre, the franchise names are
 * not (hard rule 7).
 *
 * ## Sound and speech
 *
 * This presenter makes NO audio calls. SfxService plays the crt-power-on cue
 * off this widget's `introStateChanged {active:true}` edge. There is no boot
 * narration: no baked track exists yet, and a live TTS call measures
 * 6.5-18.6 s — it would open the app with silence (see the narration seam in
 * Docs/SCENE-MAP.md). If boot narration is ever wanted, it must come from
 * NarrationService's bakedTracks, never the gateway.
 *
 * ## Skipping
 *
 * A pinch skips it — the same pinch that starts a voice capture, observed via
 * `voiceStateChanged`, so there is no second gesture path. On a desk, holding
 * SPACE does the same because the debug trigger IS the pinch. `runIntro` off
 * removes the intro entirely (the done event still fires, immediately), so
 * preview iteration is never gated on 4 seconds of ceremony.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

type IntroPhase = "off" | "wipe" | "line1" | "line2" | "hold";

@component
export class BootIntroPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')

  @input private theme: VisualConfig;
  @input @hint("HUDRoot/BootIntro — children Wipe / Line1 / Line2 are found by name.") private bootIntro: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Sequence</span>')

  @input
  @hint("Run the intro at boot. OFF for preview iteration — the done event still fires immediately, so nothing downstream waits.")
  private runIntro: boolean = true;

  @input @hint("Line 1 — names the system.") private line1Text: string = "SURVIVAL GUIDE — FIELD TERMINAL v1.0";
  @input @hint("Line 2 — says it listens. The product's thesis.") private line2Text: string = "VOICE INTERFACE ONLINE — PINCH AND HOLD TO ASK";

  @input
  @widget(new SliderWidget(0.2, 2.0, 0.1))
  @hint("Seconds for the scanline wipe to sweep the plate in.")
  private wipeSec: number = 0.7;

  @input
  @widget(new SliderWidget(10, 80, 1))
  @hint("Typewriter speed — same machinery as the StatusBar's request echo.")
  private introCharsPerSec: number = 32;

  @input
  @widget(new SliderWidget(0.0, 3.0, 0.1))
  @hint("Seconds both lines hold before the menu takes over.")
  private holdSec: number = 0.8;

  @input
  @widget(new SliderWidget(0.5, 6.0, 0.5))
  @hint("Caret blink rate, Hz.")
  private caretHz: number = 2.5;

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private wipeMat: Material | null = null;
  private line1: Text | null = null;
  private line2: Text | null = null;

  private phase: IntroPhase = "off";
  private clock: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[INTRO] " + msg);
  }

  private onStart(): void {
    this.collect();

    // Any pinch skips: the pinch already emits voiceStateChanged through
    // VoiceInput, so skipping needs no gesture wiring of its own.
    eventBus.subscribe(Events.voiceStateChanged, (p: { state: string }) => {
      if (this.phase !== "off" && p && p.state === "listening") {
        this.log("skipped by pinch");
        this.finish();
      }
    });

    if (!this.runIntro || !this.bootIntro) {
      // Belt and braces: if someone left the intro enabled in the editor,
      // an off intro must still not sit over the menu.
      setEnabled(this.bootIntro, false);
      // The done edge still fires so subscribers never wait on a disabled intro.
      eventBus.emit(Events.introStateChanged, { active: false });
      this.log("intro off (runIntro=" + this.runIntro + ")");
      return;
    }

    this.beginIntro();
  }

  private collect(): void {
    if (!this.bootIntro) return;
    const font = this.theme ? this.theme.font : null;
    for (let i = 0; i < this.bootIntro.getChildrenCount(); i++) {
      const c = this.bootIntro.getChild(i);
      if (c.name === "Wipe") {
        const v = c.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.wipeMat = isolateMaterial(v);
      } else if (c.name === "Line1") {
        this.line1 = c.getComponent("Component.Text") as Text;
        setFont(this.line1, font);
      } else if (c.name === "Line2") {
        this.line2 = c.getComponent("Component.Text") as Text;
        setFont(this.line2, font);
      }
    }
  }

  private beginIntro(): void {
    this.phase = "wipe";
    this.clock = 0;

    setEnabled(this.bootIntro, true);
    for (let i = 0; i < this.bootIntro.getChildrenCount(); i++) {
      setEnabled(this.bootIntro.getChild(i), true);
    }
    setText(this.line1, "");
    setText(this.line2, "");
    if (this.theme) {
      setTextColor(this.line1, this.theme.primaryPhosphor, this.theme.glowIntensity);
      setTextColor(this.line2, this.theme.accentAmber, this.theme.glowIntensity);
    }
    this.setWipe(0);

    eventBus.emit(Events.introStateChanged, { active: true });
    const wp = this.bootIntro.getTransform().getWorldPosition();
    this.log(
      "intro started (enabledInHierarchy=" + this.bootIntro.isEnabledInHierarchy +
        " world=(" + wp.x.toFixed(1) + "," + wp.y.toFixed(1) + "," + wp.z.toFixed(1) + ")" +
        " children=" + this.bootIntro.getChildrenCount() +
        " line1=" + (this.line1 !== null) + " line2=" + (this.line2 !== null) +
        " wipeMat=" + (this.wipeMat !== null) + ")"
    );
  }

  private finish(): void {
    this.phase = "off";
    setEnabled(this.bootIntro, false);
    eventBus.emit(Events.introStateChanged, { active: false });
    this.log("intro done");
  }

  /** The CRT shader's own boot wipe — a material property, not new geometry. */
  private setWipe(progress: number): void {
    if (!this.wipeMat) return;
    (this.wipeMat.mainPass as any).wipeProgress = progress;
  }

  private caret(): string {
    return Math.floor(this.clock * this.caretHz * 2) % 2 === 0 ? "_" : " ";
  }

  /** Typed prefix of `full` after `sec` seconds, with the blinking caret. */
  private typed(full: string, sec: number): string {
    const shown = Math.min(full.length, Math.floor(sec * this.introCharsPerSec));
    const body = full.substring(0, shown);
    return shown >= full.length ? body : body + this.caret();
  }

  private onUpdate(): void {
    if (this.phase === "off") return;
    const dt = getDeltaTime();
    this.clock += dt;

    if (this.phase === "wipe") {
      this.setWipe(Math.min(1, this.clock / Math.max(0.05, this.wipeSec)));
      if (this.clock >= this.wipeSec) {
        this.phase = "line1";
        this.clock = 0;
      }
      return;
    }

    if (this.phase === "line1") {
      setText(this.line1, this.typed(this.line1Text, this.clock));
      if (this.clock * this.introCharsPerSec >= this.line1Text.length) {
        this.phase = "line2";
        this.clock = 0;
      }
      return;
    }

    if (this.phase === "line2") {
      setText(this.line2, this.typed(this.line2Text, this.clock));
      if (this.clock * this.introCharsPerSec >= this.line2Text.length) {
        this.phase = "hold";
        this.clock = 0;
      }
      return;
    }

    // hold
    if (this.clock >= this.holdSec) this.finish();
  }
}
