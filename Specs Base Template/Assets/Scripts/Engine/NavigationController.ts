/**
 * NavigationController — owns the camp point, the trail recorder, and the live
 * navigation loop. The impure boundary of the return-to-camp feature: camera
 * reads, timers and event emission live HERE; every judgement that can be
 * tested lives in NavMath.ts as pure functions (the SurveyController /
 * SiteSelection split, applied again).
 *
 * ## The product framing (from the brief, kept because it decides the design)
 *
 * A straight line to camp is not always walkable — there may be a ravine or a
 * stream between you and it. So there are TWO return modes and they are not
 * redundant: BEARING says "that way"; FOLLOW TRAIL says "this way, you have
 * already walked it".
 *
 * ## Ownership rules
 *
 * - CAMP: manual set ALWAYS overwrites; automatic set (a tent lesson completed
 *   at a chosen site) fires ONLY if camp is unset. Replaying a tent lesson —
 *   which will happen on a second demo take — must never silently move the
 *   user's camp.
 * - TRAIL: recording is an EXPLICIT decision ("LEAVING CAMP"), made once, not
 *   at every step. Marks then drop automatically every markSpacingCm of
 *   travel. When the fixed pool (hard rule 1) fills, the trail DECIMATES —
 *   every second mark dropped, spacing doubled — never truncates.
 * - MODE: this controller never sets the engine mode. It reports facts
 *   (campReached) and executes requests (navigateRequested); LessonEngine
 *   remains the only owner of `mode`, same as with the survey.
 *
 * ## Honest degradation
 *
 * Tracking drift is physics, not a bug. Scattered marks leave bearing and
 * distance valid, just coarser — nothing here assumes marks are neat. Tracking
 * lost entirely (NaN pose) freezes the readout at the LAST KNOWN bearing and
 * says so on the bus; a guide that lies about direction is worse than one that
 * admits it is unsure. A loss is a log line, never a crash.
 */
import { eventBus, Events } from "./EventBus";
import {
  advanceTrailCursor,
  bearingDeg,
  decimate,
  distanceXZ,
  nearestMarkIndex,
} from "./NavMath";
import {
  CampReachedPayload,
  MenuChipPayload,
  NavigateRequestPayload,
  NavigateUpdatePayload,
  TrailStatePayload,
} from "./NavTypes";
import { CampChangedPayload } from "./RequestTypes";
import { SiteSelectedPayload, XYZ } from "./SurveyTypes";

const CM_PER_M = 100;

