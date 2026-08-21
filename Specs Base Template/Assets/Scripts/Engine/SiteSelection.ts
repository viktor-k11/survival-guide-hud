/**
 * Site selection — PURE. This file is the whole of the survey's mathematics.
 *
 * ############################################################################
 * # NOTHING IN HERE MAY TOUCH THE SCENE, THE CLOCK, OR WORLD QUERY.          #
 * #                                                                          #
 * # No SceneObject, no Transform, no vec3, no getTime(), no print(), no      #
 * # WorldQueryModule, no randomness. Input: a point cloud. Output: ranked     #
 * # sites. Same cloud in, same sites out, forever.                            #
 * #                                                                          #
 * # That is what lets the scoring be tested from synthetic clouds with no    #
 * # Lens Studio in the loop (hard rule 5). SurveyController owns every        #
 * # impure thing — raycasts, timing, units, events — and calls in here.       #
 * ############################################################################
 *
 * UNITS ARE METRES. The Lens runtime works in centimetres; SurveyController
 * converts on the way in and on the way out. Keeping the maths in metres means
 * the constants below read exactly like the spec they came from ("2.5 m
 * rectangle", "at least 3 m from every tent") instead of being 100x numbers
 * nobody can sanity-check.
 *
 * Y IS UP, matching Lens Studio. Distances between sites are measured in the
 * XZ plane only: two spots 3 m apart on the ground are 3 m apart whether or not
 * one is slightly higher.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** One raycast hit: where it landed and which way the surface faces. */
export interface SurveyPoint {
  position: Vec3Like;
  normal: Vec3Like;
}

export type SiteKind = "tent" | "fire";

export interface SiteCandidate {
  kind: SiteKind;
  /** Centre of the footprint, on the surface. Metres. */
  position: Vec3Like;
  /** Mean surface normal across the footprint. */
  normal: Vec3Like;
  /** 0..1 — how level the footprint is. This is the number on the marker label. */
  flatness: number;
  /** 0..1 — how much of the required footprint actually has surface under it. */
  coverage: number;
  /** 0..1 — how sensible the walk to it is. */
  distanceScore: number;
  /** Combined ranking score, 0..1. */
  score: number;
  /** Metres from the user, XZ only. */
  distanceM: number;
  /** Occupied grid cells inside the footprint — how much evidence this site rests on. */
  cellCount: number;
}

export interface SiteSelectionResult {
  /** Best first. 0..2 entries. */
  tents: SiteCandidate[];
  /** null only when there is no usable surface at all. */
  fire: SiteCandidate | null;
  /**
   * True when the fire had to be placed closer to a tent than minFireToTentM.
   * The fire is still placed — a survey that refuses to answer is worse than
   * one that answers and flags the problem.
   */
  distanceWarning: boolean;
  /** Actual distance from the fire to the NEAREST tent, metres. -1 when undefined. */
  fireToNearestTentM: number;
  // --- diagnostics; these are what the survey reports in the log -----------
  pointCount: number;
  usablePointCount: number;
  cellCount: number;
  tentCandidateCount: number;
  fireCandidateCount: number;
  /** Human-readable account of what happened. Never empty. */
  reason: string;
}

