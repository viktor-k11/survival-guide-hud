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
 *
 * ## Degrade, do not reject
 *
 * A companion is a DECORATION on a step. When the model emits a malformed one —
 * `{type: "checklist"}` with no `items`, a timer with no duration, a hologram
 * stage this lesson has no hologram for — the instruction text is still
 * perfectly good, and the user still gets a usable lesson from the guide panel
 * and the narration. Throwing the whole plan away because one of six widgets
 * is unrenderable is the wrong trade: it turns a small visual gap into a total
 * failure — and at temperature 0 it is not even a rare one. Measured live on
 * 2026-08-20: "help me purify water" emitted `{"type":"checklist"}` with no
 * `items` on step 1 in THREE runs out of three, byte-identical each time. That
 * request was not flaky under the old validator, it was simply broken: every
 * ask binned a good five-step lesson over one undrawable widget.
 * Fixtures: lesson-help-me-purify-water-DEGRADES-step1-checklist.raw.json
 * (this run) and the earlier lesson-help-me-purify-water-INVALID-empty-checklist
 * .raw.json, whose name records what the OLD validator did with it.
 *
 * So a malformed companion degrades to `null` and the step renders without a
 * widget. Every repair is recorded in `degradations` and counted, so a model
 * quietly getting worse is visible in the logs rather than invisible.
 *
 * HARD REJECTION is reserved for structural failures where there is no usable
 * lesson at all:
 *
 *   - the payload is empty or not JSON            -> nothing to read
 *   - `steps` is missing or not an array          -> no lesson
 *   - step count outside MIN_STEPS..MAX_STEPS     -> not the shape the HUD drives
 *   - any step has no instruction text            -> a blank page in the guide
 *
 * Everything else is repairable, and repaired.
 */
import {
  CHECKLIST_MAX_ITEMS,
  COMPANION_TYPES,
  HOLOGRAM_STAGE_RANGE,
  LessonCompanion,
  LessonPlan,
  LessonStep,
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

/** A repaired problem. The lesson survived; this is what it cost. */
export interface LessonDegradation extends LessonValidationIssue {
  /** What the validator did about it, for the log. */
  action: string;
}

export interface LessonValidationResult {
  ok: boolean;
  /** Present only when ok === true. Already repaired — safe to hand to the engine. */
  plan: LessonPlan | null;
  /** FATAL problems only. Non-empty exactly when ok === false. */
  issues: LessonValidationIssue[];
  /** Non-fatal repairs applied to an otherwise usable plan. May be non-empty when ok === true. */
  degradations: LessonDegradation[];
  /** One-line summary for the error HUD / log. */
  summary: string;
}

/** Used when the model omits the title. Not fatal: the HUD needs a string, not the right string. */
export const FALLBACK_TITLE = "FIELD GUIDE";

/**
 * Used when a step is flagged safety-gated but carries no warning text.
 *
 * The alternative — clearing the safety flag — would silently REMOVE a gate the
 * model asked for, which is the one degradation that could get someone hurt.
 * Keep the gate, supply generic text.
 */
export const FALLBACK_SAFETY_WARNING = "TAKE CARE ON THIS STEP.";

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
  return { ok: false, plan: null, issues: issues, degradations: [], summary: summary };
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

  const degradations: LessonDegradation[] = [];
  const degrade = (code: LessonErrorCode, path: string, message: string, action: string): void => {
    degradations.push({ code: code, path: path, message: message, action: action });
  };

  // --- title: repairable ---------------------------------------------------
  let title: string = FALLBACK_TITLE;
  if (typeof parsed.title === "string" && parsed.title.length > 0) {
    title = parsed.title;
  } else {
    degrade("MISSING_FIELD", "title", "Lesson has no title.", 'title set to "' + FALLBACK_TITLE + '"');
  }

  // --- steps: structural ---------------------------------------------------
  if (!Array.isArray(parsed.steps)) {
    return fail([issue("MISSING_FIELD", "steps", "Lesson has no steps.")], "The lesson came back incomplete.");
  }

  const rawSteps: any[] = parsed.steps;
  if (rawSteps.length < MIN_STEPS || rawSteps.length > MAX_STEPS) {
    return fail(
      [
        issue(
          "BAD_STEP_COUNT",
          "steps",
          "Lesson has " + rawSteps.length + " steps; expected " + MIN_STEPS + "-" + MAX_STEPS + "."
        ),
      ],
      "The lesson came back the wrong length."
    );
  }

  // A missing instruction is fatal per-step: renumbering around a hole changes
  // the lesson, and a blank guide panel is not a lesson. Collect them all so
  // the log names every offender rather than only the first.
  const fatal: LessonValidationIssue[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const s = rawSteps[i];
    if (!s || typeof s.instruction !== "string" || s.instruction.length === 0) {
      fatal.push(
        issue("MISSING_FIELD", "steps[" + i + "].instruction", "Step " + (i + 1) + " has no instruction.")
      );
    }
  }
  if (fatal.length > 0) return fail(fatal, summarize(fatal));

  // --- everything below is repairable -------------------------------------
  const steps: LessonStep[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const s = rawSteps[i];
    const at = "steps[" + i + "]";

    let safety = false;
    if (typeof s.safety === "boolean") {
      safety = s.safety;
    } else {
      degrade("MISSING_FIELD", at + ".safety", "Step " + (i + 1) + " is missing its safety flag.", "treated as not safety-gated");
    }

    let warning: string | null = typeof s.warning === "string" && s.warning.length > 0 ? s.warning : null;
    if (safety && warning === null) {
      // Keep the gate, supply text. See FALLBACK_SAFETY_WARNING.
      warning = FALLBACK_SAFETY_WARNING;
      degrade(
        "MISSING_FIELD",
        at + ".warning",
        "Step " + (i + 1) + " is safety-gated but carries no warning text.",
        "gate kept, generic warning substituted"
      );
    }

    steps.push({
      instruction: s.instruction,
      companion: sanitizeCompanion(s.companion, at, i, kind, degrade),
      safety: safety,
      warning: warning,
      props_required: typeof s.props_required === "number" ? s.props_required : undefined,
    });
  }

  return {
    ok: true,
    plan: { title: title, steps: steps } as LessonPlan,
    issues: [],
    degradations: degradations,
    summary:
      "Lesson valid: " +
      steps.length +
      " steps" +
      (degradations.length > 0 ? " (" + degradations.length + " degraded)" : "") +
      ".",
  };
}

