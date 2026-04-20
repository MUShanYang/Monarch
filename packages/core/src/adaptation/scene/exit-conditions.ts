import { z } from "zod";
import type { Beat } from "../beat/beat-types.js";
import type { EntityStateSnapshot } from "../types/state-types.js";

export const ExitConditionTypeSchema = z.enum([
  "beat_limit",
  "word_limit",
  "tension_drop",
  "location_change",
  "time_skip",
  "mandatory_hook",
  "human_override",
  "character_exit",
  "narrative_saturation",
]);
export type ExitConditionType = z.infer<typeof ExitConditionTypeSchema>;

export const ExitConditionSchema = z.object({
  type: ExitConditionTypeSchema,
  satisfied: z.boolean(),
  priority: z.number().min(1).max(10).default(5),
  reason: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});
export type ExitCondition = z.infer<typeof ExitConditionSchema>;

export const ExitEvaluationResultSchema = z.object({
  shouldExit: z.boolean(),
  primaryCondition: ExitConditionTypeSchema.optional(),
  allConditions: z.array(ExitConditionSchema),
  exitReason: z.string().optional(),
  recommendedNextSceneType: z.string().optional(),
});
export type ExitEvaluationResult = z.infer<typeof ExitEvaluationResultSchema>;

export const ExitConditionsConfigSchema = z.object({
  maxBeats: z.number().int().min(1).default(20),
  minBeats: z.number().int().min(1).default(3),
  maxWords: z.number().int().min(100).default(5000),
  minWords: z.number().int().min(100).default(500),
  tensionDropThreshold: z.number().min(0).max(10).default(3),
  saturationThreshold: z.number().min(0).max(1).default(0.85),
  enableMandatoryHookCheck: z.boolean().default(true),
  enableLocationChangeCheck: z.boolean().default(true),
});
export type ExitConditionsConfig = z.infer<typeof ExitConditionsConfigSchema>;

const DEFAULT_CONFIG: Required<ExitConditionsConfig> = {
  maxBeats: 20,
  minBeats: 3,
  maxWords: 5000,
  minWords: 500,
  tensionDropThreshold: 3,
  saturationThreshold: 0.85,
  enableMandatoryHookCheck: true,
  enableLocationChangeCheck: true,
};

export interface ExitConditionContext {
  beats: Beat[];
  currentTension: number;
  initialTension: number;
  currentLocation: string;
  initialLocation: string;
  currentTime: Date;
  initialTime: Date;
  stateSnapshot: EntityStateSnapshot;
  mandatoryHooks: string[];
  humanOverrideExit?: boolean;
  charactersPresent: string[];
  initialCharacters: string[];
}

export class SceneExitEvaluator {
  private config: Required<ExitConditionsConfig>;

  constructor(config?: ExitConditionsConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: ExitConditionContext): ExitEvaluationResult {
    const conditions: ExitCondition[] = [];

    conditions.push(this.checkBeatLimit(context));
    conditions.push(this.checkWordLimit(context));
    conditions.push(this.checkTensionDrop(context));
    conditions.push(this.checkLocationChange(context));
    conditions.push(this.checkTimeSkip(context));
    conditions.push(this.checkMandatoryHook(context));
    conditions.push(this.checkHumanOverride(context));
    conditions.push(this.checkCharacterExit(context));
    conditions.push(this.checkNarrativeSaturation(context));

    const satisfiedConditions = conditions.filter((c) => c.satisfied);

    if (satisfiedConditions.length === 0) {
      return ExitEvaluationResultSchema.parse({
        shouldExit: false,
        allConditions: conditions,
      });
    }

    const primaryCondition = satisfiedConditions.sort((a, b) => b.priority - a.priority)[0];

    const exitReason = this.buildExitReason(primaryCondition, satisfiedConditions);
    const recommendedNextSceneType = this.suggestNextSceneType(primaryCondition, context);

    return ExitEvaluationResultSchema.parse({
      shouldExit: true,
      primaryCondition: primaryCondition?.type,
      allConditions: conditions,
      exitReason,
      recommendedNextSceneType,
    });
  }

  private checkBeatLimit(context: ExitConditionContext): ExitCondition {
    const beatCount = context.beats.length;
    const satisfied = beatCount >= this.config.maxBeats || beatCount >= this.config.minBeats * 3;

    return ExitConditionSchema.parse({
      type: "beat_limit",
      satisfied,
      priority: satisfied && beatCount >= this.config.maxBeats ? 9 : 3,
      reason: satisfied
        ? beatCount >= this.config.maxBeats
          ? `Maximum beat limit (${this.config.maxBeats}) reached`
          : `Beat count (${beatCount}) suggests scene completion`
        : undefined,
      data: { current: beatCount, max: this.config.maxBeats, min: this.config.minBeats },
    });
  }

  private checkWordLimit(context: ExitConditionContext): ExitCondition {
    const wordCount = context.beats.reduce((sum, b) => sum + (b.wordCount ?? 0), 0);
    const satisfied = wordCount >= this.config.maxWords || wordCount >= this.config.minWords * 2;

    return ExitConditionSchema.parse({
      type: "word_limit",
      satisfied,
      priority: satisfied && wordCount >= this.config.maxWords ? 8 : 3,
      reason: satisfied
        ? wordCount >= this.config.maxWords
          ? `Maximum word limit (${this.config.maxWords}) reached`
          : `Word count (${wordCount}) suggests scene completion`
        : undefined,
      data: { current: wordCount, max: this.config.maxWords, min: this.config.minWords },
    });
  }

