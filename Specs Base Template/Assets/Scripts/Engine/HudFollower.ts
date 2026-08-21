/**
 * HudFollower — our own lazy-follow for HUDRoot, replacing SIK's Headlock.
 *
 * Why it exists: SIK Headlock's smoothing step is
 *   pos += (target - pos) * easing * dt / 0.033
 * which is a dt-scaled lerp — stable at normal frame times and DIVERGENT the
 * moment easing * dt / 0.033 exceeds 2. At our tuned easing 0.25 that is any
 * frame longer than ~0.26 s, and preview hitches (screenshots, tool calls)
 * produce those routinely. Measured runaway: position multiplying ~x30/s off
 * to 1e19 cm. Every "HUD vanished / did not follow" symptom was this one bug.
 *
 * This follower is unconditionally stable:
 *   - per-axis alpha = 1 - exp(-dt / tau), which is in (0,1) for ANY dt;
 *   - dt is clamped before use, so a multi-second hitch cannot teleport the
 *     HUD even with stable maths;
 *   - non-finite camera poses are rejected — hold the last good pose and log,
 *     never propagate a NaN.
 *
 * The follow model reproduces SIK Headlock's measured feel: a smoothed sphere
 * centre chases the head position (gated by a translation buffer), and the
 * HUD sits on that sphere at smoothed yaw/pitch angles that chase the gaze
 * only past a per-axis dead-zone, easing just far enough to sit at the buffer
 * edge (which is why a 3° buffer leaves up to ~6 cm of rest offset at 120 cm
 * — same as Headlock, measured). One deliberate difference: Headlock never
 * rotated its target, so HUDRoot kept whatever rotation the last recenter
 * gave it and turned edge-on after a large yaw. This follower derives the
 * rotation from the SAME smoothed angles, so the panel keeps facing the
 * wearer with no extra motion.
 *
 * Engine-side because it places a ROOT — the same reasoning that puts
 * ModeRouter (root visibility) and HudRecenter there. It touches only
 * HUDRoot's transform, never its contents. HudRecenter stays as the outer
 * escape hatch; this component also carries its own drift guard against its
 * own target — with stable maths it should never fire, and if it does that
 * is a bug report, not a tuning problem.
 */
import { eventBus, Events } from "./EventBus";

@component
export class HudFollower extends BaseScriptComponent {
  @input @hint("HUDRoot.") private hudRoot: SceneObject;
  @input @hint("Camera Object.") private cameraObject: SceneObject;

