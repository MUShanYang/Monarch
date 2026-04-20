import { z } from "zod";

export const MetabolismStatusSchema = z.enum(["stable", "warming", "overheating", "cooling"]);
export type MetabolismStatus = z.infer<typeof MetabolismStatusSchema>;

export const MetabolismMetricsSchema = z.object({
  chapter: z.number().int().min(1),
  beatCount: z.number().int().min(0),
  wordCount: z.number().int().min(0),
  avgTension: z.number().min(0).max(10),
  characterDensity: z.number().min(0),
  dialogueRatio: z.number().min(0).max(1),
  actionRatio: z.number().min(0).max(1),
  interiorityRatio: z.number().min(0).max(1),
});
export type MetabolismMetrics = z.infer<typeof MetabolismMetricsSchema>;

export const MetabolismReportSchema = z.object({
  chapter: z.number().int().min(1),
  status: MetabolismStatusSchema,
  metrics: MetabolismMetricsSchema,
  warnings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  shouldAdjustPacing: z.boolean(),
  suggestedBeatType: z.string().optional(),
});
export type MetabolismReport = z.infer<typeof MetabolismReportSchema>;

export const MetabolismConfigSchema = z.object({
  targetBeatCount: z.number().int().min(1).default(12),
  targetWordCount: z.number().int().min(100).default(3000),
  targetTension: z.number().min(0).max(10).default(5),
  minDialogueRatio: z.number().min(0).max(1).default(0.2),
  maxDialogueRatio: z.number().min(0).max(1).default(0.6),
  minActionRatio: z.number().min(0).max(1).default(0.1),
  maxActionRatio: z.number().min(0).max(1).default(0.5),
  tolerance: z.number().min(0).max(1).default(0.2),
});
export type MetabolismConfig = z.infer<typeof MetabolismConfigSchema>;

const DEFAULT_CONFIG: Required<MetabolismConfig> = {
  targetBeatCount: 12,
  targetWordCount: 3000,
  targetTension: 5,
  minDialogueRatio: 0.2,
  maxDialogueRatio: 0.6,
  minActionRatio: 0.1,
  maxActionRatio: 0.5,
  tolerance: 0.2,
};

export class NarrativeMetabolism {
  private config: Required<MetabolismConfig>;
  private chapterHistory: MetabolismMetrics[] = [];

