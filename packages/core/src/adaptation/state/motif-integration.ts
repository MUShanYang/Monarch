import { MotifIndexer } from "./motif-indexer.js";
import { DynamicMotifExtractor, type DynamicMotifIndex } from "./dynamic-motif-extractor.js";
import type { MotifIndex, MotifEcho } from "./motif-types.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 混合母题系统
 *
 * 结合硬编码的经典母题（用于通用文学意象）和动态提取的故事特定母题
 *
 * 使用策略：
 * 1. 初始化时从 story_bible.md 提取核心意象
 * 2. 每章生成后更新动态母题索引
 * 3. 查询时优先使用动态母题，回退到经典母题
 */
export class HybridMotifSystem {
  private staticIndexer: MotifIndexer;
  private dynamicExtractor: DynamicMotifExtractor;
  private bookDir: string;

  constructor(bookDir: string) {
    this.bookDir = bookDir;
    this.staticIndexer = new MotifIndexer();
    this.dynamicExtractor = new DynamicMotifExtractor();
  }

  /**
   * 初始化：从 story_bible.md 提取核心意象
   */
  async initialize(): Promise<void> {
    const storyBiblePath = join(this.bookDir, "story", "story_bible.md");

    try {
      const storyBible = await readFile(storyBiblePath, "utf-8");
      this.dynamicExtractor.extractFromStoryBible(storyBible);
      console.log("[motif] 从 story_bible.md 提取核心意象完成");
    } catch (error) {
      console.warn("[motif] 无法读取 story_bible.md，跳过初始化");
    }

    // 加载已保存的索引
    await this.loadIndices();
  }

  /**
   * 处理新生成的章节
   */
  async processChapter(
    chapterNumber: number,
    chapterContent: string,
    emotionalContext?: { emotion: string; valence: number }
  ): Promise<void> {
    // 1. 动态提取母题
    this.dynamicExtractor.extractFromChapter(chapterNumber, chapterContent, emotionalContext);

    // 2. 扫描并更新静态母题（保持向后兼容）
    const staticMotifs = this.staticIndexer.scanMotifs(chapterContent);
    for (const motif of staticMotifs) {
      this.staticIndexer.updateMotifHistory(
        motif,
        chapterNumber,
        `chapter-${chapterNumber}`,
        {
          primary: emotionalContext?.emotion ?? "neutral",
          valence: emotionalContext?.valence ?? 0
        }
      );
    }

    // 3. 保存索引
    await this.saveIndices();
  }

  /**
   * 扫描文本中的母题（优先动态，回退静态）
   */
  scanMotifs(text: string): string[] {
    const dynamicMotifs = this.dynamicExtractor.scanMotifs(text);

    if (dynamicMotifs.length > 0) {
      return dynamicMotifs;
    }

    // 回退到静态母题
    return this.staticIndexer.scanMotifs(text);
  }

  /**
   * 获取母题回响（优先动态）
   */
  getMotifEcho(motif: string): MotifEcho | null {
    // 先尝试从动态提取器获取
    const tendency = this.dynamicExtractor.getMotifEmotionalTendency(motif);
    if (tendency) {
      const dynamicIndex = this.dynamicExtractor.getIndex();
      const motifEntry = dynamicIndex.motifs[motif];

      if (motifEntry) {
        return {
          object: motif,
          priorEmotion: tendency.emotion,
          directive: this.inferDirective(motifEntry.emotionalAssociations),
          distance: motifEntry.frequency,
        };
      }
    }

    // 回退到静态索引
    return this.staticIndexer.getMotifEcho(motif);
  }

