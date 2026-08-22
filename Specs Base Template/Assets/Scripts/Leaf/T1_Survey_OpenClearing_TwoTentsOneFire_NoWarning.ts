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
export class T1_Survey_OpenClearing_TwoTentsOneFire_NoWarning extends Scenario {
  async run(): Promise<void> {
    await sleep(500);
    await resetToIdle();

    const survey = scriptOn("SurveyController");
    expect(survey.weightHazardPenalty).toBeCloseTo(0.25, 3); // the penalty is ON — that is the regression

    const r = await runFixtureSurvey(); // the wired cloudFixture IS open-clearing
    const sites: any[] = r.complete.sites;

    let tents = 0;
    let fire: any = null;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].kind === "fire") fire = sites[i];
      else tents++;
    }
    expect(tents).toBe(2);
    expect(fire !== null).toBe(true);

    // Fire clear of the NEAREST tent by >= 3 m (positions are centimetres).
    let nearestCm = Number.MAX_VALUE;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].kind === "fire") continue;
      const d = distXZ(sites[i].positionCm, fire.positionCm);
      if (d < nearestCm) nearestCm = d;
    }
    expect(nearestCm).toBeGreaterThan(299.9);

    // No distance warning, and the open clearing carries no hazards.
    expect(r.warnings).toBe(0);
    expect(r.complete.distanceWarning).toBeFalsy();
    const hazards: any[] = r.hazards ? r.hazards.hazards : [];
    expect(hazards.length).toBe(0);

    // The markers the demo depends on are actually standing.
    expect(findSceneObjectByName("SiteMarker_Tent_A").enabled).toBe(true);
    expect(findSceneObjectByName("SiteMarker_Fire").enabled).toBe(true);
  }
}
