/**
 * SiteMarker presenter — moves the three design-time markers onto the sites the
 * survey chose, labels them, and reports taps.
 *
 * Hard rule 1: `SiteMarker_Tent_A` / `_Tent_B` / `_Fire` and their Icon,
 * RatingLabel and PulseRing children ALL exist at design time. This script
 * positions, enables and populates them. It creates nothing.
 *
 * Hard rule 3: it renders `surveyComplete` and it publishes `siteSelected`.
 * Relaying a tap is not logic — the presenter does not decide what a tap means,
 * and deliberately does NOT start a lesson. Whoever owns that subscribes.
 *
 * ## Two things learned the hard way, encoded here
 *
 * 1. **Enabling a marker is not enough.** Everything under WorldRoot ships
 *    disabled, leaf children included. `showMarker` walks the whole chain —
 *    marker, Icon, RatingLabel, PulseRing — or the marker appears as an empty
 *    spot on the ground.
 * 2. **An icon on a box is unreadable, and PH_ materials ignore baseTex.** The
 *    design-time Icon is a `PH_Box` with `PH_PhosphorGreen`. It gets re-meshed
 *    to a quad and re-materialled from `PH_Icon.mat`, which has ENABLE_BASE_TEX
 *    baked on. Assigning a texture to any other PH_ material silently does
 *    nothing.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { eventBus, Events } from "../Engine/EventBus";
import { SiteSelectedPayload, SiteSlot, SurveyCompletePayload, SurveySite } from "../Engine/SurveyTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { adoptMaterial, isolateMaterial, pulse01, setColor, setEnabled, setFont, setIcon, setText, setTextColor } from "./WidgetUtils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** One marker's resolved parts, looked up once at start. */
interface MarkerParts {
  slot: SiteSlot;
  root: SceneObject;
  icon: SceneObject;
  iconVisual: RenderMeshVisual;
  iconMat: Material;
  label: Text;
  ring: SceneObject;
  ringMat: Material;
  site: SurveySite | null;
}

