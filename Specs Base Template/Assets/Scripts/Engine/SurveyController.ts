/**
 * SurveyController — the on-demand terrain survey (menu row 1, or debug key S).
 *
 * Casts a grid of World Query rays through the camera's view every frame and
 * accumulates the hits into a point cloud with normals. When the survey ends —
 * either the clock runs out or enough usable ground has been collected — it
 * hands the cloud to the PURE selector in SiteSelection.ts and publishes the
 * result on the bus.
 *
 * ## The split this file exists to protect
 *
 * Everything impure lives HERE: raycasts, the clock, the camera transform, unit
 * conversion, event emission. SiteSelection.ts gets a plain array of
 * {position, normal} in METRES and returns ranked sites. It never learns that
 * Lens Studio exists. Anything that looks like scoring belongs there, not here;
 * anything that looks like a SceneObject belongs here, not there.
 *
 * ## Two runtime gotchas that shape the code below
 *
 * 1. `vec3.forward()` in Lens Studio is (0, 0, +1) — the OPPOSITE of the -Z
 *    forward convention the coordinate system otherwise uses. A camera looks
 *    along its LOCAL -Z. Rather than pick between `transform.forward` and
 *    `transform.back` and be wrong half the time, the view basis below is built
 *    explicitly by rotating (0,0,-1), (1,0,0) and (0,1,0) by the camera's world
 *    rotation. No aliases, no ambiguity.
 * 2. `hitTest` returns null for any ray outside the camera frustum, because the
 *    depth map only covers what the device can see. Rays are therefore fired
 *    inside the FOV, and a null result is normal rather than an error.
 */
import { eventBus, Events } from "./EventBus";
import { MenuSelectedPayload } from "./RequestTypes";
import {
  DEFAULT_SITE_OPTIONS,
  SiteCandidate,
  SiteSelectionOptions,
  SiteSelectionResult,
  SurveyPoint,
  selectSites,
} from "./SiteSelection";
import {
  DistanceWarningPayload,
  SiteSlot,
  SurveyBounds,
  SurveyCompletePayload,
  SurveyProgressPayload,
  SurveySite,
} from "./SurveyTypes";

const WorldQueryModule = require("LensStudio:WorldQueryModule") as WorldQueryModule;

const CM_PER_M = 100;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEG2RAD = Math.PI / 180;

