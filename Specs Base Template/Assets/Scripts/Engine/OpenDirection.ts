/**
 * OpenDirection — where to signal, as a pure function over the survey cloud.
 *
 * You signal toward where you can be seen: the sampled direction with the
 * deepest run of usable, level ground. PURE like SiteSelection/HazardScoring
 * — same cloud, same metre-space convention, no scene access — so LEAF can
 * feed it synthetic clouds and assert on the answer.
 *
 * Honest by construction: with no data, or with only a puddle of points at
 * the user's feet, the answer is null. A guide that invents a direction is
 * worse than one that admits it does not know (the last-known-bearing rule,
 * applied before the fact).
 */

import { SurveyPoint } from "./SiteSelection";

export interface OpenDirectionOptions {
  /** Azimuth bin count. 12 → 30° sectors. */
  binCount: number;
  /** A point counts as usable ground above this normal.y (matches the survey). */
  minUpDot: number;
  /** Fewer TOTAL usable points than this = no answer. */
  minUsablePoints: number;
  /** Fewer points than this in the winning sector = no answer. */
  minBinPoints: number;
}

export const DEFAULT_OPEN_DIRECTION_OPTIONS: OpenDirectionOptions = {
  binCount: 12,
  minUpDot: 0.85,
  minUsablePoints: 30,
  minBinPoints: 5,
};

export interface OpenDirectionResult {
  /** Degrees [0,360), 0 = world -Z, clockwise — the bus's bearing convention. */
  bearingDeg: number;
  /** Unit direction on the ground plane. */
  dirX: number;
  dirZ: number;
  /** How far the sampled ground reaches that way, metres — the sector's depth. */
  reachM: number;
  binPoints: number;
}

/**
 * @param points  survey cloud, METRES (SurveyController.toMetres output)
 * @param originM user position, metres, same space
 */
export function openDirection(
  points: SurveyPoint[],
  originM: { x: number; z: number },
  opts?: Partial<OpenDirectionOptions>
): OpenDirectionResult | null {
  const o = { ...DEFAULT_OPEN_DIRECTION_OPTIONS, ...(opts || {}) };
  if (!points || points.length === 0) return null;

  const counts: number[] = [];
  const reach: number[] = [];
  for (let b = 0; b < o.binCount; b++) {
    counts.push(0);
    reach.push(0);
  }

  let usable = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !p.normal || p.normal.y < o.minUpDot) continue;
    const dx = p.position.x - originM.x;
    const dz = p.position.z - originM.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.3) continue; // the ground underfoot says nothing about direction
    usable++;
    // Bearing: 0 = -Z (ahead), clockwise — atan2(x, -z) in this convention.
    let deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const bin = Math.min(o.binCount - 1, Math.floor((deg / 360) * o.binCount));
    counts[bin]++;
    if (dist > reach[bin]) reach[bin] = dist;
  }

  if (usable < o.minUsablePoints) return null;

  // Deepest sector wins; density breaks ties. Depth beats density because a
  // long clear line of sight matters more for being SEEN than a wide one.
  let best = -1;
  for (let b = 0; b < o.binCount; b++) {
    if (counts[b] < o.minBinPoints) continue;
    if (best < 0 || reach[b] > reach[best] || (reach[b] === reach[best] && counts[b] > counts[best])) {
      best = b;
    }
  }
  if (best < 0) return null;

  const centerDeg = ((best + 0.5) / o.binCount) * 360;
  const rad = (centerDeg * Math.PI) / 180;
  return {
    bearingDeg: centerDeg,
    dirX: Math.sin(rad),
    dirZ: -Math.cos(rad),
    reachM: reach[best],
    binPoints: counts[best],
  };
}
