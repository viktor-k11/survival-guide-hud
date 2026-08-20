/**
 * SurveyGrid presenter — the opening shot.
 *
 * Drives the one design-time ground plane at WorldRoot/SurveyGrid so the survey
 * reads as "the lens is looking around": the plane follows the sampled area,
 * grows with surveyProgress, spins slowly, and rides a brightness wave.
 *
 * Hard rule 1: it moves, scales and tints an object that already exists. It
 * creates nothing. Hard rule 3: it subscribes and renders; it decides nothing.
 *
 * DRAFT VISUAL, and deliberately so. `SurveyGrid` is a single flat quad with a
 * plain additive material — there is no grid texture and no shader, so "grid
 * wave" here is one plane pulsing and sweeping rather than lines travelling
 * outward. Everything that would need to change for the real thing is a
 * material and a mesh on an object this script only references: swapping
 * PH_GridDim for a grid-textured or shader-driven material restyles it without
 * touching a line of this file.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { SurveyBounds, SurveyProgressPayload } from "../Engine/SurveyTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, pulse01, setColor, setEnabled } from "./WidgetUtils";

@component
export class SurveyGridPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')

  @input private theme: VisualConfig;
  @input @hint("WorldRoot/SurveyGrid — the ground plane. Exists at design time.") private surveyGrid: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Sweep</span>')

  @input
  @hint("Plane size at progress 0, centimetres. The sweep starts tight around the user and opens out.")
  private startSizeCm: number = 90;

  @input
  @hint("Largest the plane may grow, centimetres, whatever the sampled bounds say.")
  private maxSizeCm: number = 900;

  @input
  @hint("Padding added around the sampled bounds so the grid edge sits outside the points, centimetres.")
  private boundsPaddingCm: number = 80;

  @input
  @hint("Height above the sampled ground, centimetres. Small: it is a projection on the floor, not a floating sheet.")
  private hoverCm: number = 2;

  @input
  @widget(new SliderWidget(0, 90, 1))
  @hint("Slow rotation, degrees per second. This is most of what sells 'scanning'.")
  private spinDegPerSec: number = 14;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Brightness wave</span>')

  @input
  @widget(new SliderWidget(0.1, 4.0, 0.1))
  @hint("Wave rate in Hz while the survey runs.")
  private waveHz: number = 0.9;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Dimmest point of the wave. Never 0: on an additive display 0 means gone, and a grid that vanishes reads as a crash.")
  private waveFloor: number = 0.25;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  @hint("Brightest point of the wave.")
  private waveCeiling: number = 1.0;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Level the grid settles to once the survey finishes. It stays up as the ground reference under the markers.")
  private settledLevel: number = 0.22;

  @input @hint("Hide the grid completely on surveyComplete instead of settling it.") private hideOnComplete: boolean = false;

  @input private enableLogging: boolean = false;

  // ------------------------------------------------------------------ state

  private visual: RenderMeshVisual;
  private mat: Material;
  private surveying: boolean = false;
  private progress: number = 0;
  private bounds: SurveyBounds | null = null;
  private spin: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (this.surveyGrid) {
      this.visual = this.surveyGrid.getComponent("Component.RenderMeshVisual");
      // Clone: PH_GridDim is shared, and tinting it in place would recolour
      // everything else using it.
      this.mat = isolateMaterial(this.visual);
    }
    setEnabled(this.surveyGrid, false);

    eventBus.subscribe(Events.surveyStarted, () => {
      this.surveying = true;
      this.progress = 0;
      this.bounds = null;
      this.spin = 0;
      setEnabled(this.surveyGrid, true);
      if (this.enableLogging) print("[GRID] sweep started");
    });

    eventBus.subscribe(Events.surveyProgress, (p: SurveyProgressPayload) => {
      if (!p) return;
      this.progress = p.progress;
      this.bounds = p.bounds;
      // A progress event can arrive before surveyStarted is handled if another
      // subscriber reorders; make the grid visible on either.
      if (this.surveying) setEnabled(this.surveyGrid, true);
    });

    eventBus.subscribe(Events.surveyComplete, () => {
      this.surveying = false;
      this.progress = 1;
      if (this.hideOnComplete) setEnabled(this.surveyGrid, false);
      if (this.enableLogging) print("[GRID] sweep settled");
    });
  }

  private onUpdate(): void {
    if (!this.surveyGrid || !this.surveyGrid.enabled) return;

    const dt = getDeltaTime();
    const t = this.surveyGrid.getTransform();

    // --- follow the sampled area ---
    if (this.bounds) {
      const cx = (this.bounds.minX + this.bounds.maxX) / 2;
      const cz = (this.bounds.minZ + this.bounds.maxZ) / 2;
      t.setWorldPosition(new vec3(cx, this.bounds.meanY + this.hoverCm, cz));
    }

    // --- grow with progress, bounded by what was actually sampled ---
    let target = this.maxSizeCm;
    if (this.bounds) {
      const w = this.bounds.maxX - this.bounds.minX + this.boundsPaddingCm * 2;
      const d = this.bounds.maxZ - this.bounds.minZ + this.boundsPaddingCm * 2;
      target = Math.max(w, d);
    }
    if (target > this.maxSizeCm) target = this.maxSizeCm;
    if (target < this.startSizeCm) target = this.startSizeCm;
    const size = this.startSizeCm + (target - this.startSizeCm) * this.progress;
    // PlaneMeshPreset is XZ-native: scale is [width, 1, depth], never [w, h, 1].
    t.setLocalScale(new vec3(size, 1, size));

    // --- spin ---
    if (this.surveying && this.spinDegPerSec !== 0) {
      this.spin += this.spinDegPerSec * dt;
      t.setLocalRotation(quat.fromEulerAngles(0, (this.spin * Math.PI) / 180, 0));
    }

    // --- brightness wave ---
    if (this.mat && this.theme) {
      let level = this.settledLevel;
      if (this.surveying) {
        const w = pulse01(getTime(), this.waveHz);
        level = this.waveFloor + (this.waveCeiling - this.waveFloor) * w;
        // Ramp in with progress so the opening frames are not full brightness.
        level *= 0.4 + 0.6 * this.progress;
      }
      setColor(this.mat, this.theme.primaryPhosphor, level * this.theme.glowIntensity);
    }
  }
}