@component
export class NavigationController extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Wiring</span>')

  @input
  @hint("Camera Object — the user's position. Camp and marks are placed at ground level: camera y minus eyeHeightCm.")
  private cameraObject: SceneObject;

  @input @hint("Eye height above the ground, centimetres.") private eyeHeightCm: number = 170;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Trail recorder</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Sized from the measured walk: Sunlit Outdoor gives ~20 m of usable radius, so 24 marks at 1.5 m covers ~36 m and decimation will not fire in a demo. It stays as the correctness path.</span>')

  @input
  @widget(new SliderWidget(50, 600, 10))
  @hint("Drop a mark every this many centimetres of travel. Doubles on every decimation.")
  private markSpacingCm: number = 150;

  @input
  @hint("Size of the design-time Crumb pool under WorldRoot/TrailContainer. Hard rule 1: this many exist, none are created.")
  private poolSize: number = 24;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Navigation</span>')

  @input
  @widget(new SliderWidget(30, 400, 10))
  @hint("A trail mark within this range counts as passed, centimetres.")
  private reachRadiusCm: number = 120;

  @input
  @widget(new SliderWidget(50, 500, 10))
  @hint("Within this range of camp the return is DONE, centimetres.")
  private arriveRadiusCm: number = 150;

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.05))
  @hint("How often the navigation loop samples the camera, seconds.")
  private updateIntervalSec: number = 0.15;

  @input @hint("Spoken when a camp point is set.") private campMarkedLine: string = "Camp marked.";
  @input @hint("Spoken on arrival.") private campReachedLine: string = "Camp reached. Welcome back.";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Deterministic fixture — hard rule 5</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">A stored camp + trail, the way useFixtureCloud works: everything downstream — stakes, chips, FOLLOW TRAIL, bearing — runs identically off stored state. For LEAF and desk demos. SHIPS OFF.</span>')

  @input
  @hint("Load camp + trail from trailFixture at start instead of waiting for the user to create them.")
  private useFixtureTrail: boolean = false;

  @input
  @allowUndefined
  @hint("Assets/Survey/fixtures/camp-trail-demo.json — { campCm:[x,y,z], marksCm:[[x,y,z],…], spacingCm }. CENTIMETRES, ground level.")
  private trailFixture: JsonAsset;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — preview iteration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Digits, because every free right-hand LETTER is taken and W/A/S/D/Q/E/arrows are preview movement. These call the SAME methods chips and voice call.</span>')

  @input private enableDebugKeys: boolean = true;
  @input @hint("Set camp at the current position (manual — overwrites).") private keySetCamp: string = "7";
  @input @hint("Start trail recording ('LEAVING CAMP').") private keyStartTrail: string = "8";
  @input @hint("Ask the engine for FOLLOW TRAIL (same event as the chip).") private keyFollowTrail: string = "9";
  @input @hint("Toggle SIMULATED tracking loss, to verify the last-known-bearing behaviour on a desk.") private keySimTrackingLoss: string = "0";
  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private camp: XYZ | null = null;
  private recording: boolean = false;
  /** Ground positions, oldest first. Never exceeds poolSize. */
  private marks: XYZ[] = [];
  private spacingCm: number = 150;
  private pathLenCm: number = 0;
  private decimations: number = 0;
  private lastMarkAt: XYZ | null = null;

  private navActive: boolean = false;
  private navMode: "bearing" | "trail" = "bearing";
  private cursor: number = -1;
  private lastEmit: NavigateUpdatePayload | null = null;

  private trackingLost: boolean = false;
  private simTrackingLost: boolean = false;
  private lastPose: XYZ | null = null;

  /** Who set the camp — "" (unset), "auto", "manual/…", "fixture". */
  private campSource: string = "";

  private sinceUpdate: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[NAV] " + msg);
  }

  private onStart(): void {
    this.spacingCm = this.markSpacingCm;

    eventBus.subscribe(Events.menuChipSelected, (p: MenuChipPayload) => {
      if (!p) return;
      if (p.chip === "setCamp") this.setCampHere("manual/" + p.source);
      else if (p.chip === "trailStart") this.startRecording(p.source);
      // followTrail belongs to the engine — entering a mode is its job.
    });

    // --- the automatic camp: choosing a site marker, exactly as shipped in
    // 9cffd4f — the wiring stays, only the overwrite rule is new. The
    // automatic path may move an automatic camp (picking a different marker
    // re-aims it), but it NEVER overwrites a camp the user set by hand.
    // Replaying the tent flow on a second demo take must not silently move a
    // hand-placed camp; the guide does not relocate your camp on its own
    // initiative.
    eventBus.subscribe(Events.siteSelected, (p: SiteSelectedPayload) => {
      if (!p || !p.position) return;
      if (this.campSource.indexOf("manual") === 0) {
        this.log("siteSelected " + p.slot + " — camp was set BY HAND, leaving it alone");
        return;
      }
      this.setCamp(p.position, "auto");
    });

    eventBus.subscribe(Events.navigateRequested, (p: NavigateRequestPayload) => {
      if (p) this.activate(p.navMode);
    });
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (p && p.to !== "NAVIGATE" && this.navActive) this.deactivate("mode -> " + p.to);
    });

    if (this.useFixtureTrail) {
      // Deferred one beat: this controller sits ABOVE the presenters in the
      // Systems order, so an emit from onStart would fire before they have
      // subscribed and the stakes would never appear.
      const delayed = this.createEvent("DelayedCallbackEvent");
      delayed.bind(() => this.loadFixture());
      delayed.reset(0.2);
    }

    if (this.enableDebugKeys) this.bindDebugKeys();
    this.log(
      "ready. spacing=" + this.markSpacingCm + "cm pool=" + this.poolSize +
        " reach=" + this.reachRadiusCm + "cm arrive=" + this.arriveRadiusCm + "cm" +
        (this.useFixtureTrail ? " [FIXTURE trail]" : "") +
        (this.enableDebugKeys
          ? " keys=" + this.keySetCamp + "/" + this.keyStartTrail + "/" + this.keyFollowTrail + "/" + this.keySimTrackingLoss
          : "")
    );
  }

  // ------------------------------------------------------------------- camp

  /** Manual set — ALWAYS overwrites. The chip, the voice command, the key. */
  private setCampHere(source: string): void {
    const pos = this.groundedCameraPos();
    if (!pos) {
      this.log("set camp failed — no camera pose (tracking lost?)");
      return;
    }
    this.setCamp(pos, source);
  }

  private setCamp(pos: XYZ, source: string): void {
    this.camp = { x: pos.x, y: pos.y, z: pos.z };
    this.campSource = source;
    const payload: CampChangedPayload = { position: this.camp, source: source };
    // The journal line: one greppable statement of where camp is and why.
    this.log(
      "JOURNAL| CAMP MARKED (" + source + ") at (" + pos.x.toFixed(0) + ", " +
        pos.y.toFixed(0) + ", " + pos.z.toFixed(0) + ")cm"
    );
    eventBus.emit(Events.campChanged, payload);
    if (source !== "fixture") {
      eventBus.emit(Events.speakRequested, { text: this.campMarkedLine, source: "nav" });
    }
  }

  // ------------------------------------------------------------------ trail

  /** "LEAVING CAMP" — the explicit, once-per-departure decision to record. */
  private startRecording(source: string): void {
    if (this.recording) {
      this.log("startRecording ignored — already recording");
      return;
    }
    const pos = this.groundedCameraPos();
    if (!pos) {
      this.log("startRecording failed — no camera pose");
      return;
    }
    this.recording = true;
    this.marks = [pos];
    this.lastMarkAt = pos;
    this.spacingCm = this.markSpacingCm;
    this.pathLenCm = 0;
    this.decimations = 0;
    this.log("trail recording started (" + source + ") — first mark down");
    this.emitTrail();
  }

  private stopRecording(reason: string): void {
    if (!this.recording) return;
    this.recording = false;
    this.log("trail recording stopped — " + reason);
    this.emitTrail();
  }

  private dropMark(pos: XYZ): void {
    this.marks.push(pos);
    this.lastMarkAt = pos;
    if (this.marks.length > this.poolSize) {
      // The pool is full. Decimate, never truncate: coverage stays complete
      // from camp to the walker, only the resolution drops.
      this.marks = decimate(this.marks);
      this.spacingCm *= 2;
      this.decimations++;
      this.log(
        "pool full — decimated to " + this.marks.length + " marks, spacing now " +
          this.spacingCm + "cm (x" + this.decimations + ")"
      );
    }
    this.emitTrail();
  }

  private emitTrail(): void {
    const payload: TrailStatePayload = {
      recording: this.recording,
      marksCm: this.marks.slice(),
      markCount: this.marks.length,
      pathM: Math.round(this.pathLenCm / CM_PER_M),
      spacingCm: this.spacingCm,
      decimations: this.decimations,
    };
    eventBus.emit(Events.trailStateChanged, payload);
  }

  // ------------------------------------------------------------- navigation

  private activate(navMode: "bearing" | "trail"): void {
    if (navMode === "bearing" && !this.camp) {
      this.log("navigate(bearing) refused — no camp");
      return;
    }
    if (navMode === "trail" && this.marks.length === 0) {
      this.log("navigate(trail) refused — no trail");
      return;
    }
    this.navActive = true;
    this.navMode = navMode;
    this.lastEmit = null;
    const pos = this.groundedCameraPos();
    this.cursor =
      navMode === "trail" && pos ? nearestMarkIndex(this.marks, pos) : -1;
    this.log("navigation active: " + navMode + (navMode === "trail" ? " from mark #" + this.cursor : ""));
    this.tickNavigation(true);
  }

  private deactivate(reason: string): void {
    if (!this.navActive) return;
    this.navActive = false;
    this.log("navigation off — " + reason);
    if (this.lastEmit) {
      const off: NavigateUpdatePayload = { ...this.lastEmit, active: false };
      eventBus.emit(Events.navigateUpdated, off);
    }
  }

  private onUpdate(): void {
    this.sinceUpdate += getDeltaTime();
    if (this.sinceUpdate < this.updateIntervalSec) return;
    this.sinceUpdate = 0;

    const pos = this.groundedCameraPos();

    if (this.recording && pos) {
      const step = this.lastMarkAt ? distanceXZ(this.lastMarkAt, pos) : 0;
      if (step >= this.spacingCm) {
        this.pathLenCm += step;
        this.dropMark(pos);
      }
    }

    if (this.navActive) this.tickNavigation(false, pos);
  }

  private tickNavigation(force: boolean, posIn?: XYZ | null): void {
    if (!this.camp) return;
    const pos = posIn !== undefined ? posIn : this.groundedCameraPos();

    let payload: NavigateUpdatePayload;
    if (!pos) {
      // Tracking lost. The last emitted state IS the answer — frozen, and
      // labelled. Never a guess presented as a fact.
      if (!this.lastEmit) return;
      payload = { ...this.lastEmit, lastKnown: true };
    } else {
      // Trail mode: consume marks the user has reached, then aim at the next
      // one down the line; past the first mark, aim at camp itself.
      if (this.navMode === "trail") {
        this.cursor = advanceTrailCursor(this.marks, pos, this.cursor, this.reachRadiusCm);
      }
      const target =
        this.navMode === "trail" && this.cursor >= 0 && this.cursor < this.marks.length
          ? this.marks[this.cursor]
          : this.camp;
      const distM = distanceXZ(pos, this.camp) / CM_PER_M;
      payload = {
        active: true,
        navMode: this.navMode,
        targetCm: target,
        bearingDeg: Math.round(bearingDeg(pos, target)),
        distanceM: Math.round(distM * 10) / 10,
        nextMarkIndex: this.navMode === "trail" ? this.cursor : -1,
        lastKnown: false,
      };

      if (distM * CM_PER_M <= this.arriveRadiusCm) {
        this.arrive(distM);
        return;
      }
    }

    // Throttle: emit on arrival-relevant change only, or the bus drowns.
    const prev = this.lastEmit;
    const changed =
      force || !prev ||
      Math.abs(prev.distanceM - payload.distanceM) >= 0.5 ||
      Math.abs(prev.bearingDeg - payload.bearingDeg) >= 2 ||
      prev.nextMarkIndex !== payload.nextMarkIndex ||
      prev.lastKnown !== payload.lastKnown ||
      prev.navMode !== payload.navMode;
    if (!changed) return;
    this.lastEmit = payload;
    eventBus.emit(Events.navigateUpdated, payload);
  }

  private arrive(distM: number): void {
    this.log("CAMP REACHED at " + distM.toFixed(1) + "m");
    this.stopRecording("arrived at camp");
    this.deactivate("arrived");
    const payload: CampReachedPayload = { distanceM: Math.round(distM * 10) / 10 };
    eventBus.emit(Events.campReached, payload);
    eventBus.emit(Events.speakRequested, { text: this.campReachedLine, source: "nav" });
  }

  // ------------------------------------------------------------- boundaries

  /** Camera position dropped to ground level. null = tracking lost (or simulated). */
  private groundedCameraPos(): XYZ | null {
    if (this.simTrackingLost) {
      if (!this.trackingLost) {
        this.trackingLost = true;
        this.log("tracking lost (SIMULATED) — readouts freeze at last known");
      }
      return null;
    }
    if (!this.cameraObject) return null;
    const p = this.cameraObject.getTransform().getWorldPosition();
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) {
      if (!this.trackingLost) {
        this.trackingLost = true;
        this.log("tracking lost (NaN pose) — readouts freeze at last known");
      }
      return null;
    }
    if (this.trackingLost) {
      this.trackingLost = false;
      this.log("tracking recovered");
    }
    const pos = { x: p.x, y: p.y - this.eyeHeightCm, z: p.z };
    this.lastPose = pos;
    return pos;
  }

  private loadFixture(): void {
    if (!this.trailFixture) {
      this.log("useFixtureTrail is on but no trailFixture wired");
      return;
    }
    try {
      const raw = JSON.parse(this.trailFixture.getString());
      const c = raw.campCm;
      this.marks = [];
      for (const m of raw.marksCm || []) {
        if (m && m.length >= 3) this.marks.push({ x: m[0], y: m[1], z: m[2] });
      }
      if (raw.spacingCm) this.spacingCm = raw.spacingCm;
      this.setCamp({ x: c[0], y: c[1], z: c[2] }, "fixture");
      this.emitTrail();
      this.log('trail fixture "' + (raw.name || "?") + '" loaded: camp + ' + this.marks.length + " marks");
    } catch (e) {
      this.log("could not read trail fixture: " + e);
    }
  }

  // ------------------------------------------------------------ debug keys

  private keyFromChar(ch: string): Keys {
    const c = (ch || "").toUpperCase().charAt(0);
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const li = letters.indexOf(c);
    if (li >= 0) return (Keys.A + li) as Keys;
    const digits = "0123456789";
    const di = digits.indexOf(c);
    if (di >= 0) return (Keys.Zero + di) as Keys;
    return Keys.Invalid;
  }

  private bindDebugKeys(): void {
    const setCamp = this.keyFromChar(this.keySetCamp);
    const startTrail = this.keyFromChar(this.keyStartTrail);
    const followTrail = this.keyFromChar(this.keyFollowTrail);
    const simLoss = this.keyFromChar(this.keySimTrackingLoss);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      // Same events the chips emit — no parallel branch.
      if (e.key === setCamp) {
        eventBus.emit(Events.menuChipSelected, { chip: "setCamp", source: "debugKey" });
      } else if (e.key === startTrail) {
        eventBus.emit(Events.menuChipSelected, { chip: "trailStart", source: "debugKey" });
      } else if (e.key === followTrail) {
        eventBus.emit(Events.menuChipSelected, { chip: "followTrail", source: "debugKey" });
      } else if (e.key === simLoss) {
        this.simTrackingLost = !this.simTrackingLost;
        this.log("simulated tracking loss: " + (this.simTrackingLost ? "ON" : "OFF"));
      }
    });
  }

  /** Diagnostics only. */
  public currentCamp(): XYZ | null {
    return this.camp;
  }
}
