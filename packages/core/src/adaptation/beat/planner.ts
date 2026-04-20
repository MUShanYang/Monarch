import { z } from "zod";
import type { Beat, BeatType, TensionLevel, WordTarget, NarrativeDNA, KineticScaffold } from "./beat-types.js";
import { BeatSchema, BeatTypeSchema, createBeat, createKineticScaffold } from "./beat-types.js";

export const PlannerEmotionalDebtSchema = z.object({
  characterId: z.string().min(1),
  emotion: z.string().min(1),
  magnitude: z.number().int().min(1).max(10),
  sinceChapter: z.number().int().min(1),
  sinceBeatId: z.string().optional(),
});
export type PlannerEmotionalDebt = z.infer<typeof PlannerEmotionalDebtSchema>;

export const PlannerStateSchema = z.object({
  lastTwoBeatsHighIntensity: z.boolean().default(false),
  consecutiveHighIntensityCount: z.number().int().min(0).default(0),
  lastTensionLevel: z.number().int().min(1).max(10).optional(),
  emotionalDebts: z.array(PlannerEmotionalDebtSchema).default([]),
  consecutiveDialogueCount: z.number().int().min(0).default(0),
  lastBeatType: z.string().optional(),
});
export type PlannerState = z.infer<typeof PlannerStateSchema>;

export interface BeatPlannerConfig {
  highIntensityThreshold?: number;
  negativeSpaceTriggerThreshold?: number;
  maxConsecutiveHighIntensity?: number;
  emotionalDebtThreshold?: number;
  dialogueDenseThreshold?: number;
}

const DEFAULT_CONFIG: Required<BeatPlannerConfig> = {
  highIntensityThreshold: 8,
  negativeSpaceTriggerThreshold: 3,
  maxConsecutiveHighIntensity: 2,
  emotionalDebtThreshold: 5,
  dialogueDenseThreshold: 3,
};

const NEGATIVE_SPACE_SCAFFOLDS: readonly string[] = [
  "The silence that followed",
  "Nothing moved",
  "For a long moment, nothing happened",
  "The stillness stretched",
  "A pause hung in the air",
  "The moment stretched thin",
  "Quiet descended",
  "Time seemed to slow",
  "The world held its breath",
  "A beat passed in silence",
];

export class BeatPlanner {
  private state: PlannerState;
  private config: Required<BeatPlannerConfig>;

