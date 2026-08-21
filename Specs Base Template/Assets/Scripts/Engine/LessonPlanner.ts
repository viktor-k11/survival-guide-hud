/**
 * Builds and issues Gemini requests: lesson plans (validated) and in-lesson
 * Q&A answers (plain text).
 *
 * A plain module, not a component — no scene dependency, no state. Callers pass
 * the system prompt in; the probe/engine owns where that text comes from.
 *
 * Every call is temperature 0 + structured output against LESSON_RESPONSE_SCHEMA,
 * using the pinned model from RsgModels.ts. Nothing here decides what to do with
 * a lesson; that is the state machine's job, and it does not exist yet.
 *
 * ## Both calls go through GatewayQueue
 *
 * Not because a lesson request is likely to collide with another lesson request
 * — the coordinator already refuses those — but because it WILL collide with
 * narration. A user asking for a lesson while step 4's voice is synthesizing is
 * the ordinary case, not the edge case, and concurrent gateway calls corrupt
 * each other (see GatewayQueue's header for the measurements). Lesson and Q&A
 * are submitted at GW_USER, so they take the next slot ahead of any queued
 * prefetch.
 *
 * `latencyMs` is measured from DISPATCH, so it stays comparable with every
 * figure recorded before the queue existed. Time spent waiting for the slot is
 * reported separately as `queuedMs` — folding the two together would quietly
 * blame the model for our own queuing.
 */
import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { gatewaySubmit, gatewayWasDropped, GW_BACKGROUND, GW_USER } from "./GatewayQueue";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { GEMINI_MODEL } from "./RsgModels";
import { LESSON_RESPONSE_SCHEMA } from "./LessonSchema";
import { inferLessonKind, LessonValidationResult, validateLesson } from "./LessonValidator";

export interface LessonRequestOutcome {
  /** The user's spoken request, echoed for fixture naming and logging. */
  request: string;
  /** Full raw response envelope as JSON text. Saved as a fixture (hard rule 5). */
  rawEnvelope: string;
  /** The model's text payload, before parsing. */
  rawPayload: string;
  /** Round-trip time in ms, measured from dispatch — not from submission. */
  latencyMs: number;
  /** Time spent waiting for the gateway slot before dispatch. Usually 0. */
  queuedMs: number;
  /** Never null — a transport failure still produces a structured result. */
  validation: LessonValidationResult;
  /**
   * True when the request never reached a usable response: no network, gateway
   * refusal, bad token, malformed envelope. The coordinator retries THESE and
   * only these — retrying a response the model actually produced just burns
   * another 12 s to be told the same thing.
   */
  transportError: boolean;
}

function nowMs(): number {
  return getTime() * 1000;
}

export function requestLesson(
  userText: string,
  systemPrompt: string,
  onDispatch?: (queuedMs: number) => void
): Promise<LessonRequestOutcome> {
  const request: GeminiTypes.Models.GenerateContentRequest = {
    model: GEMINI_MODEL,
    type: "generateContent",
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }], role: "user" }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: LESSON_RESPONSE_SCHEMA as any,
      },
    },
  };

  let t0 = nowMs();
  let queuedMs = 0;

  return gatewaySubmit({
    label: "lesson",
    priority: GW_USER,
    onDispatch: (waited: number) => {
      // Restart the clock at dispatch; the queue wait is reported on its own.
      t0 = nowMs();
      queuedMs = waited;
      if (onDispatch) onDispatch(waited);
    },
    run: () => Gemini.models(request),
  })
    .then((response) => {
      const latencyMs = Math.round(nowMs() - t0);
      const rawEnvelope = JSON.stringify(response);

      let rawPayload = "";
      try {
        rawPayload = response.candidates[0].content.parts[0].text;
      } catch (e) {
        rawPayload = "";
      }

      const kind = inferLessonKind(userText, safeTitle(rawPayload));
      const validation = validateLesson(rawPayload, kind);

      return {
        request: userText,
        rawEnvelope: rawEnvelope,
        rawPayload: rawPayload,
        latencyMs: latencyMs,
        queuedMs: queuedMs,
        validation: validation,
        // An empty payload means the envelope came back without usable text —
        // a transport-shaped failure even though the promise resolved.
        transportError: rawPayload.length === 0,
      };
    })
    .catch((error) => {
      // Transport/model failure still returns a structured result, never a throw.
      const latencyMs = Math.round(nowMs() - t0);
      const message = String(error);
      return {
        request: userText,
        rawEnvelope: message,
        rawPayload: "",
        latencyMs: latencyMs,
        queuedMs: queuedMs,
        validation: {
          ok: false,
          plan: null,
          issues: [{ code: "EMPTY_RESPONSE" as any, path: "", message: "Request failed: " + message }],
          degradations: [],
          summary: "Could not reach the guide.",
        },
        transportError: true,
      };
    });
}