@component
export class SiteMarkerPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Children are found by name (Icon / RatingLabel / PulseRing), so the marker contract is the object names in Docs/SCENE-MAP.md rather than nine inspector fields.</span>')

  @input private theme: VisualConfig;
  @input @hint("WorldRoot/SiteMarker_Tent_A") private tentA: SceneObject;
  @input @hint("WorldRoot/SiteMarker_Tent_B") private tentB: SceneObject;
  @input @hint("WorldRoot/SiteMarker_Fire") private fire: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — markers billboard their icon and label toward it. A flat quad seen edge-on is invisible, which looks exactly like a broken marker.")
  private cameraObject: SceneObject;

  @input
  @allowUndefined
  @hint("PH_Plane.mesh — the design-time Icon is a box, which maps an icon texture unreadably.")
  private quadMesh: RenderMesh;

  @input
  @allowUndefined
  @hint("PH_Icon.mat — the only material with ENABLE_BASE_TEX baked on. Assigning baseTex to any other PH_ material silently does nothing.")
  private iconMaterial: Material;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Look</span>')

  @input @hint("Label text. {P} is replaced by the flatness percentage.") private labelFormat: string = "FLATNESS {P}%";
  @input @widget(new SliderWidget(1, 40, 1)) @hint("Icon size, centimetres.") private iconSizeCm: number = 14;
  @input @hint("Billboard the icon and label toward the camera each frame.") private billboard: boolean = true;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Steady brightness for a runner-up marker.")
  private restingLevel: number = 0.55;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  @hint("Peak brightness of the best marker's pulse. It is the recommendation, so it has to win the eye.")
  private bestPeakLevel: number = 1.35;

  @input
  @widget(new SliderWidget(0.1, 4.0, 0.1))
  @hint("Best-marker pulse rate, Hz.")
  private bestPulseHz: number = 1.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — one key per marker</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">There is no pinch in the Preview panel, so every marker needs a key. These call the SAME method the pinch handler calls.</span>')

  @input private enableDebugKeys: boolean = true;
  @input private keyTentA: string = "T";
  @input private keyTentB: string = "Y";
  @input private keyFire: string = "F";
  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private markers: MarkerParts[] = [];
  private bestSlot: SiteSlot | "" = "";

  onAwake(): void {
    // SIK subscriptions must bind in OnStartEvent, never onAwake: the
    // InteractionManager is not up yet during awake and the handler is
    // silently dropped.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[MARKER] " + msg);
  }

  private onStart(): void {
    this.markers = [];
    this.collect("TENT_A", this.tentA);
    this.collect("TENT_B", this.tentB);
    this.collect("FIRE", this.fire);
    for (let i = 0; i < this.markers.length; i++) this.hideMarker(this.markers[i]);

    eventBus.subscribe(Events.surveyStarted, () => {
      // A new survey invalidates the old sites immediately — stale markers
      // sitting on last survey's terrain are worse than no markers.
      for (let i = 0; i < this.markers.length; i++) {
        this.markers[i].site = null;
        this.hideMarker(this.markers[i]);
      }
      this.bestSlot = "";
    });

    eventBus.subscribe(Events.surveyComplete, (p: SurveyCompletePayload) => this.render(p));

    if (this.enableDebugKeys) this.bindDebugKeys();
    this.log("ready. markers=" + this.markers.length + " debugKeys=" + this.keyTentA + "/" + this.keyTentB + "/" + this.keyFire);
  }

  /** Resolve one marker's parts once, and wire its pinch handler. */
  private collect(slot: SiteSlot, root: SceneObject): void {
    if (!root) {
      this.log("slot " + slot + " has no object wired");
      return;
    }
    const icon = findChild(root, "Icon");
    const labelObj = findChild(root, "RatingLabel");
    const ring = findChild(root, "PulseRing");

    const iconVisual = icon ? (icon.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
    if (iconVisual && this.quadMesh) iconVisual.mesh = this.quadMesh;
    const iconMat = iconVisual
      ? this.iconMaterial
        ? adoptMaterial(iconVisual, this.iconMaterial)
        : isolateMaterial(iconVisual)
      : null;

    const ringVisual = ring ? (ring.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
    const label = labelObj ? (labelObj.getComponent("Component.Text") as Text) : null;
    if (label && this.theme) setFont(label, this.theme.font);

    const parts: MarkerParts = {
      slot: slot,
      root: root,
      icon: icon,
      iconVisual: iconVisual,
      iconMat: iconMat,
      label: label,
      ring: ring,
      ringMat: ringVisual ? isolateMaterial(ringVisual) : null,
      site: null,
    };
    this.markers.push(parts);

    const interactable = root.getComponent(Interactable.getTypeName()) as Interactable;
    if (interactable) {
      interactable.onTriggerEnd.add(() => this.selectSlot(slot, "pinch"));
    } else {
      this.log("slot " + slot + " has no SIK Interactable — pinch will not work, debug key still will");
    }
  }

  // ---------------------------------------------------------------- render

  private render(p: SurveyCompletePayload): void {
    if (!p) return;
    this.bestSlot = p.bestSlot;

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      m.site = findSite(p.sites, m.slot);
      if (m.site) this.showMarker(m, m.site);
      else this.hideMarker(m);
    }

    this.log(
      "placed " + countPlaced(this.markers) + "/3 markers, best=" + (this.bestSlot || "none") +
        (p.distanceWarning ? " [DISTANCE WARNING]" : "")
    );
  }

  private showMarker(m: MarkerParts, site: SurveySite): void {
    const pos = new vec3(site.positionCm.x, site.positionCm.y, site.positionCm.z);
    m.root.getTransform().setWorldPosition(pos);

    // Every level of the chain, not just the root — see the header note.
    setEnabled(m.root, true);
    setEnabled(m.icon, true);
    setEnabled(m.label ? m.label.sceneObject : null, true);
    setEnabled(m.ring, true);

    if (m.icon) {
      m.icon.getTransform().setLocalScale(new vec3(this.iconSizeCm, 1, this.iconSizeCm));
    }

    const theme = this.theme;
    const tint = site.kind === "fire" ? (theme ? theme.accentAmber : null) : theme ? theme.primaryPhosphor : null;

    if (m.iconMat && theme) {
      setIcon(m.iconMat, theme.icon(site.kind === "fire" ? "fire" : "tent"));
      setColor(m.iconMat, tint, theme.glowIntensity);
    }
    if (m.label) {
      setText(m.label, this.labelFormat.replace("{P}", "" + Math.round(site.flatness * 100)));
      if (theme) setTextColor(m.label, tint, theme.glowIntensity);
    }
    if (m.ringMat && theme) setColor(m.ringMat, tint, this.restingLevel * theme.glowIntensity);
  }

  private hideMarker(m: MarkerParts): void {
    setEnabled(m.root, false);
    setEnabled(m.icon, false);
    setEnabled(m.label ? m.label.sceneObject : null, false);
    setEnabled(m.ring, false);
  }

  private onUpdate(): void {
    const theme = this.theme;
    const camPos = this.billboard && this.cameraObject ? this.cameraObject.getTransform().getWorldPosition() : null;

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (!m.site || !m.root || !m.root.enabled) continue;

      // Pulse: only the best marker, and never down to nothing.
      if (m.ringMat && theme) {
        const isBest = m.slot === this.bestSlot;
        const tint = m.site.kind === "fire" ? theme.accentAmber : theme.primaryPhosphor;
        const level = isBest
          ? this.restingLevel + (this.bestPeakLevel - this.restingLevel) * pulse01(getTime(), this.bestPulseHz)
          : this.restingLevel;
        setColor(m.ringMat, tint, level * theme.glowIntensity);
      }

      if (camPos) {
        const rootPos = m.root.getTransform().getWorldPosition();
        // Yaw only. A marker that also pitches toward the head tips its label
        // off the horizon and reads as falling over.
        const yaw = Math.atan2(camPos.x - rootPos.x, camPos.z - rootPos.z);
        const spin = quat.angleAxis(yaw, vec3.up());
        // The icon quad is XZ-native, so it needs standing up (+90 about X)
        // before it can be yawed; Text already faces +Z.
        if (m.icon) m.icon.getTransform().setWorldRotation(spin.multiply(quat.fromEulerAngles(Math.PI / 2, 0, 0)));
        if (m.label) m.label.sceneObject.getTransform().setWorldRotation(spin);
      }
    }
  }

  // ---------------------------------------------------------------- select

  /** The one path a selection takes, whatever triggered it. */
  private selectSlot(slot: SiteSlot, source: string): void {
    const m = findMarker(this.markers, slot);
    if (!m || !m.site) {
      this.log("select " + slot + " ignored: no site there");
      return;
    }
    const payload: SiteSelectedPayload = {
      kind: m.site.kind,
      slot: slot,
      position: m.site.positionCm,
      score: m.site.score,
      source: source,
    };
    this.log(
      "siteSelected " + slot + " (" + m.site.kind + ") via " + source +
        " at (" + payload.position.x.toFixed(1) + ", " + payload.position.y.toFixed(1) + ", " +
        payload.position.z.toFixed(1) + ")cm score=" + payload.score.toFixed(3)
    );
    eventBus.emit(Events.siteSelected, payload);
  }

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const a = this.keyFromLetter(this.keyTentA);
    const b = this.keyFromLetter(this.keyTentB);
    const f = this.keyFromLetter(this.keyFire);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === a) this.selectSlot("TENT_A", "debugKey");
      else if (e.key === b) this.selectSlot("TENT_B", "debugKey");
      else if (e.key === f) this.selectSlot("FIRE", "debugKey");
    });
  }
}

// --------------------------------------------------------------- helpers

function findChild(parent: SceneObject, name: string): SceneObject | null {
  if (!parent) return null;
  const n = parent.getChildrenCount();
  for (let i = 0; i < n; i++) {
    const c = parent.getChild(i);
    if (c && c.name === name) return c;
  }
  return null;
}

function findSite(sites: SurveySite[], slot: SiteSlot): SurveySite | null {
  if (!sites) return null;
  for (let i = 0; i < sites.length; i++) if (sites[i].slot === slot) return sites[i];
  return null;
}

function findMarker(markers: MarkerParts[], slot: SiteSlot): MarkerParts | null {
  for (let i = 0; i < markers.length; i++) if (markers[i].slot === slot) return markers[i];
  return null;
}

function countPlaced(markers: MarkerParts[]): number {
  let n = 0;
  for (let i = 0; i < markers.length; i++) if (markers[i].site) n++;
  return n;
}
