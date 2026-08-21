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
import { MenuChipPayload, TrailStatePayload } from "./NavTypes";
import { CampChangedPayload, MenuSelectedPayload } from "./RequestTypes";
import { XYZ } from "./SurveyTypes";

export type EngineMode = "IDLE" | "SURVEY" | "LESSON" | "NAVIGATE" | "SOS" | "COMPLETE";

/** Local navigation intents. Matched with NO AI call — hard rule 6. */
type NavIntent = "next" | "back" | "repeat" | "done" | "confirm" | "stop" | "check" | "sos" | "recenter";

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

  { intent: "recenter", phrase: "recenter the hud", anywhere: true },
  { intent: "recenter", phrase: "re center", anywhere: true },
  { intent: "recenter", phrase: "recenter", anywhere: false },
  { intent: "recenter", phrase: "center the menu", anywhere: true },
];

/**
 * Main-menu voice selection — matched LOCALLY, after navigation, IDLE only.
 * Hard rule 6 still holds: none of this reaches Gemini; a match becomes a
 * `menuSelected` emission and the row's owner takes it from there.
 *
 * Numerals are the PRIMARY shortcut ("one".."six" and the digits) because a
 * single digit survives poor ASR far better than a phrase. Bare words only
 * count in a short utterance — "how do I make fire from sticks" must stay a
 * real question — while the specific multi-word forms match anywhere.
 */
const MENU_PHRASES: { row: number; phrase: string; anywhere: boolean }[] = [
  { row: 1, phrase: "scan this area", anywhere: true },
  { row: 1, phrase: "scan the area", anywhere: true },
  { row: 2, phrase: "i need shelter", anywhere: true },
  { row: 3, phrase: "i need fire", anywhere: true },
  { row: 3, phrase: "i need a fire", anywhere: true },
  { row: 4, phrase: "i need water", anywhere: true },
  { row: 5, phrase: "im hurt", anywhere: true },
  { row: 5, phrase: "i am hurt", anywhere: true },
  { row: 6, phrase: "take me back to camp", anywhere: true },
  { row: 6, phrase: "back to camp", anywhere: true },

  { row: 1, phrase: "one", anywhere: false },
  { row: 1, phrase: "1", anywhere: false },
  { row: 1, phrase: "scan", anywhere: false },
  { row: 1, phrase: "survey", anywhere: false },
  { row: 2, phrase: "two", anywhere: false },
  { row: 2, phrase: "2", anywhere: false },
  { row: 2, phrase: "shelter", anywhere: false },
  { row: 2, phrase: "tent", anywhere: false },
  { row: 3, phrase: "three", anywhere: false },
  { row: 3, phrase: "3", anywhere: false },
  { row: 3, phrase: "fire", anywhere: false },
  { row: 4, phrase: "four", anywhere: false },
  { row: 4, phrase: "4", anywhere: false },
  { row: 4, phrase: "water", anywhere: false },
  { row: 5, phrase: "five", anywhere: false },
  { row: 5, phrase: "5", anywhere: false },
  { row: 5, phrase: "hurt", anywhere: false },
  { row: 6, phrase: "six", anywhere: false },
  { row: 6, phrase: "6", anywhere: false },
  { row: 6, phrase: "camp", anywhere: false },
];

/**
 * Footer-chip voice twins — matched locally like everything else. setCamp and
 * trailStart are executed by NavigationController; followTrail enters NAVIGATE
 * here (a mode change is the engine's job).
 */
