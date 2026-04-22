import { z } from "zod";

export const FormatNormalizerConfigSchema = z.object({
  removeMetaComments: z.boolean().default(true),
  removeMarkdownHeaders: z.boolean().default(true),
  removeNumberedLists: z.boolean().default(true),
  removeExplicitTransitions: z.boolean().default(true),
  removeThinkingTags: z.boolean().default(true),
  normalizeQuotes: z.boolean().default(true),
  removeTrailingEllipsis: z.boolean().default(true),
  maxConsecutiveNewlines: z.number().int().min(1).max(5).default(2),
  normalizeLineBreaks: z.boolean().default(true),
  ensureParagraphBreaks: z.boolean().default(true),
});
export type FormatNormalizerConfig = z.infer<typeof FormatNormalizerConfigSchema>;

export interface FormatNormalizationResult {
  normalized: string;
  changes: string[];
  issuesFound: number;
}

/**
 * 格式规范化器 - 清理 LLM 生成的文本中的格式问题
 *
 * 常见问题：
 * 1. 包含元评论（"首先"、"接下来"、"总之"等）
 * 2. 包含 Markdown 标题（# 标题）
 * 3. 包含编号列表（1. 2. 3.）
 * 4. 包含思考标签（<thinking>...</thinking>）
 * 5. 引号不规范（混用中英文引号）
 * 6. 过多的省略号
 * 7. 过多的空行
 */
export class FormatNormalizer {
  private config: Required<FormatNormalizerConfig>;

  constructor(config?: FormatNormalizerConfig) {
    this.config = { ...FormatNormalizerConfigSchema.parse(config ?? {}) };
  }

