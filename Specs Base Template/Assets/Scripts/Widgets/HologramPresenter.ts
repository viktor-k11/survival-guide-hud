/**
 * HologramPresenter — the thing that finally makes `hologramStage` visible.
 *
 * The nine stage groups have carried baked wireframe geometry since P12 and had
 * never once been enabled during a lesson: the engine emitted `hologramStage`
 * and nobody subscribed. This subscribes.
 *
 * ## Which family — and why the answer is NOT in the lesson plan
 *
 * A plan carries only `{stage:int}`; nothing in it says "tent" or "fire". The
 * fix is deliberately NOT a new schema/prompt field — `lesson-system-prompt.txt`
 * and `LessonSchema.ts` are byte-identical to HEAD and stay that way (see the
 * next_suggestion note in LessonSchema.ts for what happens when that file
 * moves). Instead the family is inferred ONCE per lesson, at `lessonStarted`,
 * from the title plus the originating request text.
 *
 * It infers it by calling `inferLessonKind()` — **the validator's own
 * function**, not a copy. That matters: the validator already used it to decide
 * which stage range to accept, so a private reimplementation here could
 * disagree with the range check that already ran and render a fire stage inside
 * a tent lesson. One function, one answer, no drift. (Importing a PURE helper
 * from Engine is the same seam the widgets already use for VisualConfig and the
 * payload types — no logic crosses, and no engine state is read.)
 *
 * Neither matches -> NO hologram, and a log line saying so. A confidently wrong
 * blueprint is worse than none; same philosophy as degrading a broken companion
 * to null rather than guessing at it. An out-of-range stage is DROPPED for the
 * same reason — showing stage 4 when the model asked for 7 is a confident lie.
 *
 * ## Hard rules
 *
 * 1 — creates nothing. Every group and stage exists at design time, disabled.
 *     Enabling a stage means enabling its WHOLE ancestor chain (HologramRoot ->
 *     family -> stage); this project has already lost a debugging cycle to a
 *     presenter reporting success over a blank screen.
 * 2 — additive. Line work on the CRT shader, bright over nothing.
 * 3 — no logic: it subscribes, it presents. The one thing it emits is
 *     `hologramShown`, which is an announcement about a presentation event, in
 *     the same spirit as BootIntroPresenter emitting `introStateChanged`.
 *
 * ## One material for nine stages
 *
 * `CRT_HologramWire` is shared by all nine visuals. This presenter clones it
 * ONCE at start and assigns the clone to all nine, which keeps the "one field
 * re-tints the whole hologram" property intact while guaranteeing that the
 * runtime glow surge / wipe / flame tint cannot bleed into anything else. Only
 * one stage is ever visible, so one material is all the animation needs.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { inferLessonKind, LessonKind } from "../Engine/LessonValidator";
import { LessonAnchorPayload, RequestStatePayload } from "../Engine/RequestTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setEnabled } from "./WidgetUtils";

/** Stage counts per family. Mirrors HOLOGRAM_STAGE_RANGE in LessonSchema.ts. */
const TENT_STAGES = 5;
const FIRE_STAGES = 4;

