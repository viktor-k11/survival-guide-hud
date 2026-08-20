/**
 * Single source of truth for remote model names.
 *
 * Model IDs must NOT be repeated at call sites — the RSG gateway's Vertex
 * backend rejects publisher models that are not enabled for this project or
 * region, and when that happens the fix is a one-line change here.
 * A 404 whose message reads "Publisher model ... was not found or your project
 * does not have access to it" means this constant needs updating, NOT that the
 * token or the gateway is broken. Re-run RsgSmokeTest.ts with RUN_PROBE = true
 * to sweep candidates and find a working ID.
 */

/** Chosen by the candidate sweep in RsgSmokeTest.ts — see CLAD-PROMPT-LOG.md. */
export const GEMINI_MODEL = "gemini-2.5-flash";

export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