/** Best-effort title sniff for lesson-kind inference; parse errors are the validator's problem. */
function safeTitle(payload: string): string {
  try {
    const p = JSON.parse(payload);
    return typeof p.title === "string" ? p.title : "";
  } catch (e) {
    return "";
  }
}

// ------------------------------------------------------- next-step suggestion

export interface NextStepOutcome {
  /** The phrase, ready to render AND to submit verbatim as a request. "" = none. */
  text: string;
  latencyMs: number;
  ok: boolean;
  /** "" when ok; otherwise why — including "dropped" when a user request cleared it. */
  error: string;
  /** True when gatewayDropPending binned it because the user asked for something. */
  dropped: boolean;
}

/**
 * One short phrase naming the task that follows a finished lesson.
 *
 * ## Why this is a SEPARATE CALL and not a lesson-plan field
 *
 * The field was tried inside the lesson schema + prompt on 2026-08-21 and
 * REVERTED by the regression gate: it shifted lesson structure at temperature 0
 * on exactly the tasks that have no few-shot example ("purify water" lost a
 * step, "treat a burn" gained one and lost every companion), while the two
 * anchored tasks returned their few-shot suggestions verbatim. The diagnosis
 * was the fix: a second call cannot perturb the first one's output at all, and
 * `lesson-system-prompt.txt` / `LessonSchema.ts` stay byte-identical to HEAD.
 *
 * ## The rules this call lives by
 *
 * - **GW_BACKGROUND.** Nothing is waiting on it. A lesson request or a Q&A
 *   answer takes the slot first, and `gatewayDropPending` bins this outright —
 *   a user asking for something must never queue behind a suggestion.
 * - **thinkingBudget 0.** gemini-2.5-flash draws thinking tokens from
 *   maxOutputTokens; leaving it on is what once reduced an answer to the single
 *   word "If". The cap is set generously above six words for the same reason:
 *   a cap tight enough to truncate is a worse bug than a long answer, and
 *   brevity is the prompt's job.
 * - **Failure is silence.** Dropped, timed out, empty, "NONE", or too long all
 *   return `text: ""`, and the card simply has no next line.
 */
export function requestNextStep(
  lessonTitle: string,
  finalStepInstruction: string,
  systemPrompt: string,
  maxTokens: number
): Promise<NextStepOutcome> {
  const context =
    "Task just finished: " + (lessonTitle || "(unknown)") +
    "\nIts final step: " + (finalStepInstruction || "(none)");

  const request: GeminiTypes.Models.GenerateContentRequest = {
    model: GEMINI_MODEL,
    type: "generateContent",
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: context }], role: "user" }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  };

  let t0 = nowMs();

  return gatewaySubmit({
    label: "nextStep",
    priority: GW_BACKGROUND,
    onDispatch: () => {
      t0 = nowMs();
    },
    run: () => Gemini.models(request),
  })
    .then((response) => {
      const latencyMs = Math.round(nowMs() - t0);
      let text = "";
      try {
        text = response.candidates[0].content.parts[0].text;
      } catch (e) {
        text = "";
      }
      return {
        text: cleanSuggestion(text),
        latencyMs: latencyMs,
        ok: true,
        error: "",
        dropped: false,
      };
    })
    .catch((error) => {
      const dropped = gatewayWasDropped(error);
      return {
        text: "",
        latencyMs: Math.round(nowMs() - t0),
        ok: false,
        error: dropped ? "dropped" : String(error),
        dropped: dropped,
      };
    });
}

/**
 * Normalises the model's line into something renderable, or "" for none.
 * Strips quotes/trailing punctuation the prompt asked it not to emit anyway,
 * and refuses anything over the word budget rather than showing a sentence
 * where a phrase belongs.
 */
function cleanSuggestion(raw: string): string {
  let s = (raw || "").trim();
  if (s.length === 0) return "";
  // One line only; the model occasionally adds a second.
  const nl = s.indexOf("\n");
  if (nl >= 0) s = s.substring(0, nl).trim();
  // Strip wrapping quotes and a trailing full stop.
  while (s.length > 1 && (s.charAt(0) === '"' || s.charAt(0) === "'")) s = s.substring(1).trim();
  while (s.length > 1 && (s.charAt(s.length - 1) === '"' || s.charAt(s.length - 1) === "'")) {
    s = s.substring(0, s.length - 1).trim();
  }
  while (s.length > 1 && (s.charAt(s.length - 1) === "." || s.charAt(s.length - 1) === "!")) {
    s = s.substring(0, s.length - 1).trim();
  }
  if (s.length === 0) return "";
  if (s.toUpperCase() === "NONE") return "";
  // Word budget is six; allow one over before giving up, then refuse.
  const words = s.split(" ");
  if (words.length > 7 || s.length > 60) return "";
  return s;
}

