/**
 * Payload shapes for the survey events. TYPES ONLY — no logic, no scene, no
 * imports from either side.
 *
 * This file exists so the engine and the widgets can agree on the shape of
 * `surveyProgress` / `surveyComplete` / `siteSelected` without the widgets
 * importing SurveyController (which would pull WorldQueryModule into a
 * presenter) and without the engine importing a widget. Hard rule 3 says they
 * talk through the EventBus; the bus carries payloads, and this is where those
 * payloads are described.
 *
 * POSITIONS HERE ARE CENTIMETRES, world space — Lens runtime units, ready to
 * hand to setWorldPosition(). The metres/centimetres conversion happens once,
 * in SurveyController, on the boundary of the pure SiteSelection module.
 */

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned extent of everything sampled so far. Centimetres, world. */
export interface SurveyBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Mean height of sampled ground — where the grid should sit. */
  meanY: number;
}

/** Emitted continuously while SURVEY runs. */
export interface SurveyProgressPayload {
  /** 0..1. Monotonic: it never goes backwards within one survey. */
  progress: number;
  pointCount: number;
  groundCellCount: number;
  elapsedSec: number;
  /** null until the first hit lands. */
  bounds: SurveyBounds | null;
}

/** Which marker a site drives. Matches the design-time object names. */
export type SiteSlot = "TENT_A" | "TENT_B" | "FIRE";

export interface SurveySite {
  kind: "tent" | "fire";
  slot: SiteSlot;
  positionCm: XYZ;
  normal: XYZ;
  /** 0..1 combined ranking score. */
  score: number;
  /** 0..1 — the number on the marker label. */
  flatness: number;
  coverage: number;
  distanceM: number;
  cellCount: number;
}

/** Emitted once, at the end of the survey. */
export interface SurveyCompletePayload {
  /** 0..3 entries. A slot missing here means no site was found for it. */
  sites: SurveySite[];
  /** Slot of the highest-scoring site; "" when there are none. The one that pulses. */
  bestSlot: SiteSlot | "";
  pointCount: number;
  usablePointCount: number;
  cellCount: number;
  elapsedSec: number;
  /** True when the survey stopped early because it had enough surface. */
  earlyExit: boolean;
  distanceWarning: boolean;
  /** Fire-to-nearest-tent, metres. -1 when undefined. */
  fireToNearestTentM: number;
  requiredFireDistanceM: number;
  reason: string;
}

/** Emitted when the user pinch-taps a site marker. */
export interface SiteSelectedPayload {
  kind: "tent" | "fire";
  slot: SiteSlot;
  /** Centimetres, world. */
  position: XYZ;
  score: number;
  /** "pinch" | "debugKey" — how it was chosen. Diagnostics only. */
  source: string;
}

/** Emitted when the fire could not be placed clear of the tents. */
export interface DistanceWarningPayload {
  /** Uppercase, ready for the warning strip. */
  message: string;
  actualM: number;
  requiredM: number;
}
