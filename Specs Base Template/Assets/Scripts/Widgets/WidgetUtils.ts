/**
 * Shared presentation helpers. Pure functions over existing scene objects —
 * creates nothing (hard rule 1), decides nothing (hard rule 3).
 *
 * The material cloning here matters: the placeholder materials (PH_*.mat) are
 * SHARED across many objects. Tinting one object's material in place would
 * recolour every other object using it. Every presenter that changes a colour
 * must clone first, exactly once, and keep the clone.
 */

/** Clone this visual's material so tinting it cannot bleed into other objects. */
export function isolateMaterial(visual: RenderMeshVisual): Material | null {
  if (!visual) return null;
  const cloned = visual.mainMaterial.clone();
  visual.mainMaterial = cloned;
  return cloned;
}

/**
 * Replace a visual's material with a fresh clone of `source`, and return it.
 *
 * Needed for icon slots: the PH_ placeholder materials gate `baseTex` behind
 * the ENABLE_BASE_TEX shader define, so assigning a texture to them does
 * nothing at all — no error, no warning, just a blank shape. PH_Icon.mat has
 * the define baked on. Always clone; assigning the shared asset directly would
 * make every icon slot show the last texture written.
 */
export function adoptMaterial(visual: RenderMeshVisual, source: Material): Material | null {
  if (!visual || !source) return null;
  const cloned = source.clone();
  visual.mainMaterial = cloned;
  return cloned;
}

export function setColor(mat: Material, color: vec4, intensity: number): void {
  if (!mat) return;
  const pass = mat.mainPass as any;
  pass.baseColor = new vec4(
    color.r * intensity,
    color.g * intensity,
    color.b * intensity,
    color.a
  );
}

/** Put an icon texture on an additive material: transparent stays dark = invisible. */
export function setIcon(mat: Material, tex: Texture | null): void {
  if (!mat) return;
  const pass = mat.mainPass as any;
  pass.baseTex = tex;
}

export function setEnabled(obj: SceneObject, on: boolean): void {
  if (obj) obj.enabled = on;
}

export function setText(text: Text, value: string): void {
  if (text) text.text = value;
}

export function setTextColor(text: Text, color: vec4, intensity: number): void {
  if (!text) return;
  text.textFill.color = new vec4(
    color.r * intensity,
    color.g * intensity,
    color.b * intensity,
    color.a
  );
}

/** Apply the themed font, if one is wired. */
export function setFont(text: Text, font: Font | null): void {
  if (text && font) text.font = font;
}

/** MM:SS, clamped at zero. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

/** "03/06" — zero padded so the counter does not change width as it climbs. */
export function formatCounter(index0: number, total: number): string {
  const n = index0 + 1;
  const pad = (v: number) => (v < 10 ? "0" + v : "" + v);
  return pad(n) + "/" + pad(total);
}

/**
 * Greedy word wrap at a character budget.
 *
 * World-space Text has no width to wrap against without a ScreenTransform, so
 * a long instruction runs straight off the guide panel. Wrapping here is a
 * presentation concern and deterministic, which also keeps it testable.
 */
export function wrapText(value: string, maxCharsPerLine: number): string {
  const words = (value || "").split(" ");
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (line.length === 0) line = w;
    else if (line.length + 1 + w.length <= maxCharsPerLine) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}

/** 0..1 triangle wave for pulsing, from lens time. */
export function pulse01(timeSec: number, hz: number): number {
  const phase = (timeSec * hz) % 1.0;
  return phase < 0.5 ? phase * 2.0 : 2.0 - phase * 2.0;
}