// ------------------------------------------------------------------- Q&A

export interface QaOutcome {
  question: string;
  /** Plain text, ready to speak. "" when the call failed. */
  answer: string;
  /** Measured from dispatch. */
  latencyMs: number;
  /** Time spent waiting for the gateway slot. */
  queuedMs: number;
  ok: boolean;
  error: string;
  /**
   * The model's own account of why it stopped. "STOP" is a finished answer;
   * "MAX_TOKENS" means the cap cut it off and what came back is a fragment —
   * which is exactly how a one-word answer got spoken as if it were real.
   */
  finishReason: string;
}

/**
 * One in-lesson question, answered in a sentence or two.
 *
 * Deliberately unlike the lesson call: **temperature 0.4, no responseSchema,
 * plain text, a hard token cap.** A lesson is a structure the HUD has to drive,
 * so it is generated at temperature 0 against a schema. An answer is a spoken
 * aside — a little warmth reads better than a deterministic one, nothing
 * downstream parses it, and the cap is what keeps it a sentence rather than an
 * essay nobody will stand still for.
 *
 * The step context is what makes the answer specific instead of generic; it is
 * sent as user content rather than baked into the system prompt so the prompt
 * asset stays a constant.
 *
 * ## thinkingBudget: 0 — and why the first run came back as the word "If"
 *
 * gemini-2.5-flash thinks before it answers, and **thinking tokens are drawn
 * from maxOutputTokens**. With the cap at 60 the model spent the budget
 * reasoning and the entire spoken answer to "what if the ground is wet" was:
 *
 *     "If"
 *
 * — cut off mid-sentence at the token limit, delivered as a complete reply.
 * The lesson call never showed this because it sets no cap at all.
 *
 * Two changes, both needed. Thinking is switched off, because a one-sentence
 * aside about wet ground does not need a reasoning pass and the latency is
 * already the thing hurting most. And the cap is raised, because a cap tight
 * enough to truncate a good answer is a worse bug than a long one — brevity is
 * the prompt's job. `finishReason` now comes back with the outcome so a
 * truncation says so in the log instead of impersonating an answer.
 */
export function requestQaAnswer(
  question: string,
  lessonTitle: string,
  stepInstruction: string,
  systemPrompt: string,
  maxTokens: number
): Promise<QaOutcome> {
  const context =
    "Lesson: " + (lessonTitle || "(none)") +
    "\nCurrent step: " + (stepInstruction || "(none)") +
    "\nQuestion: " + question;

  const request: GeminiTypes.Models.GenerateContentRequest = {
    model: GEMINI_MODEL,
    type: "generateContent",
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: context }], role: "user" }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: maxTokens,
        // Thinking tokens come out of maxOutputTokens. Leave this on and the
        // budget is spent before the answer starts. See the header.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  };

  let t0 = nowMs();
  let queuedMs = 0;

  return gatewaySubmit({
    label: "qa",
    priority: GW_USER,
    onDispatch: (waited: number) => {
      t0 = nowMs();
      queuedMs = waited;
    },
    run: () => Gemini.models(request),
  })
    .then((response) => {
      const latencyMs = Math.round(nowMs() - t0);
      let text = "";
      let finishReason = "";
      try {
        text = response.candidates[0].content.parts[0].text;
      } catch (e) {
        text = "";
      }
      try {
        finishReason = String((response.candidates[0] as any).finishReason || "");
      } catch (e) {
        finishReason = "";
      }
      text = (text || "").trim();
      const truncated = finishReason === "MAX_TOKENS";
      return {
        question: question,
        answer: text,
        latencyMs: latencyMs,
        queuedMs: queuedMs,
        // A truncated fragment is not an answer. Better to say "I could not
        // answer that one" than to speak half a sentence with confidence.
        ok: text.length > 0 && !truncated,
        error: text.length > 0 ? (truncated ? "truncated at maxOutputTokens" : "") : "empty answer",
        finishReason: finishReason,
      };
    })
    .catch((error) => ({
      question: question,
      answer: "",
      latencyMs: Math.round(nowMs() - t0),
      queuedMs: queuedMs,
      ok: false,
      error: String(error),
      finishReason: "",
    }));
}
