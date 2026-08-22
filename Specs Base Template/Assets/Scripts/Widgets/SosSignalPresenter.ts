/**
 * SosSignalPresenter — the paced SOS rhythm readout.
 *
 * The product line this shot has to say: in a real emergency the hard part of
 * signalling is keeping the rhythm right while you are cold and frightened.
 * The Lens paces it for you — nine marks light in sequence
 * (dot dot dot · dash dash dash · dot dot dot), the screen edge flashes with
 * each pulse, and the tone sounds through SfxService.
 *
 * ## Where the truth lives
 *
 * The TIMING is pure Engine code (`SosRhythm.ts`): dot 1 unit, dash 3, gaps 1,
 * one prosign with no letter gaps, ~7 units of rest — 30 units per cycle. This
 * presenter only asks "what is the signal doing at t" and draws the answer, so
 * LEAF can assert on the same function this file renders.
 *
 * ## Hard rules
 *
 * 1 — creates nothing: `HUDRoot/SosPanel` with `Marks/Mark_1..9`, `EdgeFlash`
 *     bars and `BearingNote` all exist at design time, disabled.
 * 2 — additive: marks and edge glow bright; "off" is emission zero, never a
 *     dark fill.
 * 3 — no decisions: it renders `sosStateChanged` and announces each element
 *     onset as `sosPulse` (the hologramShown pattern); the engine owns the
 *     mode, SfxService owns the sound.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { SOS_CYCLE_UNITS, sosSampleAt } from "../Engine/SosRhythm";
import { NavigateUpdatePayload } from "../Engine/NavTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

@component
export class SosSignalPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Marks are found by name (Mark_1..9) under SosPanel/Marks; edge bars under SosPanel/EdgeFlash. All ship disabled.</span>')

  @input @hint("HUDRoot/SosPanel") private sosPanel: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Rhythm</span>')

  @input
  @widget(new SliderWidget(0.08, 0.5, 0.01))
  @hint("The Morse unit, seconds. Dot = 1 unit, dash = 3, element gap 1, rest ~7 — 30 units per cycle, so 0.2 s = a 6.0 s cycle: inside the 5-7 s demo beat and still unmistakably S-O-S.")
  private unitSec: number = 0.2;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.05))
  @hint("Brightness of marks already sent this cycle. The current element is full; history holds dim so the eye can read where in the pattern you are.")
  private sentLevel: number = 0.3;

  @input
  @widget(new SliderWidget(0.0, 2.0, 0.05))
  @hint("Edge flash peak brightness, on top of the theme glow.")
  private edgePeak: number = 1.0;

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private marks: { obj: SceneObject; mat: Material | null }[] = [];
  private edgeMat: Material | null = null;
  private edgeBars: SceneObject[] = [];
  private note: Text | null = null;
  private active: boolean = false;
  private clock: number = 0;
  private lastOnIndex: number = -1;
  private hasBearing: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[SOS] " + msg);
  }

  private onStart(): void {
    this.collect();

    eventBus.subscribe(Events.sosStateChanged, (p: { active: boolean }) => {
      if (p && p.active) this.begin();
      else this.end();
    });

    // The compass source says whether an arrow exists; the note repeats it in
    // text. No data = say so, never point at nothing.
    eventBus.subscribe(Events.navigateUpdated, (p: NavigateUpdatePayload) => {
      if (!p || p.navMode !== "sos") return;
      this.hasBearing = !!p.active;
      if (this.active) this.applyNote();
    });

    this.end();
    this.log(
      "ready. marks=" + this.marks.length + " edgeBars=" + this.edgeBars.length +
        " unit=" + this.unitSec + "s cycle=" + (SOS_CYCLE_UNITS * this.unitSec).toFixed(1) + "s"
    );
  }

  private collect(): void {
    this.marks = [];
    this.edgeBars = [];
    if (!this.sosPanel) return;

    const marksRoot = findChild(this.sosPanel, "Marks");
    if (marksRoot) {
      for (let n = 1; n <= 9; n++) {
        const obj = findChild(marksRoot, "Mark_" + n);
        if (!obj) continue;
        const v = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.marks.push({ obj: obj, mat: v ? isolateMaterial(v) : null });
      }
    }

    const edge = findChild(this.sosPanel, "EdgeFlash");
    if (edge) {
      // One clone for all four bars — they flash as one frame.
      for (let i = 0; i < edge.getChildrenCount(); i++) {
        const bar = edge.getChild(i);
        const v = bar.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (v) {
          if (!this.edgeMat) this.edgeMat = isolateMaterial(v);
          else v.mainMaterial = this.edgeMat;
        }
        this.edgeBars.push(bar);
      }
    }

    const note = findChild(this.sosPanel, "BearingNote");
    this.note = note ? (note.getComponent("Component.Text") as Text) : null;
    setFont(this.note, this.theme ? this.theme.font : null);
  }

  private begin(): void {
    this.active = true;
    this.clock = 0;
    this.lastOnIndex = -1;
    // hasBearing is NOT reset here: SurveyController subscribes to the same
    // sosStateChanged edge and sits EARLIER in the dispatch, so its
    // navigateUpdated (the arrow) lands before this handler runs. Resetting
    // here clobbered that answer and the note claimed NO SCAN DATA over a
    // live arrow. The reset lives in end() instead.

    // Whole chain, per the rule that cost a debugging cycle.
    setEnabled(this.sosPanel, true);
    const marksRoot = findChild(this.sosPanel, "Marks");
    setEnabled(marksRoot, true);
    for (let i = 0; i < this.marks.length; i++) setEnabled(this.marks[i].obj, true);
    const edge = findChild(this.sosPanel, "EdgeFlash");
    setEnabled(edge, true);
    for (let i = 0; i < this.edgeBars.length; i++) setEnabled(this.edgeBars[i], true);
    if (this.note) setEnabled(this.note.sceneObject, true);

    this.applyNote();
    this.log("signal ON — unit " + this.unitSec + "s, cycle " + (SOS_CYCLE_UNITS * this.unitSec).toFixed(1) + "s");
  }

  private end(): void {
    this.active = false;
    this.hasBearing = false;
    setEnabled(this.sosPanel, false);
  }

  private applyNote(): void {
    if (!this.note || !this.theme) return;
    if (this.hasBearing) {
      setText(this.note, "SIGNAL ALONG THE ARROW");
      setTextColor(this.note, this.theme.accentAmber, this.theme.glowIntensity);
    } else {
      // No survey data: no direction is shown ANYWHERE, and this says why.
      setText(this.note, "NO SCAN DATA · PICK OPEN GROUND");
      setTextColor(this.note, this.theme.dimColor, this.theme.glowIntensity);
    }
  }

  private onUpdate(): void {
    if (!this.active || !this.theme) return;
    this.clock += getDeltaTime();

    const s = sosSampleAt(this.clock, this.unitSec);

    // Element ONSET -> one pulse announcement. SfxService turns it into the tone.
    if (s.on && s.elementIndex !== this.lastOnIndex) {
      this.lastOnIndex = s.elementIndex;
      eventBus.emit(Events.sosPulse, { kind: s.kind });
    }
    if (s.inPause) this.lastOnIndex = -1;

    const warn = this.theme.warningColor;
    const glow = this.theme.glowIntensity;

    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (!m.mat) continue;
      let level = 0.06; // never fully dark on an additive display — "off" still exists
      if (s.on && i === s.elementIndex) level = 1.6;
      else if (i <= s.elementIndex && !s.inPause) level = this.sentLevel;
      else if (s.inPause) level = 0.12; // the rest beat: the whole word breathes low
      setColor(m.mat, warn, level * glow);
    }

    if (this.edgeMat) {
      setColor(this.edgeMat, warn, (s.on ? this.edgePeak : 0.0) * glow * 1.6);
    }
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
