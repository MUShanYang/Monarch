import { z } from "zod";

/**
 * 动态母题提取器
 *
 * 从故事内容中自动识别和追踪重复出现的意象、物品、场景元素
 * 替代硬编码的 MOTIF_VOCABULARY
 */

export const ExtractedMotifSchema = z.object({
  term: z.string().min(1),
  category: z.enum(["object", "scene", "action", "concept", "character_trait"]),
  frequency: z.number().int().min(1),
  firstAppearance: z.object({
    chapter: z.number().int().min(1),
    context: z.string().max(200),
  }),
  emotionalAssociations: z.array(z.object({
    emotion: z.string(),
    valence: z.number().min(-1).max(1),
    count: z.number().int().min(1),
  })).default([]),
  coOccurrences: z.record(z.string(), z.number().int()).default({}),
  significance: z.number().min(0).max(1).default(0),
});

export type ExtractedMotif = z.infer<typeof ExtractedMotifSchema>;

export const DynamicMotifIndexSchema = z.object({
  motifs: z.record(z.string(), ExtractedMotifSchema).default({}),
  storySpecificTerms: z.array(z.string()).default([]),
  lastExtraction: z.number().int().positive().optional(),
  version: z.string().default("2.0.0"),
});

export type DynamicMotifIndex = z.infer<typeof DynamicMotifIndexSchema>;

export interface MotifExtractionConfig {
  minFrequency: number;
  minSignificance: number;
  maxMotifs: number;
  includeProperNouns: boolean;
  language: "zh" | "en";
}

const DEFAULT_CONFIG: MotifExtractionConfig = {
  minFrequency: 3,
  minSignificance: 0.3,
  maxMotifs: 50,
  includeProperNouns: false,
  language: "zh",
};

/**
 * 动态母题提取器
 *
 * 工作流程：
 * 1. 从 story_bible.md 提取核心意象（世界观关键词）
 * 2. 从已生成章节中统计高频名词/动词
 * 3. 识别与情感强相关的词汇
 * 4. 追踪词汇的共现模式
 */
export class DynamicMotifExtractor {
  private index: DynamicMotifIndex;
  private config: MotifExtractionConfig;
  private stopWords: Set<string>;

  constructor(initialIndex?: DynamicMotifIndex, config?: Partial<MotifExtractionConfig>) {
    this.index = initialIndex ?? DynamicMotifIndexSchema.parse({ motifs: {} });
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stopWords = this.buildStopWords();
  }

