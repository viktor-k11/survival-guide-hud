/**
 * Payload shapes for the lesson-request chain. TYPES ONLY — no logic, no scene.
 *
 * Same reason SurveyTypes.ts exists: the StatusBar and the assembling-lesson
 * VFX need to render this state, and they must not import LessonCoordinator to
 * do it (that would drag the Gemini client into a presenter). The bus carries
 * the payload; this is where the payload is described.
 */

import { XYZ } from "./SurveyTypes";

/**
 * IDLE      nothing in flight.
 * COMPILING a request is with Gemini. This is a STATE THE USER WATCHES for
 *           10-15 s, not a spinner — see StatusBarPresenter.
 * BUSY      a transient notice: a second request arrived and was ignored. The
 *           coordinator is still COMPILING; only the message is different.
 * ERROR     the request failed. Shown, then the coordinator returns to IDLE.
 */
export type LessonRequestState = "IDLE" | "COMPILING" | "BUSY" | "ERROR";

/** Why a request failed. "" when it did not. */
export type LessonRequestFailure = "" | "network" | "validation" | "timeout" | "cancelled";

export interface RequestStatePayload {
  state: LessonRequestState;
  /** The user's words, echoed back for the typewriter. "" when idle. */
  requestText: string;
  /** One line, already user-facing. Empty for plain COMPILING. */
  message: string;
  /** 1, or 2 while the automatic retry is running. The retry is shown, not hidden. */
  attempt: number;
  reason: LessonRequestFailure;
  /** "voice" | "marker" | "debug" — diagnostics only. */
  source: string;
}

/**
 * Where the lesson's ground content belongs, in CENTIMETRES, world space.
 *
 * Emitted immediately before the plan is handed to the engine, so the companion
 * widgets are already anchored by the time the first `companionChanged` fires.
 * null means "no anchor" — the zone falls back to its design-time spot in front
 * of the user, which is the right answer for a request that came from the voice
 * with no site attached.
 */
export interface LessonAnchorPayload {
  position: XYZ | null;
  /** "site" | "default" — diagnostics only. */
  source: string;
}