export interface SiteSelectionOptions {
  /** Grid resolution for binning points, metres. Smaller = finer, slower. */
  cellSizeM: number;
  /** A surface counts as ground when normal.y is at least this. 1 = perfectly level. */
  minUpDot: number;
  /** Tent needs roughly this square, metres a side. */
  tentFootprintM: number;
  /** Fire needs roughly this circle, metres across. */
  fireFootprintM: number;
  /** HARD constraint: fire at least this far from every tent candidate. */
  minFireToTentM: number;
  /** Two tent suggestions closer than this are the same site twice, not a choice. */
  minTentSeparationM: number;
  /** Closer than this and the user is standing on it. */
  preferredMinDistanceM: number;
  /** Beyond this the walk starts to cost something. */
  preferredMaxDistanceM: number;
  /** Beyond this it is not a suggestion, it is a hike. */
  maxDistanceM: number;
  /** Height spread across the footprint that scores flatness 0, metres. */
  flatnessToleranceM: number;
  /** Below this coverage the footprint does not fit and the candidate is dropped. */
  minCoverage: number;
  /** Below this flatness it is not a site, whatever else it scores. */
  minFlatness: number;
  /** Exponents on the three factors. Higher = that factor dominates. */
  weightFlatness: number;
  weightCoverage: number;
  weightDistance: number;
  /**
   * How hard a penalty zone at full strength drags a candidate down, 0..1.
   * 0.25 = a candidate dead-centre in a severity-1 zone loses a quarter of its
   * score. A PENALTY, never a veto: the multiplier bottoms out at
   * (1 - weightHazardPenalty), so a hazardous site still ranks and can still
   * win when everything else is worse — "here, but watch the slope" beats
   * "no campsite found".
   */
  weightHazardPenalty: number;
  /**
   * Places candidate sites should avoid, as GENERIC zones — this file stays
   * ignorant of what produced them (today: HazardScoring.ts, via the
   * controller). Metres, XZ.
   */
  penaltyZones?: PenaltyZone[];
}

/** A spot to keep away from: penalty falls off linearly to zero at radiusM. */
export interface PenaltyZone {
  x: number;
  z: number;
  radiusM: number;
  /** 0..1 — scales the penalty. */
  severity: number;
}

export const DEFAULT_SITE_OPTIONS: SiteSelectionOptions = {
  cellSizeM: 0.25,
  minUpDot: 0.85,
  tentFootprintM: 2.5,
  fireFootprintM: 1.2,
  minFireToTentM: 3.0,
  minTentSeparationM: 3.0,
  preferredMinDistanceM: 1.5,
  preferredMaxDistanceM: 6.0,
  maxDistanceM: 12.0,
  flatnessToleranceM: 0.12,
  minCoverage: 0.6,
  minFlatness: 0.35,
  weightFlatness: 1.0,
  weightCoverage: 1.0,
  weightDistance: 0.8,
  weightHazardPenalty: 0.25,
};

/** One binned patch of ground. */
interface Cell {
  ix: number;
  iz: number;
  cx: number;
  cz: number;
  count: number;
  sumY: number;
  minY: number;
  maxY: number;
  sumNx: number;
  sumNy: number;
  sumNz: number;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function key(ix: number, iz: number): string {
  return ix + ":" + iz;
}

/**
 * Ranks every occupied cell as a possible site of one kind.
 *
 * Exported because the tent and fire passes are the same computation with a
 * different footprint, and because a test may want the ranking without the
 * selection rules on top.
 */
export function scoreCandidates(
  points: SurveyPoint[],
  userPosition: Vec3Like,
  kind: SiteKind,
  options: SiteSelectionOptions
): SiteCandidate[] {
  const cells = binPoints(points, options);
  return scoreCells(cells, userPosition, kind, options);
}

function binPoints(points: SurveyPoint[], options: SiteSelectionOptions): { [k: string]: Cell } {
  const cells: { [k: string]: Cell } = {};
  const size = options.cellSizeM;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !p.position || !p.normal) continue;

    const n = p.normal;
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    if (len <= 0) continue;
    const upDot = n.y / len;
    if (upDot < options.minUpDot) continue; // a wall is not a campsite

    const ix = Math.floor(p.position.x / size);
    const iz = Math.floor(p.position.z / size);
    const k = key(ix, iz);
    let c = cells[k];
    if (!c) {
      c = {
        ix: ix,
        iz: iz,
        cx: (ix + 0.5) * size,
        cz: (iz + 0.5) * size,
        count: 0,
        sumY: 0,
        minY: p.position.y,
        maxY: p.position.y,
        sumNx: 0,
        sumNy: 0,
        sumNz: 0,
      };
      cells[k] = c;
    }
    c.count++;
    c.sumY += p.position.y;
    if (p.position.y < c.minY) c.minY = p.position.y;
    if (p.position.y > c.maxY) c.maxY = p.position.y;
    c.sumNx += n.x / len;
    c.sumNy += n.y / len;
    c.sumNz += n.z / len;
  }
  return cells;
}