  /**
   * 从情感关联推断指令
   */
  private inferDirective(
    emotionalAssociations: Array<{ emotion: string; valence: number; count: number }>
  ): "REINFORCE" | "CONTRAST" | "TRANSMUTE" | "DORMANT" {
    if (emotionalAssociations.length < 2) {
      return "DORMANT";
    }

    const recent = emotionalAssociations.slice(-3);
    const valences = recent.map(a => a.valence);

    // 检查是否一致强化
    const allPositive = valences.every(v => v > 0);
    const allNegative = valences.every(v => v < 0);
    if (allPositive || allNegative) {
      return "REINFORCE";
    }

    // 检查是否对比
    const hasPositive = valences.some(v => v > 0);
    const hasNegative = valences.some(v => v < 0);
    if (hasPositive && hasNegative) {
      return "CONTRAST";
    }

    return "TRANSMUTE";
  }

  /**
   * 获取最显著的母题（用于规划）
   */
  getTopMotifs(limit: number = 10): string[] {
    const topMotifs = this.dynamicExtractor.getTopMotifs(limit);
    return topMotifs.map(m => m.term);
  }

  /**
   * 获取与特定情感关联的母题
   */
  getMotifsByEmotion(emotion: string): string[] {
    const motifs = this.dynamicExtractor.getMotifsByEmotion(emotion);
    return motifs.map(m => m.term);
  }

  /**
   * 生成母题使用报告
   */
  generateReport(): {
    totalMotifs: number;
    topMotifs: Array<{ term: string; frequency: number; significance: number }>;
    emotionalDistribution: Record<string, number>;
  } {
    const dynamicIndex = this.dynamicExtractor.getIndex();
    const allMotifs = Object.values(dynamicIndex.motifs);

    const topMotifs = allMotifs
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 20)
      .map(m => ({
        term: m.term,
        frequency: m.frequency,
        significance: m.significance,
      }));

    const emotionalDistribution: Record<string, number> = {};
    for (const motif of allMotifs) {
      for (const assoc of motif.emotionalAssociations) {
        emotionalDistribution[assoc.emotion] = (emotionalDistribution[assoc.emotion] || 0) + assoc.count;
      }
    }

    return {
      totalMotifs: allMotifs.length,
      topMotifs,
      emotionalDistribution,
    };
  }

  /**
   * 保存索引到磁盘
   */
  private async saveIndices(): Promise<void> {
    const dbDir = join(this.bookDir, "story", "db");

    try {
      // 保存静态索引
      const staticIndex = this.staticIndexer.getIndex();
      await writeFile(
        join(dbDir, "motif_index.json"),
        JSON.stringify(staticIndex, null, 2),
        "utf-8"
      );

      // 保存动态索引
      const dynamicIndex = this.dynamicExtractor.getIndex();
      await writeFile(
        join(dbDir, "dynamic_motif_index.json"),
        JSON.stringify(dynamicIndex, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.warn("[motif] 保存索引失败:", error);
    }
  }

  /**
   * 从磁盘加载索引
   */
  private async loadIndices(): Promise<void> {
    const dbDir = join(this.bookDir, "story", "db");

    try {
      // 加载静态索引
      const staticIndexRaw = await readFile(join(dbDir, "motif_index.json"), "utf-8");
      const staticIndex = JSON.parse(staticIndexRaw) as MotifIndex;
      this.staticIndexer.loadIndex(staticIndex);
    } catch {
      // 索引不存在，使用默认
    }

    try {
      // 加载动态索引
      const dynamicIndexRaw = await readFile(join(dbDir, "dynamic_motif_index.json"), "utf-8");
      const dynamicIndex = JSON.parse(dynamicIndexRaw) as DynamicMotifIndex;
      this.dynamicExtractor.loadIndex(dynamicIndex);
    } catch {
      // 索引不存在，使用默认
    }
  }

  /**
   * 获取静态索引器（向后兼容）
   */
  getStaticIndexer(): MotifIndexer {
    return this.staticIndexer;
  }

  /**
   * 获取动态提取器
   */
  getDynamicExtractor(): DynamicMotifExtractor {
    return this.dynamicExtractor;
  }
}

export function createHybridMotifSystem(bookDir: string): HybridMotifSystem {
  return new HybridMotifSystem(bookDir);
}
