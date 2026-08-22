/**
 * Tier 3 — the rest of the original list. Same rules: fixtures only, the AI
 * boundary observed and never crossed.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { EventRecorder, resetToIdle, scriptOn } from "./LeafHelpers";

@component
export class T3_BackOnFirstStep_HoldsWithoutCrash extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("stepChanged", "narrationRequested");
    try {
      engine.loadFromFixture(engine.campfireFixture, "campfire");
      await sleep(400);

      const stepsBefore = rec.count("stepChanged");
      const narrBefore = rec.count("narrationRequested");
      engine.back();
      await sleep(200);

      // Holds the step (no stepChanged), re-narrates instead, engine alive.
      expect(rec.count("stepChanged")).toBe(stepsBefore);
      expect(rec.count("narrationRequested")).toBe(narrBefore + 1);
      expect(engine.currentMode()).toBe("LESSON");
      engine.next();
      await sleep(200);
      expect(rec.last("stepChanged").stepIndex).toBe(1);
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