function scoreCells(
  cells: { [k: string]: Cell },
  userPosition: Vec3Like,
  kind: SiteKind,
  options: SiteSelectionOptions
): SiteCandidate[] {
  const size = options.cellSizeM;
  const isCircle = kind === "fire";
  const footprint = isCircle ? options.fireFootprintM : options.tentFootprintM;
  const half = footprint / 2;
  const reach = Math.ceil(half / size);

  // How many cells a perfectly covered footprint would occupy. Compared against
  // the occupied count to get coverage, so a site half over a cliff scores low.
  const expected = isCircle ? (Math.PI * half * half) / (size * size) : (footprint * footprint) / (size * size);

  const out: SiteCandidate[] = [];
  const keys = sortedKeys(cells);

  for (let ki = 0; ki < keys.length; ki++) {
    const centre = cells[keys[ki]];
    let occupied = 0;
    let sumMeanY = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumNx = 0;
    let sumNy = 0;
    let sumNz = 0;

    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const c = cells[key(centre.ix + dx, centre.iz + dz)];
        if (!c) continue;
        const offX = c.cx - centre.cx;
        const offZ = c.cz - centre.cz;
        if (isCircle) {
          if (offX * offX + offZ * offZ > half * half) continue;
        } else {
          if (Math.abs(offX) > half || Math.abs(offZ) > half) continue;
        }
        occupied++;
        const meanY = c.sumY / c.count;
        sumMeanY += meanY;
        if (c.minY < minY) minY = c.minY;
        if (c.maxY > maxY) maxY = c.maxY;
        sumNx += c.sumNx / c.count;
        sumNy += c.sumNy / c.count;
        sumNz += c.sumNz / c.count;
      }
    }

    if (occupied === 0) continue;

    const coverage = clamp01(occupied / expected);
    if (coverage < options.minCoverage) continue;

    // Flatness is two things at once: the ground does not step (height spread)
    // and it faces up (mean normal). A ramp passes the first and fails the
    // second; a flat patch split by a kerb passes the second and fails the first.
    const spread = maxY - minY;
    const spreadScore = clamp01(1 - spread / options.flatnessToleranceM);
    const meanNy = sumNy / occupied;
    const levelScore = clamp01((meanNy - options.minUpDot) / (1 - options.minUpDot));
    const flatness = spreadScore * levelScore;
    if (flatness < options.minFlatness) continue;

    const meanY = sumMeanY / occupied;
    const dx2 = centre.cx - userPosition.x;
    const dz2 = centre.cz - userPosition.z;
    const distanceM = Math.sqrt(dx2 * dx2 + dz2 * dz2);
    const distanceScore = scoreDistance(distanceM, options);
    if (distanceScore <= 0) continue;

    // Hazard penalty: the worst overlapping zone drags the score down, floor
    // (1 - weightHazardPenalty). Never a veto — see the option's comment.
    let hazardHit = 0;
    const zones = options.penaltyZones;
    if (zones) {
      for (let zi = 0; zi < zones.length; zi++) {
        const z = zones[zi];
        if (!z || z.radiusM <= 0) continue;
        const zdx = centre.cx - z.x;
        const zdz = centre.cz - z.z;
        const zd = Math.sqrt(zdx * zdx + zdz * zdz);
        if (zd >= z.radiusM) continue;
        const hit = clamp01(z.severity) * (1 - zd / z.radiusM);
        if (hit > hazardHit) hazardHit = hit;
      }
    }

    const score =
      Math.pow(flatness, options.weightFlatness) *
      Math.pow(coverage, options.weightCoverage) *
      Math.pow(distanceScore, options.weightDistance) *
      (1 - clamp01(options.weightHazardPenalty) * hazardHit);

    out.push({
      kind: kind,
      position: { x: centre.cx, y: meanY, z: centre.cz },
      normal: normalise({ x: sumNx / occupied, y: meanNy, z: sumNz / occupied }),
      flatness: flatness,
      coverage: coverage,
      distanceScore: distanceScore,
      score: score,
      distanceM: distanceM,
      cellCount: occupied,
    });
  }

  // Total order, never a tie: two cells with identical scores must still rank
  // in the same order on every run or the "best" marker would flicker between
  // them across surveys of the same terrain.
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Nearer first: if two spots really are equally good, the shorter walk wins.
    if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.position.z - b.position.z;
  });
  return out;
}

