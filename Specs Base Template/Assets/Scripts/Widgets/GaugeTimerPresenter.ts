/**
 * GaugeTimer presenter — countdown ring plus MM:SS.
 *
 * Honest limitation: a true radial sweep (a ring that empties like a pie chart)
 * needs either a shader with an angular mask or a procedurally rebuilt mesh.
 * The design-time placeholder is a torus, and hard rule 1 forbids building a
 * new one at runtime, so remaining time is shown by SCALING the fill ring
 * inside the static track ring. It reads correctly — the ring visibly shrinks
 * to nothing — and it swaps for a real sweep the moment the shader exists,
 * with no change to this presenter's inputs.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import { formatClock, isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

@component
export class GaugeTimerPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("HUDRoot/GaugeTimer") private gauge: SceneObject;
  @input @hint("HUDRoot/GaugeTimer/Track — static reference ring") private track: SceneObject;
  @input @hint("HUDRoot/GaugeTimer/Fill — scales down as time runs out") private fill: SceneObject;
  @input @hint("HUDRoot/GaugeTimer/Label") private label: Text;

  @input
  @widget(new SliderWidget(0.1, 1.0, 0.05))
  @hint("Fill ring size relative to the track when full.")
  private fillFullScale: number = 0.8;

  @input
  @widget(new SliderWidget(0.0, 0.5, 0.01))
  @hint("Below this fraction remaining, the ring turns to the warning colour.")
  private urgentBelow: number = 0.2;

  private trackScale: number = 16;
  private trackMat: Material;
  private fillMat: Material;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    if (this.track) {
      this.trackScale = this.track.getTransform().getLocalScale().x;
      this.trackMat = isolateMaterial(this.track.getComponent("Component.RenderMeshVisual"));
    }
    if (this.fill) {
      this.fillMat = isolateMaterial(this.fill.getComponent("Component.RenderMeshVisual"));
    }
    setFont(this.label, this.theme ? this.theme.font : null);

    eventBus.subscribe(
      Events.timerTick,
      (p: { remainingSec: number; totalSec: number }) => this.render(p)
    );
    eventBus.subscribe(Events.companionChanged, (p: { type: string | null }) => {
      if (!p || p.type !== "timer") setEnabled(this.gauge, false);
    });
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p || p.to !== "LESSON") setEnabled(this.gauge, false);
    });

    setEnabled(this.gauge, false);
  }

  private render(p: { remainingSec: number; totalSec: number }): void {
    if (!p || !p.totalSec) return;
    const theme = this.theme;

    setEnabled(this.gauge, true);
    setEnabled(this.track, true);
    setEnabled(this.fill, true);
    setEnabled(this.label ? this.label.sceneObject : null, true);

    const frac = Math.max(0, Math.min(1, p.remainingSec / p.totalSec));
    setText(this.label, formatClock(p.remainingSec));

    if (this.fill) {
      const s = this.trackScale * this.fillFullScale * frac;
      this.fill.getTransform().setLocalScale(new vec3(s, s, s));
    }

    if (!theme) return;
    const urgent = frac <= this.urgentBelow;
    setColor(this.trackMat, theme.primaryPhosphor, theme.glowIntensity * 0.5);
    setColor(this.fillMat, urgent ? theme.warningColor : theme.accentAmber, theme.glowIntensity);
    setTextColor(this.label, urgent ? theme.warningColor : theme.accentAmber, theme.glowIntensity);
  }
}
