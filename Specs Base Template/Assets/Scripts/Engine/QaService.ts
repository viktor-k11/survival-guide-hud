/**
 * QaService — answers a question asked in the middle of a lesson.
 *
 * `LessonEngine` has been emitting `qaRequested { title, stepInstruction,
 * question }` since voice routing landed: hard rule 6 says local navigation
 * keywords are matched first with no AI call, and only what does not match
 * becomes a question. This is what finally listens.
 *
 * The answer is SPOKEN, not read. Two consequences shape the code:
 *
 *   - It goes out as `speakRequested`, never `narrationRequested`. A step's
 *     narration outranks an answer about that step, so an answer arriving while
 *     the guide is still reading the instruction **queues and follows** rather
 *     than talking over it. NarrationService owns that ordering; this file just
 *     has to use the right door.
 *   - The text is also published as `qaAnswered` so the HUD can show it. On a
 *     see-through display a spoken sentence with nothing on screen is easy to
 *     miss, and impossible to screenshot.
 *
 * One question at a time. A second question while the first is in flight is
 * dropped with a log line rather than queued: by the time a 6 s answer to a
 * superseded question arrived, the user has asked something else and would hear
 * two answers back to back with no idea which was which.
 */
import { eventBus, Events } from "./EventBus";
import { requestQaAnswer } from "./LessonPlanner";
import { gatewayDropPending, gatewayStatus, GW_BACKGROUND } from "./GatewayQueue";

@component
export class QaService extends BaseScriptComponent {
  @input
  @hint("Assets/AI/prompts.generated.json — the 'qa' entry is used here.")
  private promptsAsset: JsonAsset;

  @input
  @widget(new SliderWidget(20, 400, 5))
  @hint("Hard cap on answer length. Brevity is the PROMPT's job, not this number's — set too low, the model is cut off mid-sentence and a fragment gets spoken as if it were the answer. 60 produced the literal answer \"If\".")
  private maxAnswerTokens: number = 200;

  @input
  @hint("Shown (and spoken) when the guide cannot answer. Kept short on purpose.")
  private failureMessage: string = "I could not answer that one.";

  @input
  @hint("Speak failures as well as showing them. Off = the failure is text-only.")
  private speakFailures: boolean = false;

  @input private enableLogging: boolean = true;

  private systemPrompt: string = "";
  private busy: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[QA] " + msg);
  }

  private onStart(): void {
    this.systemPrompt = this.loadPrompt();

    eventBus.subscribe(
      Events.qaRequested,
      (p: { title: string; stepInstruction: string; question: string }) => this.ask(p)
    );

    this.log("ready. maxTokens=" + this.maxAnswerTokens + " prompt=" + this.systemPrompt.length + " chars");
  }

  private loadPrompt(): string {
    if (!this.promptsAsset) {
      this.log("FAIL: promptsAsset not wired — questions cannot be answered");
      return "";
    }
    try {
      return JSON.parse(this.promptsAsset.getString()).qa;
    } catch (e) {
      this.log("FAIL: could not read prompts asset: " + e);
      return "";
    }
  }

  private ask(p: { title: string; stepInstruction: string; question: string }): void {
    if (!p || !p.question) return;

    if (this.busy) {
      this.log('busy — dropping "' + p.question + '"');
      return;
    }
    this.busy = true;

    // A question is a user request: queued prefetches get out of its way, same
    // as for a lesson. Only queued ones — the in-flight call keeps the slot.
    const dropped = gatewayDropPending(GW_BACKGROUND, "user asked a question");
    this.log(
      'asking "' + p.question + '" (step: "' + shorten(p.stepInstruction) + '")' +
        (dropped > 0 ? " [cleared " + dropped + " queued background call(s)]" : "") +
        " " + gatewayStatus()
    );

    requestQaAnswer(
      p.question,
      p.title,
      p.stepInstruction,
      this.systemPrompt,
      this.maxAnswerTokens
    ).then((outcome) => {
      this.busy = false;

      if (!outcome.ok) {
        this.log(
          "FAILED after " + outcome.latencyMs + "ms: " + outcome.error +
            (outcome.finishReason ? " (finishReason=" + outcome.finishReason + ")" : "") +
            (outcome.answer ? ' — fragment was "' + outcome.answer + '"' : "")
        );
        eventBus.emit(Events.qaAnswered, {
          question: p.question,
          answer: this.failureMessage,
          latencyMs: outcome.latencyMs,
          ok: false,
        });
        if (this.speakFailures) {
          eventBus.emit(Events.speakRequested, { text: this.failureMessage, source: "qa-error" });
        }
        return;
      }

      this.log(
        'answered in ' + outcome.latencyMs + 'ms' +
          (outcome.queuedMs > 50 ? " (+" + outcome.queuedMs + "ms queued)" : "") +
          ': "' + outcome.answer + '"'
      );
      eventBus.emit(Events.qaAnswered, {
        question: p.question,
        answer: outcome.answer,
        latencyMs: outcome.latencyMs,
        ok: true,
      });
      // Queued, not immediate — see the header note.
      eventBus.emit(Events.speakRequested, { text: outcome.answer, source: "qa" });
    });
  }
}

function shorten(text: string): string {
  const t = text || "";
  return t.length <= 40 ? t : t.substring(0, 38) + "…";
}
