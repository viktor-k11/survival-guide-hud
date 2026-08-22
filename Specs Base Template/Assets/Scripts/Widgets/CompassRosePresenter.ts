/**
 * Compass rose presenter — the ONE bearing display.
 *
 * The rose itself (`WorldRoot/CompassRose`) plus its design-time children
 * `Arrow` (Shaft + Tip) and `DistanceLabel` exist in the scene, disabled.
 * This enables them while navigation is active, keeps the rose floating ahead
 * of the user below eye level, yaws the arrow at the current target, and
 * writes "CAMP 47 M" on the label.
 *
 * ## One presenter, two (future: three) bearing sources — do not fork this
 *
 * The bearing SOURCE is the `navigateUpdated` event, not a controller
 * reference: today NavigationController points it at camp or at the next
 * trail mark; SOS will later point it at the most open sampled direction by
 * emitting the same payload shape. Anything that wants an arrow on screen
 * feeds this event; nothing gets a second compass.
 *
 * Honest degradation: when the payload says lastKnown, the label says
 * "LAST KNOWN" and the whole rose goes warning-coloured. A guide that lies
 * about direction is worse than one that admits it is unsure.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { NavigateUpdatePayload } from "../Engine/NavTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

@component
export class CompassRosePresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')

  @input private theme: VisualConfig;
  @input @hint("WorldRoot/CompassRose — children Arrow (Shaft/Tip) and DistanceLabel found by name.") private compassRose: SceneObject;
  @input @hint("Camera Object — the rose floats ahead of the user.") private cameraObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Placement</span>')

  @input @widget(new SliderWidget(60, 400, 10)) @hint("How far ahead of the user the rose floats, centimetres.") private aheadCm: number = 160;
  @input @widget(new SliderWidget(40, 200, 5)) @hint("How far below eye level, centimetres. Low enough to not block the view, high enough to stay in the angular frustum.") private belowEyeCm: number = 55;
  @input @hint("Label text. {D} is replaced by the distance in metres.") private labelFormat: string = "CAMP {D} M";
  @input @hint("Label while the source is SOS — a direction, not a distance.") private sosLabel: string = "SIGNAL THIS WAY";
  @input @hint("Suffix appended while tracking is lost.") private lastKnownSuffix: string = " · LAST KNOWN";
  @input private enableLogging: boolean = false;

  // ------------------------------------------------------------------ state

  private arrow: SceneObject | null = null;
  private arrowMats: Material[] = [];
  private roseMat: Material | null = null;
  private label: Text | null = null;
  private labelObj: SceneObject | null = null;
  private nav: NavigateUpdatePayload | null = null;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[COMPASS] " + msg);
  }

  private onStart(): void {
    if (this.compassRose) {
      for (let i = 0; i < this.compassRose.getChildrenCount(); i++) {
        const c = this.compassRose.getChild(i);
        if (c.name === "Disc") {
          const v = c.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          this.roseMat = v ? isolateMaterial(v) : null;
        } else if (c.name === "Arrow") {
          this.arrow = c;
          collectMats(c, this.arrowMats);
        } else if (c.name === "DistanceLabel") {
          this.labelObj = c;
          this.label = c.getComponent("Component.Text") as Text;
          setFont(this.label, this.theme ? this.theme.font : null);
        }
      }
    }

    eventBus.subscribe(Events.navigateUpdated, (p: NavigateUpdatePayload) => {
      this.nav = p;
      if (!p || !p.active) this.hide();
      else this.show();
    });
    // Whatever mode ends navigation, the rose must not survive it. SOS is the
    // second legitimate host (same presenter, second source — never a fork).
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p || (p.to !== "NAVIGATE" && p.to !== "SOS")) this.hide();
    });

    this.hide();
    this.log("ready. arrow=" + (this.arrow !== null) + " label=" + (this.label !== null));
  }

  private show(): void {
    if (!this.compassRose) return;
    setEnabled(this.compassRose, true);
    enableChildren(this.compassRose);
  }

  private hide(): void {
    setEnabled(this.compassRose, false);
  }

  private onUpdate(): void {
    const p = this.nav;
    if (!p || !p.active || !this.compassRose || !this.cameraObject) return;

    const camT = this.cameraObject.getTransform();
    const camPos = camT.getWorldPosition();

    // Float ahead along the user's flat gaze — yaw only, so looking down at
    // the rose does not chase it toward the feet.
    const rot = camT.getWorldRotation();
    const fwd = rot.multiplyVec3(new vec3(0, 0, -1));
    const flatLen = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const fx = flatLen > 0.001 ? fwd.x / flatLen : 0;
    const fz = flatLen > 0.001 ? fwd.z / flatLen : -1;
    this.compassRose.getTransform().setWorldPosition(
      new vec3(camPos.x + fx * this.aheadCm, camPos.y - this.belowEyeCm, camPos.z + fz * this.aheadCm)
    );

    // The arrow yaws at the TARGET (camp, or the next trail mark) from the
    // user's own position — pure geometry over two points, no GPS anywhere.
    if (this.arrow) {
      const t = p.targetCm;
      const yaw = Math.atan2(t.x - camPos.x, -(t.z - camPos.z));
      // Authored along -Z; angleAxis(-yaw) because +yaw here is clockwise.
      this.arrow.getTransform().setWorldRotation(quat.angleAxis(-yaw, vec3.up()));
    }

    if (this.label) {
      const d = p.distanceM >= 10 ? Math.round(p.distanceM) : p.distanceM;
      // SOS carries a direction, not a distance — "SIGNAL THIS WAY 0 M"
      // would be nonsense.
      const body = p.navMode === "sos" ? this.sosLabel : this.labelFormat.replace("{D}", "" + d);
      setText(this.label, body + (p.lastKnown ? this.lastKnownSuffix : ""));
      // The label yaws to the user, like every world label here.
      if (this.labelObj) {
        const lp = this.labelObj.getTransform().getWorldPosition();
        const yaw = Math.atan2(camPos.x - lp.x, camPos.z - lp.z);
        this.labelObj.getTransform().setWorldRotation(quat.angleAxis(yaw, vec3.up()));
      }
    }

    if (this.theme) {
      const tint = p.lastKnown ? this.theme.warningColor : this.theme.accentAmber;
      for (let i = 0; i < this.arrowMats.length; i++) setColor(this.arrowMats[i], tint, this.theme.glowIntensity);
      if (this.roseMat) setColor(this.roseMat, p.lastKnown ? this.theme.warningColor : this.theme.primaryPhosphor, this.theme.glowIntensity * 0.5);
      if (this.label) setTextColor(this.label, tint, this.theme.glowIntensity);
    }
  }
}

// --------------------------------------------------------------- helpers

function enableChildren(obj: SceneObject): void {
  for (let i = 0; i < obj.getChildrenCount(); i++) {
    const c = obj.getChild(i);
    c.enabled = true;
    enableChildren(c);
  }
}

function collectMats(obj: SceneObject, out: Material[]): void {
  const v = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (v) {
    const m = isolateMaterial(v);
    if (m) out.push(m);
  }
  for (let i = 0; i < obj.getChildrenCount(); i++) collectMats(obj.getChild(i), out);
}
