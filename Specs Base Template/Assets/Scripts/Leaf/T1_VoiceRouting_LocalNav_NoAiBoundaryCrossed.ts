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
export class T1_VoiceRouting_LocalNav_NoAiBoundaryCrossed extends Scenario {
  async run(): Promise<void> {
    await resetToIdle();
    const engine = scriptOn("LessonEngine");
    const rec = new EventRecorder();
    // The AI boundary IS these two events: lessonRequested feeds the planner,
    // qaRequested feeds Q&A. If neither fires, no AI call could have started.
    rec.listen("lessonRequested", "qaRequested", "stepChanged");
    try {
      await loadCampfire(engine);

      // "next" takes the local navigation path: the step advances and the AI
      // boundary is never crossed.
      engine.handleTranscript("next");
      await sleep(200);
      expect(rec.last("stepChanged").stepIndex).toBe(1);
      expect(rec.count("lessonRequested")).toBe(0);
      expect(rec.count("qaRequested")).toBe(0);

      // An unmatched sentence mid-lesson WOULD cross into Q&A — asserted with
      // the engine's own classify(), which routes without executing, so the
      // suite itself stays at zero AI calls.
      expect(engine.classify("what kind of wood burns longest")).toBe("qaRequested");

      await resetToIdle();
      // And the same unmatched sentence in IDLE would become a lesson request.
      expect(engine.classify("help me build a snow shelter")).toBe("lessonRequested");
      // While a bare navigation word stays local even in IDLE.
      expect(engine.classify("next")).toBe("navigation/next");
    } finally {
      rec.dispose();
      await resetToIdle();
    }
  }
}
