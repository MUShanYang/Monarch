import { z } from "zod";
import type { BeatType, TensionLevel } from "./beat-types.js";
import type { HookMetadata } from "../narrative/hook-prioritizer.js";

/**
 * 智能 Beat 类型推荐器
 *
 * 基于前序 beat 序列、当前张力、待推进 hooks 等因素
 * 智能推荐下一个 beat 的类型，避免节奏单调
 */

export const BeatHistoryEntrySchema = z.object({
  type: z.string(),
  tensionLevel: z.number().int().min(1).max(10),
  wordCount: z.number().int().min(0),
  hasDialogue: z.boolean().default(false),
  hasAction: z.boolean().default(false),
});

export type BeatHistoryEntry = z.infer<typeof BeatHistoryEntrySchema>;

export const BeatRecommendationSchema = z.object({
  type: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  alternatives: z.array(z.object({
    type: z.string(),
    confidence: z.number().min(0).max(1),
  })).default([]),
});

export type BeatRecommendation = z.infer<typeof BeatRecommendationSchema>;

export interface BeatTypeRecommenderConfig {
  maxConsecutiveSameType: number;
  dialogueRatioThreshold: number;
  actionRatioThreshold: number;
  tensionChangeThreshold: number;
}

const DEFAULT_CONFIG: BeatTypeRecommenderConfig = {
  maxConsecutiveSameType: 2,
  dialogueRatioThreshold: 0.6,
  actionRatioThreshold: 0.5,
  tensionChangeThreshold: 3,
};

export class BeatTypeRecommender {
  private config: BeatTypeRecommenderConfig;

  constructor(config?: Partial<BeatTypeRecommenderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 推荐下一个 beat 类型
   */
  recommendNextBeat(
    previousBeats: BeatHistoryEntry[],
    currentTension: TensionLevel,
    hooks: HookMetadata[],
    chapterProgress: number
  ): BeatRecommendation {
    const scores = new Map<BeatType, number>();
    const reasons = new Map<BeatType, string[]>();

    // 初始化所有 beat 类型的基础分数
    const allTypes: BeatType[] = [
      "action",
      "dialogue",
      "interiority",
      "environment",
      "transition",
      "revelation",
      "tension",
      "resolution",
      "negative-space",
    ];

    for (const type of allTypes) {
      scores.set(type, 50);
      reasons.set(type, []);
    }

    // 1. 避免连续相同类型
    this.applyConsecutiveTypeRule(previousBeats, scores, reasons);

    // 2. 基于对话/动作比例调整
    this.applyRatioRule(previousBeats, scores, reasons);

    // 3. 基于张力水平调整
    this.applyTensionRule(currentTension, previousBeats, scores, reasons);

    // 4. 基于 hooks 调整
    this.applyHookRule(hooks, scores, reasons);

    // 5. 基于章节进度调整
    this.applyProgressRule(chapterProgress, scores, reasons);

    // 6. 基于节奏模式调整
    this.applyRhythmRule(previousBeats, scores, reasons);

    // 选择得分最高的类型
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]);

    const topType = sorted[0]![0];
    const topScore = sorted[0]![1];
    const topReasons = reasons.get(topType) || [];

    // 生成备选方案
    const alternatives = sorted
      .slice(1, 4)
      .map(([type, score]) => ({
        type,
        confidence: score / 100,
      }));

