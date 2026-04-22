import { z } from "zod";

/**
 * Hook 优先级调整器
 *
 * 基于章节进度、hook 年龄、相关性自动调整 hook 优先级
 * 避免剧情线索被遗忘或拖延过久
 */

export const HookPrioritySchema = z.enum([
  "critical",    // 必须立即解决
  "urgent",      // 应该尽快解决
  "normal",      // 正常优先级
  "deferred",    // 可以延后
  "optional",    // 可选
]);

export type HookPriority = z.infer<typeof HookPrioritySchema>;

export const HookMetadataSchema = z.object({
  id: z.string(),
  originChapter: z.number().int().min(1),
  lastReferencedChapter: z.number().int().min(1),
  status: z.enum(["open", "progressing", "resolved", "abandoned", "deferred"]),
  urgency: z.enum(["fresh", "progressing", "overdue", "critical"]),
  description: z.string(),
  type: z.string().optional(),
  relatedCharacters: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  plannedResolutionChapter: z.number().int().min(1).optional(), // 新增：计划解决章节
  isLongTerm: z.boolean().default(false), // 新增：是否为长期 hook
});

export type HookMetadata = z.infer<typeof HookMetadataSchema>;

export const PrioritizedHookSchema = z.object({
  hook: HookMetadataSchema,
  priority: HookPrioritySchema,
  score: z.number().min(0).max(100),
  reason: z.string(),
  recommendedChapter: z.number().int().min(1).optional(),
});

export type PrioritizedHook = z.infer<typeof PrioritizedHookSchema>;

export interface HookPrioritizerConfig {
  targetChapters: number;
  agingThreshold: number;
  criticalWindowRatio: number;
  urgentWindowRatio: number;
}

const DEFAULT_CONFIG: HookPrioritizerConfig = {
  targetChapters: 100,
  agingThreshold: 10,
  criticalWindowRatio: 0.8,
  urgentWindowRatio: 0.6,
};

export class HookPrioritizer {
  private config: HookPrioritizerConfig;

