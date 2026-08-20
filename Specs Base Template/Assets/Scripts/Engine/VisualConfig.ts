/**
 * Theme parameters for the whole HUD, exposed as @input so the look can be
 * retuned in the Inspector without touching code — hard rule 1.
 *
 * Holds VALUES ONLY. No logic, no subscriptions, no scene access. Widgets read
 * these at presentation time; nothing here does anything on its own.
 *
 * Colors are authored bright and saturated on purpose: the SPECS waveguide is
 * additive, so dark values render as transparent — hard rule 2.
 *
 * This is also the ONE place icons and the typeface are named. No presenter
 * references an icon asset directly — they call icon(kind). Changing the icon
 * family or the font is an edit here and nowhere else.
 */

/** Semantic icon slots. Presenters ask for these, never for a filename. */
export type IconKind =
  | "fire"
  | "tent"
  | "compass"
  | "water"
  | "checklist"
  | "timer"
  | "warning"
  | "mic"
  | "next"
  | "back"
  | "sos"
  | "question";

@component
export class VisualConfig extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Palette</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Bright saturated only. Dark values disappear on an additive display.</span>')

  @input
  @widget(new ColorWidget())
  @hint("Primary phosphor green: panel text, guide chrome, default widget stroke.")
  primaryPhosphor: vec4 = new vec4(0.35, 1.0, 0.55, 1.0);

  @input
  @widget(new ColorWidget())
  @hint("Amber accent: step counters, active highlights, hologram staging.")
  accentAmber: vec4 = new vec4(1.0, 0.7, 0.15, 1.0);

  @input
  @widget(new ColorWidget())
  @hint("Warning: safety-gated steps, distance warnings, the status-bar warning strip.")
  warningColor: vec4 = new vec4(1.0, 0.3, 0.22, 1.0);

  @input
  @widget(new ColorWidget())
  @hint("Dimmed state: unchecked checklist rows, inactive chrome. Still emissive, just quieter.")
  dimColor: vec4 = new vec4(0.12, 0.38, 0.22, 1.0);

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Intensity</span>')

  @input
  @widget(new SliderWidget(0.0, 3.0, 0.05))
  @hint("Multiplier applied to emissive strength. 1.0 = as authored.")
  glowIntensity: number = 1.0;

  @input
  @widget(new SliderWidget(0.0, 1.0, 0.01))
  @hint("Backing-plate strength. On an additive display this brightens the glow; it never darkens what is behind it.")
  panelOpacity: number = 0.3;

  @input
  @widget(new SliderWidget(0.0, 4.0, 0.1))
  @hint("Mic pulse rate in Hz while idle / listening.")
  pulseHz: number = 1.2;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Typography</span>')

  @input
  @allowUndefined
  @hint("HUD typeface. JetBrains Mono by default: monospace keeps NN/NN and MM:SS from jittering, and it has a weight axis so strokes can be thickened for an additive display. VT323 is still in the project if you want the CRT look back.")
  font: Font;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Icon set — Material Symbols, Sharp</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Swap the family by re-importing with /icon-selector and re-pointing these fields. Presenters never name an icon asset, so this is the only place that changes.</span>')

  @input @allowUndefined iconFire: Texture;
  @input @allowUndefined iconTent: Texture;
  @input @allowUndefined iconCompass: Texture;
  @input @allowUndefined iconWater: Texture;
  @input @allowUndefined iconChecklist: Texture;
  @input @allowUndefined iconTimer: Texture;
  @input @allowUndefined iconWarning: Texture;
  @input @allowUndefined iconMic: Texture;
  @input @allowUndefined iconNext: Texture;
  @input @allowUndefined iconBack: Texture;
  @input @allowUndefined iconSos: Texture;
  @input @allowUndefined iconQuestion: Texture;

  /** Resolve a semantic slot to a texture. Returns null when unwired. */
  public icon(kind: IconKind): Texture | null {
    if (kind === "fire") return this.iconFire;
    if (kind === "tent") return this.iconTent;
    if (kind === "compass") return this.iconCompass;
    if (kind === "water") return this.iconWater;
    if (kind === "checklist") return this.iconChecklist;
    if (kind === "timer") return this.iconTimer;
    if (kind === "warning") return this.iconWarning;
    if (kind === "mic") return this.iconMic;
    if (kind === "next") return this.iconNext;
    if (kind === "back") return this.iconBack;
    if (kind === "sos") return this.iconSos;
    if (kind === "question") return this.iconQuestion;
    return null;
  }

  /**
   * Which icon represents a companion type. Kept here rather than in a
   * presenter so the mapping is themeable alongside the art.
   */
  public iconForCompanion(companionType: string | null): IconKind | null {
    if (companionType === "zone") return "compass";
    if (companionType === "timer") return "timer";
    if (companionType === "checklist") return "checklist";
    if (companionType === "compass") return "compass";
    if (companionType === "hologram_stage") return "tent";
    return null;
  }

  /** Which icon represents a lesson, from its title. */
  public iconForLessonTitle(title: string): IconKind {
    const t = (title || "").toLowerCase();
    if (t.indexOf("fire") >= 0) return "fire";
    if (t.indexOf("tent") >= 0 || t.indexOf("shelter") >= 0) return "tent";
    if (t.indexOf("water") >= 0) return "water";
    return "question";
  }
}
