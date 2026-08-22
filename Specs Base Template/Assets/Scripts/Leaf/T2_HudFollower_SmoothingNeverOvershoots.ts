/**
 * Tier 2 — the pure functions. No scene, no fixtures, no network: these
 * modules were deliberately factored with no scene access precisely so this
 * file could exist. Cheapest tests in the project; if one of these fails the
 * fault is in the maths, not the wiring.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";

import { bearingDeg, distanceXZ, decimate, NavPoint } from "../Engine/NavMath";
import { scoreHazards } from "../Engine/HazardScoring";
import { selectSites, SurveyPoint } from "../Engine/SiteSelection";
import { validateLesson } from "../Engine/LessonValidator";
import { followStep, followAlpha } from "../Engine/HudFollower";
import {
  GW_BACKGROUND,
  GW_NARRATION,
  GW_USER,
  gatewayDropPending,
  gatewaySubmit,
  gatewayWasDropped,
} from "../Engine/GatewayQueue";

// ---------------------------------------------------------------- clouds

/** A flat, clean disc of ground around the origin. Metres. */
function cleanCloud(radiusM: number, stepM: number, yM: number = 0): SurveyPoint[] {
  const out: SurveyPoint[] = [];
  for (let x = -radiusM; x <= radiusM; x += stepM) {
    for (let z = -radiusM; z <= radiusM; z += stepM) {
      if (x * x + z * z > radiusM * radiusM) continue;
      out.push({ position: { x: x, y: yM, z: z }, normal: { x: 0, y: 1, z: 0 } });
    }
  }
  return out;
}

/** Tilts a patch of the cloud: steep normals + sloped heights. */
function addSteepPatch(cloud: SurveyPoint[], cx: number, cz: number, r: number): void {
  for (let i = 0; i < cloud.length; i++) {
    const p = cloud[i];
    const dx = p.position.x - cx;
    const dz = p.position.z - cz;
    if (dx * dx + dz * dz > r * r) continue;
    // ~60° slope: the ground rises hard across the patch, normals lean over.
    p.position.y = (p.position.x - (cx - r)) * 1.7;
    p.normal = { x: 0.87, y: 0.5, z: 0 };
  }
}

/**
 * Sinks a bowl into the cloud — the collects-water case. The hollow metric is
 * "this cell sits below its NEIGHBOURHOOD mean" (a 2-cell = 0.5 m reach), so
 * the bowl must be steep-walled enough that the centre drops well below the
 * ground half a metre away — a wide, gentle dish is NOT a hollow, by design.
 */
function addHollow(cloud: SurveyPoint[], cx: number, cz: number, r: number, depthM: number): void {
  for (let i = 0; i < cloud.length; i++) {
    const p = cloud[i];
    const dx = p.position.x - cx;
    const dz = p.position.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    p.position.y = -depthM * (1 - d2 / (r * r));
  }
}

/**
 * Scrambles NORMALS point-to-point — the broken-ground case. The broken
 * metric is mean NORMAL SPREAD across the neighbourhood, not height jitter:
 * rubble reads as facets pointing every which way.
 */
function addBrokenPatch(cloud: SurveyPoint[], cx: number, cz: number, r: number): void {
  for (let i = 0; i < cloud.length; i++) {
    const p = cloud[i];
    const dx = p.position.x - cx;
    const dz = p.position.z - cz;
    if (dx * dx + dz * dz > r * r) continue;
    // Deterministic facet directions — no RNG in tests. ~40-50° tilts that
    // rotate cell to cell, plus height jag for good measure.
    const a = ((i * 37) % 8) * (Math.PI / 4);
    p.normal = { x: Math.sin(a) * 0.75, y: 0.66, z: Math.cos(a) * 0.75 };
    p.position.y = ((i * 37) % 7 - 3) * 0.12;
  }
}

// ---------------------------------------------------------------- scenarios

@component
export class T2_HudFollower_SmoothingNeverOvershoots extends Scenario {
  async run(): Promise<void> {
    // THE test that would have caught SIK Headlock diverging x30/s: its
    // dt-scaled lerp exceeds gain 2 past dt ~0.26 s and OVERSHOOTS, each step
    // further than the last. The follower's step must move TOWARD the target
    // and never past it, at EVERY dt — including the measured 30.4 s hitch.
    const tau = 0.13;
    const dts = [0.016, 0.1, 0.5, 3.3, 30.4];
    const start = 0;
    const target = 100;

    for (let i = 0; i < dts.length; i++) {
      const dt = dts[i];
      const a = followAlpha(dt, tau);
      // (0, 1] — not (0, 1): at dt=30.4s the true value 1-exp(-234) rounds to
      // exactly 1.0 in doubles, and alpha == 1 means "step exactly ONTO the
      // target", which is stable. The Headlock failure shape is alpha ABOVE 1
      // (its dt-scaled gain passed 2), which overshoots and then AMPLIFIES.
      if (!(a > 0 && a <= 1)) {
        throw new Error(
          "FOLLOWER SMOOTHING UNSTABLE at dt=" + dt + "s: alpha=" + a +
            " is outside (0,1]. This is the exact failure shape that made SIK Headlock" +
            " run away x30/s (a dt-scaled gain above 2) and cost half a session."
        );
      }
      const next = followStep(start, target, dt, tau);
      if (!(next > start)) {
        throw new Error("FOLLOWER DID NOT MOVE TOWARD TARGET at dt=" + dt + "s: " + start + " -> " + next);
      }
      if (next > target) {
        throw new Error(
          "FOLLOWER OVERSHOT at dt=" + dt + "s: " + start + " -> " + next + " past target " + target +
            ". One smoothing step may approach the target but never pass it."
        );
      }
    }

    // And iterated steps CONVERGE monotonically even at the pathological dt.
    let pos = 0;
    let lastGap = Math.abs(target - pos);
    for (let i = 0; i < 10; i++) {
      pos = followStep(pos, target, 30.4, tau);
      const gap = Math.abs(target - pos);
      if (gap > lastGap) {
        throw new Error("FOLLOWER DIVERGED on iteration " + i + ": gap grew " + lastGap + " -> " + gap);
      }
      lastGap = gap;
    }
    expect(lastGap).toBeCloseTo(0, 3);
  }
}
