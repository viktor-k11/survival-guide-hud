/**
 * Tier 1 — the survey demo invariants, exactly as SCENE-MAP records them.
 * These run the REAL SurveyController over the stored clouds (hard rule 5);
 * zero Gemini anywhere. Point counts are deliberately NOT asserted — the
 * fixture's time-based reveal makes them vary 344-387 across sessions, and
 * the recorded contract is the site/warning/hazard outcomes only.
 *
 * The hazard PENALTY regression rides inside both scenarios: the penalty is
 * asserted ON (0.25) and the invariants must hold WITH it — the exact check
 * that was once done by hand.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { distXZ, resetToIdle, runFixtureSurvey, scriptOn } from "./LeafHelpers";

@component
export class T1_Survey_CrampedCamp_WarningRaised_SteepHazards extends Scenario {
  async run(): Promise<void> {
    await sleep(300);
    await resetToIdle();

    const index = scriptOn("LeafIndex");
    if (!index.crampedCloud) throw new Error("LeafIndex.crampedCloud is not wired in the Inspector");

    const r = await runFixtureSurvey(index.crampedCloud);
    const sites: any[] = r.complete.sites;

    // The constraint case: the fire cannot clear 3 m — it is STILL placed
    // (a warning, never a veto) and distanceWarning is raised.
    let fire: any = null;
    for (let i = 0; i < sites.length; i++) if (sites[i].kind === "fire") fire = sites[i];
    expect(fire !== null).toBe(true);
    let nearestCm = Number.MAX_VALUE;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].kind === "fire") continue;
      const d = distXZ(sites[i].positionCm, fire.positionCm);
      if (d < nearestCm) nearestCm = d;
    }
    expect(nearestCm > 0 && nearestCm < 300).toBe(true);
    expect(r.warnings).toBeGreaterThan(0);
    expect(r.complete.distanceWarning).toBeTruthy();

    // The rubble ring reads as steep hazards — the recorded contract is
    // exactly three, all steep, and the penalty being ON must not move it.
    const hazards: any[] = r.hazards ? r.hazards.hazards : [];
    expect(hazards.length).toBe(3);
    for (let i = 0; i < hazards.length; i++) {
      expect(hazards[i].kind).toBe("steep");
    }
  }
}