  constructor(config?: Partial<HookPrioritizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 调整所有 hooks 的优先级
   */
  prioritizeHooks(
    hooks: HookMetadata[],
    currentChapter: number
  ): PrioritizedHook[] {
    const prioritized: PrioritizedHook[] = [];

    for (const hook of hooks) {
      if (hook.status === "resolved" || hook.status === "abandoned") {
        continue;
      }

      const result = this.calculatePriority(hook, currentChapter);
      prioritized.push(result);
    }

    // 按优先级和得分排序
    return prioritized.sort((a, b) => {
      const priorityOrder = { critical: 0, urgent: 1, normal: 2, deferred: 3, optional: 4 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;
    });
  }

  /**
   * 计算单个 hook 的优先级
   */
  private calculatePriority(
    hook: HookMetadata,
    currentChapter: number
  ): PrioritizedHook {
    let score = 50; // 基础分数
    let priority: HookPriority = "normal";
    const reasons: string[] = [];

    // 特殊处理：长期 hook
    if (hook.isLongTerm) {
      return this.calculateLongTermHookPriority(hook, currentChapter);
    }

    // 1. 章节进度因素
    const progress = currentChapter / this.config.targetChapters;
    const criticalWindow = this.config.criticalWindowRatio;
    const urgentWindow = this.config.urgentWindowRatio;

    if (progress >= criticalWindow) {
      score += 30;
      priority = "critical";
      reasons.push(`接近结尾（${Math.round(progress * 100)}%），必须解决`);
    } else if (progress >= urgentWindow) {
      score += 20;
      priority = "urgent";
      reasons.push(`已过半程（${Math.round(progress * 100)}%），应尽快推进`);
    }

    // 2. Hook 年龄因素
    const age = currentChapter - hook.originChapter;
    const staleness = currentChapter - hook.lastReferencedChapter;

    if (age > this.config.agingThreshold) {
      score += Math.min(age * 2, 30);
      reasons.push(`已存在 ${age} 章，不宜再拖延`);
    }

    if (staleness > 5) {
      score += staleness * 3;
      if (priority === "normal") {
        priority = "urgent";
      }
      reasons.push(`已 ${staleness} 章未提及，读者可能遗忘`);
    }

    // 3. 原有紧急度因素
    if (hook.urgency === "critical") {
      score += 40;
      priority = "critical";
      reasons.push("标记为关键剧情线");
    } else if (hook.urgency === "overdue") {
      score += 25;
      priority = priority === "normal" ? "urgent" : priority;
      reasons.push("已逾期");
    } else if (hook.urgency === "progressing") {
      score += 10;
      reasons.push("正在推进中");
    }

    // 4. Hook 类型因素
    if (hook.type === "mystery" || hook.type === "谜团") {
      score += 15;
      reasons.push("谜团类线索需要持续推进");
    } else if (hook.type === "conflict" || hook.type === "冲突") {
      score += 20;
      reasons.push("冲突类线索是核心驱动力");
    } else if (hook.type === "relationship" || hook.type === "关系") {
      score += 5;
      reasons.push("关系类线索可以穿插推进");
    }

    // 5. 状态因素
    if (hook.status === "deferred") {
      score -= 20;
      priority = "deferred";
      reasons.push("已标记为延后");
    } else if (hook.status === "progressing") {
      score += 15;
      reasons.push("正在推进，应保持连贯性");
    }

    // 6. 角色相关性
    if (hook.relatedCharacters.length > 0) {
      score += hook.relatedCharacters.length * 3;
      reasons.push(`涉及 ${hook.relatedCharacters.length} 个角色`);
    }

    // 7. 标签因素
    if (hook.tags.includes("main_plot") || hook.tags.includes("主线")) {
      score += 25;
      if (priority === "normal") {
        priority = "urgent";
      }
      reasons.push("主线剧情");
    } else if (hook.tags.includes("subplot") || hook.tags.includes("支线")) {
      score += 5;
      reasons.push("支线剧情");
    }

    if (hook.tags.includes("time_sensitive") || hook.tags.includes("时效性")) {
      score += 20;
      if (priority === "normal") {
        priority = "urgent";
      }
      reasons.push("有时效性");
    }

    // 最终调整优先级
    if (score >= 80) {
      priority = "critical";
    } else if (score >= 60) {
      priority = priority === "deferred" ? "deferred" : "urgent";
    } else if (score >= 40) {
      priority = priority === "deferred" ? "deferred" : "normal";
    } else if (score >= 20) {
      priority = (priority === "critical" || priority === "urgent") ? "normal" : "deferred";
    } else {
      priority = "optional";
    }

    // 推荐解决章节
    const recommendedChapter = this.calculateRecommendedChapter(
      hook,
      currentChapter,
      priority
    );

    return PrioritizedHookSchema.parse({
      hook,
      priority,
      score: Math.min(score, 100),
      reason: reasons.join("；"),
      recommendedChapter,
    });
  }

  /**
   * 计算长期 hook 的优先级
   *
   * 长期 hook 的特点：
   * 1. 贯穿全书，不应该过早解决
   * 2. 需要定期提及以保持存在感
   * 3. 只在接近计划解决章节时才提升优先级
   */
  private calculateLongTermHookPriority(
    hook: HookMetadata,
    currentChapter: number
  ): PrioritizedHook {
    let score = 30; // 长期 hook 基础分数较低
    let priority: HookPriority = "deferred";
    const reasons: string[] = ["长期剧情线"];

    const plannedResolution = hook.plannedResolutionChapter || this.config.targetChapters;
    const chaptersUntilResolution = plannedResolution - currentChapter;
    const staleness = currentChapter - hook.lastReferencedChapter;

    // 1. 距离计划解决章节的距离
    if (chaptersUntilResolution <= 3) {
      score += 40;
      priority = "critical";
      reasons.push(`距离计划解决仅剩 ${chaptersUntilResolution} 章`);
    } else if (chaptersUntilResolution <= 10) {
      score += 25;
      priority = "urgent";
      reasons.push(`即将进入解决阶段（剩余 ${chaptersUntilResolution} 章）`);
    } else if (chaptersUntilResolution <= 20) {
      score += 10;
      priority = "normal";
      reasons.push("开始铺垫解决线索");
    }

    // 2. 停滞时间检查（长期 hook 也需要定期提及）
    const maxStaleness = Math.max(10, Math.floor(this.config.targetChapters * 0.1));

    if (staleness > maxStaleness) {
      score += 30;
      priority = priority === "deferred" ? "normal" : priority;
      reasons.push(`已 ${staleness} 章未提及，需要保持存在感`);
    } else if (staleness > maxStaleness / 2) {
      score += 15;
      reasons.push(`建议适当提及以保持读者记忆`);
    }

    // 3. 提及频率建议
    const age = currentChapter - hook.originChapter;
    const mentionFrequency = age > 0 ? (age - staleness) / age : 0;

    if (mentionFrequency < 0.1 && chaptersUntilResolution > 10) {
      reasons.push("提及频率偏低，建议增加铺垫");
      score += 10;
    }

    // 4. 阶段性推进
    const progressToResolution = (currentChapter - hook.originChapter) /
                                  (plannedResolution - hook.originChapter);

    if (progressToResolution >= 0.3 && progressToResolution < 0.5 && staleness > 5) {
      score += 15;
      priority = priority === "deferred" ? "normal" : priority;
      reasons.push("中期阶段，建议推进一步");
    } else if (progressToResolution >= 0.6 && progressToResolution < 0.8 && staleness > 3) {
      score += 20;
      priority = priority === "deferred" ? "urgent" : priority;
      reasons.push("后期阶段，需要加速推进");
    }

    // 5. 类型因素
    if (hook.type === "mystery" || hook.type === "谜团") {
      score += 10;
      reasons.push("谜团类长期线索需要逐步揭示");
    } else if (hook.type === "character_arc" || hook.type === "角色成长") {
      score += 5;
      reasons.push("角色成长线需要持续推进");
    }

    // 推荐解决章节
    const recommendedChapter = this.calculateLongTermRecommendedChapter(
      hook,
      currentChapter,
      priority,
      staleness
    );

    return PrioritizedHookSchema.parse({
      hook,
      priority,
      score: Math.min(score, 100),
      reason: reasons.join("；"),
      recommendedChapter,
    });
  }

  /**
   * 计算长期 hook 的推荐章节
   */
  private calculateLongTermRecommendedChapter(
    hook: HookMetadata,
    currentChapter: number,
    priority: HookPriority,
    staleness: number
  ): number {
    const plannedResolution = hook.plannedResolutionChapter || this.config.targetChapters;

    // 如果接近解决时间，推荐立即推进
    if (priority === "critical") {
      return currentChapter + 1;
    }

    // 如果停滞太久，推荐尽快提及
    if (staleness > 10) {
      return currentChapter + Math.min(3, Math.floor(staleness / 3));
    }

    // 否则根据到解决章节的距离计算
    const chaptersUntilResolution = plannedResolution - currentChapter;
    const mentionInterval = Math.max(5, Math.floor(chaptersUntilResolution / 5));

    return currentChapter + mentionInterval;
  }

  /**
   * 计算推荐解决章节
   */
  private calculateRecommendedChapter(
    hook: HookMetadata,
    currentChapter: number,
    priority: HookPriority
  ): number {
    const remainingChapters = this.config.targetChapters - currentChapter;

    switch (priority) {
      case "critical":
        return currentChapter + Math.min(3, Math.floor(remainingChapters * 0.1));
      case "urgent":
        return currentChapter + Math.min(5, Math.floor(remainingChapters * 0.2));
      case "normal":
        return currentChapter + Math.min(10, Math.floor(remainingChapters * 0.4));
      case "deferred":
        return currentChapter + Math.floor(remainingChapters * 0.6);
      case "optional":
        return this.config.targetChapters;
    }
  }

  /**
   * 获取应该在当前章节推进的 hooks
   */
  getHooksForChapter(
    hooks: HookMetadata[],
    currentChapter: number,
    maxHooks: number = 3
  ): PrioritizedHook[] {
    const prioritized = this.prioritizeHooks(hooks, currentChapter);

    // 筛选应该在当前章节推进的 hooks
    const forThisChapter = prioritized.filter(ph => {
      if (ph.priority === "critical") return true;
      if (ph.priority === "urgent" && ph.recommendedChapter && ph.recommendedChapter <= currentChapter + 2) return true;
      if (ph.hook.status === "progressing") return true;
      return false;
    });

    return forThisChapter.slice(0, maxHooks);
  }

  /**
   * 生成优先级报告
   */
  generateReport(hooks: HookMetadata[], currentChapter: number): {
    total: number;
    byPriority: Record<HookPriority, number>;
    critical: PrioritizedHook[];
    urgent: PrioritizedHook[];
    stale: PrioritizedHook[];
  } {
    const prioritized = this.prioritizeHooks(hooks, currentChapter);

    const byPriority: Record<HookPriority, number> = {
      critical: 0,
      urgent: 0,
      normal: 0,
      deferred: 0,
      optional: 0,
    };

    for (const ph of prioritized) {
      byPriority[ph.priority] += 1;
    }

    const critical = prioritized.filter(ph => ph.priority === "critical");
    const urgent = prioritized.filter(ph => ph.priority === "urgent");
    const stale = prioritized.filter(ph => {
      const staleness = currentChapter - ph.hook.lastReferencedChapter;
      return staleness > 5;
    });

    return {
      total: prioritized.length,
      byPriority,
      critical,
      urgent,
      stale,
    };
  }
}

export function createHookPrioritizer(config?: Partial<HookPrioritizerConfig>): HookPrioritizer {
  return new HookPrioritizer(config);
}
