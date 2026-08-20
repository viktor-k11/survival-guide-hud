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
 */
import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
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
  /** Round-trip time in ms. */
  latencyMs: number;
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

export function requestLesson(userText: string, systemPrompt: string): Promise<LessonRequestOutcome> {
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

  const t0 = nowMs();

  return Gemini.models(request)
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

// ------------------------------------------------------------------- Q&A

export interface QaOutcome {
  question: string;
  /** Plain text, ready to speak. "" when the call failed. */
  answer: string;
  latencyMs: number;
  ok: boolean;
  error: string;
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
      },
    },
  };

  const t0 = nowMs();

  return Gemini.models(request)
    .then((response) => {
      const latencyMs = Math.round(nowMs() - t0);
      let text = "";
      try {
        text = response.candidates[0].content.parts[0].text;
      } catch (e) {
        text = "";
      }
      text = (text || "").trim();
      return {
        question: question,
        answer: text,
        latencyMs: latencyMs,
        ok: text.length > 0,
        error: text.length > 0 ? "" : "empty answer",
      };
    })
    .catch((error) => ({
      question: question,
      answer: "",
      latencyMs: Math.round(nowMs() - t0),
      ok: false,
      error: String(error),
    }));
}
