import { z } from "zod";
import type { ChapterSummary } from "../types/state-types.js";

export const DriftSeveritySchema = z.enum(["nominal", "watch", "alert", "critical"]);
export type DriftSeverity = z.infer<typeof DriftSeveritySchema>;

export const DriftMetricSchema = z.object({
  name: z.string().min(1),
  baseline: z.number(),
  current: z.number(),
  deviation: z.number(),
  deviationPercent: z.number(),
});
export type DriftMetric = z.infer<typeof DriftMetricSchema>;

export const DriftReportSchema = z.object({
  chapterRange: z.tuple([z.number().int(), z.number().int()]),
  severity: DriftSeveritySchema,
  overallDriftPercent: z.number(),
  metrics: z.array(DriftMetricSchema),
  warnings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  requiresHumanGate: z.boolean(),
  plainLanguageSummary: z.string(),
});
export type DriftReport = z.infer<typeof DriftReportSchema>;

export const DriftDetectorConfigSchema = z.object({
  checkInterval: z.number().int().min(1).default(5),
  nominalThreshold: z.number().min(0).max(100).default(15),
  watchThreshold: z.number().min(0).max(100).default(25),
  alertThreshold: z.number().min(0).max(100).default(40),
  metricsToTrack: z.array(z.string()).default([
    "avgTension",
    "avgWordCount",
    "dialogueRatio",
    "interiorityRatio",
    "actionRatio",
  ]),
});
export type DriftDetectorConfig = z.infer<typeof DriftDetectorConfigSchema>;

const DEFAULT_CONFIG: Required<DriftDetectorConfig> = {
  checkInterval: 5,
  nominalThreshold: 15,
  watchThreshold: 25,
  alertThreshold: 40,
  metricsToTrack: [
    "avgTension",
    "avgWordCount",
    "dialogueRatio",
    "interiorityRatio",
    "actionRatio",
  ],
};

interface ChapterMetrics {
  chapter: number;
  wordCount: number;
  tension: number;
  beatTypes: Record<string, number>;
  characterAppearances: string[];
  locationChanges: string[];
}

export class DriftDetector {
  private config: Required<DriftDetectorConfig>;

