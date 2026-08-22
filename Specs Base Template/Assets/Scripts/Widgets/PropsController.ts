/**
 * PropsController — pinch-placed training props with pattern snap.
 *
 * Grab a log, drop it near a SnapSlot, the pattern fills in; fill the whole
 * pattern and the step completes itself. This file owns the INTERACTION and
 * the PATTERN — and deliberately nothing else:
 *
 * - It reports FACTS over the bus (`propSnapped`: "n of N placed") and never
 *   advances a step or touches the mode. LessonEngine decides that a complete
 *   pattern means "done" — the same seam SurveyController uses.
 * - `required` is the LIVE SnapSlot count. The plan's `props_required` is
 *   read by the validator but never produced (and MUST stay un-produced: the
 *   last prompt extension failed its regression gate), so the required count
 *   is a property of the SCENE. The pattern knows how many pieces it takes.
 *
 * ## When props are grabbable
 *
 * A zone companion is active in a FIRE lesson. The family comes from
 * `lessonKindInferred` — HologramPresenter's own per-lesson verdict, published
 * on the bus — NOT from a second inferLessonKind() call here, so this
 * controller can never disagree with the presenter about what lesson this is.
 * The window closes the moment the step changes (companionChanged always
 * fires, even with type null) or the mode leaves LESSON. Debug key X forces
 * the window open so the interaction is testable without a lesson.
 *
 * ## Reach and the frustum
 *
 * A pinch reaches ~0.6 m and the props sit on the ground, which enters the
 * display window only past ~13° of downward pitch. So the pattern anchors
 * WITHIN REACH of the user (never at a distant surveyed site — the zone is
 * pulled onto it via `propsStateChanged` → CompanionRouter), and the HUD is
 * TOLD to say "look down" (`cue` in the same payload → StatusBar). Silence is
 * the failure mode, not the placement.
 *
 * ## Hard rules
 *
 * 1 — creates nothing. Props (P12) and SnapSlots ship in the scene, disabled;
 *     this enables, positions and snaps them. Enabling walks the WHOLE chain
 *     (the GLB-import inner nodes ship disabled too).
 * 2 — ghosts and flashes are bright additive; the logs themselves are the
 *     P12 flat-shaded props, tinted (never darkened) for hover.
 * 3 — no lesson logic. Subscribes, presents, reports facts.
 *
 * Physics on a missed release is on the cut list (item 2) and is CUT: release
 * away from a slot runs a short eased return to the rest pose instead. A log
 * that jitters or tunnels reads as a bug; a log that glides home does not.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import { eventBus, Events } from "../Engine/EventBus";
import { LessonKind } from "../Engine/LessonValidator";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, pulse01, setEnabled } from "./WidgetUtils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * What a prop IS and what a slot ACCEPTS, read from the object names —
 * "Kindling" anywhere in the name means kindling, everything else is a log.
 * The reference fire lay (tight crisscross taper, tinder and kindling NEAR
 * THE TOP) puts the kindling slot above the stack, well inside snap radius
 * of the top log slots; without typing, a log dropped on the summit would
 * seat itself where the kindling belongs and teach the lay wrong.
 */
type PropKind = "log" | "kindling";

function kindOf(name: string): PropKind {
  return name.indexOf("Kindling") >= 0 ? "kindling" : "log";
}

/** One grabbable prop, resolved once at start. */
interface PropParts {
  root: SceneObject;
  kind: PropKind;
  interactable: Interactable | null;
  manipulation: InteractableManipulation | null;
  visual: RenderMeshVisual | null;
  mat: Material | null;
  baseColor: vec4 | null;
  /** Authored local transform — the rest pose a missed release returns to. */
  restPos: vec3;
  restRot: quat;
  /** Slot index once placed, -1 while free. */
  slotIndex: number;
  held: boolean;
  hovered: boolean;
  /** Return-lerp clock, seconds remaining; <= 0 means not returning. */
  returning: number;
  returnFrom: vec3 | null;
  /** Snap-flash clock, seconds remaining. */
  flash: number;
}

interface SlotParts {
  root: SceneObject;
  kind: PropKind;
  ghost: SceneObject | null;
  filled: boolean;
}