  private checkTensionDrop(context: ExitConditionContext): ExitCondition {
    const tensionDrop = context.initialTension - context.currentTension;
    const satisfied = tensionDrop >= this.config.tensionDropThreshold && context.beats.length >= this.config.minBeats;

    return ExitConditionSchema.parse({
      type: "tension_drop",
      satisfied,
      priority: 7,
      reason: satisfied
        ? `Tension dropped from ${context.initialTension} to ${context.currentTension}`
        : undefined,
      data: { initial: context.initialTension, current: context.currentTension, drop: tensionDrop },
    });
  }

  private checkLocationChange(context: ExitConditionContext): ExitCondition {
    if (!this.config.enableLocationChangeCheck) {
      return ExitConditionSchema.parse({
        type: "location_change",
        satisfied: false,
        priority: 1,
      });
    }

    const satisfied =
      context.currentLocation !== context.initialLocation && context.beats.length >= this.config.minBeats;

    return ExitConditionSchema.parse({
      type: "location_change",
      satisfied,
      priority: 8,
      reason: satisfied
        ? `Location changed from "${context.initialLocation}" to "${context.currentLocation}"`
        : undefined,
      data: { from: context.initialLocation, to: context.currentLocation },
    });
  }

  private checkTimeSkip(context: ExitConditionContext): ExitCondition {
    const timeDiff = context.currentTime.getTime() - context.initialTime.getTime();
    const hoursPassed = timeDiff / (1000 * 60 * 60);
    const satisfied = hoursPassed >= 2 && context.beats.length >= this.config.minBeats;

    return ExitConditionSchema.parse({
      type: "time_skip",
      satisfied,
      priority: 6,
      reason: satisfied ? `Time skip of ${Math.round(hoursPassed)} hours detected` : undefined,
      data: { hoursPassed },
    });
  }

  private checkMandatoryHook(context: ExitConditionContext): ExitCondition {
    if (!this.config.enableMandatoryHookCheck || context.mandatoryHooks.length === 0) {
      return ExitConditionSchema.parse({
        type: "mandatory_hook",
        satisfied: false,
        priority: 1,
      });
    }

    const satisfied =
      context.mandatoryHooks.length > 0 &&
      context.beats.some((b) =>
        context.mandatoryHooks.some((hook) =>
          b.chosen?.toLowerCase().includes(hook.toLowerCase())
        )
      );

    return ExitConditionSchema.parse({
      type: "mandatory_hook",
      satisfied,
      priority: 10,
      reason: satisfied ? "Mandatory hook has been addressed" : undefined,
      data: { hooks: context.mandatoryHooks },
    });
  }

  private checkHumanOverride(context: ExitConditionContext): ExitCondition {
    const satisfied = context.humanOverrideExit === true;

    return ExitConditionSchema.parse({
      type: "human_override",
      satisfied,
      priority: 10,
      reason: satisfied ? "Human author requested scene exit" : undefined,
    });
  }

  private checkCharacterExit(context: ExitConditionContext): ExitCondition {
    const initialSet = new Set(context.initialCharacters);
    const currentSet = new Set(context.charactersPresent);

    const exitedCharacters = [...initialSet].filter((c) => !currentSet.has(c));
    const satisfied = exitedCharacters.length > 0 && context.beats.length >= this.config.minBeats;

    return ExitConditionSchema.parse({
      type: "character_exit",
      satisfied,
      priority: 5,
      reason: satisfied ? `Character(s) exited: ${exitedCharacters.join(", ")}` : undefined,
      data: { exited: exitedCharacters },
    });
  }

  private checkNarrativeSaturation(context: ExitConditionContext): ExitCondition {
    const beatCount = context.beats.length;
    const uniqueTypes = new Set(context.beats.map((b) => b.type)).size;
    const saturationRatio = beatCount > 0 ? uniqueTypes / beatCount : 0;

    const satisfied = saturationRatio < 1 - this.config.saturationThreshold && beatCount >= this.config.minBeats * 2;

    return ExitConditionSchema.parse({
      type: "narrative_saturation",
      satisfied,
      priority: 4,
      reason: satisfied
        ? `Narrative saturation detected (${uniqueTypes} unique types in ${beatCount} beats)`
        : undefined,
      data: { uniqueTypes, beatCount, saturationRatio },
    });
  }

  private buildExitReason(primary: ExitCondition, all: ExitCondition[]): string {
    const reasons = all.filter((c) => c.satisfied && c.reason).map((c) => c.reason);

    if (reasons.length === 0) {
      return `Scene exit triggered by ${primary.type}`;
    }

    if (reasons.length === 1) {
      return reasons[0]!;
    }

    return `${primary.reason} (and ${reasons.length - 1} other conditions)`;
  }

  private suggestNextSceneType(condition: ExitCondition, context: ExitConditionContext): string | undefined {
    switch (condition.type) {
      case "location_change":
        return "establishing_shot";
      case "time_skip":
        return "transition";
      case "tension_drop":
        return "tension_rise";
      case "mandatory_hook":
        return "revelation";
      case "character_exit":
        return "interiority";
      case "narrative_saturation":
        return "negative_space";
      default:
        return undefined;
    }
  }

  getConfig(): Required<ExitConditionsConfig> {
    return { ...this.config };
  }
}

export function createSceneExitEvaluator(config?: ExitConditionsConfig): SceneExitEvaluator {
  return new SceneExitEvaluator(config);
}

export function evaluateSceneExit(
  context: ExitConditionContext,
  config?: ExitConditionsConfig
): ExitEvaluationResult {
  const evaluator = new SceneExitEvaluator(config);
  return evaluator.evaluate(context);
}
