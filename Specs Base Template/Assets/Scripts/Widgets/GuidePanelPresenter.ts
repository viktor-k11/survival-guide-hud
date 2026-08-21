/**
 * GuidePanel presenter — the right-side lesson surface.
 *
 * stepChanged -> icon in IconSlot, NN/NN counter, instruction at the bottom.
 * Hard rule 3: subscribes, presents, decides nothing.
 *
 * The backing plate uses PH_PanelGlow, an ADDITIVE material (hard rule 2). It
 * brightens whatever is behind it and can never darken it, so `panelOpacity`
 * scales emission upward from zero rather than fading a dark plate in.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import { adoptMaterial, formatCounter, isolateMaterial, setColor, setEnabled, setFont, setIcon, setText, setTextColor, wrapText } from "./WidgetUtils";

@component
export class GuidePanelPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("HUDRoot/GuidePanel") private panel: SceneObject;
  @input @hint("HUDRoot/GuidePanel/BackingPlate") private backingPlate: SceneObject;
  @input @hint("HUDRoot/GuidePanel/IconSlot") private iconSlot: SceneObject;
  @input @hint("HUDRoot/GuidePanel/StepCounter") private stepCounter: Text;
  @input @hint("HUDRoot/GuidePanel/InstructionText") private instruction: Text;

  @input
  @allowUndefined
  @hint("HUDRoot/GuidePanel/DegradationNote — the honest-degradation line, shown when this step's companion widget was dropped by the validator. Dim, not warning colour: the step still works; this is information.")
  private degradationNote: Text;

  @input
  @hint("Degradation line copy. {N} = step number.")
  private degradationFormat: string = "STEP {N} · WIDGET UNAVAILABLE";

  @input
  @allowUndefined
  @hint("PH_Plane.mesh — the IconSlot placeholder is a box; swapping to a quad makes the icon read as an icon.")
  private quadMesh: RenderMesh;

  @input
  @allowUndefined
  @hint("PH_Icon.mat — unlit additive with ENABLE_BASE_TEX baked on. Assigning baseTex to the other PH_ materials is a silent no-op.")
  private iconMaterial: Material;

  @input
  @widget(new SliderWidget(12, 48, 1))
  @hint("Characters per line before the instruction wraps. World-space Text has no width to wrap against, so the presenter does it.")
  private instructionWrapChars: number = 26;

  private plateMat: Material;
  private iconMat: Material;
  private lessonIcon: string = "question";

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    if (this.backingPlate) {
      const v: RenderMeshVisual = this.backingPlate.getComponent("Component.RenderMeshVisual");
      this.plateMat = isolateMaterial(v);
    }
    if (this.iconSlot) {
      const v: RenderMeshVisual = this.iconSlot.getComponent("Component.RenderMeshVisual");
      // Positioning/populating an existing object is allowed; creating one is not.
      if (v && this.quadMesh) v.mesh = this.quadMesh;
      const t = this.iconSlot.getTransform();
      t.setLocalRotation(quat.fromEulerAngles(Math.PI / 2, 0, 0));
      t.setLocalScale(new vec3(7, 1, 7));
      this.iconMat = this.iconMaterial ? adoptMaterial(v, this.iconMaterial) : isolateMaterial(v);
    }

    const font = this.theme ? this.theme.font : null;
    setFont(this.stepCounter, font);
    setFont(this.instruction, font);
    setFont(this.degradationNote, font);

    eventBus.subscribe(Events.lessonStarted, (p: { title: string }) => {
      this.lessonIcon = this.theme ? this.theme.iconForLessonTitle(p ? p.title : "") : "question";
    });

    eventBus.subscribe(
      Events.stepChanged,
      (p: { stepIndex: number; total: number; instruction: string; companionDegraded?: boolean }) => {
        this.showStep(p);
      }
    );

    eventBus.subscribe(Events.companionChanged, (p: { type: string | null }) => {
      // Prefer the step's companion icon; fall back to the lesson's own icon
      // so the slot is never blank mid-lesson.
      const kind = this.theme ? this.theme.iconForCompanion(p ? p.type : null) : null;
      this.applyIcon(kind ? kind : (this.lessonIcon as any));
    });

    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      setEnabled(this.panel, p && p.to === "LESSON");
    });

    setEnabled(this.panel, false);
    this.applyTheme();
  }

  private applyTheme(): void {
    if (!this.theme) return;
    // Additive: scale emission up from zero. There is no dark plate to fade.
    setColor(this.plateMat, this.theme.primaryPhosphor, this.theme.panelOpacity * this.theme.glowIntensity * 0.5);
    setTextColor(this.stepCounter, this.theme.accentAmber, this.theme.glowIntensity);
    setTextColor(this.instruction, this.theme.primaryPhosphor, this.theme.glowIntensity);
  }

  private showStep(p: { stepIndex: number; total: number; instruction: string; companionDegraded?: boolean }): void {
    if (!p) return;
    setEnabled(this.panel, true);
    setEnabled(this.backingPlate, true);
    setEnabled(this.iconSlot, true);
    setEnabled(this.stepCounter ? this.stepCounter.sceneObject : null, true);
    setEnabled(this.instruction ? this.instruction.sceneObject : null, true);

    setText(this.stepCounter, formatCounter(p.stepIndex, p.total));
    setText(this.instruction, wrapText(p.instruction, this.instructionWrapChars));

    // Honest degradation, on screen: the validator dropped this step's widget,
    // and the system says so instead of pretending nothing was asked for.
    // Dim on purpose — the step still works; this is information, not an error.
    const degraded = p.companionDegraded === true;
    setEnabled(this.degradationNote ? this.degradationNote.sceneObject : null, degraded);
    if (degraded) {
      setText(this.degradationNote, this.degradationFormat.replace("{N}", "" + (p.stepIndex + 1)));
      if (this.theme) setTextColor(this.degradationNote, this.theme.dimColor, this.theme.glowIntensity * 0.6);
    }

    this.applyTheme();
  }

  private applyIcon(kind: any): void {
    if (!this.theme || !this.iconMat) return;
    const tex = this.theme.icon(kind);
    setIcon(this.iconMat, tex);
    setColor(this.iconMat, this.theme.accentAmber, this.theme.glowIntensity);
  }
}