const CHIP_PHRASES: { chip: "setCamp" | "trailStart" | "followTrail" | "journal"; phrase: string; anywhere: boolean }[] = [
  { chip: "setCamp", phrase: "set camp", anywhere: true },
  { chip: "setCamp", phrase: "mark camp", anywhere: true },
  { chip: "setCamp", phrase: "camp here", anywhere: true },
  { chip: "trailStart", phrase: "leaving camp", anywhere: true },
  { chip: "trailStart", phrase: "start the trail", anywhere: true },
  { chip: "trailStart", phrase: "record my trail", anywhere: true },
  { chip: "followTrail", phrase: "follow the trail", anywhere: true },
  { chip: "followTrail", phrase: "follow trail", anywhere: true },
  { chip: "followTrail", phrase: "trail", anywhere: false },

  { chip: "journal", phrase: "show the log", anywhere: true },
  { chip: "journal", phrase: "open the log", anywhere: true },
  { chip: "journal", phrase: "close the log", anywhere: true },
  { chip: "journal", phrase: "session log", anywhere: true },
  { chip: "journal", phrase: "journal", anywhere: false },
  { chip: "journal", phrase: "log", anywhere: false },
];

/**
 * Completion-card responses — matched ONLY in COMPLETE mode while a next-step
 * suggestion is pending, before anything else. Without this pre-check, "do it"
 * would fall through to `lessonRequested` and fire a Gemini call with the
 * words "do it", which is the guide mishearing its own suggestion.
 */
