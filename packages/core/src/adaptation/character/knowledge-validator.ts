import { z } from "zod";
import {
  KnowledgeTracker,
  type KnowledgeValidationResult,
  type KnowledgeViolation,
} from "./knowledge-tracker.js";
import type { Beat, NarrativeDNA } from "../beat/beat-types.js";

/**
 * 知识验证器
 *
 * 在 beat 生成后自动验证角色知识边界
 * 如果发现违规，自动重试或提供修复建议
 */

export const ValidationActionSchema = z.enum([
  "accept",      // 接受（无违规）
  "retry",       // 重试生成
  "warn",        // 警告但接受
  "reject",      // 拒绝（严重违规）
]);
export type ValidationAction = z.infer<typeof ValidationActionSchema>;

export const KnowledgeValidationDecisionSchema = z.object({
  action: ValidationActionSchema,
  violations: z.array(z.any()).default([]),
  warnings: z.array(z.string()).default([]),
  retryPrompt: z.string().optional(), // 如果需要重试，提供修复提示
  score: z.number().min(0).max(100).default(100), // 知识一致性得分
});
export type KnowledgeValidationDecision = z.infer<typeof KnowledgeValidationDecisionSchema>;

export interface KnowledgeValidatorConfig {
  strictMode: boolean; // 严格模式：任何违规都拒绝
  autoRetry: boolean;  // 自动重试
  maxRetries: number;  // 最大重试次数
}

const DEFAULT_CONFIG: KnowledgeValidatorConfig = {
  strictMode: false,
  autoRetry: true,
  maxRetries: 2,
};

export class KnowledgeValidator {
  private tracker: KnowledgeTracker;
  private config: KnowledgeValidatorConfig;
  private retryCount: Map<string, number> = new Map(); // beatId -> retry count

