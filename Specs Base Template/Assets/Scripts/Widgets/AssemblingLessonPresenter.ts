/**
 * AssemblingLesson presenter — the spatial half of the COMPILING state.
 *
 * THIS IS A HOOK, AND THE VISUAL IS A PLACEHOLDER. The object it drives
 * (`HUDRoot/AssemblingLesson`, with `Ring` and `Core` children) exists at
 * design time and is meant to be replaced by a real VFX asset. What must
 * survive that replacement is the contract:
 *
 *   requestStateChanged.state === "COMPILING"  ->  this object is enabled
 *   anything else                              ->  it is disabled
 *
 * Whoever swaps the art keeps the object path and the children names and does
 * not touch this file. If the replacement is a VFXComponent rather than meshes,
 * the spin/pulse below becomes dead weight and can go — the enable/disable is
 * the part that matters.
 *
 * Hard rule 1: enables and animates an existing object, creates nothing.
 * Hard rule 3: subscribes and renders, decides nothing.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { RequestStatePayload } from "../Engine/RequestTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, pulse01, setColor, setEnabled } from "./WidgetUtils";

@component
export class AssemblingLessonPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input
  @hint("HUDRoot/AssemblingLesson — the placeholder VFX root. Swap its contents, keep the path.")
  private root: SceneObject;

  @input @allowUndefined @hint("HUDRoot/AssemblingLesson/Ring") private ring: SceneObject;
  @input @allowUndefined @hint("HUDRoot/AssemblingLesson/Core") private core: SceneObject;

  @input
  @widget(new SliderWidget(0, 720, 10))
  @hint("Ring spin, degrees per second.")
  private spinDegPerSec: number = 220;

  @input
  @widget(new SliderWidget(0.1, 6.0, 0.1))
  @hint("Core pulse rate, Hz.")
  private pulseHz: number = 2.0;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Dimmest point of the pulse. Never 0 — on an additive display that is 'gone', which reads as a crash.")
  private pulseFloor: number = 0.35;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  private pulseCeiling: number = 1.3;

  @input private enableLogging: boolean = false;

  private ringMat: Material;
  private coreMat: Material;
  private compiling: boolean = false;
  private spin: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (this.ring) {
      this.ringMat = isolateMaterial(this.ring.getComponent("Component.RenderMeshVisual"));
    }
    if (this.core) {
      this.coreMat = isolateMaterial(this.core.getComponent("Component.RenderMeshVisual"));
    }
    this.show(false);

    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      // BUSY means "still compiling, with a notice" — the VFX must not blink
      // off and on again when a second request is waved away.
      if (!p || p.state === "BUSY") return;
      const on = p.state === "COMPILING";
      if (on === this.compiling) return;
      this.compiling = on;
      this.spin = 0;
      this.show(on);
      if (this.enableLogging) print("[ASSEMBLE] " + (on ? "on" : "off"));
    });
  }

  private show(on: boolean): void {
    // Every level of the chain: children under HUDRoot ship disabled too.
    setEnabled(this.root, on);
    setEnabled(this.ring, on);
    setEnabled(this.core, on);
  }

  private onUpdate(): void {
    if (!this.compiling || !this.theme) return;
    const dt = getDeltaTime();

    if (this.ring) {
      this.spin += this.spinDegPerSec * dt;
      this.ring.getTransform().setLocalRotation(
        quat.fromEulerAngles(Math.PI / 2, 0, (this.spin * Math.PI) / 180)
      );
    }
    const level =
      (this.pulseFloor + (this.pulseCeiling - this.pulseFloor) * pulse01(getTime(), this.pulseHz)) *
      this.theme.glowIntensity;
    if (this.ringMat) setColor(this.ringMat, this.theme.accentAmber, level);
    // Counter-phase so the two parts are never dark at the same instant.
    if (this.coreMat) {
      const inverse =
        (this.pulseCeiling + this.pulseFloor - (level / Math.max(0.001, this.theme.glowIntensity))) *
        this.theme.glowIntensity;
      setColor(this.coreMat, this.theme.primaryPhosphor, inverse);
    }
  }
}
