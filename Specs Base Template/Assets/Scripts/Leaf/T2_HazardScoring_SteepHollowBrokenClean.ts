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
export class T2_HazardScoring_SteepHollowBrokenClean extends Scenario {
  async run(): Promise<void> {
    // Clean cloud -> NOTHING. "No hazards seen" is a real answer.
    const clean = scoreHazards(cleanCloud(6, 0.25));
    expect(clean.length).toBe(0);

    const steepCloud = cleanCloud(6, 0.25);
    addSteepPatch(steepCloud, 3, 0, 1.5);
    const steep = scoreHazards(steepCloud);
    expect(steep.length).toBeGreaterThan(0);
    expect(steep[0].kind).toBe("steep");

    const hollowCloud = cleanCloud(6, 0.25);
    addHollow(hollowCloud, -3, 0, 0.7, 0.6);
    const hollow = scoreHazards(hollowCloud);
    expect(hollow.length).toBeGreaterThan(0);
    expect(hollow[0].kind).toBe("hollow");

    const brokenCloud = cleanCloud(6, 0.25);
    addBrokenPatch(brokenCloud, 0, 3, 1.5);
    const broken = scoreHazards(brokenCloud);
    expect(broken.length).toBeGreaterThan(0);
    // Tilted facets legitimately read as steep cells too; the assertion is
    // that BROKEN is among the verdicts, not that it outranks them.
    let hasBroken = false;
    for (let i = 0; i < broken.length; i++) if (broken[i].kind === "broken") hasBroken = true;
    expect(hasBroken).toBe(true);
  }
}
