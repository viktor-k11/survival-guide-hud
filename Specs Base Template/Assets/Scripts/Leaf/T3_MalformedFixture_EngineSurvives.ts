/**
 * Tier 3 — the rest of the original list. Same rules: fixtures only, the AI
 * boundary observed and never crossed.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { EventRecorder, resetToIdle, scriptOn } from "./LeafHelpers";

@component
export class T3_MalformedFixture_EngineSurvives extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const index = scriptOn("LeafIndex");
    if (!index.brokenLesson) throw new Error("LeafIndex.brokenLesson is not wired in the Inspector");
    const rec = new EventRecorder();
    rec.listen("lessonStarted");
    try {
      // A structurally broken plan (nine steps): REJECTED, no lesson starts,
      // no mode change, no crash.
      engine.loadFromFixture(index.brokenLesson, "broken");
      await sleep(300);
      expect(rec.count("lessonStarted")).toBe(0);
      expect(engine.currentMode()).toBe("IDLE");

      // And the engine is still fully alive: a good fixture loads right after.
      engine.loadFromFixture(engine.campfireFixture, "campfire");
      await sleep(400);
      expect(rec.count("lessonStarted")).toBe(1);
      expect(engine.currentMode()).toBe("LESSON");
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