type DegradeFn = (code: LessonErrorCode, path: string, message: string, action: string) => void;

/**
 * Returns a renderable companion, or null. NEVER returns a half-valid one:
 * a widget with a missing required field is exactly the silent-mismatch case
 * the presenters cannot defend against.
 */
function sanitizeCompanion(
  c: any,
  at: string,
  i: number,
  kind: LessonKind,
  degrade: DegradeFn
): LessonCompanion | null {
  if (c === null || c === undefined) return null; // a step may legitimately have no widget

  const step = "Step " + (i + 1);
  const drop = "companion dropped; step renders without a widget";

  if (typeof c.type !== "string" || COMPANION_TYPES.indexOf(c.type) < 0) {
    degrade("UNKNOWN_COMPANION", at + ".companion.type", step + " uses unknown companion '" + c.type + "'.", drop);
    return null;
  }

  if (c.type === "zone") {
    if (c.shape !== "circle" && c.shape !== "rect") {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.shape", "Zone on " + step + " has no valid shape.", drop);
      return null;
    }
    if (typeof c.size_m !== "number" || c.size_m <= 0) {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.size_m", "Zone on " + step + " has no valid size.", drop);
      return null;
    }
    return { type: "zone", shape: c.shape, size_m: c.size_m, label: strOrNull(c.label) };
  }

  if (c.type === "timer") {
    if (typeof c.duration_sec !== "number" || c.duration_sec <= 0) {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.duration_sec", "Timer on " + step + " has no valid duration.", drop);
      return null;
    }
    return { type: "timer", duration_sec: c.duration_sec, label: strOrNull(c.label) };
  }

  if (c.type === "checklist") {
    if (!Array.isArray(c.items) || c.items.length === 0) {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.items", "Checklist on " + step + " has no items.", drop);
      return null;
    }
    // Keep the items that fit rather than dropping the whole list — the widget
    // has exactly CHECKLIST_MAX_ITEMS rows and the first ones are still useful.
    let items: string[] = [];
    for (let k = 0; k < c.items.length; k++) {
      if (typeof c.items[k] === "string" && c.items[k].length > 0) items.push(c.items[k]);
    }
    if (items.length === 0) {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.items", "Checklist on " + step + " has no usable items.", drop);
      return null;
    }
    if (items.length > CHECKLIST_MAX_ITEMS) {
      degrade(
        "CHECKLIST_TOO_LONG",
        at + ".companion.items",
        "Checklist on " + step + " has " + items.length + " items; the display fits " + CHECKLIST_MAX_ITEMS + ".",
        "truncated to the first " + CHECKLIST_MAX_ITEMS
      );
      items = items.slice(0, CHECKLIST_MAX_ITEMS);
    }
    return { type: "checklist", items: items, label: strOrNull(c.label) };
  }

  if (c.type === "compass") {
    if (typeof c.label !== "string" || c.label.length === 0) {
      degrade("BAD_COMPANION_FIELDS", at + ".companion.label", "Compass on " + step + " has no label.", drop);
      return null;
    }
    return { type: "compass", label: c.label };
  }

  if (c.type === "hologram_stage") {
    const range = kind ? HOLOGRAM_STAGE_RANGE[kind] : null;
    if (!range) {
      degrade(
        "HOLOGRAM_NOT_AVAILABLE",
        at + ".companion.stage",
        step + " asks for a hologram stage, but this lesson has no hologram.",
        drop
      );
      return null;
    }
    if (typeof c.stage !== "number" || c.stage < range.min || c.stage > range.max) {
      // Deliberately NOT clamped: showing stage 5 when the model asked for 7
      // is a confidently wrong picture. No picture is the honest degradation.
      degrade(
        "HOLOGRAM_OUT_OF_RANGE",
        at + ".companion.stage",
        step + " asks for " + kind + " hologram stage " + c.stage + "; valid range is " + range.min + "-" + range.max + ".",
        drop
      );
      return null;
    }
    return { type: "hologram_stage", stage: c.stage, label: strOrNull(c.label) };
  }

  return null;
}

function strOrNull(v: any): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function summarize(issues: LessonValidationIssue[]): string {
  if (issues.length === 1) return issues[0].message;
  return issues.length + " problems with this lesson. First: " + issues[0].message;
}

/** One-line log form of a repair list. Empty string when nothing was repaired. */
export function describeDegradations(degradations: LessonDegradation[]): string {
  if (!degradations || degradations.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < degradations.length; i++) {
    const d = degradations[i];
    parts.push(d.path + " [" + d.code + "] -> " + d.action);
  }
  return parts.join("; ");
}