@component
export class HologramPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Stage groups are found by name prefix (S1.., S2..) under each family, so the contract is Docs/SCENE-MAP.md rather than nine inspector slots.</span>')

  @input @hint("WorldRoot/HologramRoot") private hologramRoot: SceneObject;
  @input @hint("WorldRoot/HologramRoot/HologramTent") private tentGroup: SceneObject;
  @input @hint("WorldRoot/HologramRoot/HologramFire") private fireGroup: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — used for the un-anchored placement and for the distance in the announcement line.")
  private cameraObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Placement — measured, see Docs/SCENE-MAP.md</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Distance and scale trade against each other against the ±16-18° display window. These defaults are the measured pair; changing one means re-measuring the other.</span>')

  @input
  @widget(new SliderWidget(200, 900, 10))
  @hint("How far ahead a VOICE-started lesson puts its blueprint, centimetres. MEASURED pair with hologramScale — see the note below; moving one means re-reading the MEASURED log line for the WIDEST stage, which is tent S4 (the stakes splay well outside the canopy).")
  private distanceCm: number = 600;

  @input
  @widget(new SliderWidget(0.4, 3.0, 0.05))
  @hint("Uniform scale of the blueprint. Pushing distance out beats shrinking: distance improves the yaw AND the pitch, while shrinking at a fixed distance leaves the ground-plane pitch where it was.")
  private hologramScale: number = 1.3;

  @input
  @widget(new SliderWidget(0, 45, 1))
  @hint("Auto-rotation, degrees per second about Y. Slow on purpose — it must never pull the eye off the step text. 0 disables it.")
  private rotationDegPerSec: number = 8;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Transitions — timeboxed</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Stages matter; transitions do not. Turn this off and the presenter hard-switches stages with no animation, which is a complete and shippable behaviour.</span>')

  @input
  @hint("OFF = hard stage switching, no animation. The explicit fallback.")
  private enableTransitions: boolean = true;

  @input
  @widget(new SliderWidget(0.15, 2.0, 0.05))
  @hint("Seconds for the reassembly wipe (the shader's own wipeProgress, wipeAxis 0 = local Y: the blueprint draws itself from the ground up).")
  private wipeSec: number = 0.55;

  @input
  @widget(new SliderWidget(1.0, 6.0, 0.1))
  @hint("Glow multiplier at the instant a stage changes, decaying back to the authored value across wipeSec.")
  private glowSurge: number = 2.6;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Fire — final stage flame loop</span>')

  @input
  @hint("Loop a bright saturated flame treatment on the fire family's last stage.")
  private enableFlameLoop: boolean = true;

  @input
  @widget(new SliderWidget(0.5, 6.0, 0.1))
  @hint("Flame flicker rate, Hz.")
  private flameHz: number = 2.6;

  @input
  @widget(new SliderWidget(0.0, 1.5, 0.05))
  @hint("Flame glow swing either side of the base glow.")
  private flameAmplitude: number = 0.55;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Announcement</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Project rule: world content outside a level gaze is only allowed if the HUD SAYS where to look. Silence is the failure mode, not the placement.</span>')

  // Kept SHORT deliberately: the first draft ("BLUEPRINT ON THE GROUND · 6 M
  // AHEAD — LOOK DOWN") measured 46 characters and ran off both edges of the
  // display in a preview capture. The instruction leads, because that is the
  // half the user has to act on.
  @input @hint("First-appearance cue. {D} = distance in metres. Keep it under ~34 characters or it runs off the display.") private cueFormat: string = "LOOK DOWN · BLUEPRINT {D} M AHEAD";
  @input @hint("Cue used when the lesson is anchored to a surveyed site.") private cueAnchored: string = "LOOK DOWN · BLUEPRINT ON YOUR SITE";

  @input
  @hint("Log the blueprint's measured world AABB and the angle it subtends from the camera, every time a stage appears. This is how the distance/scale pair was chosen — the ±16-18° display window is the constraint, and guessing at it is what put the whole HUD off-screen once already.")
  private logMeasurements: boolean = true;

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private tentStages: SceneObject[] = [];
  private fireStages: SceneObject[] = [];
  private wireMat: Material | null = null;
  private baseGlow: number = 1.8;
  private baseColor: vec4 | null = null;

  private family: LessonKind = null;
  private lastRequestText: string = "";
  private anchor: { x: number; y: number; z: number } | null = null;
  private currentStage: number = 0;
  private announced: boolean = false;
  /** Seconds since the last stage change; drives the wipe and the glow surge. */
  private sinceStage: number = 1e6;
  private spinDeg: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[HOLO] " + msg);
  }

  private onStart(): void {
    this.collect();

    // The originating request. The plan never says which family it is, so the
    // words the user actually used are half the evidence (the title is the
    // other half). COMPILING is the only state that carries them.
    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      if (p && p.state === "COMPILING" && p.requestText) this.lastRequestText = p.requestText;
    });

    eventBus.subscribe(Events.lessonAnchorChanged, (p: LessonAnchorPayload) => {
      this.anchor = p && p.position ? p.position : null;
    });

    // Family is decided ONCE, here, and logged. Everything after this only
    // looks up a stage inside the family already chosen.
    eventBus.subscribe(Events.lessonStarted, (p: { title: string }) => {
      const title = p ? p.title : "";
      const request = this.lastRequestText;
      this.family = inferLessonKind(request, title);
      // CONSUMED, not remembered. The request text is evidence about THIS
      // lesson; leaving it set let the next lesson inherit it, and a lesson
      // with no request of its own (a fixture, a debug key) then inferred the
      // PREVIOUS lesson's family. Measured: loading the purify-water fixture
      // straight after a live campfire lesson inferred "fire" and would have
      // drawn a fire blueprint over a water lesson — the exact confidently-
      // wrong picture this presenter refuses to draw.
      this.lastRequestText = "";
      this.announced = false;
      this.currentStage = 0;
      this.hideAll();
      this.log(
        'lesson "' + title + '" (request "' + request + '") -> family=' +
          (this.family ? this.family : "NONE — no hologram for this lesson")
      );
      // Published so nothing else re-infers the family. PropsController keys
      // its grabbable window off this instead of calling inferLessonKind a
      // second time — one call site, one answer, no drift.
      eventBus.emit(Events.lessonKindInferred, { kind: this.family, title: title });
    });

    eventBus.subscribe(Events.hologramStage, (p: { stage: number }) => {
      this.showStage(p ? p.stage : 0);
    });

    // A finished lesson LEAVES THE LAST STAGE STANDING — the completed
    // blueprint is the payoff frame the completion card sits over. Only a mode
    // that is neither LESSON nor COMPLETE clears it.
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      const to = p ? p.to : "IDLE";
      if (to !== "LESSON" && to !== "COMPLETE") {
        this.family = null;
        this.hideAll();
      }
    });

    this.hideAll();
    this.log(
      "ready. stages tent=" + this.tentStages.length + " fire=" + this.fireStages.length +
        " distance=" + this.distanceCm + "cm scale=" + this.hologramScale +
        " transitions=" + (this.enableTransitions ? "on" : "OFF (hard switching)")
    );
  }

  /**
   * Stage groups by name prefix, and ONE material clone shared by all nine.
   * Cloning keeps the runtime glow/wipe/flame writes off the shared asset while
   * preserving the single-material property the hologram was authored with.
   */
  private collect(): void {
    this.tentStages = collectStages(this.tentGroup, TENT_STAGES);
    this.fireStages = collectStages(this.fireGroup, FIRE_STAGES);

    const all = this.tentStages.concat(this.fireStages);
    for (let i = 0; i < all.length; i++) {
      const rmv = all[i] ? (all[i].getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
      if (!rmv) continue;
      if (!this.wireMat) {
        this.wireMat = isolateMaterial(rmv);
        if (this.wireMat) {
          const pass = this.wireMat.mainPass as any;
          if (typeof pass.glowIntensity === "number") this.baseGlow = pass.glowIntensity;
          if (pass.baseColor) this.baseColor = pass.baseColor;
        }
      } else {
        rmv.mainMaterial = this.wireMat;
      }
    }
  }

  private stagesFor(family: LessonKind): SceneObject[] {
    return family === "tent" ? this.tentStages : family === "fire" ? this.fireStages : [];
  }

  private hideAll(): void {
    for (let i = 0; i < this.tentStages.length; i++) setEnabled(this.tentStages[i], false);
    for (let i = 0; i < this.fireStages.length; i++) setEnabled(this.fireStages[i], false);
    setEnabled(this.tentGroup, false);
    setEnabled(this.fireGroup, false);
    setEnabled(this.hologramRoot, false);
    this.currentStage = 0;
    this.restoreMaterial();
  }

  /**
   * Mutually exclusive: enable exactly one stage, disable the other eight. The
   * geometry is already cumulative, so the enabled stage contains everything
   * the earlier ones drew.
   */
  private showStage(stage: number): void {
    if (!this.family) {
      this.log("hologramStage " + stage + " ignored — no family for this lesson");
      return;
    }
    const stages = this.stagesFor(this.family);
    const max = this.family === "tent" ? TENT_STAGES : FIRE_STAGES;
    if (typeof stage !== "number" || stage < 1 || stage > max) {
      // Dropped, never clamped — see the header.
      this.log("hologramStage " + stage + " DROPPED — outside 1-" + max + " for family " + this.family);
      return;
    }
    const target = stages[stage - 1];
    if (!target) {
      this.log("hologramStage " + stage + " — stage object missing from the scene");
      return;
    }

    // The whole ancestor chain, not just the leaf.
    setEnabled(this.hologramRoot, true);
    setEnabled(this.tentGroup, this.family === "tent");
    setEnabled(this.fireGroup, this.family === "fire");
    for (let i = 0; i < stages.length; i++) setEnabled(stages[i], i === stage - 1);
    // The other family stays fully off.
    const other = this.family === "tent" ? this.fireStages : this.tentStages;
    for (let i = 0; i < other.length; i++) setEnabled(other[i], false);

    const group = this.family === "tent" ? this.tentGroup : this.fireGroup;
    this.place(group);

    this.currentStage = stage;
    this.sinceStage = this.enableTransitions ? 0 : 1e6;
    this.restoreMaterial();
    if (!this.enableTransitions) this.setWipe(1);

    this.log(
      "stage " + stage + "/" + max + " (" + this.family + ") shown" +
        (this.enableTransitions ? "" : " [hard switch]")
    );
    if (this.logMeasurements) this.measure(target);
    this.announce(group);
  }

  /**
   * Anchored to the surveyed site when there is one — the blueprint standing on
   * the ground the survey actually rated is the entire point. Otherwise it goes
   * ahead of the user at the measured distance, on the WorldRoot ground plane.
   */
  private place(group: SceneObject): void {
    if (!group) return;
    const t = group.getTransform();
    t.setLocalScale(new vec3(this.hologramScale, this.hologramScale, this.hologramScale));

    if (this.anchor) {
      t.setWorldPosition(new vec3(this.anchor.x, this.anchor.y, this.anchor.z));
      return;
    }
    if (!this.cameraObject || !this.hologramRoot) return;

    const camT = this.cameraObject.getTransform();
    const cam = camT.getWorldPosition();
    const fwd = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    const len = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const fx = len > 0.001 ? fwd.x / len : 0;
    const fz = len > 0.001 ? fwd.z / len : -1;
    // Ground height comes from the hologram root's own parent plane, so the
    // blueprint stands on the same floor as the markers and the trail stakes.
    const groundY = this.hologramRoot.getTransform().getWorldPosition().y;
    t.setWorldPosition(new vec3(cam.x + fx * this.distanceCm, groundY, cam.z + fz * this.distanceCm));
  }

  /**
   * The first blueprint of a lesson announces itself. Ground content is allowed
   * to sit outside a level gaze ONLY if the HUD says where to look.
   */
  private announce(group: SceneObject): void {
    if (this.announced || !group) return;
    this.announced = true;
    const metres = this.distanceToM(group);
    const format = this.anchor ? this.cueAnchored : this.cueFormat;
    const text = format.replace("{D}", "" + Math.max(1, Math.round(metres)));
    this.log('announcing: "' + text + '"');
    eventBus.emit(Events.hologramShown, {
      family: this.family,
      stage: this.currentStage,
      distanceM: metres,
      anchored: this.anchor !== null,
      text: text,
    });
  }

  /**
   * The measurement that decides distance and scale.
   *
   * Takes the stage's own WORLD AABB (the wireframes are baked at runtime, so
   * editor-side bounds report only the placeholder mesh — this has to be read
   * from inside the Lens), walks its eight corners, and reports each corner's
   * angular offset from the camera's forward axis, split into yaw and pitch.
   * The number that matters is the WORST corner: content is on the display only
   * within roughly ±16-18° of the view centre, so if that corner is inside the
   * window, all of it is.
   */
  private measure(stage: SceneObject): void {
    if (!this.cameraObject || !stage) return;
    const rmv = stage.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) return;

    // Two possible sources, because the wireframes are MeshBuilder output and
    // the runtime does not populate a world AABB for them: prefer the visual's
    // own world AABB when it is real, else take the mesh's local AABB through
    // the object's world transform. Every component is checked before use —
    // feeding an undefined into vec3 throws inside the engine, which is how
    // this measurement failed silently the first time.
    let lo: vec3 | null = null;
    let hi: vec3 | null = null;
    let source = "worldAabb";
    const wlo = (rmv as any).worldAabbMin;
    const whi = (rmv as any).worldAabbMax;
    if (isVec3(wlo) && isVec3(whi)) {
      lo = wlo;
      hi = whi;
    } else {
      const mesh = rmv.mesh as any;
      const mlo = mesh ? mesh.aabbMin : null;
      const mhi = mesh ? mesh.aabbMax : null;
      if (!isVec3(mlo) || !isVec3(mhi)) {
        print("[HOLO] MEASURE unavailable — no usable AABB on this visual (world or mesh)");
        return;
      }
      // Local AABB corners through the world matrix, then re-bounded: exact
      // for any rotation/scale the group happens to be carrying.
      const m = stage.getTransform().getWorldTransform();
      let nlo: vec3 | null = null;
      let nhi: vec3 | null = null;
      for (let i = 0; i < 8; i++) {
        const c = m.multiplyPoint(
          new vec3(i & 1 ? mhi.x : mlo.x, i & 2 ? mhi.y : mlo.y, i & 4 ? mhi.z : mlo.z)
        );
        nlo = nlo ? new vec3(Math.min(nlo.x, c.x), Math.min(nlo.y, c.y), Math.min(nlo.z, c.z)) : c;
        nhi = nhi ? new vec3(Math.max(nhi.x, c.x), Math.max(nhi.y, c.y), Math.max(nhi.z, c.z)) : c;
      }
      lo = nlo;
      hi = nhi;
      source = "meshAabb*worldTransform";
    }
    if (!lo || !hi) return;

    const camT = this.cameraObject.getTransform();
    const cam = camT.getWorldPosition();
    const rot = camT.getWorldRotation();
    const fwd = rot.multiplyVec3(new vec3(0, 0, -1));
    const right = rot.multiplyVec3(new vec3(1, 0, 0));
    const up = rot.multiplyVec3(new vec3(0, 1, 0));

    let maxYaw = 0, maxPitch = 0, maxOff = 0;
    let minPitchSigned = 999, maxPitchSigned = -999;
    for (let i = 0; i < 8; i++) {
      const p = new vec3(
        i & 1 ? hi.x : lo.x,
        i & 2 ? hi.y : lo.y,
        i & 4 ? hi.z : lo.z
      );
      const v = p.sub(cam);
      const f = v.dot(fwd);
      if (f <= 0.01) continue; // behind the camera; not a display question
      const yaw = (Math.atan2(v.dot(right), f) * 180) / Math.PI;
      const pitch = (Math.atan2(v.dot(up), f) * 180) / Math.PI;
      const off = Math.sqrt(yaw * yaw + pitch * pitch);
      if (Math.abs(yaw) > maxYaw) maxYaw = Math.abs(yaw);
      if (Math.abs(pitch) > maxPitch) maxPitch = Math.abs(pitch);
      if (off > maxOff) maxOff = off;
      if (pitch < minPitchSigned) minPitchSigned = pitch;
      if (pitch > maxPitchSigned) maxPitchSigned = pitch;
    }

    const sizeX = hi.x - lo.x, sizeY = hi.y - lo.y, sizeZ = hi.z - lo.z;
    const cx = (hi.x + lo.x) / 2, cy = (hi.y + lo.y) / 2, cz = (hi.z + lo.z) / 2;
    const dist = Math.sqrt((cx - cam.x) * (cx - cam.x) + (cy - cam.y) * (cy - cam.y) + (cz - cam.z) * (cz - cam.z));
    print(
      "[HOLO] MEASURED (" + source + ") aabb=" + sizeX.toFixed(0) + "x" + sizeY.toFixed(0) + "x" + sizeZ.toFixed(0) +
        "cm dist=" + (dist / 100).toFixed(2) + "m | subtends yaw=±" + maxYaw.toFixed(1) +
        "° pitch " + minPitchSigned.toFixed(1) + "°.." + maxPitchSigned.toFixed(1) +
        "° | worst corner " + maxOff.toFixed(1) + "° off-axis" +
        // The display is a RECTANGLE, so the test is per-axis: a corner at
        // (7.6°, 14.2°) is inside a ±16° window even though its Euclidean
        // offset is 16.1°. The corner figure is reported anyway because it is
        // the conservative number, and a capture is still the ground truth.
        " | window ±16-18° per axis -> " +
        (Math.max(maxYaw, maxPitch) <= 16
          ? "FITS"
          : Math.max(maxYaw, maxPitch) <= 18
          ? "FITS (marginal)"
          : "OUTSIDE at level gaze")
    );
  }

  private distanceToM(group: SceneObject): number {
    if (!this.cameraObject || !group) return this.distanceCm / 100;
    const a = this.cameraObject.getTransform().getWorldPosition();
    const b = group.getTransform().getWorldPosition();
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / 100;
  }

  // ------------------------------------------------------------- material fx

  private setWipe(progress: number): void {
    if (!this.wireMat) return;
    (this.wireMat.mainPass as any).wipeProgress = progress;
  }

  private restoreMaterial(): void {
    if (!this.wireMat) return;
    const pass = this.wireMat.mainPass as any;
    pass.glowIntensity = this.baseGlow;
    if (this.baseColor) pass.baseColor = this.baseColor;
    pass.wipeProgress = 1;
  }

  private onUpdate(): void {
    if (this.currentStage === 0) return;
    const dt = getDeltaTime();

    // Slow spin. Applied to the family group, so the stage inside it is carried.
    const group = this.family === "tent" ? this.tentGroup : this.fireGroup;
    if (group && this.rotationDegPerSec > 0) {
      this.spinDeg = (this.spinDeg + this.rotationDegPerSec * dt) % 360;
      group.getTransform().setWorldRotation(quat.angleAxis((this.spinDeg * Math.PI) / 180, vec3.up()));
    }

    if (!this.wireMat) return;
    const pass = this.wireMat.mainPass as any;

    // Reassembly + glow surge, both functions of one clock. When the window has
    // passed this costs two writes of steady values, which is the cheap way to
    // keep the flame loop below from fighting it.
    if (this.enableTransitions && this.sinceStage < this.wipeSec) {
      this.sinceStage += dt;
      const t = Math.min(1, this.sinceStage / Math.max(0.05, this.wipeSec));
      pass.wipeProgress = t;
      pass.glowIntensity = this.baseGlow * (1 + (this.glowSurge - 1) * (1 - t));
      return;
    }

    // Fire's final stage: a bright saturated flame that keeps moving.
    const onFlame = this.family === "fire" && this.currentStage === FIRE_STAGES;
    if (this.enableFlameLoop && onFlame && this.theme) {
      const t = Math.sin(getTime() * this.flameHz * Math.PI * 2) * 0.5 + 0.5;
      pass.glowIntensity = this.baseGlow * (1 + this.flameAmplitude * t);
      const warm = this.theme.accentAmber;
      pass.baseColor = new vec4(warm.r, warm.g * (0.75 + 0.25 * t), warm.b, 1);
    }
  }
}

/** A real vec3 with numeric components — an undefined slips straight into the
 *  engine and throws "Value is not a number" from inside a native call. */
function isVec3(v: any): boolean {
  return !!v && typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number";
}

/** Stage children by "S<n>" name prefix, index 0 = stage 1. */
function collectStages(group: SceneObject, count: number): SceneObject[] {
  const out: SceneObject[] = [];
  if (!group) return out;
  for (let n = 1; n <= count; n++) {
    let found: SceneObject | null = null;
    for (let i = 0; i < group.getChildrenCount(); i++) {
      const c = group.getChild(i);
      if (c.name.indexOf("S" + n) === 0) {
        found = c;
        break;
      }
    }
    out.push(found);
  }
  return out;
}
