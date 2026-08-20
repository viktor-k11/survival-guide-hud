/**
 * THROWAWAY DIAGNOSTIC — settles one question and then gets deleted.
 *
 * **Does the TRACKED device camera actually translate when a human drives
 * Interactive Preview Mode with the keyboard?**
 *
 * `Docs/SCENE-MAP.md` has been asserting "the simulated device camera is pinned
 * at the origin" since the survey work. That conclusion was drawn from the MCP
 * `MovePreviewCamera` tool — which moves the EDITOR VIEWPORT, a different thing
 * from the tracked `Camera Object` the Lens sees. Measuring one tool and
 * concluding about the platform is the mistake this probe exists to correct, in
 * whichever direction the numbers point.
 *
 * Logs once per second, with a `[TRACK]` prefix:
 *
 *   - the tracked camera's `getWorldPosition()` (cm),
 *   - cumulative distance travelled since start (path length, not displacement
 *     — a there-and-back walk has to read as movement, not as zero),
 *   - straight-line displacement from the start pose (the honest "how far did
 *     we get"),
 *   - pitch in degrees, so "looking down" is a number rather than an impression,
 *   - DISTINCT World Query hit points accumulated so far.
 *
 * ## Distinct points are counted the SurveyController way, deliberately
 *
 * Same 8 cm dedupe cell, same "one key per quantised position" rule (see
 * `SurveyController.acceptPoint`). The whole value of this number is that it is
 * comparable with the 3-points-in-Sunlit-Outdoor / 6-points-in-Colorful-Home
 * figures recorded when the head never moved. A probe with its own cleverer
 * dedupe would produce a number nobody could compare to anything.
 *
 * This runs its OWN hit-test session rather than borrowing the survey's, so it
 * can measure continuously while the survey is idle, mid-run, or restarted —
 * and so switching it on cannot perturb the thing being measured.
 */
const WorldQueryModule = require("LensStudio:WorldQueryModule") as WorldQueryModule;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

