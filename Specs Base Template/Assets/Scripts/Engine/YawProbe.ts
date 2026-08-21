/**
 * [TEMP] YawProbe — one measurement, then delete (CameraTrackProbe precedent).
 *
 * Question: does the TRACKED camera's ROTATION change under keyboard yaw
 * (Shift+A/D in Interactive Preview), and does Headlock follow it? The prior
 * "no yaw follow" result was measured through MovePreviewCamera.rotate — the
 * same tool that produced the original "camera is pinned" error, so keyboard
 * input is the untested path that decides tool-vs-platform.
 *
 * Logs once a second: the tracked camera's yaw (from its world rotation) and
 * HUDRoot's world position.
 */
import { eventBus } from "./EventBus";

@component
export class YawProbe extends BaseScriptComponent {
  @input @allowUndefined private cameraObject: SceneObject;
  @input @allowUndefined private hudRoot: SceneObject;
  @input private runProbe: boolean = true;

  private elapsed: number = 0;
  private tick: number = 0;

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onUpdate(): void {
    if (!this.runProbe || !this.cameraObject || !this.hudRoot) return;
    this.elapsed += getDeltaTime();
    if (this.elapsed < 1.0) return;
    this.elapsed = 0;
    this.tick++;

    const camT = this.cameraObject.getTransform();
    const fwd = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    let yawDeg = (Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI;
    if (yawDeg < 0) yawDeg += 360;
    const camP = camT.getWorldPosition();
    const hudP = this.hudRoot.getTransform().getWorldPosition();
    print(
      "[YAWPROBE] t=" + this.tick +
        "s camYaw=" + yawDeg.toFixed(1) +
        " camPos=(" + camP.x.toFixed(0) + "," + camP.z.toFixed(0) + ")" +
        " hudPos=(" + hudP.x.toFixed(0) + "," + hudP.y.toFixed(0) + "," + hudP.z.toFixed(0) + ")"
    );
  }
}
