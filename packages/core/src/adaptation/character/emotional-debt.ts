import { z } from "zod";

export const CharacterEmotionalDebtSchema = z.object({
  id: z.string().min(1),
  creditorId: z.string().min(1),
  debtorId: z.string().min(1),
  emotion: z.enum([
    "gratitude",
    "resentment",
    "guilt",
    "obligation",
    "loyalty",
    "betrayal",
    "admiration",
    "envy",
    "fear",
    "love",
    "hatred",
  ]),
  intensity: z.number().min(0).max(1).default(0.5),
  cause: z.string().min(1),
  plantedChapter: z.number().int().min(1),
  lastReferencedChapter: z.number().int().min(0).default(0),
  status: z.enum(["active", "dormant", "resolved", "expired"]).default("active"),
  repaymentEvents: z.array(z.object({
    chapter: z.number().int().min(1),
    description: z.string(),
    intensityChange: z.number(),
  })).default([]),
  expirationChapter: z.number().int().optional(),
  isMandatory: z.boolean().default(false),
});
export type CharacterEmotionalDebt = z.infer<typeof CharacterEmotionalDebtSchema>;

export const DebtAnalysisResultSchema = z.object({
  characterId: z.string().min(1),
  totalOwed: z.number().min(0),
  totalOwing: z.number().min(0),
  netBalance: z.number(),
  dominantEmotion: z.string().optional(),
  urgentDebts: z.array(CharacterEmotionalDebtSchema),
  recommendedBeatTypes: z.array(z.string()),
  tensionModifier: z.number().min(-5).max(5).default(0),
});
export type DebtAnalysisResult = z.infer<typeof DebtAnalysisResultSchema>;

export const EmotionalDebtConfigSchema = z.object({
  defaultExpirationChapters: z.number().int().min(1).default(10),
  intensityDecayRate: z.number().min(0).max(1).default(0.1),
  urgencyThreshold: z.number().min(0).max(1).default(0.7),
  maxActiveDebtsPerCharacter: z.number().int().min(1).default(10),
  enableAutoExpiration: z.boolean().default(true),
});
export type EmotionalDebtConfig = z.infer<typeof EmotionalDebtConfigSchema>;

const DEFAULT_CONFIG: Required<EmotionalDebtConfig> = {
  defaultExpirationChapters: 10,
  intensityDecayRate: 0.1,
  urgencyThreshold: 0.7,
  maxActiveDebtsPerCharacter: 10,
  enableAutoExpiration: true,
};

export class EmotionalDebtManager {
  private debts: Map<string, CharacterEmotionalDebt> = new Map();
  private config: Required<EmotionalDebtConfig>;