  @input
  @hint("How far in front of the user the HUD sits, centimetres. Matches the authored z = -120.")
  private distanceCm: number = 120;

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.01))
  @hint("Seconds to close ~63% of the horizontal (XZ) position gap. 0.13 reproduces the tuned Headlock feel (easing 0.25 at 60 fps).")
  private tauXZ: number = 0.13;

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.01))
  @hint("Seconds to close ~63% of the vertical (Y) position gap.")
  private tauY: number = 0.13;

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.01))
  @hint("Seconds to close ~63% of the pitch gap.")
  private tauPitch: number = 0.13;

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.01))
  @hint("Seconds to close ~63% of the yaw gap.")
  private tauYaw: number = 0.13;

  @input
  @hint("Head translation, centimetres, before the HUD starts to follow. Tuned value 6.")
  private bufferTranslationCm: number = 6;

  @input
  @hint("Degrees of pitch dead-zone in each direction. Tuned value 3.")
  private bufferPitchDeg: number = 3;

  @input
  @hint("Degrees of yaw dead-zone in each direction. Tuned value 3.")
  private bufferYawDeg: number = 3;

  @input
  @widget(new SliderWidget(0.02, 0.5, 0.01))
  @hint("Ceiling on the dt fed to the smoothing, seconds. A hitch longer than this advances the ease by exactly this much — the HUD can never jump further than one clamped step.")
  private dtClampSec: number = 0.1;

  @input
  @widget(new SliderWidget(150, 2000, 50))
  @hint("Belt-and-braces: if the HUD is ever further than this from its own computed target, snap the follow state to the camera and log. With stable maths this should NEVER fire; if it does, the maths is wrong — report it, do not raise the threshold.")
  private driftSnapCm: number = 400;

  @input
  @widget(new SliderWidget(0, 10, 1))
  @hint("Log distance-from-target every N seconds (0 = off). Diagnostics for soak tests.")
  private logIntervalSec: number = 0;

  @input private enableLogging: boolean = true;

  // Follow state: sphere centre (smoothed head position) + smoothed gaze angles.
  private center: vec3 = vec3.zero();
  private yaw: number = 0;
  private pitch: number = 0;
  private haveState: boolean = false;

  private clock: number = 0;
  private sinceLog: number = 0;
  private maxExcursionCm: number = 0;
  private chasing: boolean = false;
  private chaseStartS: number = 0;
  private lastBadPoseLogS: number = -100;

  private static readonly DEG2RAD = Math.PI / 180;
  private static readonly SETTLED_CM = 10;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      eventBus.subscribe(Events.recenterRequested, () => {
        // HudRecenter force-places the root; drop our state so the next frame
        // re-seeds from the live camera instead of easing back to the old pose.
        this.haveState = false;
      });
      this.log("ready. tau=" + this.tauYaw + "s buffers=" + this.bufferTranslationCm + "cm/" + this.bufferPitchDeg + "°/" + this.bufferYawDeg + "° dist=" + this.distanceCm);
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onUpdate(): void {
    if (!this.hudRoot || !this.cameraObject) return;
    const dtRaw = getDeltaTime();
    if (!(dtRaw > 0)) return;
    this.clock += dtRaw;
    const dt = Math.min(dtRaw, this.dtClampSec);

    const camT = this.cameraObject.getTransform();
    const camPos = camT.getWorldPosition();
    const fwd = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    if (!this.finite3(camPos) || !this.finite3(fwd)) {
      // Requirement 3: never propagate a bad pose. Hold and say so (throttled).
      if (this.clock - this.lastBadPoseLogS > 1) {
        this.lastBadPoseLogS = this.clock;
        this.log("camera pose not finite — holding last good pose");
      }
      return;
    }

    const camYaw = Math.atan2(fwd.x, fwd.z);
    const camPitch = Math.atan2(fwd.y, Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z));
    if (!this.haveState) this.snapTo(camPos, camYaw, camPitch);

    // Yaw: chase only past the dead-zone, and only as far as the buffer edge.
    const yawBuf = this.bufferYawDeg * HudFollower.DEG2RAD;
    const yawErr = this.wrapPi(camYaw - this.yaw);
    if (Math.abs(yawErr) > yawBuf) {
      const excess = yawErr - Math.sign(yawErr) * yawBuf;
      this.yaw = this.wrapPi(this.yaw + excess * this.alpha(dt, this.tauYaw));
    }

    // Pitch: same shape, clamped away from the poles.
    const pitchBuf = this.bufferPitchDeg * HudFollower.DEG2RAD;
    const pitchErr = camPitch - this.pitch;
    if (Math.abs(pitchErr) > pitchBuf) {
      const excess = pitchErr - Math.sign(pitchErr) * pitchBuf;
      this.pitch += excess * this.alpha(dt, this.tauPitch);
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    }

    // Translation: the buffer is an activation gate (like Headlock), then the
    // centre eases toward the head — XZ and Y on their own time constants.
    const dcx = camPos.x - this.center.x;
    const dcy = camPos.y - this.center.y;
    const dcz = camPos.z - this.center.z;
    if (Math.sqrt(dcx * dcx + dcy * dcy + dcz * dcz) > this.bufferTranslationCm) {
      const aXZ = this.alpha(dt, this.tauXZ);
      const aY = this.alpha(dt, this.tauY);
      this.center = new vec3(this.center.x + dcx * aXZ, this.center.y + dcy * aY, this.center.z + dcz * aXZ);
    }

    let target = this.targetFromState();
    if (!this.finite3(target)) {
      this.log("computed target not finite — resetting follow state");
      this.haveState = false;
      return;
    }

    const hudT = this.hudRoot.getTransform();
    const cur = hudT.getWorldPosition();
    const ex = cur.sub(target).length;
    let excursion = this.finite3(cur) ? ex : Number.POSITIVE_INFINITY;
    if (excursion > this.driftSnapCm) {
      this.log("DRIFT-GUARD FIRED — HUD " + (isFinite(excursion) ? (excursion / 100).toFixed(1) + "m" : "NaN") + " from target, snapping. This should never happen; the maths is wrong if it does.");
      this.snapTo(camPos, camYaw, camPitch);
      target = this.targetFromState();
      excursion = 0;
    }
    if (excursion > this.maxExcursionCm) this.maxExcursionCm = excursion;

    // Settle reporting: an excursion beyond SETTLED_CM is a chase in progress.
    if (!this.chasing && excursion > HudFollower.SETTLED_CM) {
      this.chasing = true;
      this.chaseStartS = this.clock;
    } else if (this.chasing && excursion <= HudFollower.SETTLED_CM) {
      this.chasing = false;
      this.log("settled " + (this.clock - this.chaseStartS).toFixed(2) + "s after leaving the dead-zone");
    }

    hudT.setWorldPosition(target);
    hudT.setWorldRotation(
      quat.angleAxis(this.yaw + Math.PI, vec3.up()).multiply(quat.angleAxis(this.pitch, vec3.right()))
    );

    if (this.logIntervalSec > 0) {
      this.sinceLog += dtRaw;
      if (this.sinceLog >= this.logIntervalSec) {
        this.sinceLog = 0;
        this.log("dist-from-target=" + excursion.toFixed(1) + "cm max=" + this.maxExcursionCm.toFixed(1) + "cm dt=" + (dtRaw * 1000).toFixed(0) + "ms");
      }
    }
  }

  /** alpha = 1 - exp(-dt/tau): in (0,1) for any dt > 0 — cannot overshoot. */
  private alpha(dt: number, tau: number): number {
    return 1 - Math.exp(-dt / Math.max(0.01, tau));
  }

  private targetFromState(): vec3 {
    const cp = Math.cos(this.pitch);
    return new vec3(
      this.center.x + Math.sin(this.yaw) * cp * this.distanceCm,
      this.center.y + Math.sin(this.pitch) * this.distanceCm,
      this.center.z + Math.cos(this.yaw) * cp * this.distanceCm
    );
  }

  private snapTo(camPos: vec3, camYaw: number, camPitch: number): void {
    this.center = new vec3(camPos.x, camPos.y, camPos.z);
    this.yaw = camYaw;
    this.pitch = camPitch;
    this.haveState = true;
  }

  private wrapPi(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  private finite3(v: vec3): boolean {
    return isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[FOLLOW] " + msg);
  }
}
