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
export class T1_Lesson_SafetyStep_NextRefused_ConfirmReleases extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("stepChanged", "safetyPending", "safetyRejected");
    try {
      await loadCampfire(engine);
      engine.next(); // 1
      engine.next(); // 2
      engine.next(); // 3
      engine.next(); // 4 — the safety step
      await sleep(200);

      const pending = rec.last("safetyPending");
      expect(pending.pending).toBe(true);
      expect(pending.stepIndex).toBe(4);
      expect(typeof pending.warning === "string" && pending.warning.length > 0).toBe(true);

      // next() is REFUSED while the gate is up.
      const rejectedBefore = rec.count("safetyRejected");
      engine.next();
      await sleep(150);
      expect(rec.count("safetyRejected")).toBe(rejectedBefore + 1);
      expect(rec.last("stepChanged").stepIndex).toBe(4); // did not move

      // "confirm" releases it and the next step opens.
      engine.confirm();
      await sleep(150);
      expect(rec.last("safetyPending").pending).toBe(false);
      engine.next();
      await sleep(150);
      expect(rec.last("stepChanged").stepIndex).toBe(5);
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