  private buildStopWords(): Set<string> {
    if (this.config.language === "zh") {
      return new Set([
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
        "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
        "自己", "这", "那", "里", "就是", "可以", "什么", "他", "她", "它", "们",
      ]);
    } else {
      return new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
        "been", "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "must", "can", "this",
        "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
      ]);
    }
  }

  /**
   * 从 story_bible.md 提取核心意象
   */
  extractFromStoryBible(storyBibleContent: string): void {
    const lines = storyBibleContent.split("\n");
    const keyTerms: string[] = [];

    for (const line of lines) {
      // 提取标题和重点标记的内容
      if (line.startsWith("#") || line.includes("**") || line.includes("核心")) {
        const terms = this.extractTermsFromLine(line);
        keyTerms.push(...terms);
      }
    }

    // 标记为故事特定术语
    this.index.storySpecificTerms = [...new Set(keyTerms)];
  }

  /**
   * 从章节内容中提取母题
   */
  extractFromChapter(
    chapterNumber: number,
    chapterContent: string,
    emotionalContext?: { emotion: string; valence: number }
  ): void {
    const terms = this.extractTermsFromText(chapterContent);
    const termFrequency = this.calculateFrequency(terms);

    for (const [term, frequency] of Object.entries(termFrequency)) {
      if (frequency < this.config.minFrequency) continue;
      if (this.stopWords.has(term.toLowerCase())) continue;

      let motif = this.index.motifs[term];

      if (!motif) {
        // 新母题
        const context = this.extractContext(chapterContent, term);
        motif = ExtractedMotifSchema.parse({
          term,
          category: this.categorize(term, context),
          frequency,
          firstAppearance: {
            chapter: chapterNumber,
            context: context.slice(0, 200),
          },
          emotionalAssociations: [],
          coOccurrences: {},
          significance: 0,
        });
        this.index.motifs[term] = motif;
      } else {
        // 更新频率
        motif.frequency += frequency;
      }

      // 记录情感关联
      if (emotionalContext) {
        this.updateEmotionalAssociation(motif, emotionalContext);
      }

      // 更新共现关系
      this.updateCoOccurrences(motif, terms);
    }

    // 重新计算显著性
    this.recalculateSignificance();
    this.index.lastExtraction = Date.now();
  }

  /**
   * 从文本中提取术语（名词、动词、形容词）
   */
  private extractTermsFromText(text: string): string[] {
    const terms: string[] = [];

    if (this.config.language === "zh") {
      // 中文：提取 2-4 字的词组
      const matches = text.matchAll(/[一-鿿]{2,4}/g);
      for (const match of matches) {
        terms.push(match[0]);
      }
    } else {
      // 英文：提取单词
      const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
      terms.push(...words);
    }

    return terms;
  }

  private extractTermsFromLine(line: string): string[] {
    // 移除 markdown 标记
    const cleaned = line.replace(/[#*`]/g, "").trim();
    return this.extractTermsFromText(cleaned);
  }

  private calculateFrequency(terms: string[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    for (const term of terms) {
      frequency[term] = (frequency[term] || 0) + 1;
    }
    return frequency;
  }

  private extractContext(text: string, term: string): string {
    const index = text.indexOf(term);
    if (index === -1) return "";

    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + term.length + 50);
    return text.slice(start, end);
  }

  private categorize(term: string, context: string): ExtractedMotif["category"] {
    // 简单的分类逻辑，可以后续用 LLM 增强
    if (this.config.language === "zh") {
      if (context.includes("的") && context.indexOf(term) < context.indexOf("的")) {
        return "character_trait";
      }
      if (["剑", "刀", "枪", "盾", "书", "笔", "镜", "珠"].some(obj => term.includes(obj))) {
        return "object";
      }
      if (["山", "河", "城", "殿", "楼", "院"].some(scene => term.includes(scene))) {
        return "scene";
      }
    }

    return "concept";
  }

  private updateEmotionalAssociation(
    motif: ExtractedMotif,
    emotionalContext: { emotion: string; valence: number }
  ): void {
    const existing = motif.emotionalAssociations.find(
      assoc => assoc.emotion === emotionalContext.emotion
    );

    if (existing) {
      existing.count += 1;
      // 更新平均 valence
      existing.valence = (existing.valence * (existing.count - 1) + emotionalContext.valence) / existing.count;
    } else {
      motif.emotionalAssociations.push({
        emotion: emotionalContext.emotion,
        valence: emotionalContext.valence,
        count: 1,
      });
    }
  }

  private updateCoOccurrences(motif: ExtractedMotif, allTerms: string[]): void {
    const termSet = new Set(allTerms);
    for (const otherTerm of termSet) {
      if (otherTerm === motif.term) continue;
      motif.coOccurrences[otherTerm] = (motif.coOccurrences[otherTerm] || 0) + 1;
    }
  }

  /**
   * 计算母题的显著性
   *
   * 考虑因素：
   * 1. 出现频率
   * 2. 情感关联强度
   * 3. 是否为故事特定术语
   * 4. 共现模式的复杂度
   */
  private recalculateSignificance(): void {
    const allMotifs = Object.values(this.index.motifs);
    const maxFrequency = Math.max(...allMotifs.map(m => m.frequency), 1);

    for (const motif of allMotifs) {
      let significance = 0;

      // 频率得分 (0-0.4)
      significance += (motif.frequency / maxFrequency) * 0.4;

      // 情感关联得分 (0-0.3)
      const emotionalStrength = motif.emotionalAssociations.reduce(
        (sum, assoc) => sum + Math.abs(assoc.valence) * assoc.count,
        0
      );
      significance += Math.min(emotionalStrength / 10, 0.3);

      // 故事特定术语加成 (0-0.2)
      if (this.index.storySpecificTerms.includes(motif.term)) {
        significance += 0.2;
      }

      // 共现复杂度 (0-0.1)
      const coOccurrenceCount = Object.keys(motif.coOccurrences).length;
      significance += Math.min(coOccurrenceCount / 20, 0.1);

      motif.significance = Math.min(significance, 1);
    }
  }

  /**
   * 获取最显著的母题
   */
  getTopMotifs(limit?: number): ExtractedMotif[] {
    const motifs = Object.values(this.index.motifs)
      .filter(m => m.significance >= this.config.minSignificance)
      .sort((a, b) => b.significance - a.significance);

    return motifs.slice(0, limit ?? this.config.maxMotifs);
  }

  /**
   * 获取与特定情感关联的母题
   */
  getMotifsByEmotion(emotion: string): ExtractedMotif[] {
    return Object.values(this.index.motifs).filter(motif =>
      motif.emotionalAssociations.some(assoc => assoc.emotion === emotion)
    );
  }

  /**
   * 获取母题的情感倾向
   */
  getMotifEmotionalTendency(term: string): { emotion: string; valence: number } | null {
    const motif = this.index.motifs[term];
    if (!motif || motif.emotionalAssociations.length === 0) {
      return null;
    }

    // 返回最常见的情感关联
    const dominant = motif.emotionalAssociations.reduce((max, assoc) =>
      assoc.count > max.count ? assoc : max
    );

    return {
      emotion: dominant.emotion,
      valence: dominant.valence,
    };
  }

  /**
   * 扫描文本中的母题
   */
  scanMotifs(text: string): string[] {
    const found: string[] = [];
    const terms = this.extractTermsFromText(text);
    const termSet = new Set(terms);

    for (const term of termSet) {
      if (this.index.motifs[term]) {
        found.push(term);
      }
    }

    return found;
  }

  getIndex(): DynamicMotifIndex {
    return DynamicMotifIndexSchema.parse(this.index);
  }

  loadIndex(index: DynamicMotifIndex): void {
    this.index = DynamicMotifIndexSchema.parse(index);
  }

  clear(): void {
    this.index = DynamicMotifIndexSchema.parse({ motifs: {} });
  }
}

export function createDynamicMotifExtractor(
  initialIndex?: DynamicMotifIndex,
  config?: Partial<MotifExtractionConfig>
): DynamicMotifExtractor {
  return new DynamicMotifExtractor(initialIndex, config);
}
