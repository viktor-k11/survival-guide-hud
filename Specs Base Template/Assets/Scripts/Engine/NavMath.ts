/**
 * NavMath — PURE navigation maths. No scene access, no Lens types, no bus.
 *
 * Factored exactly like SiteSelection.ts and for the same reason: bearing,
 * distance, trail-following and decimation are the correctness core of the
 * return-to-camp feature, and LEAF must be able to exercise them on synthetic
 * input without Lens Studio in the loop.
 *
 * There is deliberately NO GPS in any of this. Spectacles expose a
 * LocationService, but geolocation does not work in Preview and there is no
 * physical device here — that code could not be tested anywhere. Camp and
 * marks are world positions in the same coordinate space the site markers
 * already use (CENTIMETRES on the bus), and everything below is plain maths
 * over two points.
 *
 * Bearings are measured on the XZ plane (height is tracking noise, not
 * direction): 0° = world -Z ("straight ahead" at boot), increasing clockwise
 * toward +X, range [0, 360).
 */

export interface NavPoint {
  x: number;
  y: number;
  z: number;
}

/** Horizontal (XZ) distance between two points. Units in = units out. */
export function distanceXZ(a: NavPoint, b: NavPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Bearing from `from` to `to`, degrees [0, 360). 0 = -Z, clockwise to +X. */
export function bearingDeg(from: NavPoint, to: NavPoint): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** The same bearing in radians, for feeding quat.angleAxis directly. */
export function bearingRad(from: NavPoint, to: NavPoint): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

/**
 * Index of the mark nearest to `pos` (XZ). -1 for an empty trail. The honest
 * place to START following: the user may not be standing at the trail's end.
 */
export function nearestMarkIndex(marks: NavPoint[], pos: NavPoint): number {
  let best = -1;
  let bestD = Number.MAX_VALUE;
  for (let i = 0; i < marks.length; i++) {
    const d = distanceXZ(marks[i], pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Walks the follow cursor HOME. Marks are recorded outward from camp, so
 * following runs from high indices down to 0; every mark within `reach` of the
 * user is consumed, and consuming index 0 (returning -1) means "head for camp
 * itself". Consumes multiple marks in one step when they cluster.
 */
export function advanceTrailCursor(marks: NavPoint[], pos: NavPoint, cursor: number, reach: number): number {
  let c = cursor;
  while (c >= 0 && c < marks.length && distanceXZ(marks[c], pos) <= reach) {
    c--;
  }
  return c;
}

/**
 * Halves a trail's resolution: keeps every second mark, first mark included.
 *
 * This is what runs when the fixed pool (hard rule 1) fills: the trail does
 * NOT truncate — coverage stays complete from camp to the walker, only the
 * spacing doubles. Unlimited range on a finite pool.
 */
export function decimate<T>(marks: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < marks.length; i += 2) out.push(marks[i]);
  return out;
}
