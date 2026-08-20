/**
 * THROWAWAY DIAGNOSTIC — the failure-path proof for LessonCoordinator.
 *
 * Same status as LessonProbe: this is not architecture, it is a scripted run
 * that makes each failure happen on purpose and prints what the user would see.
 * The happy path proves nothing about a demo; these four do:
 *
 *   1. DUPLICATE   a second request while one is in flight -> ignored, no
 *                  second Gemini call, user told.
 *   2. CANCEL      "stop" mid-compile -> aborted, and the response that lands
 *                  ten seconds later must NOT resurrect the lesson.
 *   3. VALIDATION  a malformed response, injected from a stored fixture through
 *                  the same handleOutcome() the live path uses -> error state,
 *                  engine still alive, raw response dumped as a fixture.
 *   4. NETWORK     a deliberately broken API token -> one automatic retry, then
 *                  a friendly error, then back to IDLE.
 *
 * Runs on a timeline because these are real asynchronous failures; the delays
 * are what let one boot exercise all four in order without them overlapping.
 */
import { eventBus, Events } from "./EventBus";
import { LessonCoordinator } from "./LessonCoordinator";
import { LessonEngine } from "./LessonEngine";
import { LessonRequestOutcome } from "./LessonPlanner";
import { RequestStatePayload } from "./RequestTypes";
import { inferLessonKind, validateLesson } from "./LessonValidator";
import { installRsgTokens, overrideGoogleToken } from "./RsgTokens";

@component
export class CoordinatorProbe extends BaseScriptComponent {
  @input private coordinator: LessonCoordinator;
  @input private engine: LessonEngine;

  @input
  @allowUndefined
  @hint("Assets/AI/fixtures/broken-lesson-9-steps-7-item-checklist.json — the malformed response injected in scenario 3.")
  private brokenFixture: JsonAsset;

  @input
  @hint("Turn OFF once the failure paths are proven. Every run costs real Gemini calls.")
  private runOnStart: boolean = false;

  @input
  @hint("Request used for the duplicate/cancel scenarios.")
  private probeRequest: string = "help me purify water";

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("failures — the four failure paths", 0),
      new ComboBoxItem("happy — one real request, end to end", 1),
      new ComboBoxItem("marker — a site tap drives a real request", 2),
    ])
  )
  @hint("Which scripted run to perform. 'failures' costs two Gemini calls; 'happy' and 'marker' cost one each.")
  private scenario: number = 0;

  private log(msg: string): void {
    print("[PROBE] " + msg);
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (this.runOnStart) this.run();
    });
  }

  /** Schedules one step. Each scenario is a couple of these. */
  private at(seconds: number, what: () => void): void {
    const ev = this.createEvent("DelayedCallbackEvent");
    ev.bind(() => what());
    ev.reset(seconds);
  }

  private run(): void {
    if (!this.coordinator || !this.engine) {
      this.log("FAIL: coordinator or engine not wired");
      return;
    }

    // Mirror what the HUD is being told, so the log shows the user's view.
    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      if (!p) return;
      this.log(
        "  HUD <- " + p.state +
          (p.requestText ? ' request="' + p.requestText + '"' : "") +
          (p.message ? ' message="' + p.message + '"' : "") +
          (p.attempt > 1 ? " attempt=" + p.attempt : "") +
          (p.reason ? " reason=" + p.reason : "")
      );
    });
    eventBus.subscribe(Events.lessonStarted, (p: { title: string; stepCount: number }) => {
      this.log('  !! lessonStarted "' + (p ? p.title : "?") + '" — if this follows a CANCEL, that is the bug');
    });

    if (this.scenario === 1) {
      this.at(0.5, () => {
        this.log("=== HAPPY PATH: one real request, end to end ===");
        this.coordinator.request(this.probeRequest, null, "debug");
      });
      return;
    }

    if (this.scenario === 2) {
      // Emits the event a marker tap emits, with a plausible surveyed site
      // attached. Everything downstream of siteSelected is the real path:
      // phrase lookup, Gemini call, validator, anchor, engine.
      this.at(0.5, () => {
        this.log("=== MARKER: siteSelected -> fixed phrase -> Gemini ===");
        eventBus.emit(Events.siteSelected, {
          kind: "tent",
          slot: "TENT_A",
          position: { x: 137.5, y: -172.9, z: -337.5 },
          score: 0.562,
          source: "debug",
        });
      });
      return;
    }

    this.log("=== failure-path run starting ===");

    // --- 1. duplicate ----------------------------------------------------
    this.at(0.5, () => {
      this.log("--- 1. DUPLICATE: two requests, back to back ---");
      this.coordinator.request(this.probeRequest, null, "debug");
    });
    this.at(1.2, () => {
      this.log('sending a second request while #' + this.coordinator.currentRequestId() + " is in flight");
      this.coordinator.request("help me build a campfire", null, "debug");
      this.log("state after duplicate: " + this.coordinator.currentState() + " (expect COMPILING, one call only)");
    });

    // --- 2. cancel -------------------------------------------------------
    this.at(3.0, () => {
      this.log('--- 2. CANCEL: "stop" while compiling ---');
      this.engine.handleTranscript("stop");
      this.log("state after stop: " + this.coordinator.currentState() + " (expect IDLE)");
      this.log("the cancelled response is still in flight; watch for it being dropped");
    });

    // --- 3. validation ---------------------------------------------------
    this.at(16.0, () => {
      this.log("--- 3. VALIDATION: malformed response injected from fixture ---");
      this.coordinator.request(this.probeRequest, null, "debug");
    });
    this.at(16.6, () => this.injectMalformed());

    // --- 4. network ------------------------------------------------------
    this.at(24.0, () => {
      this.log("--- 4. NETWORK: breaking the API token on purpose ---");
      overrideGoogleToken("this-token-is-deliberately-invalid");
      this.coordinator.request("help me pitch a tent", null, "debug");
    });
    this.at(40.0, () => {
      installRsgTokens();
      this.log("real token restored");
      this.log("=== failure-path run complete; final state " + this.coordinator.currentState() + " ===");
    });
  }

  /**
   * Feeds a stored malformed response through the SAME entry point a live
   * response takes. Hard rule 5: the test input is a file on disk, not a
   * literal in this file, and the code under test is not special-cased.
   */
  private injectMalformed(): void {
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

    const outcome: LessonRequestOutcome = {
      request: this.probeRequest,
      rawEnvelope: payload,
      rawPayload: payload,
      latencyMs: 0,
      validation: validateLesson(payload, inferLessonKind(this.probeRequest, "")),
      transportError: false,
    };

    this.log("injecting malformed response into request #" + this.coordinator.currentRequestId());
    this.coordinator.handleOutcome(outcome, this.coordinator.currentRequestId(), 1);
    this.log("state after injection: " + this.coordinator.currentState() + " (expect ERROR)");
    this.log("engine mode after injection: " + this.engine.currentMode() + " (expect IDLE — engine untouched)");
  }
}
