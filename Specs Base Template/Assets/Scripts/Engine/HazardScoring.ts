/**
 * Hazard scoring — PURE. The second, opposite judgement over the SAME cloud.
 *
 * ############################################################################
 * # NOTHING IN HERE MAY TOUCH THE SCENE, THE CLOCK, OR WORLD QUERY.          #
 * # Input: a point cloud. Output: ranked hazards. Same cloud in, same        #
 * # hazards out, forever — testable from synthetic clouds with no Lens       #
 * # Studio in the loop (hard rule 5), exactly like SiteSelection.ts.         #
 * ############################################################################
 *
 * SiteSelection answers "where SHOULD you camp"; this answers "where should
 * you NOT". They are two judgements over one input and deliberately do not
 * import each other — SurveyController runs both over the same cloud in the
 * same pass and wires the results together (hazards PENALISE candidate sites
 * through SiteSelectionOptions.penaltyZones; they never veto).
 *
 * UNITS ARE METRES, Y IS UP — same conventions, same reasons.
 *
 * Three hazard kinds, each with a number the label can carry (a hazard the
 * user cannot interpret is decoration):
 *   steep  — mean surface normal deviates from vertical beyond a threshold.
 *            value = slope in degrees.
 *   hollow — a local depression relative to its neighbourhood: where water
 *            will collect in rain. value = depth in metres.
 *   broken — high normal variance across a neighbourhood: rubble, roots,
 *            churned ground. value = mean normal spread in degrees.
 */

import { SurveyPoint, Vec3Like } from "./SiteSelection";

export type HazardKind = "steep" | "hollow" | "broken";

export interface HazardCandidate {
  kind: HazardKind;
  /** Centre of the hazardous patch, on the surface. Metres. */
  position: Vec3Like;
  /** 0..1 — how bad. Ranks the list and scales the site penalty. */
  severity: number;
  /** The number for the label: degrees (steep/broken) or metres (hollow). */
  value: number;
  /** Occupied cells behind the verdict — evidence, like SiteCandidate.cellCount. */
  cellCount: number;
}

export interface HazardOptions {
  /** Grid resolution, metres. Match the site scorer so both judge the same cells. */
  cellSizeM: number;
  /** A cell's mean slope beyond this many degrees is a steepness hazard. */
  steepThresholdDeg: number;
  /** Slope at which steepness severity saturates at 1. */
  steepMaxDeg: number;
  /** A cell this many metres below its neighbourhood mean collects water. */
  hollowThresholdM: number;
  /** Depth at which hollow severity saturates. */
  hollowMaxM: number;
  /** Mean normal spread (degrees) across a neighbourhood beyond this is broken ground. */
  brokenThresholdDeg: number;
  /** Spread at which broken severity saturates. */
  brokenMaxDeg: number;
  /** Cells with fewer points than this are noise, not evidence. */
  minCellPoints: number;
  /** Neighbourhood radius in CELLS for hollow/broken statistics. */
  neighbourhoodCells: number;
  /** Two hazards closer than this are the same patch of bad ground. */
  minSeparationM: number;
  /** Keep at most this many, best-ranked. The marker pool is the hard cap. */
  maxHazards: number;
  /** Drop candidates below this severity — barely-bad ground is not a warning. */
  minSeverity: number;
}

export const DEFAULT_HAZARD_OPTIONS: HazardOptions = {
  cellSizeM: 0.25,
  steepThresholdDeg: 25,
  steepMaxDeg: 55,
  hollowThresholdM: 0.15,
  hollowMaxM: 0.5,
  brokenThresholdDeg: 18,
  brokenMaxDeg: 45,
  minCellPoints: 1,
  neighbourhoodCells: 2,
  minSeparationM: 2.0,
  maxHazards: 3,
  minSeverity: 0.15,
};

interface HCell {
  ix: number;
  iz: number;
  cx: number;
  cz: number;
  count: number;
  sumY: number;
  sumNx: number;
  sumNy: number;
  sumNz: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function key(ix: number, iz: number): string {
  return ix + ":" + iz;
}

const RAD2DEG = 180 / Math.PI;

/**
 * Bins EVERY point — unlike the site scorer, walls and slopes are exactly what
 * this judgement is about, so there is no minUpDot gate here.
 */
function binAll(points: SurveyPoint[], size: number): { [k: string]: HCell } {
  const cells: { [k: string]: HCell } = {};
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !p.position || !p.normal) continue;
    const n = p.normal;
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    if (len <= 0) continue;

    const ix = Math.floor(p.position.x / size);
    const iz = Math.floor(p.position.z / size);
    const k = key(ix, iz);
    let c = cells[k];
    if (!c) {
      c = { ix: ix, iz: iz, cx: (ix + 0.5) * size, cz: (iz + 0.5) * size, count: 0, sumY: 0, sumNx: 0, sumNy: 0, sumNz: 0 };
      cells[k] = c;
    }
    c.count++;
    c.sumY += p.position.y;
    c.sumNx += n.x / len;
    c.sumNy += n.y / len;
    c.sumNz += n.z / len;
  }
  return cells;
}

function sortedKeys(cells: { [k: string]: HCell }): string[] {
  const keys: string[] = [];
  for (const k in cells) {
    if (Object.prototype.hasOwnProperty.call(cells, k)) keys.push(k);
  }
  keys.sort((a, b) => {
    const ca = cells[a];
    const cb = cells[b];
    if (ca.ix !== cb.ix) return ca.ix - cb.ix;
    return ca.iz - cb.iz;
  });
  return keys;
}

