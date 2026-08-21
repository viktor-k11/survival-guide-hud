/**
 * Minimal typed pub/sub. This is the ONLY channel between Scripts/Engine
 * (logic) and Scripts/Widgets (presenters) — hard rule 3. Engine code never
 * touches widget visuals directly; widgets never contain logic.
 *
 * Contains the bus and the event-name constants, nothing else. No engine
 * logic, no state, no scene access.
 */

/** Every event the system knows about. Payload shapes firm up as each feature lands. */
export const Events = {
  /** IDLE <-> LESSON <-> SURVEY transitions. */
  modeChanged: "modeChanged",
  /** A lesson plan arrived and is about to be presented. */
  lessonStarted: "lessonStarted",
  /** Current step index moved (next / back / repeat). */
  stepChanged: "stepChanged",
  /** Guide companion / voice persona swapped. */
  companionChanged: "companionChanged",
  /** Blueprint hologram should advance to a named stage group. */
  hologramStage: "hologramStage",
  /** Countdown / duration tick for GaugeTimer. */
  timerTick: "timerTick",
  /** A checklist item was ticked or cleared. */
  checklistUpdated: "checklistUpdated",
  /** A step needs explicit user confirmation before continuing. */
  safetyPending: "safetyPending",
  /** A training prop was placed in the world. */
  propPlaced: "propPlaced",
  /** Final step done. */
  lessonCompleted: "lessonCompleted",
  /** Terrain survey has begun. Payload: { durationSec }. */
  surveyStarted: "surveyStarted",
  /** Terrain survey progress, 0..1. Payload: SurveyProgressPayload. */
  surveyProgress: "surveyProgress",
  /** Terrain survey finished; site markers can be shown. Payload: SurveyCompletePayload. */
  surveyComplete: "surveyComplete",
  /**
   * The user picked a site marker. Payload: SiteSelectedPayload.
   * Nothing starts a lesson from this yet — that is deliberate, and the next
   * task. Emitting it now means the seam exists and is already exercised.
   */
  siteSelected: "siteSelected",
  /**
   * A distance constraint could not be met. Payload: DistanceWarningPayload.
   * Raised by the survey when the fire cannot clear the tents; later also when
   * the user strays from an active zone.
   */
  distanceWarning: "distanceWarning",

  // --- Voice input (VoiceInput.ts) ---------------------------------------
  /** Mic state changed. Payload: { state: "idle" | "listening" | "finalizing" }. */
  voiceStateChanged: "voiceStateChanged",
  /** Live partial transcript while the user is still speaking. Payload: { text }. */
  voiceInterim: "voiceInterim",
  /**
   * A completed user request. Payload: { text, latencyMs }.
   * This is THE seam every later feature plugs into: the lesson planner, the
   * in-lesson Q&A router and the local navigation keyword matcher all listen
   * here. Nothing downstream should ever touch the ASR module directly.
   */
  userRequest: "userRequest",

  // --- Lesson engine (LessonEngine.ts) -----------------------------------
  /** A blocked next() on a safety-gated step. Payload: { stepIndex, warning }. UI should buzz. */
  safetyRejected: "safetyRejected",
  /** An unmatched transcript in IDLE. Payload: { text }. Someone else calls Gemini. */
  lessonRequested: "lessonRequested",
  /**
   * The user asked to stop. Payload: { from }.
   * Emitted by the engine even when the mode does not change, because "stop"
   * during COMPILING must cancel the in-flight Gemini call and the engine is
   * still sitting in IDLE at that point — modeChanged would never fire.
   */
  stopRequested: "stopRequested",
  /**
   * The lesson-request chain changed state. Payload: RequestStatePayload.
   * IDLE / COMPILING / BUSY / ERROR. This is what the StatusBar and the
   * assembling-lesson VFX render.
   */
  requestStateChanged: "requestStateChanged",
  /**
   * Where this lesson's ground content belongs. Payload: LessonAnchorPayload.
   * Emitted immediately before the plan reaches the engine.
   */
  lessonAnchorChanged: "lessonAnchorChanged",
  /** An unmatched transcript during a LESSON. Payload: { title, stepInstruction, question }. */
  qaRequested: "qaRequested",
  /**
   * Speak this step now. Payload: { stepIndex, text }.
   * The engine NEVER waits for audio — see the narration seam in Docs/SCENE-MAP.md.
   */
  narrationRequested: "narrationRequested",
  /** Warm the NEXT step's audio while this one plays. Payload: { stepIndex, text }. */
  narrationPrefetch: "narrationPrefetch",
  /**
   * Speak this text WITHOUT interrupting anything. Payload: { text, source }.
   * Q&A answers use this: a step's narration outranks an answer to a question
   * about it, so the answer queues and follows.
   */
  speakRequested: "speakRequested",
  /**
   * Narration playback started or stopped, OR became pending.
   * Payload: { speaking, pending, pendingText, text, source }.
   *
   * `pending` is the 6.5-18.6 s window between a step appearing and its voice
   * arriving. The step text is never gated on it — the HUD shows the
   * instruction immediately and this only says that audio is still coming.
   */
  narrationStateChanged: "narrationStateChanged",
  /** A Q&A answer came back. Payload: { question, answer, latencyMs }. */
  qaAnswered: "qaAnswered",
  /** Something asked for the AR keyboard. Payload: { source }. */
  keyboardRequested: "keyboardRequested",

  // --- Main menu (MainMenuPresenter.ts + LessonEngine.ts) -----------------
  /**
   * The user picked a main-menu row. Payload: MenuSelectedPayload.
   * Modelled on siteSelected: the presenter (pinch) and the engine (voice)
   * both emit it, and each behaviour's owner subscribes — the coordinator for
   * the lesson rows, SurveyController for row 1, the engine for row 6. NO menu
   * selection may reach Gemini directly; rows 2-5 become fixed phrases in the
   * coordinator, exactly like a site-marker tap.
   */
  menuSelected: "menuSelected",
  /**
   * A camp point was established (a site marker was chosen). Payload:
   * CampChangedPayload. The menu's row 6 exists only while this has fired.
   */
  campChanged: "campChanged",
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus {
  private handlers: Map<string, EventHandler<any>[]> = new Map();

  /** Register a handler. Returns an unsubscribe function for convenience. */
  subscribe<T = unknown>(event: EventName, handler: EventHandler<T>): () => void {
    let list = this.handlers.get(event);
    if (!list) {
      list = [];
      this.handlers.set(event, list);
    }
    list.push(handler);
    return () => this.unsubscribe(event, handler);
  }

  /** Remove a previously registered handler. No-op if it was never registered. */
  unsubscribe<T = unknown>(event: EventName, handler: EventHandler<T>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.handlers.delete(event);
  }

  /**
   * Fire an event. Iterates a copy so a handler may subscribe/unsubscribe
   * during dispatch without corrupting the walk. One throwing handler must not
   * prevent the rest from running.
   */
  emit<T = unknown>(event: EventName, payload?: T): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload as T);
      } catch (e) {
        print("[EventBus] handler threw on '" + event + "': " + e);
      }
    }
  }

  /** Drop every handler for one event, or all events when omitted. */
  clear(event?: EventName): void {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
  }

  /** Handler count — for diagnostics only. */
  listenerCount(event: EventName): number {
    const list = this.handlers.get(event);
    return list ? list.length : 0;
  }
}

/** Shared instance. Import this rather than constructing a second bus. */
export const eventBus = new EventBus();
