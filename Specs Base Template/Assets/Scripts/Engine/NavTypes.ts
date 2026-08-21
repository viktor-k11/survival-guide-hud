/**
 * Payload shapes for camp / trail / navigation events. TYPES ONLY — no logic,
 * no scene access. Same reason SurveyTypes.ts exists: the presenters (trail
 * stakes, compass rose, menu chips, status line) render this state and must
 * not import NavigationController to do it.
 *
 * POSITIONS ARE CENTIMETRES, world space — the same convention the whole bus
 * uses. Ground-level y, ready for setWorldPosition at the mark's base.
 */

import { XYZ } from "./SurveyTypes";

/** A footer chip (or its voice twin) was activated. */
export interface MenuChipPayload {
  chip: "setCamp" | "trailStart" | "followTrail";
  /** "pinch" | "voice" | "debugKey" — diagnostics only. */
  source: string;
}

/** Trail recorder state — emitted on every change, incl. each dropped mark. */
export interface TrailStatePayload {
  recording: boolean;
  /** Ground positions of the live marks, oldest (nearest camp) first. ≤ pool size. */
  marksCm: XYZ[];
  markCount: number;
  /** Path length walked while recording, metres. */
  pathM: number;
  /** Current spacing between marks — doubles on every decimation. */
  spacingCm: number;
  /** How many times the pool overflowed and the trail halved its resolution. */
  decimations: number;
}

/** The engine entered NAVIGATE and says which return mode to run. */
export interface NavigateRequestPayload {
  navMode: "bearing" | "trail";
}

/** Live navigation state, throttled to meaningful changes. */
export interface NavigateUpdatePayload {
  active: boolean;
  navMode: "bearing" | "trail";
  /** What the compass points at RIGHT NOW: camp, or the next trail mark. */
  targetCm: XYZ;
  /** Degrees [0,360), 0 = world -Z, clockwise. */
  bearingDeg: number;
  /** User-to-CAMP distance, metres — the number on the readout. */
  distanceM: number;
  /** Follow cursor; marks with index > this are behind the user (dimmed). -1 = heading for camp itself. */
  nextMarkIndex: number;
  /** Tracking is gone; bearing/distance are the LAST KNOWN values, and the UI must say so. */
  lastKnown: boolean;
}

/** The user made it back. */
export interface CampReachedPayload {
  /** Final distance at the moment of arrival, metres. */
  distanceM: number;
}