function mergeOptions(overrides?: Partial<HazardOptions>): HazardOptions {
  const o: HazardOptions = {
    cellSizeM: DEFAULT_HAZARD_OPTIONS.cellSizeM,
    steepThresholdDeg: DEFAULT_HAZARD_OPTIONS.steepThresholdDeg,
    steepMaxDeg: DEFAULT_HAZARD_OPTIONS.steepMaxDeg,
    hollowThresholdM: DEFAULT_HAZARD_OPTIONS.hollowThresholdM,
    hollowMaxM: DEFAULT_HAZARD_OPTIONS.hollowMaxM,
    brokenThresholdDeg: DEFAULT_HAZARD_OPTIONS.brokenThresholdDeg,
    brokenMaxDeg: DEFAULT_HAZARD_OPTIONS.brokenMaxDeg,
    minCellPoints: DEFAULT_HAZARD_OPTIONS.minCellPoints,
    neighbourhoodCells: DEFAULT_HAZARD_OPTIONS.neighbourhoodCells,
    minSeparationM: DEFAULT_HAZARD_OPTIONS.minSeparationM,
    maxHazards: DEFAULT_HAZARD_OPTIONS.maxHazards,
    minSeverity: DEFAULT_HAZARD_OPTIONS.minSeverity,
  };
  if (!overrides) return o;
  for (const k in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      const v = (overrides as any)[k];
      if (typeof v === "number" && !isNaN(v)) (o as any)[k] = v;
    }
  }
  return o;
}

/**
 * THE entry point. Point cloud in, ranked hazards out — worst first, spaced by
 * minSeparationM, capped at maxHazards. Never throws; an empty or benign cloud
 * simply returns an empty list, because "no hazards seen" is a real answer.
 */
export function scoreHazards(points: SurveyPoint[], overrides?: Partial<HazardOptions>): HazardCandidate[] {
  const o = mergeOptions(overrides);
  const cells = binAll(points || [], o.cellSizeM);
  const keys = sortedKeys(cells);
  if (keys.length === 0) return [];

  const candidates: HazardCandidate[] = [];
  const reach = Math.max(1, Math.round(o.neighbourhoodCells));

  for (let ki = 0; ki < keys.length; ki++) {
    const c = cells[keys[ki]];
    if (c.count < o.minCellPoints) continue;

    const meanY = c.sumY / c.count;
    const nx = c.sumNx / c.count;
    const ny = c.sumNy / c.count;
    const nz = c.sumNz / c.count;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const upDot = nLen > 0 ? clamp01(ny / nLen) : 1;
    const slopeDeg = Math.acos(upDot) * RAD2DEG;

    // --- neighbourhood statistics (shared by hollow and broken) ----------
    let nCells = 0;
    let nSumY = 0;
    let spreadSumDeg = 0;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nb = cells[key(c.ix + dx, c.iz + dz)];
        if (!nb || nb.count < o.minCellPoints) continue;
        nCells++;
        nSumY += nb.sumY / nb.count;
        // Angle between this neighbour's mean normal and the centre cell's.
        const bx = nb.sumNx / nb.count;
        const by = nb.sumNy / nb.count;
        const bz = nb.sumNz / nb.count;
        const bLen = Math.sqrt(bx * bx + by * by + bz * bz);
        if (bLen > 0 && nLen > 0) {
          const dot = clamp01((nx * bx + ny * by + nz * bz) / (nLen * bLen));
          spreadSumDeg += Math.acos(dot) * RAD2DEG;
        }
      }
    }

    // --- steep -----------------------------------------------------------
    if (slopeDeg >= o.steepThresholdDeg) {
      candidates.push({
        kind: "steep",
        position: { x: c.cx, y: meanY, z: c.cz },
        severity: clamp01((slopeDeg - o.steepThresholdDeg) / Math.max(1, o.steepMaxDeg - o.steepThresholdDeg)) * 0.7 + 0.3,
        value: Math.round(slopeDeg),
        cellCount: c.count,
      });
    }

    if (nCells >= 3) {
      // --- hollow: this cell sits below its neighbourhood ---------------
      const depth = nSumY / nCells - meanY;
      if (depth >= o.hollowThresholdM) {
        candidates.push({
          kind: "hollow",
          position: { x: c.cx, y: meanY, z: c.cz },
          severity: clamp01((depth - o.hollowThresholdM) / Math.max(0.01, o.hollowMaxM - o.hollowThresholdM)) * 0.7 + 0.3,
          value: Math.round(depth * 100) / 100,
          cellCount: c.count,
        });
      }

      // --- broken: normals disagree across the neighbourhood ------------
      const spreadDeg = spreadSumDeg / nCells;
      if (spreadDeg >= o.brokenThresholdDeg) {
        candidates.push({
          kind: "broken",
          position: { x: c.cx, y: meanY, z: c.cz },
          severity: clamp01((spreadDeg - o.brokenThresholdDeg) / Math.max(1, o.brokenMaxDeg - o.brokenThresholdDeg)) * 0.7 + 0.3,
          value: Math.round(spreadDeg),
          cellCount: c.count,
        });
      }
    }
  }

  // Worst first; deterministic total order (the SiteSelection tie rule).
  candidates.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.position.z - b.position.z;
  });

  // Greedy spacing: the worst patch wins its neighbourhood; the pool is small
  // and three markers on one rubble pile is one warning said three times.
  const out: HazardCandidate[] = [];
  for (let i = 0; i < candidates.length && out.length < o.maxHazards; i++) {
    const c = candidates[i];
    if (c.severity < o.minSeverity) break;
    let clear = true;
    for (let j = 0; j < out.length; j++) {
      const dx = c.position.x - out[j].position.x;
      const dz = c.position.z - out[j].position.z;
      if (Math.sqrt(dx * dx + dz * dz) < o.minSeparationM) {
        clear = false;
        break;
      }
    }
    if (clear) out.push(c);
  }
  return out;
}
