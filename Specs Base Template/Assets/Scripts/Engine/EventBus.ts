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
  /** Terrain survey progress, 0..1. */
  surveyProgress: "surveyProgress",
  /** Terrain survey finished; site markers can be shown. */
  surveyComplete: "surveyComplete",
  /** User strayed too far from the active zone / site. */
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
