/**
 * SosRhythm — the SOS prosign timing, as pure data and pure functions.
 *
 * PURE on purpose (no scene, no bus, no clock): the presenter asks "what is
 * the signal doing at time t" and LEAF can ask the same question on a bench.
 * Same factoring rule as SiteSelection / HazardScoring / NavMath.
 *
 * ## The timing, because a survival product that teaches wrong Morse is
 * ## embarrassing
 *
 * dot = 1 unit · dash = 3 units · gap BETWEEN ELEMENTS = 1 unit.
 * SOS is sent as ONE prosign (...---...), so there are NO inter-letter gaps —
 * the gap between the third dot and the first dash is the same 1 unit as any
 * other element gap. After the ninth element the signal rests ~7 units, then
 * repeats.
 *
 * 9 elements (3×1 + 3×3 + 3×1 = 15 units on) + 8 gaps (8 units) + 7 units of
 * pause = 30 units per cycle. At the default unit of 0.2 s that is a 6.0 s
 * cycle — inside the 5-7 s demo beat, and still unmistakably ...---... .
 */

export type SosElementKind = "dot" | "dash";

export interface SosElement {
  kind: SosElementKind;
  /** Element duration in units: dot 1, dash 3. */
  units: number;
  /** Cycle time at which the element starts, in units. */
  startUnits: number;
}

/** What the signal is doing at one instant. */
export interface SosSample {
  /** True while an element is sounding; false in gaps and the long pause. */
  on: boolean;
  /** Index 0..8 of the CURRENT element while on, else of the LAST element sent (-1 before the first). */
  elementIndex: number;
  kind: SosElementKind;
  /** True during the ~7-unit rest between prosigns — the "all sent" beat. */
  inPause: boolean;
  /** 0..1 progress through the whole cycle. */
  cycleT: number;
}

const GAP_UNITS = 1;
const PAUSE_UNITS = 7;

/** dot dot dot · dash dash dash · dot dot dot — one prosign, no letter gaps. */
export const SOS_ELEMENTS: SosElement[] = (() => {
  const kinds: SosElementKind[] = ["dot", "dot", "dot", "dash", "dash", "dash", "dot", "dot", "dot"];
  const out: SosElement[] = [];
  let clock = 0;
  for (let i = 0; i < kinds.length; i++) {
    const units = kinds[i] === "dash" ? 3 : 1;
    out.push({ kind: kinds[i], units: units, startUnits: clock });
    clock += units + GAP_UNITS;
  }
  return out;
})();

/** Units in one full cycle: prosign (last gap folded into the pause) + rest. */
export const SOS_CYCLE_UNITS = (() => {
  const last = SOS_ELEMENTS[SOS_ELEMENTS.length - 1];
  return last.startUnits + last.units + PAUSE_UNITS;
})();

/**
 * Sample the rhythm at `tSec` since the signal started, for a given unit
 * length. Time wraps — the signal repeats forever.
 */
export function sosSampleAt(tSec: number, unitSec: number): SosSample {
  const cycleSec = SOS_CYCLE_UNITS * unitSec;
  const safeCycle = cycleSec > 0.0001 ? cycleSec : 0.0001;
  let t = tSec % safeCycle;
  if (t < 0) t += safeCycle;
  const u = t / unitSec;

  let lastIndex = -1;
  for (let i = 0; i < SOS_ELEMENTS.length; i++) {
    const e = SOS_ELEMENTS[i];
    if (u >= e.startUnits && u < e.startUnits + e.units) {
      return {
        on: true,
        elementIndex: i,
        kind: e.kind,
        inPause: false,
        cycleT: u / SOS_CYCLE_UNITS,
      };
    }
    if (u >= e.startUnits) lastIndex = i;
  }

  const last = SOS_ELEMENTS[SOS_ELEMENTS.length - 1];
  const inPause = u >= last.startUnits + last.units;
  return {
    on: false,
    elementIndex: lastIndex,
    kind: lastIndex >= 0 ? SOS_ELEMENTS[lastIndex].kind : "dot",
    inPause: inPause,
    cycleT: u / SOS_CYCLE_UNITS,
  };
}