const SUGGESTION_PHRASES: { verdict: "accept" | "decline"; phrase: string; anywhere: boolean }[] = [
  { verdict: "accept", phrase: "do it", anywhere: true },
  { verdict: "accept", phrase: "lets do it", anywhere: true },
  { verdict: "accept", phrase: "go ahead", anywhere: true },
  { verdict: "accept", phrase: "yes please", anywhere: true },
  { verdict: "accept", phrase: "yes", anywhere: false },
  { verdict: "accept", phrase: "yeah", anywhere: false },
  { verdict: "accept", phrase: "sure", anywhere: false },
  { verdict: "accept", phrase: "okay", anywhere: false },
  { verdict: "accept", phrase: "ok", anywhere: false },
  { verdict: "accept", phrase: "next", anywhere: false },

  { verdict: "decline", phrase: "not now", anywhere: true },
  { verdict: "decline", phrase: "no thanks", anywhere: true },
  { verdict: "decline", phrase: "no", anywhere: false },
  { verdict: "decline", phrase: "later", anywhere: false },
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
  @hint("Seconds to sit in COMPLETE when a next-step suggestion is ON the card — the user needs time to read it and answer. It NEVER auto-starts; the dwell ending just returns to IDLE.")
  private suggestionDwellSec: number = 14;

  @input
  @hint("Seconds to hold the completion card while a next-step suggestion may still arrive (the coordinator's background call takes a few seconds). A definite 'none' cuts this short immediately, so a failed call costs nothing.")
  private suggestionWaitSec: number = 11;

  @input
  @hint("A bare command word ('next', 'check') only counts as navigation in an utterance this short. Longer ones are treated as questions.")
  private shortUtteranceMaxWords: number = 4;

  @input
  @hint("Spoken on entering NAVIGATE in bearing mode (menu row 6 / voice).")
  private navigateLine: string = "Head for camp. Follow the arrow.";

  @input
  @hint("Spoken on entering NAVIGATE in trail mode.")
  private followTrailLine: string = "Follow the stakes back. They are your own footsteps.";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — preview iteration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Single letters A-Z. These call the SAME methods as voice, not a parallel branch. Click the Preview panel first so it has focus.</span>')

  @input
  @hint("Turn every debug key off before shipping.")
  private enableDebugKeys: boolean = true;

  // NO debug key may sit on W/A/S/D, Q/E or the arrows: those are Interactive
  // Preview movement, injected keys DO reach the Lens, and a walking capture
  // would silently drive the engine. Right-hand cluster only.
  @input private keyLoadCampfire: string = "C";
  @input @hint("H as in H2O — 'W' is walk-forward.") private keyLoadWater: string = "H";
  @input private keyNext: string = "N";
  @input private keyBack: string = "B";
  @input private keyConfirm: string = "K";
  @input @hint("O as in dOne — 'D' is strafe-right.") private keyDone: string = "O";

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

  /**
   * Camp / trail state MIRRORED off the bus (campChanged / trailStateChanged).
   * NavigationController owns the truth; the engine only needs enough to gate
   * NAVIGATE entry and to stamp row 6's payload. Still deterministic — this is
   * bus state, not scene state.
   */
  private campPosition: XYZ | null = null;
  private trailMarkCount: number = 0;

  /**
   * The completion card's pending next-step phrase. Set on complete(), cleared
   * on ANY exit from COMPLETE. While set, "yes" / "do it" / "next" (and pinch,
   * via suggestionAccepted) feed it VERBATIM into lessonRequested — the same
   * generative path the menu rows use. Nothing here auto-starts.
   */
  private pendingSuggestion: string = "";

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
    // Camp and trail truth lives in NavigationController; the engine mirrors
    // just enough off the bus to gate NAVIGATE entry (see the fields above).
    eventBus.subscribe(Events.campChanged, (p: CampChangedPayload) => {
      this.campPosition = p ? p.position : null;
    });
    eventBus.subscribe(Events.trailStateChanged, (p: TrailStatePayload) => {
      this.trailMarkCount = p ? p.markCount : 0;
    });

    // Row 6 enters NAVIGATE in bearing mode. Rows 1-5 have other owners
    // (SurveyController, LessonCoordinator).
    eventBus.subscribe(Events.menuSelected, (p: MenuSelectedPayload) => {
      if (!p || p.row !== 6) return;
      this.navigate("bearing", p.source);
    });
    // followTrail is the one chip the engine takes — it is a mode change.
    eventBus.subscribe(Events.menuChipSelected, (p: MenuChipPayload) => {
      if (!p || p.chip !== "followTrail") return;
      this.navigate("trail", p.source);
    });
    // Arrival is a fact reported by the controller; the engine decides it
    // means IDLE — the same single-owner rule as the survey.
    eventBus.subscribe(Events.campReached, () => {
      if (this.mode === "NAVIGATE") this.setMode("IDLE");
    });

    // Pinch on the completion card's next line. Voice lands in
    // handleTranscript; both funnel through acceptSuggestion.
    eventBus.subscribe(Events.suggestionAccepted, (p: { source: string }) => {
      this.acceptSuggestion(p ? p.source : "pinch");
    });

    // A late suggestion from the coordinator's background call. It only ever
    // ARMS the card — accepting is still the user's act.
    eventBus.subscribe(Events.nextStepSuggested, (p: { text: string }) => {
      if (this.mode !== "COMPLETE") return;
      const text = p && p.text ? p.text : "";
      if (text.length > 0) {
        this.pendingSuggestion = text;
        this.log('next-step suggestion armed: "' + text + '"');
        // Fresh time to read and answer, measured from when the line appeared.
        this.completeDelay.enabled = true;
        this.completeDelay.reset(this.suggestionDwellSec);
      } else if (this.pendingSuggestion.length === 0) {
        // A definite "none": stop holding the card open for nothing.
        this.log("no next-step suggestion — shortening the completion dwell");
        this.completeDelay.enabled = true;
        this.completeDelay.reset(this.completeReturnDelaySec);
      }
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

    // Completion card first: while a suggestion is pending, yes/no words are
    // answers to the card, not navigation — and "do it" must never fall
    // through to Gemini as the literal request "do it".
    if (this.mode === "COMPLETE" && this.pendingSuggestion.length > 0) {
      const verdict = this.matchSuggestion(text);
      if (verdict === "accept") {
        this.log("routed: suggestion/accept (no AI call)");
        this.acceptSuggestion("voice");
        return;
      }
      if (verdict === "decline") {
        this.log("routed: suggestion/decline (no AI call)");
        this.declineSuggestion("voice");
        return;
      }
    }

    const intent = this.matchNavIntent(text);
    if (intent) {
      this.log("routed: navigation/" + intent + " (no AI call)");
      this.dispatchNav(intent);
      return;
    }

    // IDLE is the menu, so menu rows are voice targets — still local, still
    // free (hard rule 6). Only what matches nothing may go on to Gemini.
    if (this.mode === "IDLE") {
      const row = this.matchMenuRow(text);
      if (row > 0) {
        this.log("routed: menu/row" + row + " (no AI call)");
        this.selectMenuRow(row, "voice");
        return;
      }
    }

    // Camp/trail chips are voice targets in IDLE and NAVIGATE ("follow the
    // trail" spoken mid-bearing switches modes without leaving NAVIGATE).
    if (this.mode === "IDLE" || this.mode === "NAVIGATE") {
      const chip = this.matchChip(text);
      if (chip) {
        this.log("routed: chip/" + chip + " (no AI call)");
        this.emit(Events.menuChipSelected, { chip: chip, source: "voice" });
        return;
      }
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
    if (this.mode === "COMPLETE" && this.pendingSuggestion.length > 0) {
      const verdict = this.matchSuggestion(text);
      if (verdict) return "suggestion/" + verdict;
    }
    const intent = this.matchNavIntent(text);
    if (intent) return "navigation/" + intent;
    if (this.mode === "IDLE") {
      const row = this.matchMenuRow(text);
      if (row > 0) return "menu/row" + row;
    }
    if (this.mode === "IDLE" || this.mode === "NAVIGATE") {
      const chip = this.matchChip(text);
      if (chip) return "chip/" + chip;
    }
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
      "three",
      "i need shelter",
      "take me back to camp",
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

  /** 1..6, or 0 for no match. Same anywhere/short-utterance mechanics as nav. */
  private matchMenuRow(text: string): number {
    const wordCount = text.split(" ").length;
    const isShort = wordCount <= this.shortUtteranceMaxWords;
    for (let i = 0; i < MENU_PHRASES.length; i++) {
      const entry = MENU_PHRASES[i];
      if (!entry.anywhere && !isShort) continue;
      if (this.containsPhrase(text, entry.phrase)) return entry.row;
    }
    return 0;
  }

  /** Suggestion twin of matchNavIntent — COMPLETE mode only. */
  private matchSuggestion(text: string): "accept" | "decline" | null {
    const wordCount = text.split(" ").length;
    const isShort = wordCount <= this.shortUtteranceMaxWords;
    for (let i = 0; i < SUGGESTION_PHRASES.length; i++) {
      const entry = SUGGESTION_PHRASES[i];
      if (!entry.anywhere && !isShort) continue;
      if (this.containsPhrase(text, entry.phrase)) return entry.verdict;
    }
    return null;
  }

  /**
   * Feed the pending suggestion VERBATIM into the same generative path a menu
   * row uses. The one rule that matters: this runs only on an explicit user
   * act (voice here, pinch via suggestionAccepted) — never on a timer.
   */
  public acceptSuggestion(source: string): void {
    if (this.mode !== "COMPLETE" || this.pendingSuggestion.length === 0) {
      this.log("acceptSuggestion(" + source + ") ignored — nothing pending");
      return;
    }
    const text = this.pendingSuggestion;
    this.log('suggestion accepted (' + source + ') -> "' + text + '"');
    this.completeDelay.enabled = false;
    this.setMode("IDLE"); // clears the pending suggestion (see setMode)
    this.emit(Events.lessonRequested, { text: text });
  }

  /** "No" is an answer too: retire the card now instead of at the dwell's end. */
  public declineSuggestion(source: string): void {
    if (this.mode !== "COMPLETE") return;
    this.log("suggestion declined (" + source + ")");
    this.completeDelay.enabled = false;
    this.setMode("IDLE");
  }

  /** Chip twin of matchMenuRow. */
  private matchChip(text: string): "setCamp" | "trailStart" | "followTrail" | "journal" | null {
    const wordCount = text.split(" ").length;
    const isShort = wordCount <= this.shortUtteranceMaxWords;
    for (let i = 0; i < CHIP_PHRASES.length; i++) {
      const entry = CHIP_PHRASES[i];
      if (!entry.anywhere && !isShort) continue;
      if (this.containsPhrase(text, entry.phrase)) return entry.chip;
    }
    return null;
  }

  /**
   * Enter NAVIGATE — not a companion, not a lesson: a mode of its own. The
   * gates are the mirrored bus state; a refused entry is a log line, and the
   * chips/rows that could ask for it are hidden by the presenters anyway.
   */
  public navigate(navMode: "bearing" | "trail", source: string): void {
    if (navMode === "bearing" && !this.campPosition) {
      this.log("navigate(bearing, " + source + ") refused — no camp set");
      return;
    }
    if (navMode === "trail" && this.trailMarkCount === 0) {
      this.log("navigate(trail, " + source + ") refused — no trail recorded");
      return;
    }
    if (this.mode === "LESSON" || this.mode === "SOS") {
      this.log("navigate refused — mode is " + this.mode);
      return;
    }
    this.setMode("NAVIGATE");
    this.emit(Events.navigateRequested, { navMode: navMode });
    this.emit(Events.speakRequested, {
      text: navMode === "trail" ? this.followTrailLine : this.navigateLine,
      source: "nav",
    });
  }

  /**
   * The one path a menu selection takes from the engine's side. The presenter
   * emits the same event for a pinch; every row's owner subscribes to the bus,
   * so voice and pinch are indistinguishable downstream.
   */
  public selectMenuRow(row: number, source: string): void {
    if (row === 6 && !this.campPosition) {
      this.log("menu row 6 (" + source + ") ignored — no camp point set");
      return;
    }
    const payload: MenuSelectedPayload = {
      row: row,
      source: source,
      position: row === 6 ? this.campPosition : null,
    };
    this.emit(Events.menuSelected, payload);
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
    else if (intent === "recenter") this.emit(Events.recenterRequested, { source: "voice" });
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

    // The plan's OWN TITLE is evidence, exactly as it is on the live path
    // (LessonPlanner passes inferLessonKind(userText, title)). Passing only the
    // debug-key label was a real bug the holograms exposed: a tent fixture
    // loaded under the "campfire" key was validated against the FIRE stage
    // range, so its stage 5 was dropped as out-of-range and the step rendered
    // "WIDGET UNAVAILABLE" for no reason the user could see.
    let fixtureTitle = "";
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed.title === "string") fixtureTitle = parsed.title;
    } catch (e) {
      // validateLesson reports the parse failure properly a line below.
    }

    // Same validator the live path uses — a fixture gets no special treatment.
    const result = validateLesson(payload, inferLessonKind(label, fixtureTitle));
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
      // The validator's own record that this step asked for a widget it could
      // not have. The panel says so — honest degradation, on screen.
      companionDegraded: step.companionDegraded === true,
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
    const suggestion = this.plan && this.plan.nextSuggestion ? this.plan.nextSuggestion : "";
    this.pendingSuggestion = suggestion;
    const last = this.plan ? this.plan.steps[this.plan.steps.length - 1] : null;
    this.emit(Events.lessonCompleted, {
      title: this.plan ? this.plan.title : "",
      steps: this.plan ? this.plan.steps.length : 0,
      nextSuggestion: suggestion,
      // The coordinator's suggestion call is grounded in the finished task AND
      // where it left off, so it can name what genuinely follows.
      finalStep: last ? last.instruction : "",
    });
    this.setMode("COMPLETE");
    this.completeDelay.enabled = true;
    // Three dwells, in order of how much the user has to do:
    //   suggestion already on the card -> long, they must read and answer;
    //   one may still arrive           -> hold, then re-arm when it lands;
    //   none coming                    -> a beat.
    // The dwell ending always means IDLE. Nothing here auto-starts anything.
    this.completeDelay.reset(
      suggestion.length > 0
        ? this.suggestionDwellSec
        : this.suggestionWaitSec > 0
        ? this.suggestionWaitSec
        : this.completeReturnDelaySec
    );
  }

  private setMode(next: EngineMode): void {
    if (this.mode === next) return;
    const from = this.mode;
    this.mode = next;
    // Leaving COMPLETE retires the card's offer, whatever the exit path —
    // dwell timeout, stop, accept, or a new lesson landing.
    if (from === "COMPLETE") this.pendingSuggestion = "";
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
