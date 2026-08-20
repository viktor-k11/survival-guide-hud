/**
 * StatusBar presenter. Hard rule 3: subscribes to the EventBus and contains no
 * logic. It only enables objects that already exist and writes text into them —
 * it creates nothing and decides nothing.
 *
 * Mapping (see Docs/SCENE-MAP.md):
 *   MicIcon       — visible only while listening; the mic-state tell
 *   HintText      — standing hint when idle, "LISTENING…" while capturing
 *   ExampleTicker — live interim transcript while capturing
 */
import { eventBus, Events } from "../Engine/EventBus";

@component
export class StatusBarPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">All must already exist in the scene. This script never creates any of them.</span>')

  @input
  @hint("HUDRoot. Enabled on start so the StatusBar is visible. Ownership moves to the mode router when that lands.")
  private hudRoot: SceneObject;

  @input
  @hint("HUDRoot/StatusBar")
  private statusBar: SceneObject;

  @input
  @hint("HUDRoot/StatusBar/MicIcon")
  private micIcon: SceneObject;

  @input
  @hint("HUDRoot/StatusBar/HintText")
  private hintText: Text;

  @input
  @hint("HUDRoot/StatusBar/ExampleTicker — reused as the live transcript line")
  private tickerText: Text;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Copy</span>')

  @input
  @hint("Shown when idle.")
  private idleHint: string = "PINCH & HOLD — ASK FOR HELP";

  @input
  @hint("Shown while the mic is capturing.")
  private listeningHint: string = "LISTENING… RELEASE WHEN DONE";

  @input
  @hint("Shown between release and the final transcript arriving.")
  private finalizingHint: string = "THINKING…";

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    // Enable the surface this presenter owns. Everything below HUDRoot ships
    // disabled (hard rule 1), so the presenter turns on exactly what it drives.
    if (this.hudRoot) this.hudRoot.enabled = true;
    if (this.statusBar) this.statusBar.enabled = true;
    if (this.hintText) this.hintText.sceneObject.enabled = true;
    if (this.tickerText) this.tickerText.sceneObject.enabled = true;

    eventBus.subscribe(Events.voiceStateChanged, (p: { state: string }) => this.onVoiceState(p));
    eventBus.subscribe(Events.voiceInterim, (p: { text: string }) => this.onInterim(p));
    eventBus.subscribe(Events.userRequest, (p: { text: string }) => this.onFinal(p));

    this.applyIdle();
  }

  private applyIdle(): void {
    if (this.micIcon) this.micIcon.enabled = false;
    if (this.hintText) this.hintText.text = this.idleHint;
  }

  private onVoiceState(payload: { state: string }): void {
    const state = payload ? payload.state : "idle";

    if (state === "listening") {
      if (this.micIcon) this.micIcon.enabled = true;
      if (this.hintText) this.hintText.text = this.listeningHint;
      if (this.tickerText) this.tickerText.text = "";
      return;
    }

    if (state === "finalizing") {
      if (this.micIcon) this.micIcon.enabled = false;
      if (this.hintText) this.hintText.text = this.finalizingHint;
      return;
    }

    this.applyIdle();
  }

  private onInterim(payload: { text: string }): void {
    if (this.tickerText) this.tickerText.text = payload ? payload.text : "";
  }

  private onFinal(payload: { text: string }): void {
    if (this.tickerText) this.tickerText.text = payload ? payload.text : "";
  }
}
