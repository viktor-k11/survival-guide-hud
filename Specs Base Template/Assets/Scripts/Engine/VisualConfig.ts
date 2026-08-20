/**
 * Theme parameters for the whole HUD, exposed as @input so the look can be
 * retuned in the Inspector without touching code — hard rule 1.
 *
 * Holds VALUES ONLY. No logic, no subscriptions, no scene access. Widgets read
 * these at presentation time; nothing here does anything on its own.
 *
 * Colors are authored bright and saturated on purpose: the SPECS waveguide is
 * additive, so dark values render as transparent — hard rule 2.
 */
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

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Typography</span>')

  @input
  @allowUndefined
  @hint("HUD typeface. VT323 by default - OFL-licensed, no third-party IP (hard rule 7).")
  font: Font;
}