@component
export class CameraTrackProbe extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Camera tracking probe [TEMP]</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Answers: does the tracked device camera translate under keyboard drive in Interactive Preview Mode? Delete once the answer is in SCENE-MAP.</span>')

  @input
  @hint("The TRACKED camera — 'Camera Object', the one carrying DeviceTracking. NOT the editor viewport camera; the difference is the entire point of this probe.")
  private cameraObject: SceneObject;

  @input
  @hint("Off by default. Every run casts real World Query rays.")
  private runOnStart: boolean = false;

  @input
  @widget(new SliderWidget(0.25, 5.0, 0.25))
  private logIntervalSec: number = 1.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Ray sampling — mirrors SurveyController</span>')

  @input
  @hint("MUST match SurveyController.dedupeCellCm (8) or the distinct-point count stops being comparable to the 3/6 baseline.")
  private dedupeCellCm: number = 8;

  @input private raysPerFrame: number = 8;
  @input private rayRangeCm: number = 900;

  @input
  @hint("Half-width of the ray fan in degrees, yaw and pitch. The survey's own lattice spans +-28 yaw and +6..-42 pitch; this is a coarser stand-in whose only job is to keep finding surface while walking.")
  private fanHalfAngleDeg: number = 20;

  @input private fanSteps: number = 5;

  // ------------------------------------------------------------------ state

  private session: HitTestSession | null = null;
  private lattice: { yaw: number; pitch: number }[] = [];
  private rayCursor: number = 0;

  private running: boolean = false;
  private startPos: vec3 | null = null;
  private lastPos: vec3 | null = null;
  private travelledCm: number = 0;
  private maxDisplacementCm: number = 0;
  private samples: number = 0;
  private movedSamples: number = 0;

  private seen: { [k: string]: boolean } = {};
  private distinct: number = 0;
  private rawHits: number = 0;
  private raysCast: number = 0;
  private pending: number = 0;

  private nextLogAt: number = 0;

  onAwake(): void {
    this.buildLattice();
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    print("[TRACK] " + msg);
  }

  private buildLattice(): void {
    const n = Math.max(2, Math.round(this.fanSteps));
    const half = this.fanHalfAngleDeg;
    for (let iy = 0; iy < n; iy++) {
      for (let ip = 0; ip < n; ip++) {
        const yaw = -half + (2 * half * iy) / (n - 1);
        // Biased downward: the interesting surface in an outdoor scene is floor.
        const pitch = 6 - ((6 + half * 2) * ip) / (n - 1);
        this.lattice.push({ yaw: yaw, pitch: pitch });
      }
    }
  }

  private onStart(): void {
    if (!this.runOnStart) return;
    if (!this.cameraObject) {
      this.log("FAIL: cameraObject not wired — nothing to measure");
      return;
    }

    const options = HitTestSessionOptions.create();
    options.filter = false;
    this.session = WorldQueryModule.createHitTestSessionWithOptions(options);
    // Without start() every hitTest silently returns null and the scene looks
    // like empty terrain — the same trap SurveyController documents.
    this.session.start();

    const p = this.cameraObject.getTransform().getWorldPosition();
    this.startPos = new vec3(p.x, p.y, p.z);
    this.lastPos = new vec3(p.x, p.y, p.z);
    this.running = true;
    this.nextLogAt = getTime() + this.logIntervalSec;

    this.createEvent("UpdateEvent").bind(() => this.onUpdate());

    this.log(
      "started. start pose (" + p.x.toFixed(1) + ", " + p.y.toFixed(1) + ", " + p.z.toFixed(1) +
        ")cm — hold W/A/S/D or Q/E in the Preview panel now. dedupe=" + this.dedupeCellCm +
        "cm, fan=" + this.lattice.length + " rays"
    );
  }

  private onUpdate(): void {
    if (!this.running) return;
    this.castBatch();

    const t = this.cameraObject.getTransform();
    const p = t.getWorldPosition();

    if (this.lastPos) {
      const step = Math.sqrt(
        (p.x - this.lastPos.x) * (p.x - this.lastPos.x) +
          (p.y - this.lastPos.y) * (p.y - this.lastPos.y) +
          (p.z - this.lastPos.z) * (p.z - this.lastPos.z)
      );
      // 0.01 cm floor: tracking jitter must not be reported as walking.
      if (step > 0.01) this.travelledCm += step;
    }
    this.lastPos = new vec3(p.x, p.y, p.z);

    if (this.startPos) {
      const d = Math.sqrt(
        (p.x - this.startPos.x) * (p.x - this.startPos.x) +
          (p.y - this.startPos.y) * (p.y - this.startPos.y) +
          (p.z - this.startPos.z) * (p.z - this.startPos.z)
      );
      if (d > this.maxDisplacementCm) this.maxDisplacementCm = d;
    }

    const now = getTime();
    if (now >= this.nextLogAt) {
      this.nextLogAt = now + this.logIntervalSec;
      this.emitSample(p, t.getWorldRotation());
    }
  }

  private emitSample(p: vec3, rot: quat): void {
    this.samples++;
    const disp = this.startPos
      ? Math.sqrt(
          (p.x - this.startPos.x) * (p.x - this.startPos.x) +
            (p.y - this.startPos.y) * (p.y - this.startPos.y) +
            (p.z - this.startPos.z) * (p.z - this.startPos.z)
        )
      : 0;
    if (disp > 0.5) this.movedSamples++;

    const e = rot.toEulerAngles();
    this.log(
      "t=" + this.samples + "s pos=(" + p.x.toFixed(1) + ", " + p.y.toFixed(1) + ", " + p.z.toFixed(1) +
        ")cm travelled=" + this.travelledCm.toFixed(1) +
        "cm displacement=" + disp.toFixed(1) +
        "cm pitch=" + (e.x * RAD2DEG).toFixed(1) +
        "deg yaw=" + (e.y * RAD2DEG).toFixed(1) +
        "deg distinctPoints=" + this.distinct +
        " rawHits=" + this.rawHits + "/" + this.raysCast + " rays"
    );
  }

  private castBatch(): void {
    if (!this.session || !this.cameraObject || this.lattice.length === 0) return;
    const t = this.cameraObject.getTransform();
    const origin = t.getWorldPosition();
    const rot = t.getWorldRotation();

    // Explicit basis, not transform.forward — see SurveyController's header.
    const fwd = rot.multiplyVec3(new vec3(0, 0, -1));
    const right = rot.multiplyVec3(new vec3(1, 0, 0));
    const up = rot.multiplyVec3(new vec3(0, 1, 0));

    const count = Math.max(1, Math.round(this.raysPerFrame));
    for (let i = 0; i < count; i++) {
      const cell = this.lattice[this.rayCursor % this.lattice.length];
      this.rayCursor++;
      const ty = Math.tan(cell.yaw * DEG2RAD);
      const tp = Math.tan(cell.pitch * DEG2RAD);
      const dir = fwd.add(right.uniformScale(ty)).add(up.uniformScale(tp)).normalize();
      const end = origin.add(dir.uniformScale(this.rayRangeCm));
      this.pending++;
      this.raysCast++;
      this.session.hitTest(origin, end, (hit: WorldQueryHitTestResult | null) => this.onHit(hit));
    }
  }

  private onHit(hit: WorldQueryHitTestResult | null): void {
    this.pending--;
    if (!hit || !this.running) return;
    this.rawHits++;
    const p = hit.position;
    const q = Math.max(1, this.dedupeCellCm);
    const key = Math.floor(p.x / q) + ":" + Math.floor(p.y / q) + ":" + Math.floor(p.z / q);
    if (this.seen[key]) return;
    this.seen[key] = true;
    this.distinct++;
  }

  /** Final tally, for the report. Call from a delayed event or a debug key. */
  public summarise(): void {
    this.log(
      "SUMMARY samples=" + this.samples + " movedSamples=" + this.movedSamples +
        " travelled=" + this.travelledCm.toFixed(1) +
        "cm maxDisplacement=" + this.maxDisplacementCm.toFixed(1) +
        "cm distinctPoints=" + this.distinct +
        " rawHits=" + this.rawHits + "/" + this.raysCast +
        " VERDICT=" + (this.maxDisplacementCm > 1.0 ? "CAMERA TRANSLATES" : "CAMERA PINNED")
    );
  }
}