  constructor(tracker: KnowledgeTracker, config?: Partial<KnowledgeValidatorConfig>) {
    this.tracker = tracker;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 验证 beat 的知识一致性
   */
  async validateBeat(
    prose: string,
    beat: Beat,
    chapterNumber: number,
    beatIndex: number
  ): Promise<KnowledgeValidationDecision> {
    const focusCharacters = beat.dna.who.map(c => c.id);

    if (focusCharacters.length === 0) {
      return {
        action: "accept",
        violations: [],
        warnings: [],
        score: 100,
      };
    }

    const allViolations: KnowledgeViolation[] = [];
    const allWarnings: string[] = [];
    let totalScore = 100;

    // 验证每个焦点角色
    for (const characterId of focusCharacters) {
      const result = this.tracker.validateText(prose, characterId, chapterNumber, beatIndex);

      if (!result.isValid) {
        allViolations.push(...result.violations);
      }

      allWarnings.push(...result.warnings);

      // 计算扣分
      for (const violation of result.violations) {
        if (violation.severity === "critical") {
          totalScore -= 30;
        } else if (violation.severity === "major") {
          totalScore -= 15;
        } else {
          totalScore -= 5;
        }
      }
    }

    totalScore = Math.max(0, totalScore);

    // 决定行动
    const action = this.decideAction(allViolations, totalScore, beat.id);

    // 生成重试提示
    let retryPrompt: string | undefined;
    if (action === "retry" && allViolations.length > 0) {
      retryPrompt = this.generateRetryPrompt(allViolations);
    }

    return {
      action,
      violations: allViolations,
      warnings: allWarnings,
      retryPrompt,
      score: totalScore,
    };
  }

  /**
   * 从对话中提取新知识并更新追踪器
   */
  extractAndUpdateKnowledge(
    prose: string,
    beat: Beat,
    chapterNumber: number
  ): void {
    const focusCharacters = beat.dna.who;

    // 简单的知识提取：查找"知道"、"发现"、"意识到"等关键词
    const knowledgePatterns = [
      /(.+?)(?:知道|得知|发现|意识到|明白|了解到)(?:了)?(.+?)[。！？]/g,
      /(.+?)(?:learned|discovered|realized|found out|understood)\s+(?:that\s+)?(.+?)[.!?]/gi,
    ];

    for (const pattern of knowledgePatterns) {
      let match;
      while ((match = pattern.exec(prose)) !== null) {
        const subject = match[1]?.trim();
        const fact = match[2]?.trim();

        if (!subject || !fact) continue;

        // 尝试匹配角色
        for (const character of focusCharacters) {
          if (subject.includes(character.name) || character.name.includes(subject)) {
            this.tracker.addKnowledge(
              character.id,
              character.name,
              fact,
              chapterNumber,
              "dialogue",
              "confirmed"
            );
          }
        }
      }
    }

    // 提取怀疑/推测
    const suspicionPatterns = [
      /(.+?)(?:怀疑|猜测|推测|觉得|认为)(.+?)[。！？]/g,
      /(.+?)(?:suspects|guesses|thinks|believes)\s+(?:that\s+)?(.+?)[.!?]/gi,
    ];

    for (const pattern of suspicionPatterns) {
      let match;
      while ((match = pattern.exec(prose)) !== null) {
        const subject = match[1]?.trim();
        const fact = match[2]?.trim();

        if (!subject || !fact) continue;

        for (const character of focusCharacters) {
          if (subject.includes(character.name) || character.name.includes(subject)) {
            this.tracker.addKnowledge(
              character.id,
              character.name,
              fact,
              chapterNumber,
              "inference",
              "suspected"
            );
          }
        }
      }
    }
  }

  /**
   * 重置重试计数
   */
  resetRetryCount(beatId: string): void {
    this.retryCount.delete(beatId);
  }

  /**
   * 获取追踪器
   */
  getTracker(): KnowledgeTracker {
    return this.tracker;
  }

  // ========== 私有方法 ==========

  private decideAction(
    violations: KnowledgeViolation[],
    score: number,
    beatId: string
  ): ValidationAction {
    if (violations.length === 0) {
      return "accept";
    }

    const criticalCount = violations.filter(v => v.severity === "critical").length;
    const majorCount = violations.filter(v => v.severity === "major").length;

    // 严格模式：任何违规都拒绝
    if (this.config.strictMode) {
      if (criticalCount > 0) {
        return "reject";
      }
      if (majorCount > 0) {
        return this.shouldRetry(beatId) ? "retry" : "reject";
      }
      return "warn";
    }

    // 宽松模式
    if (criticalCount > 0) {
      return this.shouldRetry(beatId) ? "retry" : "reject";
    }

    if (majorCount >= 2 || score < 60) {
      return this.shouldRetry(beatId) ? "retry" : "warn";
    }

    if (majorCount === 1 || score < 80) {
      return "warn";
    }

    return "accept";
  }

  private shouldRetry(beatId: string): boolean {
    if (!this.config.autoRetry) {
      return false;
    }

    const currentRetries = this.retryCount.get(beatId) ?? 0;

    if (currentRetries >= this.config.maxRetries) {
      return false;
    }

    this.retryCount.set(beatId, currentRetries + 1);
    return true;
  }

  private generateRetryPrompt(violations: KnowledgeViolation[]): string {
    const lines: string[] = ["【知识边界违规，需要修正】\n"];

    for (const violation of violations) {
      lines.push(`❌ ${violation.characterName}: ${violation.violatedFact}`);
      lines.push(`   原因: ${violation.evidence}`);
      if (violation.suggestion) {
        lines.push(`   建议: ${violation.suggestion}`);
      }
      lines.push("");
    }

    lines.push("请重新生成，确保角色只说他们应该知道的内容。");

    return lines.join("\n");
  }
}

export function createKnowledgeValidator(
  tracker: KnowledgeTracker,
  config?: Partial<KnowledgeValidatorConfig>
): KnowledgeValidator {
  return new KnowledgeValidator(tracker, config);
}
