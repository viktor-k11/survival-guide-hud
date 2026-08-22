/**
 * Shared plumbing for the LEAF suite. ZERO Gemini anywhere in these tests:
 * everything runs from stored fixtures and pure functions. The five-phrase
 * prompt gate needs the live model and stays a separate manual run.
 *
 * Scenarios share one live Lens, so every helper here leans on the project's
 * own reset paths (engine.stop(), beginSurvey()) instead of assuming a fresh
 * boot.
 */
import { eventBus } from "../Engine/EventBus";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";

/** The ScriptComponent instance on a Systems object, by object name. */
export function scriptOn(objectName: string): any {
  const obj = findSceneObjectByName(objectName);
  if (!obj) throw new Error("scene object '" + objectName + "' not found");
  const comp = obj.getComponent("Component.ScriptComponent");
  if (!comp) throw new Error("no ScriptComponent on '" + objectName + "'");
  return comp as any;
}

/** Records bus emissions so a test can assert what fired — and what did not. */
export class EventRecorder {
  private unsubs: (() => void)[] = [];
  public events: { name: string; payload: any }[] = [];

  listen(...names: string[]): void {
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      this.unsubs.push(
        eventBus.subscribe(n as any, (p: any) => {
          this.events.push({ name: n, payload: p });
        })
      );
    }
  }

  count(name: string): number {
    let c = 0;
    for (let i = 0; i < this.events.length; i++) if (this.events[i].name === name) c++;
    return c;
  }

  last(name: string): any {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].name === name) return this.events[i].payload;
    }
    return undefined;
  }

  dispose(): void {
    for (let i = 0; i < this.unsubs.length; i++) this.unsubs[i]();
    this.unsubs = [];
  }
}

/** Waits until the recorder has seen `name`, or fails with a readable message. */
export async function waitForEvent(rec: EventRecorder, name: string, timeoutMs: number, what: string): Promise<any> {
  const start = getTime();
  while ((getTime() - start) * 1000 < timeoutMs) {
    if (rec.count(name) > 0) return rec.last(name);
    await sleep(100);
  }
  throw new Error("TIMED OUT after " + timeoutMs + "ms waiting for " + name + " — " + what);
}

/**
 * Runs one fixture survey to completion and returns the surveyComplete
 * payload. Flips the controller's fixture toggle for the duration and puts it
 * back — the toggle SHIPS OFF and must stay that way outside a test.
 */
export async function runFixtureSurvey(cloudAsset?: any): Promise<{ complete: any; hazards: any; warnings: number; rec: EventRecorder }> {
  const survey = scriptOn("SurveyController");
  const rec = new EventRecorder();
  rec.listen("surveyComplete", "hazardsDetected", "distanceWarning");

  const prevToggle = survey.useFixtureCloud;
  const prevAsset = survey.cloudFixture;
  survey.useFixtureCloud = true;
  if (cloudAsset) survey.cloudFixture = cloudAsset;
  try {
    survey.beginSurvey();
    const complete = await waitForEvent(rec, "surveyComplete", 20000, "the fixture survey never finished");
    await sleep(300); // hazardsDetected and any warning follow immediately after
    return { complete: complete, hazards: rec.last("hazardsDetected"), warnings: rec.count("distanceWarning"), rec: rec };
  } finally {
    survey.useFixtureCloud = prevToggle;
    survey.cloudFixture = prevAsset;
    rec.dispose();
  }
}

/** Hard-resets the lesson machinery to IDLE between scenarios. */
export async function resetToIdle(): Promise<void> {
  const engine = scriptOn("LessonEngine");
  engine.stop();
  await sleep(400);
  if (engine.currentMode() !== "IDLE") {
    throw new Error("resetToIdle: engine is still in " + engine.currentMode());
  }
}

/** XZ distance between two {x,z} carriers, same units in as out. */
export function distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}