  constructor(config?: MetabolismConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyzeChapter(
    chapter: number,
    beatTypes: string[],
    wordCount: number,
    tensionLevels: number[],
    characterAppearances: string[]
  ): MetabolismReport {
    const beatCount = beatTypes.length;
    const avgTension = tensionLevels.length > 0
      ? tensionLevels.reduce((a, b) => a + b, 0) / tensionLevels.length
      : 0;

    const typeCounts: Record<string, number> = {};
    for (const type of beatTypes) {
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }

    const dialogueRatio = beatCount > 0 ? (typeCounts["dialogue"] ?? 0) / beatCount : 0;
    const actionRatio = beatCount > 0 ? (typeCounts["action"] ?? 0) / beatCount : 0;
    const interiorityRatio = beatCount > 0 ? (typeCounts["interiority"] ?? 0) / beatCount : 0;

    const uniqueCharacters = new Set(characterAppearances);
    const characterDensity = wordCount > 0 ? uniqueCharacters.size / (wordCount / 1000) : 0;

    const metrics: MetabolismMetrics = {
      chapter,
      beatCount,
      wordCount,
      avgTension,
      characterDensity,
      dialogueRatio,
      actionRatio,
      interiorityRatio,
    };

    this.chapterHistory.push(metrics);

    const status = this.calculateStatus(metrics);
    const warnings = this.generateWarnings(metrics);
    const recommendations = this.generateRecommendations(metrics, status);
    const shouldAdjustPacing = status !== "stable";
    const suggestedBeatType = this.suggestBeatType(metrics, status);

    return MetabolismReportSchema.parse({
      chapter,
      status,
      metrics,
      warnings,
      recommendations,
      shouldAdjustPacing,
      suggestedBeatType,
    });
  }

  private calculateStatus(metrics: MetabolismMetrics): MetabolismStatus {
    const beatDeviation = Math.abs(metrics.beatCount - this.config.targetBeatCount) / this.config.targetBeatCount;
    const wordDeviation = Math.abs(metrics.wordCount - this.config.targetWordCount) / this.config.targetWordCount;
    const tensionDeviation = Math.abs(metrics.avgTension - this.config.targetTension) / 10;

    const totalDeviation = (beatDeviation + wordDeviation + tensionDeviation) / 3;

    if (totalDeviation < this.config.tolerance) return "stable";
    if (totalDeviation < this.config.tolerance * 2) return "warming";
    if (metrics.avgTension > this.config.targetTension * 1.5) return "overheating";
    return "cooling";
  }

  private generateWarnings(metrics: MetabolismMetrics): string[] {
    const warnings: string[] = [];

    if (metrics.beatCount < this.config.targetBeatCount * 0.7) {
      warnings.push("Chapter has significantly fewer beats than target. Consider expanding scenes.");
    } else if (metrics.beatCount > this.config.targetBeatCount * 1.3) {
      warnings.push("Chapter has significantly more beats than target. Consider condensing.");
    }

    if (metrics.wordCount < this.config.targetWordCount * 0.6) {
      warnings.push("Chapter is unusually short. Verify content completeness.");
    } else if (metrics.wordCount > this.config.targetWordCount * 1.5) {
      warnings.push("Chapter is unusually long. Consider splitting or trimming.");
    }

    if (metrics.dialogueRatio < this.config.minDialogueRatio) {
      warnings.push("Low dialogue ratio. Consider adding character interaction.");
    } else if (metrics.dialogueRatio > this.config.maxDialogueRatio) {
      warnings.push("High dialogue ratio. Consider adding narrative beats between dialogue.");
    }

    if (metrics.actionRatio < this.config.minActionRatio) {
      warnings.push("Low action ratio. Chapter may feel static.");
    } else if (metrics.actionRatio > this.config.maxActionRatio) {
      warnings.push("High action ratio. Consider slowing pace with interiority or environment beats.");
    }

    if (metrics.avgTension > 8) {
      warnings.push("Very high tension. Risk of reader fatigue without relief beats.");
    } else if (metrics.avgTension < 2) {
      warnings.push("Very low tension. Risk of losing reader engagement.");
    }

    return warnings;
  }

  private generateRecommendations(metrics: MetabolismMetrics, status: MetabolismStatus): string[] {
    const recommendations: string[] = [];

    if (status === "overheating") {
      recommendations.push("Insert a negative-space or environment beat to cool tension.");
      recommendations.push("Consider a transition beat to shift to a lower-tension scene.");
    } else if (status === "cooling") {
      recommendations.push("Add a tension or revelation beat to raise engagement.");
      recommendations.push("Introduce a conflict or obstacle for characters.");
    } else if (status === "warming") {
      recommendations.push("Monitor pacing. Adjust next beat type to maintain balance.");
    }

    if (metrics.dialogueRatio > 0.5) {
      recommendations.push("Balance dialogue with action or interiority beats.");
    }

    if (metrics.interiorityRatio > 0.4) {
      recommendations.push("High interiority may slow pacing. Consider externalizing through action.");
    }

    return recommendations;
  }

  private suggestBeatType(metrics: MetabolismMetrics, status: MetabolismStatus): string | undefined {
    if (status === "overheating") {
      return metrics.avgTension > 8 ? "negative-space" : "environment";
    }

    if (status === "cooling") {
      return "tension";
    }

    if (metrics.dialogueRatio > this.config.maxDialogueRatio) {
      return "action";
    }

    if (metrics.actionRatio > this.config.maxActionRatio) {
      return "interiority";
    }

    if (metrics.avgTension < 3) {
      return "tension";
    }

    return undefined;
  }

  getChapterHistory(): MetabolismMetrics[] {
    return [...this.chapterHistory];
  }

  getAverageMetrics(): Partial<MetabolismMetrics> {
    if (this.chapterHistory.length === 0) return {};

    const totals = this.chapterHistory.reduce(
      (acc, m) => ({
        beatCount: acc.beatCount + m.beatCount,
        wordCount: acc.wordCount + m.wordCount,
        avgTension: acc.avgTension + m.avgTension,
        characterDensity: acc.characterDensity + m.characterDensity,
        dialogueRatio: acc.dialogueRatio + m.dialogueRatio,
        actionRatio: acc.actionRatio + m.actionRatio,
        interiorityRatio: acc.interiorityRatio + m.interiorityRatio,
      }),
      {
        beatCount: 0,
        wordCount: 0,
        avgTension: 0,
        characterDensity: 0,
        dialogueRatio: 0,
        actionRatio: 0,
        interiorityRatio: 0,
      }
    );

    const count = this.chapterHistory.length;
    return {
      beatCount: totals.beatCount / count,
      wordCount: totals.wordCount / count,
      avgTension: totals.avgTension / count,
      characterDensity: totals.characterDensity / count,
      dialogueRatio: totals.dialogueRatio / count,
      actionRatio: totals.actionRatio / count,
      interiorityRatio: totals.interiorityRatio / count,
    };
  }

  getConfig(): Required<MetabolismConfig> {
    return { ...this.config };
  }
}

export function createNarrativeMetabolism(config?: MetabolismConfig): NarrativeMetabolism {
  return new NarrativeMetabolism(config);
}
