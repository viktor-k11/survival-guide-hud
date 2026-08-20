/**
 * Validates a raw Gemini lesson response.
 *
 * Enforces the rules the response schema cannot express (see LessonSchema.ts):
 * step count, per-companion-type required fields, checklist item cap, and
 * hologram stage range per lesson kind.
 *
 * NEVER THROWS. Every failure comes back as a structured LessonValidationResult
 * the engine can render as a friendly error state — an exception escaping into
 * a promise chain here would surface as a HUD that silently does nothing.
 */
import {
  CHECKLIST_MAX_ITEMS,
  COMPANION_TYPES,
  HOLOGRAM_STAGE_RANGE,
  LessonPlan,
  MAX_STEPS,
  MIN_STEPS,
} from "./LessonSchema";

/** Machine-readable so the engine can branch; message is human-facing. */
export type LessonErrorCode =
  | "EMPTY_RESPONSE"
  | "NOT_JSON"
  | "MISSING_FIELD"
  | "BAD_STEP_COUNT"
  | "UNKNOWN_COMPANION"
  | "BAD_COMPANION_FIELDS"
  | "CHECKLIST_TOO_LONG"
  | "HOLOGRAM_OUT_OF_RANGE"
  | "HOLOGRAM_NOT_AVAILABLE";

export interface LessonValidationIssue {
  code: LessonErrorCode;
  /** Where it went wrong, e.g. "steps[2].companion.items". */
  path: string;
  /** One line, safe to show a user. */
  message: string;
}

export interface LessonValidationResult {
  ok: boolean;
  /** Present only when ok === true. */
  plan: LessonPlan | null;
  issues: LessonValidationIssue[];
  /** One-line summary for the error HUD. */
  summary: string;
}

/** Which hologram a request maps to; null = no hologram exists for this lesson. */
export type LessonKind = "tent" | "fire" | null;

/**
 * Cheap keyword guess at lesson kind. Only used to bound hologram_stage — the
 * prompt already tells the model not to emit hologram_stage for anything else,
 * so this is the belt to that braces.
 */
export function inferLessonKind(request: string, title: string): LessonKind {
  const hay = ((request || "") + " " + (title || "")).toLowerCase();
  if (hay.indexOf("tent") >= 0 || hay.indexOf("shelter") >= 0) return "tent";
  if (hay.indexOf("campfire") >= 0 || hay.indexOf("fire") >= 0) return "fire";
  return null;
}

function issue(code: LessonErrorCode, path: string, message: string): LessonValidationIssue {
  return { code: code, path: path, message: message };
}

function fail(issues: LessonValidationIssue[], summary: string): LessonValidationResult {
  return { ok: false, plan: null, issues: issues, summary: summary };
}

/**
 * @param rawText  the model's text payload (already extracted from the envelope)
 * @param kind     lesson kind, for hologram range checking
 */
