/**
 * LessonEngine — the lesson state machine.
 *
 * Fully deterministic: zero Gemini calls, zero TTS calls, zero references to
 * widget visuals. It talks to the presentation layer ONLY through the EventBus
 * (hard rule 3), and it never blocks on anything asynchronous.
 *
 * When it needs AI it EMITS and moves on (`lessonRequested`, `qaRequested`);
 * someone else makes the call. Same for audio (`narrationRequested`). That is
 * what keeps this file testable from fixtures alone.
 */
import { eventBus, Events } from "./EventBus";
import { LessonCompanion, LessonPlan, LessonStep } from "./LessonSchema";
import { describeDegradations, inferLessonKind, validateLesson } from "./LessonValidator";

export type EngineMode = "IDLE" | "SURVEY" | "LESSON" | "SOS" | "COMPLETE";

/** Local navigation intents. Matched with NO AI call — hard rule 6. */
type NavIntent = "next" | "back" | "repeat" | "done" | "confirm" | "stop" | "check" | "sos";

/**
 * Multi-word phrases are specific enough to match anywhere in a transcript.
 * Bare single words are not — "how do I check the wind" must NOT be swallowed
 * as a `check` command. Those only match in a SHORT utterance (see
 * shortUtteranceMaxWords). SOS always matches, at any length: an emergency word
 * must never be routed to Gemini as a question.
 */