  constructor(initialState?: PlannerState, config?: BeatPlannerConfig) {
    this.state = PlannerStateSchema.parse(initialState ?? {});
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldInsertNegativeSpaceBeat(prevBeat: Beat | undefined, emotionalDebt: PlannerEmotionalDebt | undefined): boolean {
    if (!prevBeat) return false;

    const highTensity = prevBeat.tensionLevel >= this.config.highIntensityThreshold;
    const consecutiveHigh = this.state.consecutiveHighIntensityCount >= this.config.maxConsecutiveHighIntensity;
    const highDebt = emotionalDebt !== undefined && emotionalDebt.magnitude > this.config.emotionalDebtThreshold;

    const originalCondition = highTensity && consecutiveHigh && highDebt;

    const dialogueDense = this.state.consecutiveDialogueCount >= this.config.dialogueDenseThreshold;

    return originalCondition || dialogueDense;
  }

  isDialogueDense(): boolean {
    return this.state.consecutiveDialogueCount >= this.config.dialogueDenseThreshold;
  }

  createNegativeSpaceBeat(
    chapterNumber: number,
    sequenceInChapter: number,
    prevBeat: Beat,
    emotionalDebt?: PlannerEmotionalDebt
  ): Beat {
    const tensionLevel = Math.max(1, prevBeat.tensionLevel - 1) as TensionLevel;
    const targetWords: WordTarget = [40, 60];

    const scaffoldIndex = Math.floor(Math.random() * NEGATIVE_SPACE_SCAFFOLDS.length);
    const kineticScaffold: KineticScaffold = createKineticScaffold(
      NEGATIVE_SPACE_SCAFFOLDS[scaffoldIndex] ?? "The silence that followed",
      "negative-space beat for rhythm relief"
    );

    const dna: NarrativeDNA = {
      who: prevBeat.dna.who,
      where: prevBeat.dna.where,
      mustInclude: [],
      mustNotInclude: ["felt", "thought", "because", "heart", "eyes", "realized", "wondered"],
      lastBeatSummary: prevBeat.chosen ?? prevBeat.dna.lastBeatSummary,
      tensionContext: tensionLevel,
      hookContext: [],
      emotionalContext: emotionalDebt
        ? `${emotionalDebt.characterId}'s ${emotionalDebt.emotion} lingers beneath the surface`
        : undefined,
      spatialConstraints: prevBeat.dna.spatialConstraints,
    };

    return createBeat({
      chapterNumber,
      sequenceInChapter,
      type: "environment",
      tensionLevel,
      targetWords,
      dna,
      kineticScaffold,
    });
  }

  updateStateAfterBeat(beat: Beat): void {
    const isHighIntensity = beat.tensionLevel >= this.config.highIntensityThreshold;

    if (isHighIntensity) {
      this.state.consecutiveHighIntensityCount += 1;
    } else {
      this.state.consecutiveHighIntensityCount = 0;
    }

    this.state.lastTwoBeatsHighIntensity = this.state.consecutiveHighIntensityCount >= 2;
    this.state.lastTensionLevel = beat.tensionLevel;

    if (beat.type === "dialogue") {
      this.state.consecutiveDialogueCount += 1;
    } else {
      this.state.consecutiveDialogueCount = 0;
    }
    this.state.lastBeatType = beat.type;
  }

  addEmotionalDebt(debt: PlannerEmotionalDebt): void {
    const existing = this.state.emotionalDebts.findIndex((d) => d.characterId === debt.characterId && d.emotion === debt.emotion);
    if (existing >= 0) {
      this.state.emotionalDebts[existing] = debt;
    } else {
      this.state.emotionalDebts.push(debt);
    }
  }

  resolveEmotionalDebt(characterId: string, emotion?: string): void {
    if (emotion) {
      this.state.emotionalDebts = this.state.emotionalDebts.filter(
        (d) => !(d.characterId === characterId && d.emotion === emotion)
      );
    } else {
      this.state.emotionalDebts = this.state.emotionalDebts.filter((d) => d.characterId !== characterId);
    }
  }

  getEmotionalDebt(characterId: string): PlannerEmotionalDebt | undefined {
    return this.state.emotionalDebts.find((d) => d.characterId === characterId);
  }

  getHighestEmotionalDebt(): PlannerEmotionalDebt | undefined {
    return this.state.emotionalDebts.sort((a, b) => b.magnitude - a.magnitude)[0];
  }

  getState(): PlannerState {
    return PlannerStateSchema.parse(this.state);
  }

  loadState(state: PlannerState): void {
    this.state = PlannerStateSchema.parse(state);
  }

  planNextBeat(
    chapterNumber: number,
    sequenceInChapter: number,
    preferredType: BeatType,
    tensionLevel: TensionLevel,
    dna: NarrativeDNA,
    prevBeat?: Beat
  ): Beat | Beat[] {
    const emotionalDebt = this.getHighestEmotionalDebt();

    if (prevBeat && this.shouldInsertNegativeSpaceBeat(prevBeat, emotionalDebt)) {
      const negativeSpaceBeat = this.createNegativeSpaceBeat(
        chapterNumber,
        sequenceInChapter,
        prevBeat,
        emotionalDebt
      );

      const regularBeat = createBeat({
        chapterNumber,
        sequenceInChapter: sequenceInChapter + 1,
        type: preferredType,
        tensionLevel,
        targetWords: this.getDefaultWordTarget(preferredType),
        dna,
      });

      return [negativeSpaceBeat, regularBeat];
    }

    return createBeat({
      chapterNumber,
      sequenceInChapter,
      type: preferredType,
      tensionLevel,
      targetWords: this.getDefaultWordTarget(preferredType),
      dna,
    });
  }

  private getDefaultWordTarget(beatType: BeatType): WordTarget {
    const targets: Record<BeatType, WordTarget> = {
      action: [60, 120],
      dialogue: [80, 150],
      interiority: [50, 100],
      environment: [40, 80],
      transition: [30, 60],
      revelation: [70, 130],
      tension: [60, 110],
      resolution: [80, 140],
    };
    return targets[beatType] ?? [60, 120];
  }
}

export function createBeatPlanner(initialState?: PlannerState, config?: BeatPlannerConfig): BeatPlanner {
  return new BeatPlanner(initialState, config);
}