export function validateLesson(rawText: string, kind: LessonKind): LessonValidationResult {
  const text = (rawText || "").trim();

  if (text.length === 0) {
    return fail(
      [issue("EMPTY_RESPONSE", "", "The guide returned nothing.")],
      "Empty response from the lesson planner."
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return fail(
      [issue("NOT_JSON", "", "Response was not valid JSON: " + e)],
      "The guide's answer was not readable."
    );
  }

  const issues: LessonValidationIssue[] = [];

  if (typeof parsed.title !== "string" || parsed.title.length === 0) {
    issues.push(issue("MISSING_FIELD", "title", "Lesson has no title."));
  }

  if (!Array.isArray(parsed.steps)) {
    issues.push(issue("MISSING_FIELD", "steps", "Lesson has no steps."));
    return fail(issues, "The lesson came back incomplete.");
  }

  const steps: any[] = parsed.steps;
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
    issues.push(
      issue(
        "BAD_STEP_COUNT",
        "steps",
        "Lesson has " + steps.length + " steps; expected " + MIN_STEPS + "-" + MAX_STEPS + "."
      )
    );
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const at = "steps[" + i + "]";

    if (!s || typeof s.instruction !== "string" || s.instruction.length === 0) {
      issues.push(issue("MISSING_FIELD", at + ".instruction", "Step " + (i + 1) + " has no instruction."));
      continue;
    }
    if (typeof s.safety !== "boolean") {
      issues.push(issue("MISSING_FIELD", at + ".safety", "Step " + (i + 1) + " is missing its safety flag."));
    }
    // A safety step with no warning text leaves WarningStrip with nothing to
    // show, which is exactly the silent-mismatch case this guards against.
    if (s.safety === true && (typeof s.warning !== "string" || s.warning.length === 0)) {
      issues.push(
        issue("MISSING_FIELD", at + ".warning", "Step " + (i + 1) + " is safety-gated but carries no warning text.")
      );
    }

    const c = s.companion;
    if (c === null || c === undefined) continue; // a step may legitimately have no widget

    if (typeof c.type !== "string" || COMPANION_TYPES.indexOf(c.type) < 0) {
      issues.push(
        issue("UNKNOWN_COMPANION", at + ".companion.type", "Step " + (i + 1) + " uses unknown companion '" + c.type + "'.")
      );
      continue;
    }

    if (c.type === "zone") {
      if (c.shape !== "circle" && c.shape !== "rect") {
        issues.push(issue("BAD_COMPANION_FIELDS", at + ".companion.shape", "Zone on step " + (i + 1) + " has no valid shape."));
      }
      if (typeof c.size_m !== "number" || c.size_m <= 0) {
        issues.push(issue("BAD_COMPANION_FIELDS", at + ".companion.size_m", "Zone on step " + (i + 1) + " has no valid size."));
      }
    } else if (c.type === "timer") {
      if (typeof c.duration_sec !== "number" || c.duration_sec <= 0) {
        issues.push(issue("BAD_COMPANION_FIELDS", at + ".companion.duration_sec", "Timer on step " + (i + 1) + " has no valid duration."));
      }
    } else if (c.type === "checklist") {
      if (!Array.isArray(c.items) || c.items.length === 0) {
        issues.push(issue("BAD_COMPANION_FIELDS", at + ".companion.items", "Checklist on step " + (i + 1) + " has no items."));
      } else if (c.items.length > CHECKLIST_MAX_ITEMS) {
        issues.push(
          issue(
            "CHECKLIST_TOO_LONG",
            at + ".companion.items",
            "Checklist on step " + (i + 1) + " has " + c.items.length + " items; the display fits " + CHECKLIST_MAX_ITEMS + "."
          )
        );
      }
    } else if (c.type === "compass") {
      if (typeof c.label !== "string" || c.label.length === 0) {
        issues.push(issue("BAD_COMPANION_FIELDS", at + ".companion.label", "Compass on step " + (i + 1) + " has no label."));
      }
    } else if (c.type === "hologram_stage") {
      const range = kind ? HOLOGRAM_STAGE_RANGE[kind] : null;
      if (!range) {
        issues.push(
          issue(
            "HOLOGRAM_NOT_AVAILABLE",
            at + ".companion.stage",
            "Step " + (i + 1) + " asks for a hologram stage, but this lesson has no hologram."
          )
        );
      } else if (typeof c.stage !== "number" || c.stage < range.min || c.stage > range.max) {
        issues.push(
          issue(
            "HOLOGRAM_OUT_OF_RANGE",
            at + ".companion.stage",
            "Step " + (i + 1) + " asks for " + kind + " hologram stage " + c.stage + "; valid range is " + range.min + "-" + range.max + "."
          )
        );
      }
    }
  }

  if (issues.length > 0) {
    return fail(issues, summarize(issues));
  }

  return {
    ok: true,
    plan: { title: parsed.title, steps: steps } as LessonPlan,
    issues: [],
    summary: "Lesson valid: " + steps.length + " steps.",
  };
}

function summarize(issues: LessonValidationIssue[]): string {
  if (issues.length === 1) return issues[0].message;
  return issues.length + " problems with this lesson. First: " + issues[0].message;
}