    return BeatRecommendationSchema.parse({
      type: topType,
      confidence: Math.min(topScore / 100, 1),
      reason: topReasons.join("；"),
      alternatives,
    });
  }

  /**
   * 规则1：避免连续相同类型
   */
  private applyConsecutiveTypeRule(
    previousBeats: BeatHistoryEntry[],
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    if (previousBeats.length === 0) return;

    const lastN = previousBeats.slice(-this.config.maxConsecutiveSameType);
    const lastType = lastN[lastN.length - 1]?.type;

    if (!lastType) return;

    // 检查是否连续相同
    const allSame = lastN.every(b => b.type === lastType);

    if (allSame) {
      const currentScore = scores.get(lastType as BeatType) || 50;
      scores.set(lastType as BeatType, currentScore - 30);
      reasons.get(lastType as BeatType)?.push(`避免连续 ${lastN.length} 个相同类型`);

      // 提升互补类型
      const complementary = this.getComplementaryType(lastType as BeatType);
      for (const type of complementary) {
        const score = scores.get(type) || 50;
        scores.set(type, score + 20);
        reasons.get(type)?.push(`与前序 ${lastType} 形成对比`);
      }
    }
  }

  /**
   * 规则2：基于对话/动作比例
   */
  private applyRatioRule(
    previousBeats: BeatHistoryEntry[],
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    if (previousBeats.length < 3) return;

    const recent = previousBeats.slice(-5);
    const dialogueCount = recent.filter(b => b.type === "dialogue" || b.hasDialogue).length;
    const actionCount = recent.filter(b => b.type === "action" || b.hasAction).length;

    const dialogueRatio = dialogueCount / recent.length;
    const actionRatio = actionCount / recent.length;

    // 对话过多
    if (dialogueRatio > this.config.dialogueRatioThreshold) {
      const dialogueScore = scores.get("dialogue") || 50;
      scores.set("dialogue", dialogueScore - 25);
      reasons.get("dialogue")?.push(`对话比例过高（${Math.round(dialogueRatio * 100)}%）`);

      const actionScore = scores.get("action") || 50;
      scores.set("action", actionScore + 20);
      reasons.get("action")?.push("需要增加动作场景");

      const envScore = scores.get("environment") || 50;
      scores.set("environment", envScore + 15);
      reasons.get("environment")?.push("需要环境描写");
    }

    // 动作过多
    if (actionRatio > this.config.actionRatioThreshold) {
      const actionScore = scores.get("action") || 50;
      scores.set("action", actionScore - 20);
      reasons.get("action")?.push(`动作比例过高（${Math.round(actionRatio * 100)}%）`);

      const interiorityScore = scores.get("interiority") || 50;
      scores.set("interiority", interiorityScore + 20);
      reasons.get("interiority")?.push("需要内心戏");

      const dialogueScore = scores.get("dialogue") || 50;
      scores.set("dialogue", dialogueScore + 15);
      reasons.get("dialogue")?.push("需要对话缓冲");
    }
  }

  /**
   * 规则3：基于张力水平
   */
  private applyTensionRule(
    currentTension: TensionLevel,
    previousBeats: BeatHistoryEntry[],
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    // 高张力场景
    if (currentTension >= 8) {
      const actionScore = scores.get("action") || 50;
      scores.set("action", actionScore + 25);
      reasons.get("action")?.push(`高张力（${currentTension}/10）适合动作`);

      const tensionScore = scores.get("tension") || 50;
      scores.set("tension", tensionScore + 20);
      reasons.get("tension")?.push("维持紧张感");

      const revelationScore = scores.get("revelation") || 50;
      scores.set("revelation", revelationScore + 15);
      reasons.get("revelation")?.push("高潮时刻适合揭示");

      // 检查是否需要负空间
      if (previousBeats.length >= 2) {
        const lastTwo = previousBeats.slice(-2);
        if (lastTwo.every(b => b.tensionLevel >= 8)) {
          const negSpaceScore = scores.get("negative-space") || 50;
          scores.set("negative-space", negSpaceScore + 30);
          reasons.get("negative-space")?.push("连续高张力，需要喘息空间");
        }
      }
    }

    // 低张力场景
    if (currentTension <= 3) {
      const envScore = scores.get("environment") || 50;
      scores.set("environment", envScore + 20);
      reasons.get("environment")?.push(`低张力（${currentTension}/10）适合环境描写`);

      const interiorityScore = scores.get("interiority") || 50;
      scores.set("interiority", interiorityScore + 15);
      reasons.get("interiority")?.push("适合内心独白");

      const dialogueScore = scores.get("dialogue") || 50;
      scores.set("dialogue", dialogueScore + 10);
      reasons.get("dialogue")?.push("适合日常对话");
    }

    // 张力变化
    if (previousBeats.length > 0) {
      const lastTension = previousBeats[previousBeats.length - 1]!.tensionLevel;
      const tensionChange = Math.abs(currentTension - lastTension);

      if (tensionChange >= this.config.tensionChangeThreshold) {
        const transitionScore = scores.get("transition") || 50;
        scores.set("transition", transitionScore + 20);
        reasons.get("transition")?.push(`张力变化大（${lastTension}→${currentTension}），需要过渡`);
      }
    }
  }

  /**
   * 规则4：基于待推进 hooks
   */
  private applyHookRule(
    hooks: HookMetadata[],
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    const urgentHooks = hooks.filter(h =>
      h.urgency === "critical" || h.urgency === "overdue"
    );

    if (urgentHooks.length === 0) return;

    // 有紧急 hooks 需要推进
    const revelationScore = scores.get("revelation") || 50;
    scores.set("revelation", revelationScore + 25);
    reasons.get("revelation")?.push(`有 ${urgentHooks.length} 个紧急线索待揭示`);

    const dialogueScore = scores.get("dialogue") || 50;
    scores.set("dialogue", dialogueScore + 15);
    reasons.get("dialogue")?.push("对话适合推进剧情线");

    // 检查 hook 类型
    for (const hook of urgentHooks) {
      if (hook.type === "mystery" || hook.type === "谜团") {
        const revScore = scores.get("revelation") || 50;
        scores.set("revelation", revScore + 10);
        reasons.get("revelation")?.push("谜团类线索需要揭示");
      } else if (hook.type === "conflict" || hook.type === "冲突") {
        const actionScore = scores.get("action") || 50;
        scores.set("action", actionScore + 10);
        reasons.get("action")?.push("冲突类线索需要动作推进");
      }
    }
  }

  /**
   * 规则5：基于章节进度
   */
  private applyProgressRule(
    chapterProgress: number,
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    // 章节开头（0-20%）
    if (chapterProgress < 0.2) {
      const envScore = scores.get("environment") || 50;
      scores.set("environment", envScore + 15);
      reasons.get("environment")?.push("章节开头适合场景设定");

      const dialogueScore = scores.get("dialogue") || 50;
      scores.set("dialogue", dialogueScore + 10);
      reasons.get("dialogue")?.push("开头适合对话引入");
    }

    // 章节中段（20-70%）
    if (chapterProgress >= 0.2 && chapterProgress < 0.7) {
      const actionScore = scores.get("action") || 50;
      scores.set("action", actionScore + 15);
      reasons.get("action")?.push("中段适合动作推进");

      const tensionScore = scores.get("tension") || 50;
      scores.set("tension", tensionScore + 10);
      reasons.get("tension")?.push("中段适合制造张力");
    }

    // 章节结尾（70-100%）
    if (chapterProgress >= 0.7) {
      const revelationScore = scores.get("revelation") || 50;
      scores.set("revelation", revelationScore + 20);
      reasons.get("revelation")?.push("结尾适合揭示关键信息");

      const resolutionScore = scores.get("resolution") || 50;
      scores.set("resolution", resolutionScore + 15);
      reasons.get("resolution")?.push("结尾适合阶段性解决");

      const tensionScore = scores.get("tension") || 50;
      scores.set("tension", tensionScore + 10);
      reasons.get("tension")?.push("结尾适合留悬念");
    }
  }

  /**
   * 规则6：基于节奏模式
   */
  private applyRhythmRule(
    previousBeats: BeatHistoryEntry[],
    scores: Map<BeatType, number>,
    reasons: Map<BeatType, string[]>
  ): void {
    if (previousBeats.length < 4) return;

    const recent = previousBeats.slice(-4);

    // 检测单调模式：ABAB 或 AABB
    const pattern = recent.map(b => b.type).join("-");

    if (pattern.match(/^(\w+)-(\w+)-\1-\2$/)) {
      // ABAB 模式，打破它
      const typeA = recent[0]!.type;
      const typeB = recent[1]!.type;

      const scoreA = scores.get(typeA as BeatType) || 50;
      scores.set(typeA as BeatType, scoreA - 20);
      reasons.get(typeA as BeatType)?.push("打破 ABAB 单调模式");

      const scoreB = scores.get(typeB as BeatType) || 50;
      scores.set(typeB as BeatType, scoreB - 20);
      reasons.get(typeB as BeatType)?.push("打破 ABAB 单调模式");
    }

    // 检测张力单调
    const tensions = recent.map(b => b.tensionLevel);
    const allSimilar = tensions.every(t => Math.abs(t - tensions[0]!) <= 1);

    if (allSimilar) {
      const transitionScore = scores.get("transition") || 50;
      scores.set("transition", transitionScore + 15);
      reasons.get("transition")?.push("张力单调，需要变化");
    }
  }

  /**
   * 获取互补类型
   */
  private getComplementaryType(type: BeatType): BeatType[] {
    const complementary: Record<BeatType, BeatType[]> = {
      action: ["interiority", "dialogue", "environment"],
      dialogue: ["action", "environment", "interiority"],
      interiority: ["action", "dialogue", "environment"],
      environment: ["action", "dialogue"],
      transition: ["action", "dialogue"],
      revelation: ["interiority", "dialogue"],
      tension: ["negative-space", "interiority"],
      resolution: ["transition", "interiority"],
      "negative-space": ["action", "dialogue"],
    };

    return complementary[type] || [];
  }
}

export function createBeatTypeRecommender(
  config?: Partial<BeatTypeRecommenderConfig>
): BeatTypeRecommender {
  return new BeatTypeRecommender(config);
}
