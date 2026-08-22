/**
 * Tier 1 — the lesson-machine demo invariants. Every lesson here loads from a
 * STORED FIXTURE through the engine's own loadFromFixture (hard rule 5);
 * nothing in this file can reach Gemini:
 *
 *  - the campfire fixture used for completion is the DOCTORED one the C key
 *    loads, whose plan CARRIES nextSuggestion — the coordinator skips its
 *    background next-step call for exactly that case;
 *  - voice routing asserts the AI boundary with the engine's own classify(),
 *    which decides WITHOUT executing ("what WOULD happen") — the boundary is
 *    observed, never crossed. The one transcript actually executed ("next")
 *    is a local navigation word, and the recorder proves no AI-bound event
 *    fired while it ran.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { EventRecorder, resetToIdle, runFixtureSurvey, scriptOn, waitForEvent } from "./LeafHelpers";

/** Loads the campfire fixture through the SAME path debug key C uses. */
async function loadCampfire(engine: any): Promise<void> {
  if (!engine.campfireFixture) throw new Error("LessonEngine.campfireFixture is not wired");
  engine.loadFromFixture(engine.campfireFixture, "campfire");
  await sleep(400);
  if (engine.currentMode() !== "LESSON") {
    throw new Error("campfire fixture did not enter LESSON (mode=" + engine.currentMode() + ")");
  }
}

@component
export class T1_Lesson_StopMidLesson_IdleMenuAndMarkersSurvive extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    // Markers first — "still standing" needs something standing.
    await runFixtureSurvey();
    expect(findSceneObjectByName("SiteMarker_Tent_A").enabled).toBe(true);

    const engine = scriptOn("LessonEngine");
    await loadCampfire(engine);
    engine.next();
    await sleep(200);

    engine.stop();
    await sleep(400);

    expect(engine.currentMode()).toBe("IDLE");
    expect(findSceneObjectByName("MainMenu").enabled).toBe(true);
    // The markers survived the round trip — WorldRoot stays up in IDLE.
    expect(findSceneObjectByName("SiteMarker_Tent_A").enabled).toBe(true);
    expect(findSceneObjectByName("SiteMarker_Fire").enabled).toBe(true);
  }
}
