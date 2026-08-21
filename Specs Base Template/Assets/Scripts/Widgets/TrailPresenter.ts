/**
 * Trail presenter — the stake pool and the camp stake.
 *
 * Hard rule 1: `WorldRoot/TrailContainer/Crumb_01..24` and
 * `WorldRoot/CampStake` (Pole + Label) exist at design time, disabled. This
 * enables, positions and tints; it creates nothing. When the controller
 * decimates the trail, FEWER marks come down the bus and the surplus crumbs
 * simply switch off — the pool never grows.
 *
 * ## Why stakes, not ground discs (measured, not taste)
 *
 * The display frustum limit is ANGULAR (±16-18°), so floor-level content is
 * invisible to a wearer facing the horizon — and someone walking a trail is
 * looking ahead, not down. A ~1.5 m vertical stake crosses the view at eye
 * height from close range; a disc at their feet does not exist for them.
 *
 * Passed marks dim behind the user while following (navigateUpdated carries
 * the cursor), so it is visible that they are ON the trail, not beside it.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { NavigateUpdatePayload, TrailStatePayload } from "../Engine/NavTypes";
import { CampChangedPayload } from "../Engine/RequestTypes";
import { XYZ } from "../Engine/SurveyTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

interface Crumb {
  root: SceneObject;
  mat: Material | null;
}

@component
export class TrailPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')

  @input private theme: VisualConfig;
  @input @hint("WorldRoot/TrailContainer — children Crumb_01..24 are collected by name order.") private trailContainer: SceneObject;
  @input @hint("WorldRoot/CampStake — children Pole and Label.") private campStake: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — the camp label yaws toward the user, like the site-marker labels.")
  private cameraObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Look</span>')

  @input @hint("Stake height, centimetres. ~150 = crosses the view of a wearer facing the horizon.") private stakeHeightCm: number = 150;
  @input @hint("Camp pole height, centimetres — larger than the trail stakes, same language.") private campPoleHeightCm: number = 200;
  @input @widget(new SliderWidget(0.0, 1.5, 0.05)) @hint("Brightness of a live mark.") private restingLevel: number = 0.9;
  @input @widget(new SliderWidget(0.0, 1.0, 0.05)) @hint("Brightness of a PASSED mark — visible, clearly behind you.") private passedLevel: number = 0.25;
  @input private enableLogging: boolean = false;

  // ------------------------------------------------------------------ state

  private crumbs: Crumb[] = [];
  private poleMat: Material | null = null;
  private label: Text | null = null;
  private labelObj: SceneObject | null = null;
  private marks: XYZ[] = [];
  private cursor: number = -1;
  private following: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[TRAIL] " + msg);
  }

  private onStart(): void {
    this.collect();

    eventBus.subscribe(Events.trailStateChanged, (p: TrailStatePayload) => this.renderTrail(p));
    eventBus.subscribe(Events.navigateUpdated, (p: NavigateUpdatePayload) => {
      this.following = !!(p && p.active && p.navMode === "trail");
      this.cursor = p ? p.nextMarkIndex : -1;
      this.tintMarks();
    });
    eventBus.subscribe(Events.campChanged, (p: CampChangedPayload) => this.showCamp(p));

    this.log("ready. crumbs=" + this.crumbs.length);
  }

  private collect(): void {
    this.crumbs = [];
    if (this.trailContainer) {
      for (let i = 0; i < this.trailContainer.getChildrenCount(); i++) {
        const c = this.trailContainer.getChild(i);
        const v = c.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.crumbs.push({ root: c, mat: v ? isolateMaterial(v) : null });
      }
    }
    if (this.campStake) {
      for (let i = 0; i < this.campStake.getChildrenCount(); i++) {
        const c = this.campStake.getChild(i);
        if (c.name === "Pole") {
          const v = c.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          this.poleMat = v ? isolateMaterial(v) : null;
        } else if (c.name === "Label") {
          this.labelObj = c;
          this.label = c.getComponent("Component.Text") as Text;
          setFont(this.label, this.theme ? this.theme.font : null);
        }
      }
    }
  }

  // ----------------------------------------------------------------- render

  private renderTrail(p: TrailStatePayload): void {
    this.marks = p && p.marksCm ? p.marksCm : [];
    for (let i = 0; i < this.crumbs.length; i++) {
      const crumb = this.crumbs[i];
      const used = i < this.marks.length;
      setEnabled(crumb.root, used);
      if (!used) continue;
      const m = this.marks[i];
      // Payload y is GROUND level; the box is centred, so lift by half height.
      crumb.root.getTransform().setWorldPosition(new vec3(m.x, m.y + this.stakeHeightCm / 2, m.z));
    }
    if (this.trailContainer) setEnabled(this.trailContainer, this.marks.length > 0);
    this.tintMarks();
  }

  private tintMarks(): void {
    if (!this.theme) return;
    for (let i = 0; i < this.crumbs.length && i < this.marks.length; i++) {
      // While following, everything ABOVE the cursor is already behind the
      // user. Off-navigation (and in bearing mode) all marks rest bright.
      const passed = this.following && i > this.cursor;
      const level = (passed ? this.passedLevel : this.restingLevel) * this.theme.glowIntensity;
      if (this.crumbs[i].mat) setColor(this.crumbs[i].mat, this.theme.primaryPhosphor, level);
    }
  }

  private showCamp(p: CampChangedPayload): void {
    if (!p || !p.position || !this.campStake) return;
    const pos = p.position;
    this.campStake.getTransform().setWorldPosition(new vec3(pos.x, pos.y, pos.z));
    // The whole chain, per hard rule 1's enabling note.
    setEnabled(this.campStake, true);
    for (let i = 0; i < this.campStake.getChildrenCount(); i++) {
      setEnabled(this.campStake.getChild(i), true);
    }
    if (this.theme) {
      if (this.poleMat) setColor(this.poleMat, this.theme.accentAmber, this.theme.glowIntensity);
      if (this.label) {
        setText(this.label, "CAMP");
        setTextColor(this.label, this.theme.accentAmber, this.theme.glowIntensity);
      }
    }
    this.log("camp stake placed (" + p.source + ")");
  }

  private onUpdate(): void {
    // Camp label yaws toward the user — yaw only, same rule as the site
    // markers: a label that pitches tips off the horizon and reads as fallen.
    if (!this.labelObj || !this.cameraObject || !this.campStake || !this.campStake.enabled) return;
    const cam = this.cameraObject.getTransform().getWorldPosition();
    const pos = this.labelObj.getTransform().getWorldPosition();
    const yaw = Math.atan2(cam.x - pos.x, cam.z - pos.z);
    this.labelObj.getTransform().setWorldRotation(quat.angleAxis(yaw, vec3.up()));
  }
}
