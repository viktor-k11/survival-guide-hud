/**
 * Lesson response schema — passed as `responseSchema` on every lesson call.
 *
 * ############################################################################
 * # THIS FILE AND Assets/AI/lesson-system-prompt.txt ARE A PAIR.             #
 * # Change one, change the other in the same commit.                         #
 * #                                                                          #
 * # When they disagree the model obeys the SCHEMA and ignores the prompt,    #
 * # so a drift produces a lesson that parses fine and is quietly wrong -     #
 * # no error, no crash, just a field nobody populates or a rule nobody       #
 * # enforces. LessonValidator.ts is the third member of this triangle: it    #
 * # enforces the rules the schema cannot express.                            #
 * ############################################################################
 *
 * Two things the Vertex/Gemini schema subset cannot express, which is why the
 * validator exists:
 *
 * 1. NO UNIONS. The prompt describes `companion` as a tagged union (a "zone"
 *    has shape/size_m/label, a "timer" has duration_sec/label, ...). The
 *    subset has no oneOf, so this is ONE flattened object with every field
 *    nullable, and the prompt tells the model to null the fields that do not
 *    apply. Which fields are required for which `type` is checked in
 *    LessonValidator.ts, not here.
 * 2. NO CROSS-FIELD OR COUNT RULES. "4-8 steps", "checklist <= 6 items" and
 *    "hologram_stage only for tent/campfire, within range" are all invisible
 *    to the schema. Also validator-side.
 */

export const COMPANION_TYPES = ["zone", "timer", "checklist", "compass", "hologram_stage"];

/** Display hard limit: the Checklist widget has exactly six pre-made rows. */
export const CHECKLIST_MAX_ITEMS = 6;

export const MIN_STEPS = 4;
/**
 * Lowered 8 -> 6 on 2026-08-20. Latency scales with output tokens: an 8-step
 * plan measured ~12.1s versus ~10.7s for 6. Keep this in step with rule 1 of
 * lesson-system-prompt.txt.
 */
export const MAX_STEPS = 6;

/** Hologram stage ranges, keyed by lesson kind. Mirrors Docs/SCENE-MAP.md. */
export const HOLOGRAM_STAGE_RANGE: { [kind: string]: { min: number; max: number } } = {
  tent: { min: 1, max: 5 },
  fire: { min: 1, max: 4 },
};

export const LESSON_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    steps: {
      type: "ARRAY",
      // Constrain the model rather than only asking it in the prompt. The
      // validator still checks: if the gateway ignores these, we catch it.
      minItems: MIN_STEPS,
      maxItems: MAX_STEPS,
      items: {
        type: "OBJECT",
        properties: {
          instruction: { type: "STRING" },
          companion: {
            type: "OBJECT",
            nullable: true,
            properties: {
              type: { type: "STRING", enum: COMPANION_TYPES },
              shape: { type: "STRING", nullable: true, enum: ["circle", "rect"] },
              size_m: { type: "NUMBER", nullable: true },
              label: { type: "STRING", nullable: true },
              duration_sec: { type: "INTEGER", nullable: true },
              items: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
              stage: { type: "INTEGER", nullable: true },
            },
            required: ["type"],
          },
          safety: { type: "BOOLEAN" },
          warning: { type: "STRING", nullable: true },
        },
        required: ["instruction", "companion", "safety", "warning"],
      },
    },
  },
  required: ["title", "steps"],
};

// ---------------------------------------------------------------- app types

export interface LessonCompanion {
  type: string;
  shape?: string | null;
  size_m?: number | null;
  label?: string | null;
  duration_sec?: number | null;
  items?: string[] | null;
  stage?: number | null;
}

export interface LessonStep {
  instruction: string;
  companion: LessonCompanion | null;
  safety: boolean;
  warning: string | null;
  /**
   * How many training props must be placed before this step auto-completes.
   * Absent/0 means the step is not prop-gated.
   *
   * NOT in LESSON_RESPONSE_SCHEMA and NOT in the prompt, on purpose: the
   * planner does not emit it yet, and adding it to only one half would be
   * exactly the prompt/schema drift the banner above warns about. LessonEngine
   * reads it so the mechanism exists and is testable; wiring the planner to
   * produce it is a follow-up that must touch prompt + schema + validator
   * together.
   */
  props_required?: number;
}

export interface LessonPlan {
  title: string;
  steps: LessonStep[];
}
