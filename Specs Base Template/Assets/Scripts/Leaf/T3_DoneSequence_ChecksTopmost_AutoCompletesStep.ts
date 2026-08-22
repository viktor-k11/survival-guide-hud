/**
 * Tier 3 — the rest of the original list. Same rules: fixtures only, the AI
 * boundary observed and never crossed.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { EventRecorder, resetToIdle, scriptOn } from "./LeafHelpers";

@component
export class T3_DoneSequence_ChecksTopmost_AutoCompletesStep extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("checklistUpdated", "stepChanged");
    try {
      engine.loadFromFixture(engine.campfireFixture, "campfire");
      await sleep(400);
      engine.next(); // step 1 — the three-fuel checklist
      await sleep(200);

      engine.done();
      await sleep(120);
      expect(rec.last("checklistUpdated").justChecked).toBe(0); // topmost first
      engine.done();
      await sleep(120);
      expect(rec.last("checklistUpdated").justChecked).toBe(1);
      engine.done(); // last item -> the step auto-completes
      await sleep(300);
      expect(rec.last("checklistUpdated").justChecked).toBe(2);
      expect(rec.last("stepChanged").stepIndex).toBe(2);
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
