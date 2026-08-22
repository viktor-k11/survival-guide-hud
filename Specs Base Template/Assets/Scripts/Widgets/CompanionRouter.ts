/**
 * Companion router — ONE handler that switches among the four companion
 * widgets, exactly as Docs/SCENE-MAP.md specifies: companionChanged carries a
 * type and enables the corresponding EXISTING widget. It creates nothing.
 *
 * `type: null` explicitly hides all four. No presenter infers "hide" from the
 * absence of an event: the engine always says which companion is active, even
 * when the answer is none, so a stale widget from the previous step can never
 * survive onto this one.
 *
 * Checklist and GaugeTimer have their own presenters for content; this router
 * only decides which of the four is on. It is the single place that mapping
 * lives.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { LessonAnchorPayload } from "../Engine/RequestTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled } from "./WidgetUtils";

@component
export class CompanionRouter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("WorldRoot/ZoneWidget") private zoneWidget: SceneObject;
  @input @hint("WorldRoot/ZoneWidget/ZoneCircle") private zoneCircle: SceneObject;
  @input @hint("WorldRoot/ZoneWidget/ZoneRect") private zoneRect: SceneObject;
  @input @hint("WorldRoot/CompassRose") private compassRose: SceneObject;
  @input @hint("HUDRoot/GaugeTimer") private gaugeTimer: SceneObject;
  @input @hint("HUDRoot/Checklist") private checklist: SceneObject;

  @input private enableLogging: boolean = true;

  /**
   * Where the zone stands when the lesson came from a site marker, in
   * centimetres, world. null = the design-time spot in front of the user.
   *
   * Kept here rather than in the engine because it is a placement decision
   * about an existing widget, which is exactly this router's job. The engine
   * only ever says WHICH companion; the anchor says WHERE.
   */
  private anchor: { x: number; y: number; z: number } | null = null;
  /**
   * Where the props pattern stands while a prop session is active. It BEATS
   * the lesson anchor: the props are deliberately within reach of the user
   * (a pinch is ~0.6 m), so a zone anchored at a distant surveyed site would
   * outline ground the user cannot work. PropsController reports the
   * position as a fact; placing the zone on it is this router's decision.
   */
  private propsAnchor: { x: number; y: number; z: number } | null = null;
  /** The authored position, restored whenever a lesson arrives with no anchor. */
  private zoneHomePosition: vec3 | null = null;

  /** ZoneCircle's authored Y scale — the tube height the ring was tuned at. */
  private zoneCircleAuthoredY: number = 1;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    if (this.zoneWidget) this.zoneHomePosition = this.zoneWidget.getTransform().getLocalPosition();
    if (this.zoneCircle) this.zoneCircleAuthoredY = this.zoneCircle.getTransform().getLocalScale().y;

    eventBus.subscribe(Events.lessonAnchorChanged, (p: LessonAnchorPayload) => {
      this.anchor = p && p.position ? p.position : null;
      if (this.enableLogging) {
        print(
          "[COMPANION] anchor " +
            (this.anchor
              ? "(" + this.anchor.x.toFixed(0) + ", " + this.anchor.y.toFixed(0) + ", " + this.anchor.z.toFixed(0) + ")cm"
              : "default")
        );
      }
      this.placeZone();
    });

    eventBus.subscribe(
      Events.propsStateChanged,
      (p: { active: boolean; positionCm: { x: number; y: number; z: number } | null }) => {
        this.propsAnchor = p && p.active && p.positionCm ? p.positionCm : null;
        this.placeZone();
      }
    );

    eventBus.subscribe(
      Events.companionChanged,
      (p: { type: string | null; companion: any }) => this.route(p)
    );
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p || p.to !== "LESSON") this.hideAll();
    });
    this.hideAll();
  }

  private hideAll(): void {
    setEnabled(this.zoneWidget, false);
    setEnabled(this.zoneCircle, false);
    setEnabled(this.zoneRect, false);
    setEnabled(this.compassRose, false);
    setEnabled(this.gaugeTimer, false);
    setEnabled(this.checklist, false);
  }

  private route(p: { type: string | null; companion: any }): void {
    this.hideAll();
    const type = p ? p.type : null;

    if (this.enableLogging) print("[COMPANION] " + (type === null ? "none — all hidden" : type));

    if (type === null) return;

    if (type === "zone") {
      const c = p.companion;
      const rect = c && c.shape === "rect";
      this.placeZone();
      setEnabled(this.zoneWidget, true);
      setEnabled(this.zoneCircle, !rect);
      setEnabled(this.zoneRect, rect);
      this.sizeZone(rect ? this.zoneRect : this.zoneCircle, c ? c.size_m : null, rect);
    } else if (type === "compass") {
      setEnabled(this.compassRose, true);
    } else if (type === "timer") {
      setEnabled(this.gaugeTimer, true);
    } else if (type === "checklist") {
      setEnabled(this.checklist, true);
    }
    // hologram_stage has no companion widget of its own — HologramRoot is
    // driven by the separate hologramStage event.
  }

  /**
   * Puts the zone on the chosen site, or back at its authored spot.
   *
   * The zone is a child of WorldRoot, so the anchor — which arrives in world
   * centimetres straight from the survey — goes in through setWorldPosition
   * and needs no conversion. A tent lesson started from the tent marker then
   * draws its footprint on the ground the survey actually rated, instead of
   * two metres in front of whoever is standing there.
   */
  private placeZone(): void {
    if (!this.zoneWidget) return;
    const t = this.zoneWidget.getTransform();
    if (this.propsAnchor) {
      t.setWorldPosition(new vec3(this.propsAnchor.x, this.propsAnchor.y, this.propsAnchor.z));
    } else if (this.anchor) {
      t.setWorldPosition(new vec3(this.anchor.x, this.anchor.y, this.anchor.z));
    } else if (this.zoneHomePosition) {
      t.setLocalPosition(this.zoneHomePosition);
    }
  }

  /** size_m is metres; scene units are centimetres. */
  private sizeZone(target: SceneObject, sizeM: number | null, isRect: boolean): void {
    if (!target || typeof sizeM !== "number" || sizeM <= 0) return;
    const cm = sizeM * 100;
    const t = target.getTransform();
    if (isRect) {
      // The rect form is a group of four edges; scaling the group scales the outline.
      t.setLocalScale(new vec3(cm / 90, 1, cm / 90));
    } else {
      // XZ only — the Y stays at the authored tube height. Scaling the torus
      // uniformly inflated a 1.2 m zone into a ball that BURIED the ground it
      // was outlining (found when the props pattern moved the zone within
      // reach); the rect branch above always kept Y flat for the same reason.
      t.setLocalScale(new vec3(cm, this.zoneCircleAuthoredY, cm));
    }
  }
}
