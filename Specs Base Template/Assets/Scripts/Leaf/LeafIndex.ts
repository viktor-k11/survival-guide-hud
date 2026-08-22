/**
 * LeafIndex — the LEAF suite registry, in the run order the suite depends on:
 * Tier 2 pure functions first (fast failure signal, no state), then the
 * Tier 1 demo invariants, then Tier 3. Scenarios share the live Lens, so the
 * lesson scenarios each reset to IDLE around themselves.
 *
 * ZERO GEMINI ANYWHERE: everything runs from stored fixtures and pure
 * functions. The five-phrase prompt gate stays a separate manual run.
 *
 * The two @inputs are the fixtures the engine does not already carry:
 * the cramped survey cloud and a structurally broken lesson.
 */
import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";

import { T2_NavMath_BearingDistanceDegenerate } from "./T2_NavMath_BearingDistanceDegenerate";
import { T2_HazardScoring_SteepHollowBrokenClean } from "./T2_HazardScoring_SteepHollowBrokenClean";
import { T2_SiteSelection_BestSite_ImpossibleFireConstraint } from "./T2_SiteSelection_BestSite_ImpossibleFireConstraint";
import { T2_LessonValidator_DegradeVsReject } from "./T2_LessonValidator_DegradeVsReject";
import { T2_TrailDecimation_CoveragePreserved } from "./T2_TrailDecimation_CoveragePreserved";
import { T2_GatewayQueue_SerialPriorityDrop } from "./T2_GatewayQueue_SerialPriorityDrop";
import { T2_HudFollower_SmoothingNeverOvershoots } from "./T2_HudFollower_SmoothingNeverOvershoots";
import { T1_Survey_OpenClearing_TwoTentsOneFire_NoWarning } from "./T1_Survey_OpenClearing_TwoTentsOneFire_NoWarning";
import { T1_Survey_CrampedCamp_WarningRaised_SteepHazards } from "./T1_Survey_CrampedCamp_WarningRaised_SteepHazards";
import { T1_Lesson_CampfireStep1_ZoneCompanionRendered } from "./T1_Lesson_CampfireStep1_ZoneCompanionRendered";
import { T1_Lesson_SafetyStep_NextRefused_ConfirmReleases } from "./T1_Lesson_SafetyStep_NextRefused_ConfirmReleases";
import { T1_Lesson_StopMidLesson_IdleMenuAndMarkersSurvive } from "./T1_Lesson_StopMidLesson_IdleMenuAndMarkersSurvive";
import { T1_Lesson_Completion_CardThenAutoIdle } from "./T1_Lesson_Completion_CardThenAutoIdle";
import { T1_VoiceRouting_LocalNav_NoAiBoundaryCrossed } from "./T1_VoiceRouting_LocalNav_NoAiBoundaryCrossed";
import { T3_NextTwice_HologramStageAdvances } from "./T3_NextTwice_HologramStageAdvances";
import { T3_BackOnFirstStep_HoldsWithoutCrash } from "./T3_BackOnFirstStep_HoldsWithoutCrash";
import { T3_DoneSequence_ChecksTopmost_AutoCompletesStep } from "./T3_DoneSequence_ChecksTopmost_AutoCompletesStep";
import { T3_MalformedFixture_EngineSurvives } from "./T3_MalformedFixture_EngineSurvives";

@component
export class LeafIndex extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("Assets/Survey/fixtures/survey-cramped-camp.json — the constraint-case cloud.")
  public crampedCloud: JsonAsset;

  @input
  @allowUndefined
  @hint("Assets/AI/fixtures/broken-lesson-9-steps-7-item-checklist.json — a structurally broken plan the validator must REJECT.")
  public brokenLesson: JsonAsset;

  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    { id: "t2-navmath-bearing-distance-degenerate", typename: T2_NavMath_BearingDistanceDegenerate.getTypeName() },
    { id: "t2-hazards-steep-hollow-broken-clean", typename: T2_HazardScoring_SteepHollowBrokenClean.getTypeName() },
    { id: "t2-sites-best-and-impossible-fire", typename: T2_SiteSelection_BestSite_ImpossibleFireConstraint.getTypeName() },
    { id: "t2-validator-degrade-vs-reject", typename: T2_LessonValidator_DegradeVsReject.getTypeName() },
    { id: "t2-trail-decimation-coverage", typename: T2_TrailDecimation_CoveragePreserved.getTypeName() },
    { id: "t2-gateway-serial-priority-drop", typename: T2_GatewayQueue_SerialPriorityDrop.getTypeName() },
    { id: "t2-follower-never-overshoots", typename: T2_HudFollower_SmoothingNeverOvershoots.getTypeName() },
    { id: "t1-survey-open-clearing", typename: T1_Survey_OpenClearing_TwoTentsOneFire_NoWarning.getTypeName() },
    { id: "t1-survey-cramped-camp", typename: T1_Survey_CrampedCamp_WarningRaised_SteepHazards.getTypeName() },
    { id: "t1-lesson-step1-zone", typename: T1_Lesson_CampfireStep1_ZoneCompanionRendered.getTypeName() },
    { id: "t1-lesson-safety-gate", typename: T1_Lesson_SafetyStep_NextRefused_ConfirmReleases.getTypeName() },
    { id: "t1-lesson-stop-midlesson", typename: T1_Lesson_StopMidLesson_IdleMenuAndMarkersSurvive.getTypeName() },
    { id: "t1-lesson-completion-card", typename: T1_Lesson_Completion_CardThenAutoIdle.getTypeName() },
    { id: "t1-voice-routing-boundary", typename: T1_VoiceRouting_LocalNav_NoAiBoundaryCrossed.getTypeName() },
    { id: "t3-hologram-stage-advance", typename: T3_NextTwice_HologramStageAdvances.getTypeName() },
    { id: "t3-back-on-first-step", typename: T3_BackOnFirstStep_HoldsWithoutCrash.getTypeName() },
    { id: "t3-done-sequence-autocomplete", typename: T3_DoneSequence_ChecksTopmost_AutoCompletesStep.getTypeName() },
    { id: "t3-malformed-fixture-survives", typename: T3_MalformedFixture_EngineSurvives.getTypeName() },
  ];
}
