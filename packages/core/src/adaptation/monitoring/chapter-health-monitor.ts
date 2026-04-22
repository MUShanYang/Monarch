import { z } from "zod";
import type { BeatType, TensionLevel } from "../beat/beat-types.js";

/**
 * 章节健康度实时监控器
 *
 * 在章节生成过程中实时监控各项指标，及时发现问题并给出建议
 */

export const HealthMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  threshold: z.number(),
  status: z.enum(["healthy", "warning", "critical"]),
  message: z.string().optional(),
});

export type HealthMetric = z.infer<typeof HealthMetricSchema>;

export const HealthReportSchema = z.object({
  overallStatus: z.enum(["healthy", "warning", "critical"]),
  metrics: z.array(HealthMetricSchema),
  warnings: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  timestamp: z.number().int().positive(),
});

export type HealthReport = z.infer<typeof HealthReportSchema>;

export interface ChapterHealthConfig {
  dialogueRatioMax: number;
  dialogueRatioMin: number;
  actionRatioMin: number;
  tensionVarianceMin: number;
  wordCountPerBeatMin: number;
  wordCountPerBeatMax: number;
  consecutiveSameTypeMax: number;
}

const DEFAULT_CONFIG: ChapterHealthConfig = {
  dialogueRatioMax: 0.7,
  dialogueRatioMin: 0.2,
  actionRatioMin: 0.15,
  tensionVarianceMin: 2,
  wordCountPerBeatMin: 50,
  wordCountPerBeatMax: 200,
  consecutiveSameTypeMax: 3,
};

export interface BeatSnapshot {
  type: BeatType;
  tensionLevel: TensionLevel;
  wordCount: number;
  hasDialogue: boolean;
  hasAction: boolean;
  characterCount: number;
}

export class ChapterHealthMonitor {
  private config: ChapterHealthConfig;
  private beats: BeatSnapshot[] = [];
  private totalBeats: number;

