/**
 * THROWAWAY DIAGNOSTIC — delete alongside RsgSmokeTest.ts once the lesson
 * planner is wired into the real engine. Not architecture.
 *
 * Runs three real lesson requests and one deliberately broken fixture through
 * the validator, logging everything with an [LESSON] prefix.
 *
 * The broken case is loaded from a stored fixture rather than hardcoded, per
 * hard rule 5 — the fixture on disk is the test input, so it can be edited
 * without touching code.
 */
import { requestLesson } from "./LessonPlanner";
import { describeDegradations, inferLessonKind, validateLesson } from "./LessonValidator";

@component
export class LessonProbe extends BaseScriptComponent {
  @input
  @hint("Assets/AI/prompts.generated.json — built from the .txt sources by Tools/build-prompts.py")
  private promptsAsset: JsonAsset;

  @input
  @hint("Assets/AI/fixtures/broken-lesson-9-steps-7-item-checklist.json — the deliberately invalid case")
  private brokenFixture: JsonAsset;

  @input
  @hint("Turn off once the planner is wired into the real engine.")
  private runOnStart: boolean = true;

  @input
  @hint("Comma-separated requests. Empty = the standard three (campfire / tent / water).")
  private requestsOverride: string = "";

  @input
  @hint("How many times to run EACH request. Set to 3 to prove an intermittent model failure is actually fixed — one green run means nothing when the fault only appears sometimes.")
  private repeatEach: number = 1;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (this.runOnStart) this.run();
    });
  }

  private log(msg: string): void {
    print("[LESSON] " + msg);
  }

  private passCount: number = 0;
  private failCount: number = 0;
  private degradedCount: number = 0;

  /** Override list wins when non-empty; otherwise the standard three. */
  private resolveRequests(): string[] {
    const raw = (this.requestsOverride || "").trim();
    if (raw.length === 0) {
      return ["help me build a campfire", "help me pitch a tent", "help me purify water"];
    }
    const parts = raw.split(",");
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i].trim();
      if (t.length > 0) out.push(t);
    }
    return out.length > 0 ? out : ["help me purify water"];
  }

  private run(): void {
    if (!this.promptsAsset) {
      this.log("FAIL: promptsAsset not wired");
      return;
    }

    let lessonPrompt = "";
    try {
      lessonPrompt = JSON.parse(this.promptsAsset.getString()).lesson;
    } catch (e) {
      this.log("FAIL: could not read prompts asset: " + e);
      return;
    }
    this.log("loaded lesson system prompt (" + lessonPrompt.length + " chars)");

    // Sequential, so the log reads in order and the calls do not interleave.
    const requests = this.resolveRequests();
    const reps = Math.max(1, Math.round(this.repeatEach));
    this.log("plan: " + requests.length + " request(s) x " + reps + " run(s) each");

    let chain: Promise<any> = Promise.resolve();
    this.passCount = 0;
    this.failCount = 0;
    this.degradedCount = 0;
    for (let r = 0; r < reps; r++) {
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const tag = reps > 1 ? " [run " + (r + 1) + "/" + reps + "]" : "";
        chain = chain.then(() => this.runOne(req, lessonPrompt, tag));
      }
    }
    chain.then(() => {
      this.log(
        "TALLY usable=" + this.passCount + " unusable=" + this.failCount +
          " degradedRuns=" + this.degradedCount
      );
      this.runBrokenCase();
    });
  }

  private runOne(userText: string, prompt: string, tag: string): Promise<void> {
    this.log('--- request: "' + userText + '"' + tag + ' ---');
    return requestLesson(userText, prompt).then((outcome) => {
      const v = outcome.validation;
      this.log('"' + userText + '"' + tag + " latency=" + outcome.latencyMs + "ms validator=" + (v.ok ? "PASS" : "FAIL"));

      if (!v.ok) {
        this.failCount++;
        this.log("validator issues: " + JSON.stringify(v.issues));
        this.log("summary: " + v.summary);
      } else {
        this.passCount++;
        if (v.degradations.length > 0) {
          this.degradedCount++;
          this.log("DEGRADED x" + v.degradations.length + " — " + describeDegradations(v.degradations));
        }
        const plan = v.plan;
        const companions: string[] = [];
        let safetyCount = 0;
        for (let i = 0; i < plan.steps.length; i++) {
          const s = plan.steps[i];
          companions.push(s.companion ? s.companion.type : "none");
          if (s.safety) safetyCount++;
        }
        this.log(
          'title="' + plan.title + '" steps=' + plan.steps.length +
            " companions=[" + companions.join(", ") + "]" +
            " safetyGatedSteps=" + safetyCount +
            " nextSuggestion=" + (plan.nextSuggestion ? '"' + plan.nextSuggestion + '"' : "none")
        );
      }

      // Full raw envelope — this line is what gets saved as the fixture.
      this.log("FIXTURE|" + this.slug(userText) + "|" + outcome.rawEnvelope);
    });
  }

  private runBrokenCase(): void {
    this.log("--- deliberately broken fixture ---");
    if (!this.brokenFixture) {
      this.log("FAIL: brokenFixture not wired");
      return;
    }

    let payload = "";
    try {
      payload = this.brokenFixture.getString();
    } catch (e) {
      this.log("FAIL: could not read broken fixture: " + e);
      return;
    }

    // Same entry point the live path uses — no special-casing for the test.
    const kind = inferLessonKind("help me build a campfire", "");
    const result = validateLesson(payload, kind);

    // This fixture is 9 steps with a 7-item checklist. The step count is the
    // structural failure and still rejects; the over-long checklist would only
    // have been truncated. Rejection here is about the step count, not the widget.
    this.log("broken fixture validator=" + (result.ok ? "PASS (UNEXPECTED)" : "FAIL (expected)"));
    this.log("summary: " + result.summary);
    this.log("issueCount=" + result.issues.length);
    for (let i = 0; i < result.issues.length; i++) {
      const iss = result.issues[i];
      this.log("  issue[" + i + "] " + iss.code + " at " + iss.path + ": " + iss.message);
    }
    this.log("plan returned: " + (result.plan === null ? "null (correct)" : "NON-NULL (BUG)"));
  }

  private slug(text: string): string {
    let out = "";
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const ch = lower.charAt(i);
      out += (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") ? ch : "-";
    }
    return out;
  }
}