  constructor(config?: DriftDetectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldCheck(currentChapter: number): boolean {
    return currentChapter % this.config.checkInterval === 0 && currentChapter >= this.config.checkInterval;
  }

  detectDrift(
    recentSummaries: ChapterSummary[],
    baselineSummaries: ChapterSummary[]
  ): DriftReport | null {
    if (recentSummaries.length < 2 || baselineSummaries.length < 2) {
      return null;
    }

    const recentMetrics = this.summarizeMetrics(recentSummaries);
    const baselineMetrics = this.summarizeMetrics(baselineSummaries);

    const driftMetrics: DriftMetric[] = [];
    let totalDeviation = 0;
    let metricCount = 0;

    for (const metricName of this.config.metricsToTrack) {
      const baseline = baselineMetrics[metricName];
      const current = recentMetrics[metricName];

      if (baseline !== undefined && current !== undefined && baseline !== 0) {
        const deviation = current - baseline;
        const deviationPercent = Math.abs((deviation / baseline) * 100);

        driftMetrics.push({
          name: metricName,
          baseline,
          current,
          deviation,
          deviationPercent,
        });

        totalDeviation += deviationPercent;
        metricCount++;
      }
    }

    const overallDriftPercent = metricCount > 0 ? totalDeviation / metricCount : 0;
    const severity = this.calculateSeverity(overallDriftPercent);
    const requiresHumanGate = severity === "alert" || severity === "critical";

    const warnings = this.generateWarnings(driftMetrics);
    const recommendations = this.generateRecommendations(driftMetrics, severity);
    const plainLanguageSummary = this.generatePlainLanguageSummary(
      overallDriftPercent,
      severity,
      recentSummaries,
      warnings
    );

    const chapterRange: [number, number] = [
      recentSummaries[0]?.chapter ?? 0,
      recentSummaries[recentSummaries.length - 1]?.chapter ?? 0,
    ];

    return DriftReportSchema.parse({
      chapterRange,
      severity,
      overallDriftPercent,
      metrics: driftMetrics,
      warnings,
      recommendations,
      requiresHumanGate,
      plainLanguageSummary,
    });
  }

  private summarizeMetrics(summaries: ChapterSummary[]): Record<string, number> {
    const metrics: Record<string, number> = {};

    const totalWordCount = summaries.reduce((sum, s) => sum + s.wordCount, 0);
    metrics.avgWordCount = totalWordCount / summaries.length;

    const totalTension = summaries.reduce((sum, s) => {
      const tensionMap: Record<string, number> = {
        slow: 2,
        medium: 5,
        fast: 8,
        variable: 5,
      };
      return sum + (tensionMap[s.pacing] ?? 5);
    }, 0);
    metrics.avgTension = totalTension / summaries.length;

    const beatTypeCounts: Record<string, number> = {};
    let totalBeats = 0;

    for (const summary of summaries) {
      for (const event of summary.keyEvents) {
        const type = this.inferBeatType(event);
        beatTypeCounts[type] = (beatTypeCounts[type] ?? 0) + 1;
        totalBeats++;
      }
    }

    metrics.dialogueRatio = totalBeats > 0 ? (beatTypeCounts["dialogue"] ?? 0) / totalBeats : 0;
    metrics.interiorityRatio = totalBeats > 0 ? (beatTypeCounts["interiority"] ?? 0) / totalBeats : 0;
    metrics.actionRatio = totalBeats > 0 ? (beatTypeCounts["action"] ?? 0) / totalBeats : 0;

    return metrics;
  }

  private inferBeatType(event: string): string {
    const eventLower = event.toLowerCase();

    if (eventLower.includes("said") || eventLower.includes("ask") || eventLower.includes("reply")) {
      return "dialogue";
    }
    if (eventLower.includes("thought") || eventLower.includes("felt") || eventLower.includes("realized")) {
      return "interiority";
    }
    if (eventLower.includes("ran") || eventLower.includes("fought") || eventLower.includes("moved")) {
      return "action";
    }
    return "other";
  }

  private calculateSeverity(driftPercent: number): DriftSeverity {
    if (driftPercent < this.config.nominalThreshold) return "nominal";
    if (driftPercent < this.config.watchThreshold) return "watch";
    if (driftPercent < this.config.alertThreshold) return "alert";
    return "critical";
  }

  private generateWarnings(metrics: DriftMetric[]): string[] {
    const warnings: string[] = [];

    for (const metric of metrics) {
      if (metric.deviationPercent > this.config.alertThreshold) {
        const direction = metric.deviation > 0 ? "increased" : "decreased";
        warnings.push(
          `${metric.name} has ${direction} by ${metric.deviationPercent.toFixed(1)}%`
        );
      }
    }

    return warnings;
  }

  private generateRecommendations(metrics: DriftMetric[], severity: DriftSeverity): string[] {
    const recommendations: string[] = [];

    if (severity === "alert" || severity === "critical") {
      recommendations.push("Consider reviewing recent chapters for consistency with earlier tone and pacing.");
    }

    for (const metric of metrics) {
      if (metric.name === "avgTension" && metric.deviationPercent > 20) {
        if (metric.deviation > 0) {
          recommendations.push("Tension has risen significantly. Consider adding breathing room with lower-tension beats.");
        } else {
          recommendations.push("Tension has dropped. Consider re-engaging plot threads to maintain momentum.");
        }
      }

      if (metric.name === "avgWordCount" && metric.deviationPercent > 30) {
        if (metric.deviation > 0) {
          recommendations.push("Chapters are getting longer. Verify this aligns with narrative intent.");
        } else {
          recommendations.push("Chapters are getting shorter. Check if content feels rushed.");
        }
      }
    }

    return recommendations;
  }

  private generatePlainLanguageSummary(
    driftPercent: number,
    severity: DriftSeverity,
    recentSummaries: ChapterSummary[],
    warnings: string[]
  ): string {
    const chapterRange = `${recentSummaries[0]?.chapter ?? 0}-${recentSummaries[recentSummaries.length - 1]?.chapter ?? 0}`;

    let summary = `Narrative drift check for chapters ${chapterRange}: `;

    switch (severity) {
      case "nominal":
        summary += `No significant drift detected (${driftPercent.toFixed(1)}% deviation). Narrative remains consistent with baseline.`;
        break;
      case "watch":
        summary += `Minor drift detected (${driftPercent.toFixed(1)}% deviation). Some metrics show variation but within acceptable range.`;
        break;
      case "alert":
        summary += `Moderate drift detected (${driftPercent.toFixed(1)}% deviation). Review recommended to ensure narrative consistency.`;
        break;
      case "critical":
        summary += `Significant drift detected (${driftPercent.toFixed(1)}% deviation). Immediate attention required to realign narrative.`;
        break;
    }

    if (warnings.length > 0) {
      summary += ` Key concerns: ${warnings.join("; ")}.`;
    }

    return summary;
  }

  getConfig(): Required<DriftDetectorConfig> {
    return { ...this.config };
  }
}

export function createDriftDetector(config?: DriftDetectorConfig): DriftDetector {
  return new DriftDetector(config);
}

export function detectNarrativeDrift(
  recentSummaries: ChapterSummary[],
  baselineSummaries: ChapterSummary[],
  config?: DriftDetectorConfig
): DriftReport | null {
  const detector = new DriftDetector(config);
  return detector.detectDrift(recentSummaries, baselineSummaries);
}
