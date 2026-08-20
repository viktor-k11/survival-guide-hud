/**
 * Checklist presenter — six design-time rows, showing only as many as the step
 * needs (hard rule 1: six is the hard cap, nothing is ever created).
 *
 * Sequential highlight: the topmost unchecked row is bright amber, checked rows
 * are dimmed and prefixed with a tick, rows below the cursor sit quiet. That
 * makes "say done" unambiguous — there is exactly one row asking to be actioned.
 *
 * Takes the container as ONE @input and walks ChecklistItem_1..6 by index.
 * That structure is documented in Docs/SCENE-MAP.md and enforced by
 * Tools/check-scene-roots.py, so it is a contract, not an assumption — and it
 * beats wiring twelve inspector fields by hand.
 */
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import { isolateMaterial, setColor, setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

interface Row {
  root: SceneObject;
  label: Text;
  indicatorMat: Material;
  indicator: SceneObject;
}

@component
export class ChecklistPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("HUDRoot/Checklist — children ChecklistItem_1..6 are read by index.") private container: SceneObject;

  @input @hint("Prefix for a checked row.") private checkedPrefix: string = "[x] ";
  @input @hint("Prefix for the row currently being actioned.") private activePrefix: string = "[>] ";
  @input @hint("Prefix for a row not yet reached.") private pendingPrefix: string = "[ ] ";

  @input private enableLogging: boolean = false;

  private rows: Row[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    this.collectRows();
    this.hideAll();

    eventBus.subscribe(
      Events.checklistUpdated,
      (p: { items: string[]; checked: boolean[] }) => this.render(p)
    );
    // A step without a checklist must clear the rows, not leave the last
    // lesson's items sitting on screen.
    eventBus.subscribe(Events.companionChanged, (p: { type: string | null }) => {
      if (!p || p.type !== "checklist") this.hideAll();
    });
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p || p.to !== "LESSON") this.hideAll();
    });
  }

  private collectRows(): void {
    this.rows = [];
    if (!this.container) return;
    const font = this.theme ? this.theme.font : null;

    for (let i = 0; i < this.container.getChildrenCount(); i++) {
      const item = this.container.getChild(i);
      let label: Text = null;
      let indicator: SceneObject = null;

      for (let c = 0; c < item.getChildrenCount(); c++) {
        const child = item.getChild(c);
        if (child.name === "Label") label = child.getComponent("Component.Text");
        else if (child.name === "CheckIndicator") indicator = child;
      }

      let mat: Material = null;
      if (indicator) {
        const v: RenderMeshVisual = indicator.getComponent("Component.RenderMeshVisual");
        mat = isolateMaterial(v);
      }
      setFont(label, font);
      this.rows.push({ root: item, label: label, indicatorMat: mat, indicator: indicator });
    }
    if (this.enableLogging) {
      print("[CHECKLIST] collected " + this.rows.length + " rows from " +
        (this.container ? this.container.name : "<null container>"));
    }
  }

  private hideAll(): void {
    for (let i = 0; i < this.rows.length; i++) setEnabled(this.rows[i].root, false);
    setEnabled(this.container, false);
  }

  private render(p: { items: string[]; checked: boolean[] }): void {
    if (!p || !p.items) {
      this.hideAll();
      return;
    }
    const theme = this.theme;
    setEnabled(this.container, true);
    if (this.enableLogging) print("[CHECKLIST] render items=" + p.items.length + " rows=" + this.rows.length);

    // The topmost unchecked row is the one "done" will action.
    let cursor = -1;
    for (let i = 0; i < p.checked.length; i++) {
      if (!p.checked[i]) {
        cursor = i;
        break;
      }
    }

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const used = i < p.items.length;
      setEnabled(row.root, used);
      // The row's CHILDREN also ship disabled (hard rule 1), so enabling only
      // the row leaves it empty. Every level of the chain has to be turned on.
      setEnabled(row.label ? row.label.sceneObject : null, used);
      setEnabled(row.indicator, used);
      if (!used) continue;

      const isChecked = p.checked[i];
      const isActive = i === cursor;
      const prefix = isChecked ? this.checkedPrefix : isActive ? this.activePrefix : this.pendingPrefix;
      setText(row.label, prefix + p.items[i]);

      if (!theme) continue;
      const color = isChecked ? theme.dimColor : isActive ? theme.accentAmber : theme.primaryPhosphor;
      const level = isActive ? theme.glowIntensity : theme.glowIntensity * 0.7;
      setTextColor(row.label, color, level);
      setColor(row.indicatorMat, color, level);
    }
  }
}
