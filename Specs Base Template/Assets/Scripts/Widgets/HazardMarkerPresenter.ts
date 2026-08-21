/**
 * Hazard marker presenter — the "do NOT camp here" half of the survey's
 * verdict, rendered from the SAME scan that placed the green site markers.
 *
 * Hard rule 1: `WorldRoot/HazardMarker_1..3` (children Cross_A, Cross_B,
 * Label) exist at design time, disabled. This positions, enables and tints —
 * it creates nothing. Three is the hard cap; the scorer ranks and the pool
 * renders the worst three.
 *
 * The look is deliberately NOT the site-marker language: a warning-coloured
 * X of two crossed stakes instead of an icon-on-a-ring, so sites and hazards
 * separate at a glance. The label carries the REASON with its number
 * ("STEEP 31°", "COLLECTS WATER") — a hazard the user cannot interpret is
 * decoration, not information.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { HazardsDetectedPayload, SurveyHazard } from "../Engine/SurveyTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

interface HazardParts {
  root: SceneObject;
  mats: Material[];
  label: Text | null;
  labelObj: SceneObject | null;
}

@component
export class HazardMarkerPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')

  @input private theme: VisualConfig;
  @input @hint("WorldRoot — children HazardMarker_1..3 are collected by name.") private worldRoot: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — labels yaw toward the user, like every world label here.")
  private cameraObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Copy</span>')

  @input @hint("Steepness label. {V} = degrees.") private steepFormat: string = "STEEP {V}°";
  @input @hint("Hollow label — the reason, not the number; depth means little to a user.") private hollowLabel: string = "COLLECTS WATER";
  @input @hint("Broken-ground label.") private brokenLabel: string = "BROKEN GROUND";
  @input private enableLogging: boolean = true;

  private markers: HazardParts[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[HAZARD] " + msg);
  }

  private onStart(): void {
    this.collect();
    this.hideAll();

    eventBus.subscribe(Events.hazardsDetected, (p: HazardsDetectedPayload) => this.render(p));
    // A new survey re-measures the terrain; last survey's hazards are void.
    eventBus.subscribe(Events.surveyStarted, () => this.hideAll());

    this.log("ready. markers=" + this.markers.length);
  }

  private collect(): void {
    this.markers = [];
    if (!this.worldRoot) return;
    const font = this.theme ? this.theme.font : null;
    for (let i = 1; i <= 3; i++) {
      const root = findChild(this.worldRoot, "HazardMarker_" + i);
      if (!root) {
        this.log("HazardMarker_" + i + " missing from the scene");
        continue;
      }
      const parts: HazardParts = { root: root, mats: [], label: null, labelObj: null };
      for (let c = 0; c < root.getChildrenCount(); c++) {
        const child = root.getChild(c);
        if (child.name === "Label") {
          parts.labelObj = child;
          parts.label = child.getComponent("Component.Text") as Text;
          setFont(parts.label, font);
        } else {
          const v = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          if (v) {
            const m = isolateMaterial(v);
            if (m) parts.mats.push(m);
          }
        }
      }
      this.markers.push(parts);
    }
  }

  private hideAll(): void {
    for (let i = 0; i < this.markers.length; i++) setEnabled(this.markers[i].root, false);
  }

  private render(p: HazardsDetectedPayload): void {
    const hazards = p && p.hazards ? p.hazards : [];
    const theme = this.theme;

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const used = i < hazards.length;
      setEnabled(m.root, used);
      if (!used) continue;
      const h = hazards[i];

      m.root.getTransform().setWorldPosition(new vec3(h.positionCm.x, h.positionCm.y, h.positionCm.z));
      // The whole chain, per hard rule 1's enabling note.
      for (let c = 0; c < m.root.getChildrenCount(); c++) setEnabled(m.root.getChild(c), true);

      if (m.label) {
        setText(m.label, this.labelFor(h));
        if (theme) setTextColor(m.label, theme.warningColor, theme.glowIntensity);
      }
      if (theme) {
        // Worse = brighter. Never fully dark — an invisible warning is worse
        // than none, because the user believes they have been shown everything.
        const level = (0.55 + 0.45 * h.severity) * theme.glowIntensity;
        for (let mi = 0; mi < m.mats.length; mi++) setColor(m.mats[mi], theme.warningColor, level);
      }
    }

    this.log("placed " + Math.min(hazards.length, this.markers.length) + "/" + this.markers.length + " hazard markers");
  }

  private labelFor(h: SurveyHazard): string {
    if (h.kind === "steep") return this.steepFormat.replace("{V}", "" + Math.round(h.value));
    if (h.kind === "hollow") return this.hollowLabel;
    return this.brokenLabel;
  }

  private onUpdate(): void {
    // Labels yaw to the user — yaw only, same rule as the site markers.
    if (!this.cameraObject) return;
    const cam = this.cameraObject.getTransform().getWorldPosition();
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (!m.labelObj || !m.root.enabled) continue;
      const lp = m.labelObj.getTransform().getWorldPosition();
      const yaw = Math.atan2(cam.x - lp.x, cam.z - lp.z);
      m.labelObj.getTransform().setWorldRotation(quat.angleAxis(yaw, vec3.up()));
    }
  }
}

function findChild(parent: SceneObject, name: string): SceneObject | null {
  if (!parent) return null;
  for (let i = 0; i < parent.getChildrenCount(); i++) {
    const c = parent.getChild(i);
    if (c && c.name === name) return c;
  }
  return null;
}