@component
export class SurveyController extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Survey timing</span>')

  @input
  @hint("Camera Object. The survey rays are cast from here, through its view.")
  private cameraObject: SceneObject;

  @input
  @widget(new SliderWidget(2, 30, 0.5))
  @hint("Full survey length in seconds. The survey ALWAYS ends by this point.")
  private durationSec: number = 12;

  @input
  @widget(new SliderWidget(0, 15, 0.5))
  @hint("Never finish before this, however fast the ground fills in. Stops a lucky first frame from ending the survey instantly.")
  private minDurationSec: number = 3;

  @input
  @hint("Cheap precondition for the early exit, and the denominator of the coverage half of surveyProgress. Distinct ground cells. Set it very high to force the full duration.")
  private earlyExitGroundCells: number = 260;

  @input
  @hint("Early exit needs this many tent sites plus a fire. 2 = the user gets a real choice. If the terrain cannot offer that many, the survey simply runs its full duration and reports what it found.")
  private earlyExitRequiresTents: number = 2;

  @input
  @widget(new SliderWidget(0.25, 5.0, 0.25))
  @hint("How often the early-exit check runs the selector, in seconds. It is the only expensive thing in the loop, so it is not run every frame.")
  private earlyExitCheckSec: number = 1.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Terrain source</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Hard rule 5. A stored cloud makes the survey deterministic, and it is the ONLY way to exercise this on a desk: the Preview panel cannot feed a real one (see the note on cloudFixture).</span>')

  @input
  @hint("Read the point cloud from cloudFixture instead of casting World Query rays. The rest of the survey — timeline, progress, early exit, scoring, markers — is unchanged.")
  private useFixtureCloud: boolean = false;

  @input
  @allowUndefined
  @hint("Assets/Survey/fixtures/*.json — a stored cloud in CENTIMETRES. The Preview panel's simulated depth resolves only about five taps per pose and its device camera never moves, so a live survey there tops out at a handful of points; a stored cloud is how the markers and the distance guard get verified off-device.")
  private cloudFixture: JsonAsset;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Ray grid</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">World Query resolves at roughly 5 Hz, so more rays per frame does not mean more detail — it means wider coverage of whatever the user is looking at right now.</span>')

  @input
  @widget(new SliderWidget(1, 24, 1))
  @hint("Rays fired per frame. They walk through the lattice below, so the whole pattern is covered every few frames.")
  private raysPerFrame: number = 8;

  @input @hint("Lattice columns across the view.") private gridColumns: number = 7;
  @input @hint("Lattice rows down the view.") private gridRows: number = 5;

  @input
  @widget(new SliderWidget(5, 60, 1))
  @hint("Half-width of the ray fan in degrees, left and right of centre.")
  private yawHalfAngleDeg: number = 28;

  @input
  @hint("Top of the fan, degrees relative to the view centre. Slightly positive so a user looking level still samples ground ahead.")
  private pitchMaxDeg: number = 6;

  @input
  @hint("Bottom of the fan, degrees. Negative = downward. The ground is below eye level, so the fan is biased down.")
  private pitchMinDeg: number = -42;

  @input
  @hint("How far each ray reaches, centimetres.")
  private rayRangeCm: number = 900;

  @input
  @hint("Smooth hit results over time. OFF for a survey: filtering trades positional truth for stability, and this is a measurement, not a placement.")
  private filterHits: boolean = false;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Point cloud</span>')

  @input
  @hint("Hits closer together than this collapse into one point, centimetres. Keeps a stare at one spot from swamping the cloud.")
  private dedupeCellCm: number = 8;

  @input
  @hint("Hard cap on stored points. Reached, the survey keeps running but stops growing.")
  private maxPoints: number = 6000;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Site scoring — all pure inputs to SiteSelection.ts</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">METRES. These are passed straight into the pure selector; nothing here reads the scene.</span>')

  @input @hint("Tent footprint, metres square.") private tentFootprintM: number = 2.5;
  @input @hint("Fire footprint, metres across.") private fireFootprintM: number = 1.2;

  @input
  @hint("HARD CONSTRAINT: minimum fire-to-tent distance, metres. Cannot be met -> the fire is still placed and distanceWarning fires.")
  private minFireToTentM: number = 3.0;

  @input @hint("Two tent suggestions closer than this are the same site twice.") private minTentSeparationM: number = 3.0;
  @input @hint("Binning resolution, metres.") private cellSizeM: number = 0.25;
  @input @hint("Surface counts as ground above this normal.y. 1 = perfectly level.") private minUpDot: number = 0.85;
  @input @hint("Height spread across a footprint that scores flatness 0, metres.") private flatnessToleranceM: number = 0.12;
  @input @hint("Nearest comfortable site distance, metres.") private preferredMinDistanceM: number = 1.5;
  @input @hint("Furthest comfortable site distance, metres.") private preferredMaxDistanceM: number = 6.0;
  @input @hint("Beyond this it is a hike, not a suggestion.") private maxDistanceM: number = 12.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug</span>')

  @input
  @hint("Log this many individual hits per survey, with position and normal. 0 = off. The way to tell 'the rays are missing' from 'the rays all land in the same place'.")
  private logFirstNHits: number = 0;

  @input @hint("Turn off before shipping.") private enableDebugKeys: boolean = true;
  @input @hint("Restart the survey from scratch.") private keyRestartSurvey: string = "S";
  @input @hint("End the survey immediately with whatever has been collected.") private keyFinishSurvey: string = "G";
  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private session: HitTestSession | null = null;
  private running: boolean = false;
  private startTime: number = 0;
  private lastProgress: number = 0;
  private rayCursor: number = 0;
  private pending: number = 0;

  /** Deduped cloud, CENTIMETRES. Converted to metres once, at selection time. */
  private cloud: SurveyPoint[] = [];
  private seen: { [k: string]: boolean } = {};
  /** Distinct ground cells, for the early exit. Mirrors the selector's binning. */
  private groundCells: { [k: string]: boolean } = {};
  private groundCellCount: number = 0;
  private bounds: SurveyBounds | null = null;
  /** Ray accounting. A null hit is ordinary, but ALL nulls means a broken setup. */
  private lastReadinessCheck: number = 0;
  private raysCast: number = 0;
  private raysHit: number = 0;
  private firstHitLogged: boolean = false;

  private lattice: { yaw: number; pitch: number }[] = [];
  /** Fixture points waiting to be revealed, so a stored survey still animates. */
  private fixtureQueue: SurveyPoint[] = [];

  onAwake(): void {
    this.buildLattice();
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[SURVEY] " + msg);
  }

  private onStart(): void {
    const options = HitTestSessionOptions.create();
    options.filter = this.filterHits;
    this.session = WorldQueryModule.createHitTestSessionWithOptions(options);
    // Depth is not computed until start() is called. Without this every
    // hitTest silently returns null and the survey looks like empty terrain.
    this.session.start();

    if (this.enableDebugKeys) this.bindDebugKeys();

    this.createEvent("UpdateEvent").bind(() => this.onUpdate());

    this.log(
      "ready. lattice=" + this.lattice.length + " rays, " + this.raysPerFrame + "/frame, range=" +
        this.rayRangeCm + "cm, duration=" + this.durationSec + "s, earlyExit>=" +
        this.earlyExitRequiresTents + " tents + fire after " + this.minDurationSec + "s / " +
        this.earlyExitGroundCells + " cells"
    );

    // The survey is ON DEMAND now: menu row 1 ("SCAN THIS AREA") starts it.
    // No boot auto-start. The seam is unchanged — this controller still only
    // reports facts (started / complete) and LessonEngine still decides what
    // mode those mean. Re-selecting the row restarts the survey, which is the
    // same behaviour as the S debug key.
    eventBus.subscribe(Events.menuSelected, (p: MenuSelectedPayload) => {
      if (!p || p.row !== 1) return;
      this.log("menu row 1 (" + p.source + ") — starting survey");
      this.beginSurvey();
    });
  }

  /** Fixed yaw/pitch lattice across the view. Deterministic: no jitter, no random. */
  private buildLattice(): void {
    this.lattice = [];
    const cols = Math.max(1, Math.round(this.gridColumns));
    const rows = Math.max(1, Math.round(this.gridRows));
    for (let r = 0; r < rows; r++) {
      const tv = rows === 1 ? 0.5 : r / (rows - 1);
      const pitch = this.pitchMaxDeg + (this.pitchMinDeg - this.pitchMaxDeg) * tv;
      for (let c = 0; c < cols; c++) {
        const tu = cols === 1 ? 0.5 : c / (cols - 1);
        const yaw = -this.yawHalfAngleDeg + 2 * this.yawHalfAngleDeg * tu;
        this.lattice.push({ yaw: yaw, pitch: pitch });
      }
    }
  }

  // ------------------------------------------------------------- public API

  /** Start (or restart) the survey. Safe to call at any time. */
  public beginSurvey(): void {
    this.cloud = [];
    this.seen = {};
    this.groundCells = {};
    this.groundCellCount = 0;
    this.bounds = null;
    this.rayCursor = 0;
    this.pending = 0;
    this.lastReadinessCheck = 0;
    this.raysCast = 0;
    this.raysHit = 0;
    this.firstHitLogged = false;
    this.lastProgress = 0;
    this.startTime = getTime();
    this.running = true;
    this.fixtureQueue = this.useFixtureCloud ? this.loadFixtureCloud() : [];

    this.log(
      "survey started" +
        (this.useFixtureCloud ? " [FIXTURE cloud, " + this.fixtureQueue.length + " points]" : " [World Query]")
    );
    eventBus.emit(Events.surveyStarted, { durationSec: this.durationSec });
    this.emitProgress(0);
  }

  /** End the survey now and select sites from whatever has been collected. */
  public finishSurvey(earlyExit: boolean, precomputed?: SiteSelectionResult): void {
    if (!this.running) return;
    this.running = false;
    const elapsed = getTime() - this.startTime;

    // Reuse the readiness check's result when it is the reason we stopped —
    // selecting twice over the same cloud would be pure waste, and a second
    // pass over a cloud that grew in between would report different sites from
    // the ones that triggered the exit.
    const result = precomputed
      ? precomputed
      : selectSites(this.toMetres(this.cloud), this.userPositionM(), this.selectionOptions());

    const sites: SurveySite[] = [];
    for (let i = 0; i < result.tents.length; i++) {
      sites.push(this.toSite(result.tents[i], i === 0 ? "TENT_A" : "TENT_B"));
    }
    if (result.fire) sites.push(this.toSite(result.fire, "FIRE"));

    let bestSlot: SiteSlot | "" = "";
    let bestScore = -1;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].score > bestScore) {
        bestScore = sites[i].score;
        bestSlot = sites[i].slot;
      }
    }

    const payload: SurveyCompletePayload = {
      sites: sites,
      bestSlot: bestSlot,
      pointCount: result.pointCount,
      usablePointCount: result.usablePointCount,
      cellCount: result.cellCount,
      elapsedSec: Math.round(elapsed * 100) / 100,
      earlyExit: earlyExit,
      distanceWarning: result.distanceWarning,
      fireToNearestTentM: Math.round(result.fireToNearestTentM * 100) / 100,
      requiredFireDistanceM: this.minFireToTentM,
      reason: result.reason,
    };

    this.log(
      "survey complete in " + payload.elapsedSec + "s" + (earlyExit ? " (early exit)" : "") +
        (this.useFixtureCloud ? " source=fixture" : " source=worldQuery") +
        " rays=" + this.raysCast + " hits=" + this.raysHit +
        " (" + (this.raysCast > 0 ? Math.round((this.raysHit / this.raysCast) * 100) : 0) + "%)" +
        " points=" + payload.pointCount + " usable=" + payload.usablePointCount +
        " cells=" + payload.cellCount + " sites=" + sites.length
    );
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      this.log(
        "  " + s.slot + " at (" + s.positionCm.x.toFixed(1) + ", " + s.positionCm.y.toFixed(1) + ", " +
          s.positionCm.z.toFixed(1) + ")cm score=" + s.score.toFixed(3) +
          " flatness=" + Math.round(s.flatness * 100) + "%" +
          " coverage=" + Math.round(s.coverage * 100) + "%" +
          " dist=" + s.distanceM.toFixed(2) + "m cells=" + s.cellCount
      );
    }
    this.log("  fireToNearestTent=" + payload.fireToNearestTentM + "m (min " + this.minFireToTentM + "m) — " + payload.reason);

    // Progress must land on exactly 1 before completion, or the grid finishes
    // its sweep mid-stride.
    this.emitProgress(1);
    eventBus.emit(Events.surveyComplete, payload);

    if (payload.distanceWarning) {
      const warn: DistanceWarningPayload = {
        message: "FIRE TOO CLOSE TO SHELTER",
        actualM: payload.fireToNearestTentM,
        requiredM: this.minFireToTentM,
      };
      this.log("DISTANCE WARNING: " + warn.message + " (" + warn.actualM + "m < " + warn.requiredM + "m)");
      eventBus.emit(Events.distanceWarning, warn);
    }
  }

  // ------------------------------------------------------------- the sweep

  private onUpdate(): void {
    if (!this.running) return;

    const elapsed = getTime() - this.startTime;
    if (this.useFixtureCloud) this.revealFixtureBatch(elapsed);
    else this.castBatch();

    const byTime = this.durationSec > 0 ? elapsed / this.durationSec : 1;
    const byCoverage =
      this.earlyExitGroundCells > 0 ? this.groundCellCount / this.earlyExitGroundCells : 0;
    this.emitProgress(Math.max(byTime, byCoverage));

    if (elapsed >= this.durationSec) {
      this.finishSurvey(false);
      return;
    }

    // EARLY EXIT: "enough usable surface" means "I can already answer the
    // question", not "I have seen N cells".
    //
    // Counting distinct ground cells was the first version and it was wrong in
    // a way that only showed up when it ran: a scan spread thinly over a wide
    // area hits the cell count while leaving every 2.5 m footprint full of
    // holes, so the survey exited pleased with itself and reported no sites at
    // all. The only honest readiness test is the selector itself.
    if (elapsed < this.minDurationSec) return;
    if (this.groundCellCount < this.earlyExitGroundCells) return; // cheap gate first
    if (elapsed - this.lastReadinessCheck < this.earlyExitCheckSec) return;
    this.lastReadinessCheck = elapsed;

    const trial = selectSites(this.toMetres(this.cloud), this.userPositionM(), this.selectionOptions());

    // `!distanceWarning` is not decoration. Without it the survey stops the
    // moment it can NAME three sites, and a partial cloud's best fire is often
    // the one crammed 0.9 m from a tent — measured on this exact fixture. More
    // ground then turns up a spot 3 m clear, but the survey has already quit
    // and shipped the warning. So: exit early only on an answer that satisfies
    // the constraint. If the terrain genuinely cannot, the full duration runs
    // out and the warning is the honest result rather than an impatient one.
    const complete =
      trial.tents.length >= this.earlyExitRequiresTents && trial.fire !== null && !trial.distanceWarning;
    if (complete) this.finishSurvey(true, trial);
  }

  /**
   * Reads the stored cloud. Format is [x, y, z, nx, ny, nz] per point, in
   * centimetres — the compact form keeps a 1681-point clearing under 65 KB.
   * A malformed fixture yields an empty cloud and a logged complaint; it never
   * throws, because a survey that dies on boot takes the whole Lens with it.
   */
  private loadFixtureCloud(): SurveyPoint[] {
    if (!this.cloudFixture) {
      this.log("useFixtureCloud is on but no cloudFixture is wired — surveying empty terrain");
      return [];
    }
    let raw: any;
    try {
      raw = JSON.parse(this.cloudFixture.getString());
    } catch (e) {
      this.log("could not read cloud fixture: " + e);
      return [];
    }
    const rows = raw && raw.points;
    if (!Array.isArray(rows)) {
      this.log("cloud fixture has no points array");
      return [];
    }
    const out: SurveyPoint[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 6) continue;
      out.push({
        position: { x: r[0], y: r[1], z: r[2] },
        normal: { x: r[3], y: r[4], z: r[5] },
      });
    }
    this.log('cloud fixture "' + (raw.name || "?") + '" loaded: ' + out.length + " points");
    return spreadOrder(out);
  }

  /**
   * Feeds stored points in over the survey's duration rather than all at once,
   * so the grid sweep, the progress curve and the early exit all behave exactly
   * as they do on live terrain. A fixture that teleported straight to 100%
   * would verify the scoring and nothing else.
   */
  private revealFixtureBatch(elapsed: number): void {
    if (this.fixtureQueue.length === 0) return;
    const total = this.fixtureQueue.length + this.cloud.length;
    const want = Math.min(total, Math.ceil(total * (this.durationSec > 0 ? elapsed / this.durationSec : 1)));
    while (this.cloud.length < want && this.fixtureQueue.length > 0) {
      const p = this.fixtureQueue.shift();
      if (!p) break;
      this.acceptPoint(p.position.x, p.position.y, p.position.z, p.normal.x, p.normal.y, p.normal.z);
    }
  }

  private castBatch(): void {
    if (!this.session || !this.cameraObject || this.lattice.length === 0) return;

    const t = this.cameraObject.getTransform();
    const origin = t.getWorldPosition();
    const rot = t.getWorldRotation();

    // Built explicitly rather than via transform.forward — see the header note.
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

  /** A null hit is ordinary: the ray left the frustum or found nothing in range. */
  private onHit(hit: WorldQueryHitTestResult | null): void {
    this.pending--;
    if (!hit || !this.running) return;
    this.raysHit++;
    const p = hit.position;
    const n = hit.normal;

    if (this.raysHit <= this.logFirstNHits) {
      this.log(
        "  hit#" + this.raysHit + " (" + p.x.toFixed(0) + ", " + p.y.toFixed(0) + ", " + p.z.toFixed(0) +
          ") n=(" + n.x.toFixed(2) + ", " + n.y.toFixed(2) + ", " + n.z.toFixed(2) + ")"
      );
    }

    if (!this.firstHitLogged) {
      this.firstHitLogged = true;
      const cam = this.cameraObject ? this.cameraObject.getTransform().getWorldPosition() : new vec3(0, 0, 0);
      // Sanity line, once per survey: a hit BEHIND the camera would mean the
      // view basis is inverted, which is the classic vec3.forward() trap.
      this.log(
        "first hit at (" + p.x.toFixed(0) + ", " + p.y.toFixed(0) + ", " + p.z.toFixed(0) +
          ")cm, camera at (" + cam.x.toFixed(0) + ", " + cam.y.toFixed(0) + ", " + cam.z.toFixed(0) +
          ")cm, normal.y=" + n.y.toFixed(2)
      );
    }
    this.acceptPoint(p.x, p.y, p.z, n.x, n.y, n.z);
  }

  /**
   * The single accumulate path. Both sources — World Query hits and stored
   * fixture points — come through here, so dedupe, bounds and the ground tally
   * cannot drift apart between the live and the deterministic run.
   */
  private acceptPoint(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    if (this.cloud.length >= this.maxPoints) return;

    const q = Math.max(1, this.dedupeCellCm);
    const key = Math.floor(x / q) + ":" + Math.floor(y / q) + ":" + Math.floor(z / q);
    if (this.seen[key]) return;
    this.seen[key] = true;

    this.cloud.push({ position: { x: x, y: y, z: z }, normal: { x: nx, y: ny, z: nz } });

    if (this.bounds === null) {
      this.bounds = { minX: x, maxX: x, minZ: z, maxZ: z, meanY: y };
    } else {
      if (x < this.bounds.minX) this.bounds.minX = x;
      if (x > this.bounds.maxX) this.bounds.maxX = x;
      if (z < this.bounds.minZ) this.bounds.minZ = z;
      if (z > this.bounds.maxZ) this.bounds.maxZ = z;
      // Running mean, so a single high hit does not lift the grid off the floor.
      this.bounds.meanY += (y - this.bounds.meanY) / this.cloud.length;
    }

    // Ground-cell tally for the early exit. Same binning the selector uses, so
    // "enough surface" means the same thing in both places.
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0 && ny / len >= this.minUpDot) {
      const cellCm = this.cellSizeM * CM_PER_M;
      const gk = Math.floor(x / cellCm) + ":" + Math.floor(z / cellCm);
      if (!this.groundCells[gk]) {
        this.groundCells[gk] = true;
        this.groundCellCount++;
      }
    }
  }

  private emitProgress(raw: number): void {
    let p = raw;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    // Monotonic. Coverage can dip relative to time as the denominators race;
    // a progress bar that goes backwards reads as a bug even when it is not.
    if (p < this.lastProgress) p = this.lastProgress;
    this.lastProgress = p;

    const payload: SurveyProgressPayload = {
      progress: p,
      pointCount: this.cloud.length,
      groundCellCount: this.groundCellCount,
      elapsedSec: this.running ? getTime() - this.startTime : this.durationSec,
      bounds: this.bounds,
    };
    eventBus.emit(Events.surveyProgress, payload);
  }

  // ------------------------------------------------------------- boundaries

  /** cm -> m, once, on the way into the pure selector. */
  private toMetres(points: SurveyPoint[]): SurveyPoint[] {
    const out: SurveyPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      out.push({
        position: { x: p.position.x / CM_PER_M, y: p.position.y / CM_PER_M, z: p.position.z / CM_PER_M },
        normal: p.normal,
      });
    }
    return out;
  }

  private userPositionM(): { x: number; y: number; z: number } {
    if (!this.cameraObject) return { x: 0, y: 0, z: 0 };
    const p = this.cameraObject.getTransform().getWorldPosition();
    return { x: p.x / CM_PER_M, y: p.y / CM_PER_M, z: p.z / CM_PER_M };
  }

  /** m -> cm, once, on the way back out. */
  private toSite(c: SiteCandidate, slot: SiteSlot): SurveySite {
    return {
      kind: c.kind,
      slot: slot,
      positionCm: { x: c.position.x * CM_PER_M, y: c.position.y * CM_PER_M, z: c.position.z * CM_PER_M },
      normal: c.normal,
      score: c.score,
      flatness: c.flatness,
      coverage: c.coverage,
      distanceM: c.distanceM,
      cellCount: c.cellCount,
    };
  }

  private selectionOptions(): Partial<SiteSelectionOptions> {
    return {
      cellSizeM: this.cellSizeM,
      minUpDot: this.minUpDot,
      tentFootprintM: this.tentFootprintM,
      fireFootprintM: this.fireFootprintM,
      minFireToTentM: this.minFireToTentM,
      minTentSeparationM: this.minTentSeparationM,
      preferredMinDistanceM: this.preferredMinDistanceM,
      preferredMaxDistanceM: this.preferredMaxDistanceM,
      maxDistanceM: this.maxDistanceM,
      flatnessToleranceM: this.flatnessToleranceM,
      minCoverage: DEFAULT_SITE_OPTIONS.minCoverage,
      minFlatness: DEFAULT_SITE_OPTIONS.minFlatness,
      weightFlatness: DEFAULT_SITE_OPTIONS.weightFlatness,
      weightCoverage: DEFAULT_SITE_OPTIONS.weightCoverage,
      weightDistance: DEFAULT_SITE_OPTIONS.weightDistance,
    };
  }

  // ------------------------------------------------------------ debug keys

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const restart = this.keyFromLetter(this.keyRestartSurvey);
    const finish = this.keyFromLetter(this.keyFinishSurvey);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === restart) {
        this.log("debug key: restart survey");
        this.beginSurvey();
      } else if (e.key === finish) {
        this.log("debug key: finish survey now");
        this.finishSurvey(true);
      }
    });
  }
}

/**
 * Reorders a stored cloud so that ANY prefix of it covers the whole terrain
 * rather than one edge of it.
 *
 * The fixtures are generated in scan order — a column of z for each x — so
 * revealing them front-to-back walks a strip across the ground from one side
 * to the other. That is fine until the early exit fires, at which point the
 * survey has only ever "seen" the left-hand third of the clearing and picks its
 * sites from there. The sites were then an artefact of the array order, which
 * is exactly the kind of hidden dependency a fixture is supposed to remove.
 *
 * The golden-ratio (low-discrepancy) key spreads any prefix evenly over the
 * set, is deterministic, and needs no random source.
 */
function spreadOrder<T>(items: T[]): T[] {
  const keyed: { key: number; item: T }[] = [];
  const PHI = 0.6180339887498949;
  for (let i = 0; i < items.length; i++) {
    const k = (i + 1) * PHI;
    keyed.push({ key: k - Math.floor(k), item: items[i] });
  }
  keyed.sort((a, b) => a.key - b.key);
  const out: T[] = [];
  for (let i = 0; i < keyed.length; i++) out.push(keyed[i].item);
  return out;
}