  constructor(totalBeats: number, config?: Partial<ChapterHealthConfig>) {
    this.totalBeats = totalBeats;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 添加新生成的 beat
   */
  addBeat(beat: BeatSnapshot): void {
    this.beats.push(beat);
  }

  /**
   * 生成实时健康报告
   */
  generateReport(): HealthReport {
    const metrics: HealthMetric[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (this.beats.length === 0) {
      return HealthReportSchema.parse({
        overallStatus: "healthy",
        metrics: [],
        warnings: [],
        suggestions: [],
        timestamp: Date.now(),
      });
    }

    // 1. 对话比例检查
    const dialogueMetric = this.checkDialogueRatio();
    metrics.push(dialogueMetric);
    if (dialogueMetric.status !== "healthy") {
      warnings.push(dialogueMetric.message || "对话比例异常");
      if (dialogueMetric.value > this.config.dialogueRatioMax) {
        suggestions.push("建议增加动作或环境描写场景");
      } else {
        suggestions.push("建议增加对话场景");
      }
    }

    // 2. 动作比例检查
    const actionMetric = this.checkActionRatio();
    metrics.push(actionMetric);
    if (actionMetric.status !== "healthy") {
      warnings.push(actionMetric.message || "动作比例不足");
      suggestions.push("建议增加动作场景");
    }

    // 3. 张力变化检查
    const tensionMetric = this.checkTensionVariance();
    metrics.push(tensionMetric);
    if (tensionMetric.status !== "healthy") {
      warnings.push(tensionMetric.message || "张力变化不足");
      suggestions.push("建议增加张力起伏，避免平淡");
    }

    // 4. 字数分布检查
    const wordCountMetric = this.checkWordCountDistribution();
    metrics.push(wordCountMetric);
    if (wordCountMetric.status !== "healthy") {
      warnings.push(wordCountMetric.message || "字数分布异常");
    }

    // 5. 节奏单调检查
    const rhythmMetric = this.checkRhythmMonotony();
    metrics.push(rhythmMetric);
    if (rhythmMetric.status !== "healthy") {
      warnings.push(rhythmMetric.message || "节奏单调");
      suggestions.push("建议变换 beat 类型，打破单调模式");
    }

    // 6. 进度检查
    const progressMetric = this.checkProgress();
    metrics.push(progressMetric);
    if (progressMetric.status === "warning") {
      warnings.push(progressMetric.message || "进度异常");
    }

    // 确定整体状态
    const criticalCount = metrics.filter(m => m.status === "critical").length;
    const warningCount = metrics.filter(m => m.status === "warning").length;

    let overallStatus: "healthy" | "warning" | "critical" = "healthy";
    if (criticalCount > 0) {
      overallStatus = "critical";
    } else if (warningCount >= 2) {
      overallStatus = "warning";
    }

    return HealthReportSchema.parse({
      overallStatus,
      metrics,
      warnings,
      suggestions,
      timestamp: Date.now(),
    });
  }

  /**
   * 检查对话比例
   */
  private checkDialogueRatio(): HealthMetric {
    const dialogueCount = this.beats.filter(b =>
      b.type === "dialogue" || b.hasDialogue
    ).length;
    const ratio = dialogueCount / this.beats.length;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    if (ratio > this.config.dialogueRatioMax) {
      status = ratio > this.config.dialogueRatioMax + 0.1 ? "critical" : "warning";
      message = `对话比例过高（${Math.round(ratio * 100)}%），建议 ≤${Math.round(this.config.dialogueRatioMax * 100)}%`;
    } else if (ratio < this.config.dialogueRatioMin) {
      status = "warning";
      message = `对话比例过低（${Math.round(ratio * 100)}%），建议 ≥${Math.round(this.config.dialogueRatioMin * 100)}%`;
    }

    return HealthMetricSchema.parse({
      name: "对话比例",
      value: ratio,
      threshold: this.config.dialogueRatioMax,
      status,
      message,
    });
  }

  /**
   * 检查动作比例
   */
  private checkActionRatio(): HealthMetric {
    const actionCount = this.beats.filter(b =>
      b.type === "action" || b.hasAction
    ).length;
    const ratio = actionCount / this.beats.length;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    if (ratio < this.config.actionRatioMin) {
      status = ratio < this.config.actionRatioMin - 0.1 ? "critical" : "warning";
      message = `动作比例不足（${Math.round(ratio * 100)}%），建议 ≥${Math.round(this.config.actionRatioMin * 100)}%`;
    }

    return HealthMetricSchema.parse({
      name: "动作比例",
      value: ratio,
      threshold: this.config.actionRatioMin,
      status,
      message,
    });
  }

  /**
   * 检查张力变化
   */
  private checkTensionVariance(): HealthMetric {
    if (this.beats.length < 3) {
      return HealthMetricSchema.parse({
        name: "张力变化",
        value: 0,
        threshold: this.config.tensionVarianceMin,
        status: "healthy",
      });
    }

    const tensions = this.beats.map(b => b.tensionLevel);
    const max = Math.max(...tensions);
    const min = Math.min(...tensions);
    const variance = max - min;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    if (variance < this.config.tensionVarianceMin) {
      status = "warning";
      message = `张力变化不足（${variance}），建议 ≥${this.config.tensionVarianceMin}`;
    }

    return HealthMetricSchema.parse({
      name: "张力变化",
      value: variance,
      threshold: this.config.tensionVarianceMin,
      status,
      message,
    });
  }

  /**
   * 检查字数分布
   */
  private checkWordCountDistribution(): HealthMetric {
    const wordCounts = this.beats.map(b => b.wordCount);
    const avg = wordCounts.reduce((sum, wc) => sum + wc, 0) / wordCounts.length;

    const tooShort = wordCounts.filter(wc => wc < this.config.wordCountPerBeatMin).length;
    const tooLong = wordCounts.filter(wc => wc > this.config.wordCountPerBeatMax).length;
    const abnormalRatio = (tooShort + tooLong) / wordCounts.length;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    if (abnormalRatio > 0.3) {
      status = "warning";
      message = `${Math.round(abnormalRatio * 100)}% 的 beat 字数异常（平均 ${Math.round(avg)} 字）`;
    }

    return HealthMetricSchema.parse({
      name: "字数分布",
      value: avg,
      threshold: (this.config.wordCountPerBeatMin + this.config.wordCountPerBeatMax) / 2,
      status,
      message,
    });
  }

  /**
   * 检查节奏单调
   */
  private checkRhythmMonotony(): HealthMetric {
    if (this.beats.length < 4) {
      return HealthMetricSchema.parse({
        name: "节奏单调度",
        value: 0,
        threshold: this.config.consecutiveSameTypeMax,
        status: "healthy",
      });
    }

    let maxConsecutive = 1;
    let currentConsecutive = 1;

    for (let i = 1; i < this.beats.length; i++) {
      if (this.beats[i]!.type === this.beats[i - 1]!.type) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    if (maxConsecutive > this.config.consecutiveSameTypeMax) {
      status = maxConsecutive > this.config.consecutiveSameTypeMax + 1 ? "critical" : "warning";
      message = `连续 ${maxConsecutive} 个相同类型 beat，建议 ≤${this.config.consecutiveSameTypeMax}`;
    }

    return HealthMetricSchema.parse({
      name: "节奏单调度",
      value: maxConsecutive,
      threshold: this.config.consecutiveSameTypeMax,
      status,
      message,
    });
  }

  /**
   * 检查进度
   */
  private checkProgress(): HealthMetric {
    const progress = this.beats.length / this.totalBeats;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message: string | undefined;

    const totalWordCount = this.beats.reduce((sum, b) => sum + b.wordCount, 0);
    const avgPerBeat = totalWordCount / this.beats.length;
    const estimatedTotal = avgPerBeat * this.totalBeats;

    if (progress > 0.5 && estimatedTotal < 800) {
      status = "warning";
      message = `预计总字数 ${Math.round(estimatedTotal)} 字，可能偏少`;
    } else if (progress > 0.5 && estimatedTotal > 2500) {
      status = "warning";
      message = `预计总字数 ${Math.round(estimatedTotal)} 字，可能偏多`;
    }

    return HealthMetricSchema.parse({
      name: "进度",
      value: progress,
      threshold: 1,
      status,
      message,
    });
  }

  /**
   * 获取当前统计信息
   */
  getStats(): {
    totalBeats: number;
    completedBeats: number;
    totalWords: number;
    avgWordsPerBeat: number;
    dialogueRatio: number;
    actionRatio: number;
    avgTension: number;
  } {
    const totalWords = this.beats.reduce((sum, b) => sum + b.wordCount, 0);
    const dialogueCount = this.beats.filter(b => b.type === "dialogue" || b.hasDialogue).length;
    const actionCount = this.beats.filter(b => b.type === "action" || b.hasAction).length;
    const avgTension = this.beats.reduce((sum, b) => sum + b.tensionLevel, 0) / Math.max(this.beats.length, 1);

    return {
      totalBeats: this.totalBeats,
      completedBeats: this.beats.length,
      totalWords,
      avgWordsPerBeat: totalWords / Math.max(this.beats.length, 1),
      dialogueRatio: dialogueCount / Math.max(this.beats.length, 1),
      actionRatio: actionCount / Math.max(this.beats.length, 1),
      avgTension,
    };
  }

  /**
   * 重置监控器
   */
  reset(): void {
    this.beats = [];
  }
}

export function createChapterHealthMonitor(
  totalBeats: number,
  config?: Partial<ChapterHealthConfig>
): ChapterHealthMonitor {
  return new ChapterHealthMonitor(totalBeats, config);
}
