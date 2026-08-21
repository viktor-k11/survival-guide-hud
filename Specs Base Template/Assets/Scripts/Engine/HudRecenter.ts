/**
 * HudRecenter — the escape hatch for a tracking hiccup.
 *
 * With Headlock enabled the HUD lazily follows the head, but a tracking jump
 * mid-demo can still leave it somewhere the easing takes seconds to recover
 * from — and the way back must never be "restart the Lens". `recenterRequested`
 * (voice "recenter", or the debug key) force-places HUDRoot directly in front
 * of the user at its authored distance, yawed to face them; the Headlock
 * component simply resumes its lazy follow from the new pose.
 *
 * Engine-side because it makes a placement decision about a ROOT — the same
 * reasoning that puts ModeRouter (root visibility) on this side of the split.
 * It touches only HUDRoot itself, never its contents.
 */
import { eventBus, Events } from "./EventBus";

@component
export class HudRecenter extends BaseScriptComponent {
  @input @hint("HUDRoot.") private hudRoot: SceneObject;
  @input @hint("Camera Object.") private cameraObject: SceneObject;

  @input
  @hint("How far in front of the user the HUD snaps to, centimetres. Matches the authored z = -120.")
  private distanceCm: number = 120;

  @input private enableDebugKeys: boolean = true;
  @input @hint("Debug key — a digit, off the movement keys.") private keyRecenter: string = "5";
  @input private enableLogging: boolean = true;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[RECENTER] " + msg);
  }

  private onStart(): void {
    eventBus.subscribe(Events.recenterRequested, (p: { source: string }) => {
      this.recenter(p ? p.source : "?");
    });
    if (this.enableDebugKeys) this.bindDebugKeys();
    this.log("ready. key=" + this.keyRecenter);
  }

  private recenter(source: string): void {
    if (!this.hudRoot || !this.cameraObject) {
      this.log("recenter failed — not wired");
      return;
    }
    const camT = this.cameraObject.getTransform();
    const pos = camT.getWorldPosition();
    const fwd = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    // Flat forward: the HUD re-appears level in front of the user, not tilted
    // into the ground because they happened to be looking down.
    const len = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const fx = len > 0.001 ? fwd.x / len : 0;
    const fz = len > 0.001 ? fwd.z / len : -1;

    const t = this.hudRoot.getTransform();
    t.setWorldPosition(new vec3(pos.x + fx * this.distanceCm, pos.y, pos.z + fz * this.distanceCm));
    t.setWorldRotation(quat.angleAxis(Math.atan2(fx, fz) + Math.PI, vec3.up()));
    this.log("HUD recentered (" + source + ")");
  }

  private bindDebugKeys(): void {
    const digits = "0123456789";
    const di = digits.indexOf((this.keyRecenter || "").charAt(0));
    const key = di >= 0 ? ((Keys.Zero + di) as Keys) : Keys.Invalid;
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === key) this.recenter("debugKey");
    });
  }
}
