/**
 * Tier 3 — the rest of the original list. Same rules: fixtures only, the AI
 * boundary observed and never crossed.
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { EventRecorder, resetToIdle, scriptOn } from "./LeafHelpers";

@component
export class T3_NextTwice_HologramStageAdvances extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    rec.listen("hologramStage", "stepChanged");
    try {
      engine.loadFromFixture(engine.campfireFixture, "campfire");
      await sleep(400);
      engine.next(); // 1 checklist
      engine.next(); // 2 hologram stage 2
      await sleep(300);

      expect(rec.last("stepChanged").stepIndex).toBe(2);
      const stage = rec.last("hologramStage");
      expect(stage.stage).toBe(2);
      // The fire family's stage 2 group is actually on (family inferred from
      // the title — the same single inference the holograms use).
      expect(findSceneObjectByName("S2_Tinder").enabled).toBe(true);

      engine.next(); // 3 -> hologram stage 3
      await sleep(300);
      expect(rec.last("hologramStage").stage).toBe(3);
      expect(findSceneObjectByName("S3_LogCabin").enabled).toBe(true);
      expect(findSceneObjectByName("S2_Tinder").enabled).toBe(false); // stages are mutually exclusive
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