@component
export class PropsController extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this controller drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Props (Prop_Log_*) and slots (SnapSlot_*) are found by name prefix under the container, so the contract is Docs/SCENE-MAP.md. Slot transforms ARE the pattern — edit them in the Inspector.</span>')

  @input @hint("WorldRoot/PropsContainer") private propsContainer: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — the pattern anchors ahead of the user, within reach.")
  private cameraObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Placement — within reach, by rule</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">A pinch reaches ~0.6 m. Ground content this close is outside a level gaze (~13° down before the floor enters the window), which is exactly why the cue line below exists.</span>')

  @input
  @widget(new SliderWidget(30, 150, 5))
  @hint("How far ahead of the user the pattern stands, centimetres. Keep it a reach, not a walk.")
  private reachCm: number = 55;

  @input
  @widget(new SliderWidget(10, 80, 1))
  @hint("Release closer than this to an EMPTY slot (of the matching kind) snaps the prop in; anything further returns it to rest. Centimetres, world. Generous on purpose: pinch precision is coarse on device, and typed slots + nearest-empty keep a sloppy drop honest — a log dropped onto the stack simply seats in the next open layer.")
  private snapRadiusCm: number = 50;

  @input
  @widget(new SliderWidget(0, 1, 0.05))
  @hint("Seconds for the missed-release glide back to the rest pose. 0 = instant return — the pre-agreed fallback, and nobody watching can tell.")
  private returnSec: number = 0.25;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Look</span>')

  @input
  @widget(new SliderWidget(0.05, 1.0, 0.05))
  @hint("Resting brightness of the empty-slot ghosts.")
  private ghostLevel: number = 0.35;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("How far a hovered log tints toward the accent colour.")
  private hoverTint: number = 0.65;

  @input
  @widget(new SliderWidget(0.1, 1.5, 0.05))
  @hint("Seconds the snap confirmation flash takes to decay.")
  private flashSec: number = 0.45;

  @input
  @hint("StatusBar cue when the props appear. The frustum rule: near ground content is allowed ONLY when the HUD says to look down. Keep it under ~34 characters.")
  private cueText: string = "LOOK DOWN · STACK THE LOGS";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug</span>')

  @input
  @hint("Force the prop step open/closed without a lesson — the interaction is testable on a desk. Same right-hand-cluster rule as every debug key: never W/A/S/D, Q/E or the arrows.")
  private keyForceProps: string = "X";

  @input
  @hint("Auto-place the next free prop into its nearest empty matching slot, through the SAME release path a real drop takes (kind gating, snap, flash, propSnapped). Exists because the synthetic hand cannot pinch every prop reliably; a real hand can. Never ships doing anything — it is a no-op unless the window is open.")
  private keyAutoPlace: string = "Z";

  @input private enableDebugKeys: boolean = true;
  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private props: PropParts[] = [];
  private slots: SlotParts[] = [];
  private ghostMat: Material | null = null;
  private ghostColor: vec4 | null = null;

  private family: LessonKind = null;
  private zoneActive: boolean = false;
  private inLesson: boolean = false;
  private forced: boolean = false;
  private active: boolean = false;
  private placed: number = 0;

  onAwake(): void {
    // SIK subscriptions bind in OnStartEvent — the InteractionManager is not
    // up during awake and handlers bound there are silently dropped.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[PROPS] " + msg);
  }

  private onStart(): void {
    this.collect();

    // The family is HologramPresenter's verdict, shared over the bus — never
    // re-inferred here (see the header).
    eventBus.subscribe(Events.lessonKindInferred, (p: { kind: LessonKind }) => {
      this.family = p ? p.kind : null;
      this.evaluate();
    });

    // companionChanged fires on EVERY step entry, even with type null, so a
    // step change away from the zone closes the window with no extra event.
    eventBus.subscribe(Events.companionChanged, (p: { type: string | null }) => {
      this.zoneActive = !!(p && p.type === "zone");
      this.evaluate();
    });

    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      this.inLesson = !!(p && p.to === "LESSON");
      if (!this.inLesson) this.forced = false;
      this.evaluate();
    });

    if (this.enableDebugKeys) this.bindDebugKeys();

    this.log(
      "ready. props=" + this.props.length + " slots=" + this.slots.length +
        " reach=" + this.reachCm + "cm snap=" + this.snapRadiusCm + "cm" +
        (this.enableDebugKeys ? " forceKey=" + this.keyForceProps : "")
    );
  }

  /**
   * Props and slots by name prefix, one hover-tintable material clone per
   * prop (the six logs SHARE FirewoodLog_Flat — tinting without a clone
   * would highlight all six), one shared clone for all the ghosts.
   */
  private collect(): void {
    this.props = [];
    this.slots = [];
    if (!this.propsContainer) {
      this.log("no propsContainer wired — controller is inert");
      return;
    }

    for (let i = 0; i < this.propsContainer.getChildrenCount(); i++) {
      const child = this.propsContainer.getChild(i);
      if (child.name.indexOf("SnapSlot") === 0) {
        const ghost = findChild(child, "Ghost");
        this.slots.push({ root: child, kind: kindOf(child.name), ghost: ghost, filled: false });
        const ghostVisual = ghost ? (ghost.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
        if (ghostVisual) {
          if (!this.ghostMat) {
            this.ghostMat = isolateMaterial(ghostVisual);
            if (this.ghostMat) {
              const c = (this.ghostMat.mainPass as any).baseColor;
              if (c) this.ghostColor = new vec4(c.r, c.g, c.b, c.a);
            }
          } else {
            ghostVisual.mainMaterial = this.ghostMat;
          }
        }
      } else if (child.name.indexOf("Prop_Log") === 0 || child.name === "Prop_Kindling") {
        const visual = findVisual(child);
        const mat = visual ? isolateMaterial(visual) : null;
        let baseColor: vec4 | null = null;
        if (mat) {
          // The logs are GLB imports: the tint lives on baseColorFactor, not
          // baseColor — writing the wrong one silently does nothing.
          const c = (mat.mainPass as any).baseColorFactor;
          if (c) baseColor = new vec4(c.r, c.g, c.b, c.a);
        }
        const t = child.getTransform();
        const prop: PropParts = {
          root: child,
          kind: kindOf(child.name),
          interactable: child.getComponent(Interactable.getTypeName()) as Interactable,
          manipulation: child.getComponent(InteractableManipulation.getTypeName()) as InteractableManipulation,
          visual: visual,
          mat: mat,
          baseColor: baseColor,
          restPos: t.getLocalPosition(),
          restRot: t.getLocalRotation(),
          slotIndex: -1,
          held: false,
          hovered: false,
          returning: 0,
          returnFrom: null,
          flash: 0,
        };
        this.props.push(prop);
        this.wire(prop);
      }
    }
  }

  private wire(prop: PropParts): void {
    if (prop.interactable) {
      prop.interactable.onHoverEnter.add(() => {
        if (!this.active || prop.held || prop.slotIndex >= 0) return;
        prop.hovered = true;
        this.applyTint(prop);
      });
      prop.interactable.onHoverExit.add(() => {
        prop.hovered = false;
        this.applyTint(prop);
      });
    } else {
      this.log(prop.root.name + " has no SIK Interactable — it cannot be grabbed");
    }

    if (prop.manipulation) {
      prop.manipulation.onManipulationStart.add(() => {
        if (!this.active || prop.slotIndex >= 0) return;
        prop.held = true;
        prop.returning = 0; // a grab cancels an in-flight return
        this.log(prop.root.name + " grabbed");
      });
      prop.manipulation.onManipulationEnd.add(() => {
        if (!prop.held) return;
        prop.held = false;
        this.release(prop);
      });
    } else {
      this.log(prop.root.name + " has no InteractableManipulation — it cannot be moved");
    }
  }

  // ------------------------------------------------------------ the window

  /** The one gate. Facts in, activation out; re-evaluated on every input. */
  private evaluate(): void {
    const shouldBeActive = this.forced || (this.inLesson && this.family === "fire" && this.zoneActive);
    if (shouldBeActive === this.active) return;
    if (shouldBeActive) this.activate();
    else this.deactivate();
  }

  private activate(): void {
    this.active = true;
    this.placed = 0;

    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].filled = false;
      setEnabled(this.slots[i].root, true);
      setEnabled(this.slots[i].ghost, true);
    }

    // The pattern stands ahead of the user, ON the WorldRoot floor, facing
    // them — never at a distant anchor. Reach is the constraint (see header).
    this.place();

    for (let i = 0; i < this.props.length; i++) {
      const prop = this.props[i];
      this.resetProp(prop, true);
      enableTree(prop.root); // GLB inner nodes ship disabled — whole chain
    }
    setEnabled(this.propsContainer, true);

    const pos = this.propsContainer.getTransform().getWorldPosition();
    this.log(
      "ACTIVE (" + (this.forced ? "FORCED" : "fire lesson zone step") + ") — " +
        this.props.length + " props, " + this.slots.length + " slots at (" +
        pos.x.toFixed(0) + ", " + pos.y.toFixed(0) + ", " + pos.z.toFixed(0) + ")cm"
    );
    eventBus.emit(Events.propsStateChanged, {
      active: true,
      placed: 0,
      required: this.slots.length,
      positionCm: { x: pos.x, y: pos.y, z: pos.z },
      cue: this.cueText,
    });
  }

  private deactivate(): void {
    this.active = false;
    for (let i = 0; i < this.props.length; i++) this.resetProp(this.props[i], false);
    setEnabled(this.propsContainer, false);
    this.log("retired (" + this.placed + "/" + this.slots.length + " placed)");
    eventBus.emit(Events.propsStateChanged, {
      active: false,
      placed: this.placed,
      required: this.slots.length,
      positionCm: null,
      cue: "",
    });
  }

  /** Back to the authored rest pose, free, un-tinted, grabbable again. */
  private resetProp(prop: PropParts, enable: boolean): void {
    const t = prop.root.getTransform();
    t.setLocalPosition(prop.restPos);
    t.setLocalRotation(prop.restRot);
    prop.slotIndex = -1;
    prop.held = false;
    prop.hovered = false;
    prop.returning = 0;
    prop.flash = 0;
    if (prop.interactable) prop.interactable.enabled = true;
    if (prop.manipulation) prop.manipulation.enabled = true;
    this.applyTint(prop);
    if (!enable) setEnabled(prop.root, false);
  }

  /**
   * Ahead of the user at reachCm, on the container's own floor level (its
   * parent is WorldRoot, whose origin IS the floor), yawed to face them so
   * the authored slot/rest layout reads the same way every time.
   */
  private place(): void {
    if (!this.cameraObject || !this.propsContainer) return;
    const t = this.propsContainer.getTransform();
    const camT = this.cameraObject.getTransform();
    const cam = camT.getWorldPosition();
    const fwd = camT.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    const len = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const fx = len > 0.001 ? fwd.x / len : 0;
    const fz = len > 0.001 ? fwd.z / len : -1;

    const groundY = t.getWorldPosition().y; // never written, so always floor
    const px = cam.x + fx * this.reachCm;
    const pz = cam.z + fz * this.reachCm;
    t.setWorldPosition(new vec3(px, groundY, pz));
    // Local +Z toward the user: the rest row (authored at +Z) stays nearest.
    const yaw = Math.atan2(cam.x - px, cam.z - pz);
    t.setWorldRotation(quat.angleAxis(yaw, vec3.up()));
  }

  // -------------------------------------------------------------- release

  /** Snap to the nearest EMPTY slot in range, else glide back to rest. */
  private release(prop: PropParts): void {
    const propPos = prop.root.getTransform().getWorldPosition();

    let best = -1;
    let bestDist = this.snapRadiusCm;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.filled || !slot.root) continue;
      if (slot.kind !== prop.kind) continue; // a log never seats where the kindling belongs
      const sp = slot.root.getTransform().getWorldPosition();
      const dx = sp.x - propPos.x, dy = sp.y - propPos.y, dz = sp.z - propPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= bestDist) {
        bestDist = dist;
        best = i;
      }
    }

    if (best < 0) {
      // Missed. A prop left floating mid-air reads as a bug in every frame
      // after it, so it always goes home. (Free-fall physics: cut, by plan.)
      prop.returnFrom = prop.root.getTransform().getLocalPosition();
      prop.returning = this.returnSec > 0 ? this.returnSec : 0.0001;
      this.log(prop.root.name + " released clear of the pattern — returning to rest");
      return;
    }

    const slot = this.slots[best];
    const st = slot.root.getTransform();
    const pt = prop.root.getTransform();
    pt.setWorldPosition(st.getWorldPosition());
    pt.setWorldRotation(st.getWorldRotation());
    slot.filled = true;
    setEnabled(slot.ghost, false);
    prop.slotIndex = best;
    prop.flash = this.flashSec;
    // Placed = placed. Grabbing a seated log back out would make the count
    // lie to the engine; the pattern is build-up only within one step.
    if (prop.interactable) prop.interactable.enabled = false;
    if (prop.manipulation) prop.manipulation.enabled = false;

    this.placed++;
    this.log(
      prop.root.name + " SNAPPED into " + slot.root.name + " (" +
        bestDist.toFixed(0) + "cm) — " + this.placed + "/" + this.slots.length +
        (this.placed >= this.slots.length ? " PATTERN COMPLETE" : "")
    );
    eventBus.emit(Events.propSnapped, {
      slotIndex: best,
      placed: this.placed,
      required: this.slots.length,
    });
  }

  // ------------------------------------------------------------- materials

  /** Hover tints toward the accent; flash overrides both; rest is the base. */
  private applyTint(prop: PropParts): void {
    if (!prop.mat || !prop.baseColor) return;
    const pass = prop.mat.mainPass as any;
    let c = prop.baseColor;
    if (prop.flash > 0 && this.ghostColor) {
      const k = prop.flash / Math.max(0.05, this.flashSec); // 1 -> 0
      c = mix4(prop.baseColor, this.ghostColor, k);
    } else if (prop.hovered && this.theme) {
      const a = this.theme.accentAmber;
      c = mix4(prop.baseColor, new vec4(a.r, a.g, a.b, 1), this.hoverTint);
    }
    pass.baseColorFactor = c;
  }

  private onUpdate(): void {
    if (!this.active) return;
    const dt = getDeltaTime();

    // Empty-slot ghosts breathe gently — an invitation, not a warning.
    if (this.ghostMat && this.ghostColor) {
      const level = this.ghostLevel * (0.6 + 0.4 * pulse01(getTime(), this.theme ? this.theme.pulseHz : 1));
      (this.ghostMat.mainPass as any).baseColor = new vec4(
        this.ghostColor.r * level,
        this.ghostColor.g * level,
        this.ghostColor.b * level,
        this.ghostColor.a
      );
    }

    for (let i = 0; i < this.props.length; i++) {
      const prop = this.props[i];

      if (prop.flash > 0) {
        prop.flash -= dt;
        this.applyTint(prop);
      }

      if (prop.returning > 0 && prop.returnFrom) {
        prop.returning -= dt;
        const t = prop.root.getTransform();
        if (prop.returning <= 0) {
          t.setLocalPosition(prop.restPos);
          t.setLocalRotation(prop.restRot);
          prop.returnFrom = null;
        } else {
          const k = 1 - prop.returning / Math.max(0.01, this.returnSec); // 0 -> 1
          const e = 1 - (1 - k) * (1 - k); // ease-out
          t.setLocalPosition(vec3.lerp(prop.returnFrom, prop.restPos, e));
        }
      }
    }
  }

  // ------------------------------------------------------------ debug keys

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const forceK = this.keyFromLetter(this.keyForceProps);
    const placeK = this.keyFromLetter(this.keyAutoPlace);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === forceK) {
        this.forced = !this.forced;
        this.log("debug key: force props " + (this.forced ? "ON" : "OFF"));
        this.evaluate();
      } else if (e.key === placeK) {
        this.autoPlaceNext();
      }
    });
  }

  /**
   * Debug: drop the next free prop right on its nearest empty MATCHING slot
   * and run the normal release path. No parallel snap logic — the one thing
   * this fakes is where the hand let go.
   */
  private autoPlaceNext(): void {
    if (!this.active) {
      this.log("debug key: auto-place ignored — window closed");
      return;
    }
    for (let i = 0; i < this.props.length; i++) {
      const prop = this.props[i];
      if (prop.held || prop.slotIndex >= 0) continue;
      let target: SlotParts | null = null;
      for (let s = 0; s < this.slots.length; s++) {
        if (!this.slots[s].filled && this.slots[s].kind === prop.kind) {
          target = this.slots[s];
          break;
        }
      }
      if (!target) continue; // this prop's slots are full; try another kind
      const sp = target.root.getTransform().getWorldPosition();
      prop.root.getTransform().setWorldPosition(new vec3(sp.x, sp.y + 5, sp.z));
      this.log("debug key: auto-place " + prop.root.name);
      this.release(prop);
      return;
    }
    this.log("debug key: auto-place — nothing left to place");
  }
}

// --------------------------------------------------------------- helpers

function findChild(parent: SceneObject, name: string): SceneObject | null {
  if (!parent) return null;
  for (let i = 0; i < parent.getChildrenCount(); i++) {
    const c = parent.getChild(i);
    if (c && c.name === name) return c;
  }
  return null;
}

/** First RenderMeshVisual anywhere under this object (GLB imports nest it). */
function findVisual(obj: SceneObject): RenderMeshVisual | null {
  if (!obj) return null;
  const own = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (own) return own;
  for (let i = 0; i < obj.getChildrenCount(); i++) {
    const found = findVisual(obj.getChild(i));
    if (found) return found;
  }
  return null;
}

/** Enable an object AND every descendant — the whole-chain rule. */
function enableTree(obj: SceneObject): void {
  if (!obj) return;
  obj.enabled = true;
  for (let i = 0; i < obj.getChildrenCount(); i++) enableTree(obj.getChild(i));
}

function mix4(a: vec4, b: vec4, k: number): vec4 {
  return new vec4(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    1
  );
}
