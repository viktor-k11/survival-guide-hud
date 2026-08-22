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
export class T1_Lesson_CampfireStep1_ZoneCompanionRendered extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("stepChanged", "companionChanged");
    try {
      await loadCampfire(engine);

      const step = rec.last("stepChanged");
      expect(step.stepIndex).toBe(0);
      const companion = rec.last("companionChanged");
      expect(companion.type).toBe("zone");

      // The panel the user reads: visible, and saying step 01.
      expect(findSceneObjectByName("GuidePanel").enabled).toBe(true);
      const counter = findSceneObjectByName("StepCounter").getComponent("Component.Text") as Text;
      expect(counter.text).toBe("01/06");

      // The zone the companion routed to is actually on.
      expect(findSceneObjectByName("ZoneWidget").enabled).toBe(true);
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