  normalize(text: string): FormatNormalizationResult {
    const changes: string[] = [];
    let normalized = text;
    let issuesFound = 0;

    // 1. 移除思考标签
    if (this.config.removeThinkingTags) {
      const before = normalized;
      normalized = normalized.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
      if (before !== normalized) {
        changes.push("移除了思考标签");
        issuesFound += 1;
      }
    }

    // 2. 移除 Markdown 标题
    if (this.config.removeMarkdownHeaders) {
      const before = normalized;
      normalized = normalized.replace(/^#{1,6}\s+.+$/gm, "");
      if (before !== normalized) {
        changes.push("移除了 Markdown 标题");
        issuesFound += 1;
      }
    }

    // 3. 移除编号列表开头
    if (this.config.removeNumberedLists) {
      const before = normalized;
      // 匹配 "1. " "2. " 等开头
      normalized = normalized.replace(/^\d+\.\s+/gm, "");
      if (before !== normalized) {
        changes.push("移除了编号列表标记");
        issuesFound += 1;
      }
    }

    // 4. 移除显式过渡词
    if (this.config.removeExplicitTransitions) {
      const before = normalized;
      const transitionPatterns = [
        /^首先[，,：:]/gm,
        /^其次[，,：:]/gm,
        /^然后[，,：:]/gm,
        /^接着[，,：:]/gm,
        /^最后[，,：:]/gm,
        /^总之[，,：:]/gm,
        /^综上所述[，,：:]/gm,
      ];
      for (const pattern of transitionPatterns) {
        normalized = normalized.replace(pattern, "");
      }
      if (before !== normalized) {
        changes.push("移除了显式过渡词");
        issuesFound += 1;
      }
    }

    // 5. 移除元评论
    if (this.config.removeMetaComments) {
      const before = normalized;
      const metaPatterns = [
        /\[.*?注.*?[:：].*?\]/g,  // [注：...]
        /\(.*?注.*?[:：].*?\)/g,  // (注：...)
        /【.*?注.*?[:：].*?】/g,  // 【注：...】
        /\[.*?作者.*?[:：].*?\]/g, // [作者：...]
        /\(.*?作者.*?[:：].*?\)/g, // (作者：...)
      ];
      for (const pattern of metaPatterns) {
        normalized = normalized.replace(pattern, "");
      }
      if (before !== normalized) {
        changes.push("移除了元评论");
        issuesFound += 1;
      }
    }

    // 6. 规范化引号
    if (this.config.normalizeQuotes) {
      const before = normalized;
      // 将英文引号替换为中文引号
      normalized = normalized.replace(/"/g, "“");
      normalized = normalized.replace(/"/g, "”");
      normalized = normalized.replace(/'/g, "‘");
      normalized = normalized.replace(/'/g, "’");
      if (before !== normalized) {
        changes.push("规范化了引号");
        issuesFound += 1;
      }
    }

    // 7. 移除过多的省略号
    if (this.config.removeTrailingEllipsis) {
      const before = normalized;
      // 将多个连续的省略号替换为单个
      normalized = normalized.replace(/[…\.]{4,}/g, "…");
      // 移除句尾过多的省略号（保留最多一个）
      normalized = normalized.replace(/([。！？])[…\.]+/g, "$1");
      if (before !== normalized) {
        changes.push("规范化了省略号");
        issuesFound += 1;
      }
    }

    // 8. 规范化换行
    if (this.config.normalizeLineBreaks) {
      const before = normalized;

      // 移除句子中间的不必要换行（保留段落间的换行）
      // 匹配：非句尾标点 + 换行 + 非空行
      normalized = normalized.replace(/([^。！？\n])\n([^\n])/g, "$1$2");

      // 确保对话后有换行
      normalized = normalized.replace(/([""'])([^""'\n]{0,5})([。！？])([^\n])/g, "$1$2$3\n$4");

      if (before !== normalized) {
        changes.push("规范化了换行");
        issuesFound += 1;
      }
    }

    // 9. 确保段落间有适当的空行
    if (this.config.ensureParagraphBreaks) {
      const before = normalized;

      // 在句号、问号、感叹号后如果没有换行，添加换行
      // 但要避免对话引号内的情况
      normalized = normalized.replace(/([。！？])([^""'\n\s])/g, "$1\n\n$2");

      if (before !== normalized) {
        changes.push("添加了段落间空行");
        issuesFound += 1;
      }
    }

    // 10. 规范化空行数量
    const maxNewlines = this.config.maxConsecutiveNewlines;
    const beforeNewlines = normalized;
    const newlinePattern = new RegExp(`\n{${maxNewlines + 1},}`, "g");
    normalized = normalized.replace(newlinePattern, "\n".repeat(maxNewlines));
    if (beforeNewlines !== normalized) {
      changes.push(`限制了连续空行数量（最多 ${maxNewlines} 行）`);
      issuesFound += 1;
    }

    // 11. 清理首尾空白
    normalized = normalized.trim();

    return {
      normalized,
      changes,
      issuesFound,
    };
  }

  /**
   * 检测文本中的格式问题（不修改）
   */
  detectIssues(text: string): string[] {
    const issues: string[] = [];

    if (/<thinking>[\s\S]*?<\/thinking>/i.test(text)) {
      issues.push("包含思考标签");
    }

    if (/^#{1,6}\s+.+$/m.test(text)) {
      issues.push("包含 Markdown 标题");
    }

    if (/^\d+\.\s+/m.test(text)) {
      issues.push("包含编号列表");
    }

    if (/^(首先|其次|然后|接着|最后|总之|综上所述)[，,：:]/m.test(text)) {
      issues.push("包含显式过渡词");
    }

    if (/\[.*?注.*?[:：].*?\]|\(.*?注.*?[:：].*?\)|【.*?注.*?[:：].*?】/.test(text)) {
      issues.push("包含元评论");
    }

    if (/["']/.test(text)) {
      issues.push("使用了英文引号");
    }

    if (/[…\.]{4,}/.test(text)) {
      issues.push("包含过多省略号");
    }

    const newlineCount = (text.match(/\n/g) || []).length;
    const maxConsecutive = this.getMaxConsecutiveNewlines(text);
    if (maxConsecutive > this.config.maxConsecutiveNewlines) {
      issues.push(`包含过多连续空行（${maxConsecutive} 行）`);
    }

    return issues;
  }

  private getMaxConsecutiveNewlines(text: string): number {
    const matches = text.match(/\n+/g);
    if (!matches) return 0;
    return Math.max(...matches.map(m => m.length));
  }
}

export function createFormatNormalizer(config?: FormatNormalizerConfig): FormatNormalizer {
  return new FormatNormalizer(config);
}