const NAV_PHRASES: { intent: NavIntent; phrase: string; anywhere: boolean }[] = [
  { intent: "sos", phrase: "sos", anywhere: true },
  { intent: "sos", phrase: "emergency", anywhere: true },
  { intent: "sos", phrase: "mayday", anywhere: true },

  { intent: "next", phrase: "next step", anywhere: true },
  { intent: "next", phrase: "go on", anywhere: true },
  { intent: "next", phrase: "carry on", anywhere: true },
  { intent: "next", phrase: "keep going", anywhere: true },
  { intent: "next", phrase: "next", anywhere: false },
  { intent: "next", phrase: "continue", anywhere: false },
  { intent: "next", phrase: "forward", anywhere: false },

  { intent: "back", phrase: "go back", anywhere: true },
  { intent: "back", phrase: "previous step", anywhere: true },
  { intent: "back", phrase: "last step", anywhere: true },
  { intent: "back", phrase: "back", anywhere: false },
  { intent: "back", phrase: "previous", anywhere: false },

  { intent: "repeat", phrase: "say that again", anywhere: true },
  { intent: "repeat", phrase: "one more time", anywhere: true },
  { intent: "repeat", phrase: "what was that", anywhere: true },
  { intent: "repeat", phrase: "repeat that", anywhere: true },
  { intent: "repeat", phrase: "repeat", anywhere: false },
  { intent: "repeat", phrase: "again", anywhere: false },

  { intent: "done", phrase: "im done", anywhere: true },
  { intent: "done", phrase: "i am done", anywhere: true },
  { intent: "done", phrase: "thats done", anywhere: true },
  { intent: "done", phrase: "got it", anywhere: true },
  { intent: "done", phrase: "done", anywhere: false },
  { intent: "done", phrase: "finished", anywhere: false },

  { intent: "confirm", phrase: "i understand", anywhere: true },
  { intent: "confirm", phrase: "understood", anywhere: false },
  { intent: "confirm", phrase: "confirm", anywhere: false },
  { intent: "confirm", phrase: "confirmed", anywhere: false },
  { intent: "confirm", phrase: "yes", anywhere: false },

  { intent: "stop", phrase: "start over", anywhere: true },
  { intent: "stop", phrase: "never mind", anywhere: true },
  { intent: "stop", phrase: "stop", anywhere: false },
  { intent: "stop", phrase: "cancel", anywhere: false },
  { intent: "stop", phrase: "quit", anywhere: false },
  { intent: "stop", phrase: "new", anywhere: false },

  { intent: "check", phrase: "check it off", anywhere: true },
  { intent: "check", phrase: "tick it", anywhere: true },
  { intent: "check", phrase: "check", anywhere: false },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

@component
export class LessonEngine extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Behaviour</span>')

  @input
  @hint("Seconds to sit in COMPLETE before returning to IDLE.")
  private completeReturnDelaySec: number = 4;

  @input
  @hint("A bare command word ('next', 'check') only counts as navigation in an utterance this short. Longer ones are treated as questions.")
  private shortUtteranceMaxWords: number = 4;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — preview iteration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Single letters A-Z. These call the SAME methods as voice, not a parallel branch. Click the Preview panel first so it has focus.</span>')

  @input
  @hint("Turn every debug key off before shipping.")
  private enableDebugKeys: boolean = true;

  @input private keyLoadCampfire: string = "C";
  @input private keyLoadWater: string = "W";
  @input private keyNext: string = "N";
  @input private keyBack: string = "B";
  @input private keyConfirm: string = "K";
  @input private keyDone: string = "D";

  @input
  @hint("Runs a table of canned transcripts through the SAME classifier handleTranscript uses, and logs the routing decision for each. Non-destructive: classifies only, executes nothing.")
  private keyRoutingSelfTest: string = "R";

  @input
  @allowUndefined
  @hint("Assets/AI/fixtures/lesson-help-me-build-a-campfire.raw.json")
  private campfireFixture: JsonAsset;

  @input
  @allowUndefined
  @hint("Assets/AI/fixtures/lesson-help-me-purify-water.raw.json — no hologram, exercises companion:null")
  private waterFixture: JsonAsset;

  @ui.separator

  @input
  @hint("Log every emitted event. Loud but this is the only way to read a run.")
  private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private mode: EngineMode = "IDLE";
  private plan: LessonPlan | null = null;
  private stepIndex: number = 0;
  private safetyPending: boolean = false;
  /** checkedItems[stepIndex] = array of booleans, one per checklist item. */
  private checkedItems: { [stepIndex: number]: boolean[] } = {};
  /** propCounts[stepIndex] = props placed so far on that step. */
  private propCounts: { [stepIndex: number]: number } = {};

  private timerTotalSec: number = 0;
  private timerRemainingSec: number = 0;
  private timerRunning: boolean = false;
  private lastTickWholeSec: number = -1;

  private completeDelay: DelayedCallbackEvent;

  // ---------------------------------------------------------------- lifecycle

  onAwake(): void {
    this.completeDelay = this.createEvent("DelayedCallbackEvent");
    this.completeDelay.bind(() => this.setMode("IDLE"));

    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    // The ONLY input seam: whatever produced the transcript is irrelevant here.
    eventBus.subscribe(Events.userRequest, (p: { text: string }) => {
      this.handleTranscript(p ? p.text : "");
    });

    // The survey does not own the mode; this does. SurveyController reports
    // facts ("started", "complete") and the state machine decides what mode
    // that means, so there is still exactly one owner of `mode` — the same
    // reason ModeRouter owns root visibility instead of the presenters.
    eventBus.subscribe(Events.surveyStarted, () => {
      if (this.mode === "IDLE") this.setMode("SURVEY");
      else this.log("surveyStarted ignored: mode is " + this.mode);
    });
    eventBus.subscribe(Events.surveyComplete, () => {
      if (this.mode === "SURVEY") this.setMode("IDLE");
    });
    // Nothing acts on a chosen site yet — starting a lesson from one is the
    // next task. Logged so the seam is visible in a run rather than only in code.
    eventBus.subscribe(Events.siteSelected, (p: { kind: string; slot: string }) => {
      this.log("siteSelected " + (p ? p.slot + " (" + p.kind + ")" : "?") + " — no lesson wired to this yet");
    });

    if (this.enableDebugKeys) this.bindDebugKeys();

    this.log(
      "ready. mode=" + this.mode +
        " debugKeys=" + (this.enableDebugKeys
          ? this.keyLoadCampfire + "/" + this.keyLoadWater + " load, " +
            this.keyNext + "/" + this.keyBack + "/" + this.keyConfirm + "/" + this.keyDone
          : "off")
    );
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[ENGINE] " + msg);
  }

  /** Single funnel for every emission, so the log IS the event sequence. */
  private emit(event: string, payload?: any): void {
    if (this.enableLogging) {
      const body = payload === undefined ? "" : " " + JSON.stringify(payload);
      print("[ENGINE] emit " + event + body);
    }
    eventBus.emit(event as any, payload);
  }

  // --------------------------------------------------------- voice routing

  /**
   * Hard rule 6: local keywords FIRST, with no AI call. Only what does not
   * match is allowed to become an AI request — and even then this method only
   * emits; it never calls anything.
   */
  public handleTranscript(raw: string): void {
    const text = this.normalize(raw);
    if (text.length === 0) return;

    this.log('transcript "' + raw + '" -> normalized "' + text + '"');

    const intent = this.matchNavIntent(text);
    if (intent) {
      this.log("routed: navigation/" + intent + " (no AI call)");
      this.dispatchNav(intent);
      return;
    }

    if (this.mode === "LESSON") {
      const step = this.currentStep();
      this.log("routed: qaRequested (unmatched during LESSON)");
      this.emit(Events.qaRequested, {
        title: this.plan ? this.plan.title : "",
        stepInstruction: step ? step.instruction : "",
        question: raw,
      });
      return;
    }

    this.log("routed: lessonRequested (unmatched in " + this.mode + ")");
    this.emit(Events.lessonRequested, { text: raw });
  }

  /** Lowercase, strip punctuation, collapse whitespace. */
  private normalize(raw: string): string {
    const lower = (raw || "").toLowerCase();
    let out = "";
    for (let i = 0; i < lower.length; i++) {
      const ch = lower.charAt(i);
      const isAlnum = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
      out += isAlnum ? ch : " ";
    }
    // collapse runs of spaces
    const parts = out.split(" ");
    const words: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) words.push(parts[i]);
    }
    return words.join(" ");
  }

  /**
   * What WOULD happen to this transcript, without doing it. Same functions
   * handleTranscript() uses, so the self-test cannot drift from live routing.
   */
  public classify(raw: string): string {
    const text = this.normalize(raw);
    if (text.length === 0) return "ignored/empty";
    const intent = this.matchNavIntent(text);
    if (intent) return "navigation/" + intent;
    return this.mode === "LESSON" ? "qaRequested" : "lessonRequested";
  }

  private runRoutingSelfTest(): void {
    const cases = [
      "next",
      "okay next please",
      "go on",
      "previous",
      "say that again",
      "I'm done",
      "start over",
      "confirm",
      "SOS!",
      "help me build a campfire",
      "how do I check the wind direction?",
      "what kind of wood burns longest",
      "is it safe to leave this burning overnight",
    ];
    this.log("routing self-test (mode=" + this.mode + ", classify only, nothing executed)");
    for (let i = 0; i < cases.length; i++) {
      this.log('  "' + cases[i] + '" -> ' + this.classify(cases[i]));
    }
  }

  private matchNavIntent(text: string): NavIntent | null {
    const wordCount = text.split(" ").length;
    const isShort = wordCount <= this.shortUtteranceMaxWords;

    for (let i = 0; i < NAV_PHRASES.length; i++) {
      const entry = NAV_PHRASES[i];
      if (!entry.anywhere && !isShort) continue;
      if (this.containsPhrase(text, entry.phrase)) return entry.intent;
    }
    return null;
  }

  /** Whole-word containment, so "backpack" never matches "back". */
  private containsPhrase(text: string, phrase: string): boolean {
    const padded = " " + text + " ";
    return padded.indexOf(" " + phrase + " ") >= 0;
  }

  private dispatchNav(intent: NavIntent): void {
    if (intent === "next") this.next();
    else if (intent === "back") this.back();
    else if (intent === "repeat") this.repeat();
    else if (intent === "done" || intent === "check") this.done();
    else if (intent === "confirm") this.confirm();
    else if (intent === "stop") this.stop();
    else if (intent === "sos") this.sos();
  }

  // ------------------------------------------------------------ lesson load

  /** Load from a stored fixture — deterministic, no Gemini. Hard rule 5. */
  public loadFromFixture(asset: JsonAsset, label: string): void {
    if (!asset) {
      this.log("loadFromFixture(" + label + "): asset not wired");
      return;
    }

    let payload = "";
    try {
      const envelope = JSON.parse(asset.getString());
      payload = envelope.candidates[0].content.parts[0].text;
    } catch (e) {
      this.log("loadFromFixture(" + label + "): could not read envelope: " + e);
      return;
    }

    // Same validator the live path uses — a fixture gets no special treatment.
    const result = validateLesson(payload, inferLessonKind(label, ""));
    if (!result.ok) {
      this.log("loadFromFixture(" + label + "): REJECTED — " + result.summary);
      return;
    }
    // A degraded lesson is still loaded — that is the point. Log what it cost
    // so a model quietly getting sloppier shows up here rather than nowhere.
    if (result.degradations.length > 0) {
      this.log(
        "loadFromFixture(" + label + "): DEGRADED x" + result.degradations.length +
          " — " + describeDegradations(result.degradations)
      );
    }
    this.log("loadFromFixture(" + label + "): valid, " + result.plan.steps.length + " steps");
    this.loadLesson(result.plan);
  }

  public loadLesson(plan: LessonPlan): void {
    this.plan = plan;
    this.stepIndex = 0;
    this.checkedItems = {};
    this.propCounts = {};
    this.safetyPending = false;
    this.stopTimer();
    // Cancel any pending COMPLETE->IDLE return. Without this, finishing a
    // lesson and immediately starting another one lets the old timer fire
    // mid-lesson and yank the user back to IDLE.
    this.completeDelay.enabled = false;

    this.setMode("LESSON");
    this.emit(Events.lessonStarted, { title: plan.title, stepCount: plan.steps.length });
    this.enterStep(0, "load");
  }

  // ------------------------------------------------------------ navigation

  public next(): void {
    if (this.mode !== "LESSON" || !this.plan) return;

    if (this.safetyPending) {
      const step = this.currentStep();
      this.emit(Events.safetyRejected, {
        stepIndex: this.stepIndex,
        warning: step ? step.warning : null,
      });
      return;
    }

    const last = this.plan.steps.length - 1;
    if (this.stepIndex >= last) {
      this.complete();
      return;
    }
    this.enterStep(this.stepIndex + 1, "next");
  }

  public back(): void {
    if (this.mode !== "LESSON" || !this.plan) return;
    if (this.stepIndex <= 0) {
      // Explicitly a no-op, not an error: re-narrate so the user gets feedback.
      this.log("back() at first step — staying put");
      this.repeat();
      return;
    }
    this.enterStep(this.stepIndex - 1, "back");
  }

  /** Re-narrate only. No widget rebuild, no state change. */
  public repeat(): void {
    const step = this.currentStep();
    if (!step) return;
    this.emit(Events.narrationRequested, { stepIndex: this.stepIndex, text: step.instruction });
  }

  public confirm(): void {
    if (!this.safetyPending) {
      this.log("confirm() ignored — nothing pending");
      return;
    }
    this.safetyPending = false;
    this.emit(Events.safetyPending, {
      stepIndex: this.stepIndex,
      pending: false,
      warning: null,
    });
  }

  /**
   * Checks the topmost unchecked checklist item. When the last one is checked
   * the step auto-completes. A step with no checklist treats "done" as
   * "this step is finished".
   */
  public done(): void {
    if (this.mode !== "LESSON" || !this.plan) return;

    const step = this.currentStep();
    if (!step) return;

    const items = this.checklistItems(step);
    if (items === null) {
      this.log("done() on a step with no checklist — advancing");
      this.next();
      return;
    }

    const checked = this.checkedItems[this.stepIndex];
    let target = -1;
    for (let i = 0; i < checked.length; i++) {
      if (!checked[i]) {
        target = i;
        break;
      }
    }

    if (target < 0) {
      this.log("done() but every item is already checked — advancing");
      this.next();
      return;
    }

    checked[target] = true;
    this.emit(Events.checklistUpdated, {
      stepIndex: this.stepIndex,
      items: items,
      checked: checked.slice(),
      justChecked: target,
    });

    let allChecked = true;
    for (let i = 0; i < checked.length; i++) {
      if (!checked[i]) allChecked = false;
    }
    if (allChecked) {
      this.log("checklist complete — auto-advancing");
      this.next();
    }
  }

  public stop(): void {
    this.log("stop() — resetting from " + this.mode);
    // Announced BEFORE the reset, and unconditionally: setMode() is a no-op
    // when the mode is unchanged, so a "stop" spoken while a request is
    // compiling (engine still IDLE) would otherwise be silent and the Gemini
    // call would run to completion and load a lesson the user cancelled.
    this.emit(Events.stopRequested, { from: this.mode });
    this.plan = null;
    this.stepIndex = 0;
    this.safetyPending = false;
    this.checkedItems = {};
    this.propCounts = {};
    this.stopTimer();
    this.completeDelay.enabled = false;
    this.setMode("IDLE");
  }

  public sos(): void {
    this.stopTimer();
    this.setMode("SOS");
  }

  /** Read-only mode, for diagnostics. Nothing may set the mode from outside. */
  public currentMode(): EngineMode {
    return this.mode;
  }

  /** Called by the (future) prop system when a training prop is placed. */
  public notifyPropPlaced(): void {
    if (this.mode !== "LESSON" || !this.plan) return;
    const step = this.currentStep();
    if (!step) return;

    const current = (this.propCounts[this.stepIndex] || 0) + 1;
    this.propCounts[this.stepIndex] = current;

    const required = step.props_required ? step.props_required : 0;
    this.emit(Events.propPlaced, { stepIndex: this.stepIndex, placed: current, required: required });

    if (required > 0 && current >= required) {
      this.log("prop requirement met — auto-advancing");
      this.next();
    }
  }

  // ----------------------------------------------------------------- steps

  private currentStep(): LessonStep | null {
    if (!this.plan) return null;
    if (this.stepIndex < 0 || this.stepIndex >= this.plan.steps.length) return null;
    return this.plan.steps[this.stepIndex];
  }

  /** Returns the item list, initialising check state; null if not a checklist step. */
  private checklistItems(step: LessonStep): string[] | null {
    const c = step.companion;
    if (!c || c.type !== "checklist" || !c.items || c.items.length === 0) return null;
    if (!this.checkedItems[this.stepIndex]) {
      const fresh: boolean[] = [];
      for (let i = 0; i < c.items.length; i++) fresh.push(false);
      this.checkedItems[this.stepIndex] = fresh;
    }
    return c.items;
  }

  private enterStep(index: number, reason: string): void {
    this.stepIndex = index;
    const step = this.currentStep();
    if (!step) return;

    this.stopTimer();
    this.safetyPending = false;

    this.emit(Events.stepChanged, {
      stepIndex: index,
      total: this.plan.steps.length,
      instruction: step.instruction,
      reason: reason,
    });

    // --- narration seam: request now, warm the next one immediately after.
    // The engine never waits for either. See Docs/SCENE-MAP.md.
    this.emit(Events.narrationRequested, { stepIndex: index, text: step.instruction });
    const upcoming = this.plan.steps[index + 1];
    if (upcoming) {
      this.emit(Events.narrationPrefetch, { stepIndex: index + 1, text: upcoming.instruction });
    }

    this.announceCompanion(step);

    if (step.safety) {
      this.safetyPending = true;
      this.emit(Events.safetyPending, {
        stepIndex: index,
        pending: true,
        warning: step.warning,
      });
    }
  }

  /** companionChanged is a ROUTER event — it enables an existing widget. */
  private announceCompanion(step: LessonStep): void {
    const c: LessonCompanion | null = step.companion;
    this.emit(Events.companionChanged, {
      stepIndex: this.stepIndex,
      type: c ? c.type : null,
      companion: c,
    });

    if (!c) return;

    if (c.type === "hologram_stage" && typeof c.stage === "number") {
      this.emit(Events.hologramStage, { stepIndex: this.stepIndex, stage: c.stage });
    } else if (c.type === "checklist") {
      const items = this.checklistItems(step);
      if (items) {
        this.emit(Events.checklistUpdated, {
          stepIndex: this.stepIndex,
          items: items,
          checked: this.checkedItems[this.stepIndex].slice(),
          justChecked: -1,
        });
      }
    } else if (c.type === "timer" && typeof c.duration_sec === "number" && c.duration_sec > 0) {
      this.startTimer(c.duration_sec);
    }
  }

  private complete(): void {
    this.stopTimer();
    this.emit(Events.lessonCompleted, {
      title: this.plan ? this.plan.title : "",
      steps: this.plan ? this.plan.steps.length : 0,
    });
    this.setMode("COMPLETE");
    this.completeDelay.enabled = true;
    this.completeDelay.reset(this.completeReturnDelaySec);
  }

  private setMode(next: EngineMode): void {
    if (this.mode === next) return;
    const from = this.mode;
    this.mode = next;
    this.emit(Events.modeChanged, { from: from, to: next });
  }

  // ----------------------------------------------------------------- timer

  private startTimer(durationSec: number): void {
    this.timerTotalSec = durationSec;
    this.timerRemainingSec = durationSec;
    this.timerRunning = true;
    this.lastTickWholeSec = -1;
  }

  private stopTimer(): void {
    this.timerRunning = false;
    this.timerRemainingSec = 0;
    this.timerTotalSec = 0;
    this.lastTickWholeSec = -1;
  }

  private onUpdate(): void {
    if (!this.timerRunning) return;

    this.timerRemainingSec -= getDeltaTime();
    if (this.timerRemainingSec < 0) this.timerRemainingSec = 0;

    // Emit on whole-second boundaries only — a per-frame event would drown the bus.
    const whole = Math.ceil(this.timerRemainingSec);
    if (whole !== this.lastTickWholeSec) {
      this.lastTickWholeSec = whole;
      this.emit(Events.timerTick, {
        stepIndex: this.stepIndex,
        remainingSec: whole,
        totalSec: this.timerTotalSec,
      });
    }

    // Timer expiry does NOT auto-advance: a countdown is a pacing aid, and
    // silently skipping a step the user is mid-way through would be worse
    // than letting it sit at zero.
    if (this.timerRemainingSec <= 0) this.timerRunning = false;
  }

  // ------------------------------------------------------------ debug keys

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const campfire = this.keyFromLetter(this.keyLoadCampfire);
    const water = this.keyFromLetter(this.keyLoadWater);
    const nextK = this.keyFromLetter(this.keyNext);
    const backK = this.keyFromLetter(this.keyBack);
    const confirmK = this.keyFromLetter(this.keyConfirm);
    const doneK = this.keyFromLetter(this.keyDone);
    const routeK = this.keyFromLetter(this.keyRoutingSelfTest);

    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      // Every branch calls the same public method voice does — no parallel path.
      if (e.key === campfire) {
        this.log("debug key: load campfire fixture");
        this.loadFromFixture(this.campfireFixture, "campfire");
      } else if (e.key === water) {
        this.log("debug key: load water fixture");
        this.loadFromFixture(this.waterFixture, "purify water");
      } else if (e.key === nextK) {
        this.log("debug key: next");
        this.next();
      } else if (e.key === backK) {
        this.log("debug key: back");
        this.back();
      } else if (e.key === confirmK) {
        this.log("debug key: confirm");
        this.confirm();
      } else if (e.key === doneK) {
        this.log("debug key: done");
        this.done();
      } else if (e.key === routeK) {
        this.runRoutingSelfTest();
      }
    });
  }
}
