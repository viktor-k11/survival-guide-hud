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
export class T1_Lesson_Completion_CardThenAutoIdle extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("lessonCompleted", "modeChanged");
    try {
      await loadCampfire(engine);
      // 0(zone) -> 1 -> 2 -> 3 -> 4(safety: confirm) -> 5 -> complete
      engine.next();
      engine.next();
      engine.next();
      engine.next();
      await sleep(150);
      engine.confirm();
      engine.next();
      await sleep(150);
      engine.next();
      await sleep(300);

      const done = rec.last("lessonCompleted");
      expect(done !== undefined).toBe(true);
      // The DOCTORED fixture carries its suggestion IN the plan — this is the
      // precondition for the coordinator SKIPPING its background Gemini call.
      expect(typeof done.nextSuggestion === "string" && done.nextSuggestion.length > 0).toBe(true);
      expect(engine.currentMode()).toBe("COMPLETE");
      expect(findSceneObjectByName("CompletionCard").enabled).toBe(true);

      // Nothing auto-starts; the dwell ends in IDLE on its own.
      const dwellSec = typeof engine.suggestionDwellSec === "number" ? engine.suggestionDwellSec : 14;
      await sleep((dwellSec + 2) * 1000);
      expect(engine.currentMode()).toBe("IDLE");
      expect(findSceneObjectByName("MainMenu").enabled).toBe(true);
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
