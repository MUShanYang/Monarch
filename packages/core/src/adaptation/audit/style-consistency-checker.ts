import { z } from "zod";

/**
 * 风格一致性检查器
 *
 * 检查新章节是否偏离已建立的写作风格
 * 分析句长、词汇选择、节奏模式等维度
 */

export const StyleProfileSchema = z.object({
  avgSentenceLength: z.number().min(0),
  sentenceLengthVariance: z.number().min(0),
  avgParagraphLength: z.number().min(0),
  lexicalDiversity: z.number().min(0).max(1),
  commonWords: z.array(z.string()).default([]),
  commonPhrases: z.array(z.string()).default([]),
  punctuationRatio: z.record(z.string(), z.number()).default({}),
  chapterCount: z.number().int().min(1),
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const StyleConsistencyResultSchema = z.object({
  isConsistent: z.boolean(),
  overallScore: z.number().min(0).max(100),
  deviations: z.array(z.object({
    dimension: z.string(),
    expected: z.number(),
    actual: z.number(),
    deviation: z.number(),
    severity: z.enum(["minor", "moderate", "major"]),
    message: z.string(),
  })).default([]),
  suggestions: z.array(z.string()).default([]),
});

export type StyleConsistencyResult = z.infer<typeof StyleConsistencyResultSchema>;

export interface StyleConsistencyConfig {
  sentenceLengthTolerance: number;
  lexicalDiversityTolerance: number;
  minorDeviationThreshold: number;
  moderateDeviationThreshold: number;
  majorDeviationThreshold: number;
}

const DEFAULT_CONFIG: StyleConsistencyConfig = {
  sentenceLengthTolerance: 0.2,
  lexicalDiversityTolerance: 0.15,
  minorDeviationThreshold: 0.15,
  moderateDeviationThreshold: 0.3,
  majorDeviationThreshold: 0.5,
};

export class StyleConsistencyChecker {
  private profile: StyleProfile | null = null;
  private config: StyleConsistencyConfig;

  constructor(config?: Partial<StyleConsistencyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 从已有章节建立风格档案
   */
  buildProfile(chapters: string[]): void {
    if (chapters.length === 0) {
      throw new Error("需要至少一章来建立风格档案");
    }

    const sentenceLengths: number[] = [];
    const paragraphLengths: number[] = [];
    const allWords: string[] = [];
    const wordFrequency = new Map<string, number>();
    const phraseFrequency = new Map<string, number>();
    const punctuationCounts: Record<string, number> = {};

    for (const chapter of chapters) {
      const analysis = this.analyzeText(chapter);

      sentenceLengths.push(...analysis.sentenceLengths);
      paragraphLengths.push(...analysis.paragraphLengths);
      allWords.push(...analysis.words);

      for (const word of analysis.words) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }

      for (const phrase of analysis.phrases) {
        phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
      }

      for (const [punct, count] of Object.entries(analysis.punctuationCounts)) {
        punctuationCounts[punct] = (punctuationCounts[punct] || 0) + count;
      }
    }

    const avgSentenceLength = sentenceLengths.reduce((sum, len) => sum + len, 0) / sentenceLengths.length;
    const sentenceLengthVariance = this.calculateVariance(sentenceLengths, avgSentenceLength);
    const avgParagraphLength = paragraphLengths.reduce((sum, len) => sum + len, 0) / paragraphLengths.length;
    const lexicalDiversity = this.calculateLexicalDiversity(allWords);

    const commonWords = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([word]) => word);

    const commonPhrases = Array.from(phraseFrequency.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([phrase]) => phrase);

    const totalPunctuation = Object.values(punctuationCounts).reduce((sum, count) => sum + count, 0);
    const punctuationRatio: Record<string, number> = {};
    for (const [punct, count] of Object.entries(punctuationCounts)) {
      punctuationRatio[punct] = count / totalPunctuation;
    }

    this.profile = StyleProfileSchema.parse({
      avgSentenceLength,
      sentenceLengthVariance,
      avgParagraphLength,
      lexicalDiversity,
      commonWords,
      commonPhrases,
      punctuationRatio,
      chapterCount: chapters.length,
    });
  }

  /**
   * 检查新章节的风格一致性
   */
  checkConsistency(newChapter: string): StyleConsistencyResult {
    if (!this.profile) {
      throw new Error("需要先建立风格档案");
    }

    const analysis = this.analyzeText(newChapter);
    const deviations: StyleConsistencyResult["deviations"] = [];
    const suggestions: string[] = [];

    // 1. 句长检查
    const avgSentenceLength = analysis.sentenceLengths.reduce((sum, len) => sum + len, 0) / analysis.sentenceLengths.length;
    const sentenceLengthDeviation = Math.abs(avgSentenceLength - this.profile.avgSentenceLength) / this.profile.avgSentenceLength;

    if (sentenceLengthDeviation > this.config.sentenceLengthTolerance) {
      const severity = this.determineSeverity(sentenceLengthDeviation);
      deviations.push({
        dimension: "句长",
        expected: this.profile.avgSentenceLength,
        actual: avgSentenceLength,
        deviation: sentenceLengthDeviation,
        severity,
        message: `平均句长 ${avgSentenceLength.toFixed(1)} 字，预期 ${this.profile.avgSentenceLength.toFixed(1)} 字`,
      });

      if (avgSentenceLength > this.profile.avgSentenceLength) {
        suggestions.push("句子偏长，建议拆分复杂句");
      } else {
        suggestions.push("句子偏短，建议适当增加句子复杂度");
      }
    }

    // 2. 段落长度检查
    const avgParagraphLength = analysis.paragraphLengths.reduce((sum, len) => sum + len, 0) / analysis.paragraphLengths.length;
    const paragraphDeviation = Math.abs(avgParagraphLength - this.profile.avgParagraphLength) / this.profile.avgParagraphLength;

    if (paragraphDeviation > 0.3) {
      const severity = this.determineSeverity(paragraphDeviation);
      deviations.push({
        dimension: "段落长度",
        expected: this.profile.avgParagraphLength,
        actual: avgParagraphLength,
        deviation: paragraphDeviation,
        severity,
        message: `平均段落 ${avgParagraphLength.toFixed(1)} 字，预期 ${this.profile.avgParagraphLength.toFixed(1)} 字`,
      });
    }

    // 3. 词汇多样性检查
    const lexicalDiversity = this.calculateLexicalDiversity(analysis.words);
    const diversityDeviation = Math.abs(lexicalDiversity - this.profile.lexicalDiversity) / this.profile.lexicalDiversity;

    if (diversityDeviation > this.config.lexicalDiversityTolerance) {
      const severity = this.determineSeverity(diversityDeviation);
      deviations.push({
        dimension: "词汇多样性",
        expected: this.profile.lexicalDiversity,
        actual: lexicalDiversity,
        deviation: diversityDeviation,
        severity,
        message: `词汇多样性 ${(lexicalDiversity * 100).toFixed(1)}%，预期 ${(this.profile.lexicalDiversity * 100).toFixed(1)}%`,
      });

      if (lexicalDiversity < this.profile.lexicalDiversity) {
        suggestions.push("词汇重复度较高，建议使用更多样的表达");
      }
    }

    // 4. 标点符号使用检查
    const totalPunctuation = Object.values(analysis.punctuationCounts).reduce((sum, count) => sum + count, 0);
    const newPunctuationRatio: Record<string, number> = {};
    for (const [punct, count] of Object.entries(analysis.punctuationCounts)) {
      newPunctuationRatio[punct] = count / totalPunctuation;
    }

    for (const [punct, expectedRatio] of Object.entries(this.profile.punctuationRatio)) {
      const actualRatio = newPunctuationRatio[punct] || 0;
      const deviation = Math.abs(actualRatio - expectedRatio) / Math.max(expectedRatio, 0.01);

      if (deviation > 0.5 && expectedRatio > 0.05) {
        const severity = this.determineSeverity(deviation);
        deviations.push({
          dimension: `标点符号"${punct}"`,
          expected: expectedRatio,
          actual: actualRatio,
          deviation,
          severity,
          message: `"${punct}"使用比例 ${(actualRatio * 100).toFixed(1)}%，预期 ${(expectedRatio * 100).toFixed(1)}%`,
        });
      }
    }

    // 计算总体得分
    const overallScore = this.calculateOverallScore(deviations);
    const isConsistent = overallScore >= 70;

    return StyleConsistencyResultSchema.parse({
      isConsistent,
      overallScore,
      deviations,
      suggestions,
    });
  }

  /**
   * 分析文本
   */
  private analyzeText(text: string): {
    sentenceLengths: number[];
    paragraphLengths: number[];
    words: string[];
    phrases: string[];
    punctuationCounts: Record<string, number>;
  } {
    const sentences = text.split(/[。！？.!?]/);
    const paragraphs = text.split(/\n\n+/);

    const sentenceLengths = sentences
      .filter(s => s.trim().length > 0)
      .map(s => s.trim().length);

    const paragraphLengths = paragraphs
      .filter(p => p.trim().length > 0)
      .map(p => p.trim().length);

    // 提取词汇（中文按字，英文按单词）
    const words: string[] = [];
    const chineseChars = text.match(/[一-鿿]/g) || [];
    const englishWords = text.match(/\b[a-zA-Z]{2,}\b/g) || [];

    if (chineseChars.length > englishWords.length) {
      // 中文文本：提取 2-4 字词组
      const matches = text.matchAll(/[一-鿿]{2,4}/g);
      for (const match of matches) {
        words.push(match[0]);
      }
    } else {
      // 英文文本
      words.push(...englishWords.map(w => w.toLowerCase()));
    }

    // 提取短语（3-5 字/词）
    const phrases: string[] = [];
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join("");
      phrases.push(phrase);
    }

    // 统计标点符号
    const punctuationCounts: Record<string, number> = {};
    const punctuations = [
      "。", "，", "！", "？", "；", "：",
      "“", "”", // 中文引号
      "、", ".", ",", "!", "?", ";", ":", "\""
    ];

    for (const punct of punctuations) {
      const count = (text.match(new RegExp(`\\${punct}`, "g")) || []).length;
      if (count > 0) {
        punctuationCounts[punct] = count;
      }
    }

    return {
      sentenceLengths,
      paragraphLengths,
      words,
      phrases,
      punctuationCounts,
    };
  }

  /**
   * 计算词汇多样性（Type-Token Ratio）
   */
  private calculateLexicalDiversity(words: string[]): number {
    if (words.length === 0) return 0;
    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length;
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  /**
   * 确定偏差严重程度
   */
  private determineSeverity(deviation: number): "minor" | "moderate" | "major" {
    if (deviation >= this.config.majorDeviationThreshold) {
      return "major";
    } else if (deviation >= this.config.moderateDeviationThreshold) {
      return "moderate";
    } else {
      return "minor";
    }
  }

  /**
   * 计算总体得分
   */
  private calculateOverallScore(deviations: StyleConsistencyResult["deviations"]): number {
    if (deviations.length === 0) return 100;

    let totalPenalty = 0;
    for (const deviation of deviations) {
      if (deviation.severity === "major") {
        totalPenalty += 20;
      } else if (deviation.severity === "moderate") {
        totalPenalty += 10;
      } else {
        totalPenalty += 5;
      }
    }

    return Math.max(0, 100 - totalPenalty);
  }

  /**
   * 获取风格档案
   */
  getProfile(): StyleProfile | null {
    return this.profile;
  }

  /**
   * 加载风格档案
   */
  loadProfile(profile: StyleProfile): void {
    this.profile = StyleProfileSchema.parse(profile);
  }
}

export function createStyleConsistencyChecker(
  config?: Partial<StyleConsistencyConfig>
): StyleConsistencyChecker {
  return new StyleConsistencyChecker(config);
}