/** Deterministic cell iteration order, independent of insertion order. */
function sortedKeys(cells: { [k: string]: Cell }): string[] {
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

/**
 * Peaks in the MIDDLE of the comfortable band and falls away on both sides:
 * 1.0 at the midpoint, BAND_EDGE_SCORE at the band edges, 0 at the user's feet
 * and at maxDistanceM. Underfoot and over the horizon are both bad suggestions.
 *
 * A flat plateau across the band was the first version, and it was wrong for a
 * reason worth recording: on genuinely uniform ground — a flat lawn, or the
 * Preview's simulated floor — flatness and coverage are 1.0 everywhere, so a
 * plateau made EVERY candidate score exactly 1.000 and the winner fell out of
 * the coordinate tiebreak. The survey confidently marked the far corner of the
 * sampled patch, which is deterministic and useless. A peak means "the middle
 * of comfortable walking distance" always wins a tie, which is a real
 * preference rather than an artefact of iteration order.
 */
const BAND_EDGE_SCORE = 0.85;

function scoreDistance(d: number, o: SiteSelectionOptions): number {
  if (d <= 0) return 0;
  if (d >= o.maxDistanceM) return 0;

  const lo = o.preferredMinDistanceM;
  const hi = o.preferredMaxDistanceM;

  if (d < lo) return lo > 0 ? clamp01(d / lo) * BAND_EDGE_SCORE : BAND_EDGE_SCORE;

  if (d > hi) {
    const span = o.maxDistanceM - hi;
    if (span <= 0) return 0;
    return clamp01((o.maxDistanceM - d) / span) * BAND_EDGE_SCORE;
  }

  const mid = (lo + hi) / 2;
  const halfBand = (hi - lo) / 2;
  if (halfBand <= 0) return 1;
  return 1 - (1 - BAND_EDGE_SCORE) * clamp01(Math.abs(d - mid) / halfBand);
}

function normalise(v: Vec3Like): Vec3Like {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len <= 0) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function distanceXZ(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function mergeOptions(overrides?: Partial<SiteSelectionOptions>): SiteSelectionOptions {
  const o: SiteSelectionOptions = {
    cellSizeM: DEFAULT_SITE_OPTIONS.cellSizeM,
    minUpDot: DEFAULT_SITE_OPTIONS.minUpDot,
    tentFootprintM: DEFAULT_SITE_OPTIONS.tentFootprintM,
    fireFootprintM: DEFAULT_SITE_OPTIONS.fireFootprintM,
    minFireToTentM: DEFAULT_SITE_OPTIONS.minFireToTentM,
    minTentSeparationM: DEFAULT_SITE_OPTIONS.minTentSeparationM,
    preferredMinDistanceM: DEFAULT_SITE_OPTIONS.preferredMinDistanceM,
    preferredMaxDistanceM: DEFAULT_SITE_OPTIONS.preferredMaxDistanceM,
    maxDistanceM: DEFAULT_SITE_OPTIONS.maxDistanceM,
    flatnessToleranceM: DEFAULT_SITE_OPTIONS.flatnessToleranceM,
    minCoverage: DEFAULT_SITE_OPTIONS.minCoverage,
    minFlatness: DEFAULT_SITE_OPTIONS.minFlatness,
    weightFlatness: DEFAULT_SITE_OPTIONS.weightFlatness,
    weightCoverage: DEFAULT_SITE_OPTIONS.weightCoverage,
    weightDistance: DEFAULT_SITE_OPTIONS.weightDistance,
    weightHazardPenalty: DEFAULT_SITE_OPTIONS.weightHazardPenalty,
  };
  if (!overrides) return o;
  for (const k in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      const v = (overrides as any)[k];
      if (typeof v === "number" && !isNaN(v)) (o as any)[k] = v;
    }
  }
  if (overrides.penaltyZones) o.penaltyZones = overrides.penaltyZones;
  return o;
}

/**
 * THE entry point. Point cloud in, ranked sites out.
 *
 * Selection rules, in order:
 *   1. Tent A  = highest-scoring 2.5 m footprint.
 *   2. Tent B  = highest-scoring remaining footprint at least minTentSeparationM
 *                from A. Two markers on the same patch of grass is not a choice.
 *   3. Fire    = highest-scoring 1.2 m footprint at least minFireToTentM from
 *                EVERY selected tent. If no candidate satisfies that, the best
 *                available spot is used and distanceWarning is raised.
 *
 * Never throws. An empty or unusable cloud comes back as empty lists with a
 * reason, because "no sites here" is a real answer the HUD has to render.
 */
export function selectSites(
  points: SurveyPoint[],
  userPosition: Vec3Like,
  overrides?: Partial<SiteSelectionOptions>
): SiteSelectionResult {
  const o = mergeOptions(overrides);
  const cloud = points || [];
  const user = userPosition || { x: 0, y: 0, z: 0 };

  const cells = binPoints(cloud, o);
  const keys = sortedKeys(cells);
  let usable = 0;
  for (let i = 0; i < keys.length; i++) usable += cells[keys[i]].count;

  const empty = (reason: string): SiteSelectionResult => ({
    tents: [],
    fire: null,
    distanceWarning: false,
    fireToNearestTentM: -1,
    pointCount: cloud.length,
    usablePointCount: usable,
    cellCount: keys.length,
    tentCandidateCount: 0,
    fireCandidateCount: 0,
    reason: reason,
  });

  if (cloud.length === 0) return empty("No points sampled.");
  if (keys.length === 0) return empty("No up-facing surface in " + cloud.length + " points.");

  const tentRanked = scoreCells(cells, user, "tent", o);
  const fireRanked = scoreCells(cells, user, "fire", o);

  const tents: SiteCandidate[] = [];
  for (let i = 0; i < tentRanked.length && tents.length < 2; i++) {
    const c = tentRanked[i];
    let farEnough = true;
    for (let t = 0; t < tents.length; t++) {
      if (distanceXZ(c.position, tents[t].position) < o.minTentSeparationM) {
        farEnough = false;
        break;
      }
    }
    if (farEnough) tents.push(c);
  }

  // Fire: first choice is a candidate clear of every tent. Fall back to the
  // best spot and warn rather than returning no fire at all.
  let fire: SiteCandidate | null = null;
  let distanceWarning = false;
  for (let i = 0; i < fireRanked.length; i++) {
    const c = fireRanked[i];
    let clear = true;
    for (let t = 0; t < tents.length; t++) {
      if (distanceXZ(c.position, tents[t].position) < o.minFireToTentM) {
        clear = false;
        break;
      }
    }
    if (clear) {
      fire = c;
      break;
    }
  }
  if (fire === null && fireRanked.length > 0) {
    fire = fireRanked[0];
    distanceWarning = tents.length > 0;
  }

  let nearest = -1;
  if (fire && tents.length > 0) {
    nearest = distanceXZ(fire.position, tents[0].position);
    for (let t = 1; t < tents.length; t++) {
      const d = distanceXZ(fire.position, tents[t].position);
      if (d < nearest) nearest = d;
    }
  }

  const reasons: string[] = [];
  if (tents.length === 0) reasons.push("no tent footprint met the flatness/coverage floor");
  else if (tents.length === 1) reasons.push("only one tent site clear of the others by " + o.minTentSeparationM + " m");
  if (fire === null) reasons.push("no fire footprint met the flatness/coverage floor");
  else if (distanceWarning) {
    reasons.push(
      "fire placed " + nearest.toFixed(2) + " m from the nearest tent, under the " + o.minFireToTentM + " m minimum"
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      "tents " + tents.length + ", fire clear by " + (nearest >= 0 ? nearest.toFixed(2) + " m" : "n/a")
    );
  }

  return {
    tents: tents,
    fire: fire,
    distanceWarning: distanceWarning,
    fireToNearestTentM: nearest,
    pointCount: cloud.length,
    usablePointCount: usable,
    cellCount: keys.length,
    tentCandidateCount: tentRanked.length,
    fireCandidateCount: fireRanked.length,
    reason: reasons.join("; "),
  };
}