  constructor(config?: EmotionalDebtConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createDebt(
    creditorId: string,
    debtorId: string,
    emotion: CharacterEmotionalDebt["emotion"],
    intensity: number,
    cause: string,
    plantedChapter: number,
    options?: {
      isMandatory?: boolean;
      expirationChapter?: number;
    }
  ): CharacterEmotionalDebt {
    const id = `debt-${creditorId}-${debtorId}-${Date.now()}`;

    const debt: CharacterEmotionalDebt = {
      id,
      creditorId,
      debtorId,
      emotion,
      intensity: Math.max(0, Math.min(1, intensity)),
      cause,
      plantedChapter,
      lastReferencedChapter: plantedChapter,
      status: "active",
      repaymentEvents: [],
      expirationChapter: options?.expirationChapter ??
        (plantedChapter + this.config.defaultExpirationChapters),
      isMandatory: options?.isMandatory ?? false,
    };

    this.debts.set(id, debt);
    return debt;
  }

  repayDebt(
    debtId: string,
    chapter: number,
    description: string,
    intensityChange: number
  ): CharacterEmotionalDebt | null {
    const debt = this.debts.get(debtId);
    if (!debt) return null;

    const newIntensity = Math.max(0, Math.min(1, debt.intensity + intensityChange));

    const updatedDebt: CharacterEmotionalDebt = {
      ...debt,
      intensity: newIntensity,
      lastReferencedChapter: chapter,
      repaymentEvents: [
        ...debt.repaymentEvents,
        { chapter, description, intensityChange },
      ],
      status: newIntensity <= 0.1 ? "resolved" : debt.status,
    };

    this.debts.set(debtId, updatedDebt);
    return updatedDebt;
  }

  updateDebtStatus(
    debtId: string,
    status: CharacterEmotionalDebt["status"]
  ): CharacterEmotionalDebt | null {
    const debt = this.debts.get(debtId);
    if (!debt) return null;

    const updatedDebt: CharacterEmotionalDebt = { ...debt, status };
    this.debts.set(debtId, updatedDebt);
    return updatedDebt;
  }

  processChapterAdvancement(currentChapter: number): CharacterEmotionalDebt[] {
    const updatedDebts: CharacterEmotionalDebt[] = [];

    for (const [id, debt] of this.debts) {
      if (debt.status !== "active") continue;

      const chaptersSinceReference = currentChapter - debt.lastReferencedChapter;
      const decayedIntensity = Math.max(
        0,
        debt.intensity - chaptersSinceReference * this.config.intensityDecayRate
      );

      let newStatus: CharacterEmotionalDebt["status"] = debt.status;
      if (this.config.enableAutoExpiration && debt.expirationChapter &&
          currentChapter > debt.expirationChapter) {
        newStatus = "expired";
      } else if (decayedIntensity <= 0.1) {
        newStatus = "dormant";
      }

      if (decayedIntensity !== debt.intensity || newStatus !== debt.status) {
        const updatedDebt: CharacterEmotionalDebt = {
          ...debt,
          intensity: decayedIntensity,
          status: newStatus,
        };
        this.debts.set(id, updatedDebt);
        updatedDebts.push(updatedDebt);
      }
    }

    return updatedDebts;
  }

  analyzeCharacterDebts(characterId: string): DebtAnalysisResult {
    const characterDebts = this.getDebtsForCharacter(characterId);

    let totalOwed = 0;
    let totalOwing = 0;
    const emotionCounts: Record<string, number> = {};
    const urgentDebts: CharacterEmotionalDebt[] = [];

    for (const debt of characterDebts) {
      if (debt.status !== "active") continue;

      if (debt.creditorId === characterId) {
        totalOwed += debt.intensity;
      } else if (debt.debtorId === characterId) {
        totalOwing += debt.intensity;
      }

      emotionCounts[debt.emotion] = (emotionCounts[debt.emotion] ?? 0) + debt.intensity;

      if (debt.intensity >= this.config.urgencyThreshold || debt.isMandatory) {
        urgentDebts.push(debt);
      }
    }

    const dominantEmotion = Object.entries(emotionCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    const recommendedBeatTypes = this.generateBeatRecommendations(
      totalOwed,
      totalOwing,
      dominantEmotion,
      urgentDebts
    );

    const tensionModifier = this.calculateTensionModifier(
      totalOwed,
      totalOwing,
      urgentDebts.length
    );

    return {
      characterId,
      totalOwed,
      totalOwing,
      netBalance: totalOwed - totalOwing,
      dominantEmotion,
      urgentDebts,
      recommendedBeatTypes,
      tensionModifier,
    };
  }

  getDebtsBetweenCharacters(char1: string, char2: string): CharacterEmotionalDebt[] {
    return [...this.debts.values()].filter(
      (d) =>
        d.status === "active" &&
        ((d.creditorId === char1 && d.debtorId === char2) ||
          (d.creditorId === char2 && d.debtorId === char1))
    );
  }

  getDebtsForCharacter(characterId: string): CharacterEmotionalDebt[] {
    return [...this.debts.values()].filter(
      (d) => d.creditorId === characterId || d.debtorId === characterId
    );
  }

  getActiveDebts(): CharacterEmotionalDebt[] {
    return [...this.debts.values()].filter((d) => d.status === "active");
  }

  getDebtById(id: string): CharacterEmotionalDebt | undefined {
    return this.debts.get(id);
  }

  deleteDebt(id: string): boolean {
    return this.debts.delete(id);
  }

  private generateBeatRecommendations(
    totalOwed: number,
    totalOwing: number,
    dominantEmotion: string | undefined,
    urgentDebts: CharacterEmotionalDebt[]
  ): string[] {
    const recommendations: string[] = [];

    if (urgentDebts.length > 0) {
      recommendations.push("revelation");
      recommendations.push("tension");
    }

    if (totalOwing > totalOwed) {
      recommendations.push("interiority");
    }

    if (totalOwed > totalOwing) {
      recommendations.push("action");
    }

    if (dominantEmotion) {
      const emotionBeatMap: Record<string, string[]> = {
        gratitude: ["dialogue", "action"],
        resentment: ["tension", "interiority"],
        guilt: ["interiority", "dialogue"],
        obligation: ["action", "dialogue"],
        loyalty: ["action", "dialogue"],
        betrayal: ["revelation", "tension"],
        admiration: ["dialogue", "interiority"],
        envy: ["interiority", "tension"],
        fear: ["tension", "action"],
        love: ["dialogue", "interiority"],
        hatred: ["tension", "action"],
      };

      const beats = emotionBeatMap[dominantEmotion];
      if (beats) {
        recommendations.push(...beats);
      }
    }

    return [...new Set(recommendations)];
  }

  private calculateTensionModifier(
    totalOwed: number,
    totalOwing: number,
    urgentCount: number
  ): number {
    let modifier = 0;

    modifier += Math.min(2, totalOwed * 2);
    modifier += Math.min(2, totalOwing * 2);
    modifier += Math.min(1, urgentCount * 0.5);

    return Math.min(5, modifier);
  }

  getAllDebts(): CharacterEmotionalDebt[] {
    return [...this.debts.values()];
  }

  clear(): void {
    this.debts.clear();
  }

  getConfig(): Required<EmotionalDebtConfig> {
    return { ...this.config };
  }
}

export function createEmotionalDebtManager(config?: EmotionalDebtConfig): EmotionalDebtManager {
  return new EmotionalDebtManager(config);
}

export function analyzeEmotionalDebt(
  debts: CharacterEmotionalDebt[],
  characterId: string,
  config?: EmotionalDebtConfig
): DebtAnalysisResult {
  const manager = new EmotionalDebtManager(config);
  for (const debt of debts) {
    manager["debts"].set(debt.id, debt);
  }
  return manager.analyzeCharacterDebts(characterId);
}
