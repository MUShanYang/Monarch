import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 知识追踪器
 *
 * 追踪每个角色在每个章节知道什么、不知道什么
 * 防止 AI 让角色说出他们不应该知道的信息
 */

export const KnowledgeEntrySchema = z.object({
  fact: z.string().min(1),
  learnedInChapter: z.number().int().min(0),
  source: z.string().optional(), // 从哪里学到的（对话、观察、推理）
  confidence: z.enum(["confirmed", "suspected", "unknown"]).default("confirmed"),
});
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const CharacterKnowledgeStateSchema = z.object({
  characterId: z.string().min(1),
  characterName: z.string().min(1),
  knows: z.array(KnowledgeEntrySchema).default([]),
  suspects: z.array(KnowledgeEntrySchema).default([]),
  explicitlyDoesNotKnow: z.array(z.string()).default([]), // 明确标记为不知道的事实
  lastUpdatedChapter: z.number().int().min(0).default(0),
});
export type CharacterKnowledgeState = z.infer<typeof CharacterKnowledgeStateSchema>;

export const KnowledgeViolationSchema = z.object({
  characterId: z.string().min(1),
  characterName: z.string().min(1),
  violatedFact: z.string().min(1),
  evidence: z.string().min(1), // 违规的具体文本
  chapterNumber: z.number().int().min(1),
  beatIndex: z.number().int().min(0),
  severity: z.enum(["minor", "major", "critical"]).default("major"),
  suggestion: z.string().optional(), // 修复建议
});
export type KnowledgeViolation = z.infer<typeof KnowledgeViolationSchema>;

export const KnowledgeValidationResultSchema = z.object({
  isValid: z.boolean(),
  violations: z.array(KnowledgeViolationSchema).default([]),
  warnings: z.array(z.string()).default([]),
});
export type KnowledgeValidationResult = z.infer<typeof KnowledgeValidationResultSchema>;

export class KnowledgeTracker {
  private knowledgeStates: Map<string, CharacterKnowledgeState> = new Map();
  private bookDir: string;

  constructor(bookDir: string) {
    this.bookDir = bookDir;
  }

  /**
   * 从 character_knowledge.md 加载知识状态
   */
  async load(): Promise<void> {
    const path = join(this.bookDir, "story", "character_knowledge.md");

    try {
      const content = await readFile(path, "utf-8");
      this.parseKnowledgeFile(content);
    } catch (error) {
      console.warn("[knowledge-tracker] 无法加载 character_knowledge.md，使用空状态");
    }
  }

  /**
   * 保存知识状态到 character_knowledge.md
   */
  async save(): Promise<void> {
    const path = join(this.bookDir, "story", "character_knowledge.md");
    const content = this.generateKnowledgeFile();
    await writeFile(path, content, "utf-8");
  }

  /**
   * 添加角色知识
   */
  addKnowledge(
    characterId: string,
    characterName: string,
    fact: string,
    chapterNumber: number,
    source?: string,
    confidence: "confirmed" | "suspected" = "confirmed"
  ): void {
    let state = this.knowledgeStates.get(characterId);

    if (!state) {
      state = {
        characterId,
        characterName,
        knows: [],
        suspects: [],
        explicitlyDoesNotKnow: [],
        lastUpdatedChapter: chapterNumber,
      };
      this.knowledgeStates.set(characterId, state);
    }

    const entry: KnowledgeEntry = {
      fact,
      learnedInChapter: chapterNumber,
      source,
      confidence,
    };

    if (confidence === "confirmed") {
      // 检查是否已存在
      const exists = state.knows.some(k => this.isSameFact(k.fact, fact));
      if (!exists) {
        state.knows.push(entry);
      }

      // 从 suspects 中移除
      state.suspects = state.suspects.filter(s => !this.isSameFact(s.fact, fact));
    } else if (confidence === "suspected") {
      const exists = state.suspects.some(s => this.isSameFact(s.fact, fact));
      if (!exists && !state.knows.some(k => this.isSameFact(k.fact, fact))) {
        state.suspects.push(entry);
      }
    }

    state.lastUpdatedChapter = chapterNumber;
  }

  /**
   * 标记角色明确不知道某事
   */
  markAsUnknown(characterId: string, characterName: string, fact: string): void {
    let state = this.knowledgeStates.get(characterId);

    if (!state) {
      state = {
        characterId,
        characterName,
        knows: [],
        suspects: [],
        explicitlyDoesNotKnow: [],
        lastUpdatedChapter: 0,
      };
      this.knowledgeStates.set(characterId, state);
    }

    if (!state.explicitlyDoesNotKnow.includes(fact)) {
      state.explicitlyDoesNotKnow.push(fact);
    }
  }

  /**
   * 验证文本是否违反角色知识边界
   */
  validateText(
    text: string,
    characterId: string,
    chapterNumber: number,
    beatIndex: number = 0
  ): KnowledgeValidationResult {
    const state = this.knowledgeStates.get(characterId);

    if (!state) {
      return {
        isValid: true,
        violations: [],
        warnings: ["角色知识状态未初始化"],
      };
    }

    const violations: KnowledgeViolation[] = [];
    const warnings: string[] = [];

    // 检查是否提及了明确不知道的事实
    for (const unknownFact of state.explicitlyDoesNotKnow) {
      if (this.textMentionsFact(text, unknownFact)) {
        violations.push({
          characterId: state.characterId,
          characterName: state.characterName,
          violatedFact: unknownFact,
          evidence: this.extractEvidence(text, unknownFact),
          chapterNumber,
          beatIndex,
          severity: "critical",
          suggestion: `${state.characterName} 不应该知道"${unknownFact}"，请移除相关内容或改为推测语气`,
        });
      }
    }

    // 检查是否将怀疑当作确定事实
    for (const suspectedEntry of state.suspects) {
      if (this.textTreatsAsConfirmed(text, suspectedEntry.fact)) {
        violations.push({
          characterId: state.characterId,
          characterName: state.characterName,
          violatedFact: suspectedEntry.fact,
          evidence: this.extractEvidence(text, suspectedEntry.fact),
          chapterNumber,
          beatIndex,
          severity: "major",
          suggestion: `${state.characterName} 只是怀疑"${suspectedEntry.fact}"，不应该用确定语气，建议使用"也许"、"可能"等词`,
        });
      }
    }

    // 检查是否提及了其他角色的私密知识
    for (const [otherId, otherState] of this.knowledgeStates.entries()) {
      if (otherId === characterId) continue;

      for (const knownEntry of otherState.knows) {
        // 检查是否是私密信息（标记为 private）
        if (knownEntry.source?.includes("private") || knownEntry.source?.includes("secret")) {
          if (this.textMentionsFact(text, knownEntry.fact)) {
            // 检查当前角色是否也知道
            const currentKnows = state.knows.some(k => this.isSameFact(k.fact, knownEntry.fact));
            if (!currentKnows) {
              warnings.push(
                `${state.characterName} 提及了 ${otherState.characterName} 的私密信息"${knownEntry.fact}"，请确认是否合理`
              );
            }
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * 获取角色当前知识状态
   */
  getKnowledgeState(characterId: string): CharacterKnowledgeState | null {
    return this.knowledgeStates.get(characterId) ?? null;
  }

  /**
   * 获取所有角色的知识状态
   */
  getAllKnowledgeStates(): CharacterKnowledgeState[] {
    return Array.from(this.knowledgeStates.values());
  }

  /**
   * 生成知识差异报告（用于调试）
   */
  generateKnowledgeDiffReport(characterIds: string[]): string {
    const lines: string[] = ["# 角色知识差异报告\n"];

    for (const characterId of characterIds) {
      const state = this.knowledgeStates.get(characterId);
      if (!state) continue;

      lines.push(`## ${state.characterName} (${characterId})`);
      lines.push(`\n**确定知道** (${state.knows.length} 项):`);
      for (const entry of state.knows.slice(0, 10)) {
        lines.push(`- ${entry.fact} (第 ${entry.learnedInChapter} 章)`);
      }

      lines.push(`\n**怀疑** (${state.suspects.length} 项):`);
      for (const entry of state.suspects.slice(0, 5)) {
        lines.push(`- ${entry.fact} (第 ${entry.learnedInChapter} 章)`);
      }

      lines.push(`\n**明确不知道** (${state.explicitlyDoesNotKnow.length} 项):`);
      for (const fact of state.explicitlyDoesNotKnow.slice(0, 5)) {
        lines.push(`- ${fact}`);
      }

      lines.push("\n");
    }

    return lines.join("\n");
  }

  // ========== 私有方法 ==========

  private parseKnowledgeFile(content: string): void {
    const sections = content.split(/^## /m).filter(s => s.trim());

    for (const section of sections) {
      const lines = section.split("\n");
      const header = lines[0]?.trim();

      if (!header) continue;

      // 解析角色名和 ID
      const match = header.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (!match) continue;

      const characterName = match[1]!.trim();
      const characterId = match[2]!.trim();

      const state: CharacterKnowledgeState = {
        characterId,
        characterName,
        knows: [],
        suspects: [],
        explicitlyDoesNotKnow: [],
        lastUpdatedChapter: 0,
      };

      let currentSection: "knows" | "suspects" | "unknown" | null = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!.trim();

        if (line.startsWith("**确定知道**") || line.startsWith("**Knows**")) {
          currentSection = "knows";
        } else if (line.startsWith("**怀疑**") || line.startsWith("**Suspects**")) {
          currentSection = "suspects";
        } else if (line.startsWith("**明确不知道**") || line.startsWith("**Does Not Know**")) {
          currentSection = "unknown";
        } else if (line.startsWith("- ")) {
          const fact = line.substring(2).trim();
          const chapterMatch = fact.match(/\(第\s*(\d+)\s*章\)/);
          const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]!, 10) : 0;
          const cleanFact = fact.replace(/\s*\(第\s*\d+\s*章\)/, "").trim();

          if (currentSection === "knows") {
            state.knows.push({
              fact: cleanFact,
              learnedInChapter: chapterNumber,
              confidence: "confirmed",
            });
          } else if (currentSection === "suspects") {
            state.suspects.push({
              fact: cleanFact,
              learnedInChapter: chapterNumber,
              confidence: "suspected",
            });
          } else if (currentSection === "unknown") {
            state.explicitlyDoesNotKnow.push(cleanFact);
          }
        }
      }

      this.knowledgeStates.set(characterId, state);
    }
  }

  private generateKnowledgeFile(): string {
    const lines: string[] = ["# 角色知识追踪\n"];
    lines.push("此文件追踪每个角色在故事中知道什么、不知道什么。");
    lines.push("用于防止 AI 让角色说出他们不应该知道的信息。\n");

    for (const state of this.knowledgeStates.values()) {
      lines.push(`## ${state.characterName} (${state.characterId})\n`);

      lines.push(`**确定知道** (${state.knows.length} 项):`);
      for (const entry of state.knows) {
        lines.push(`- ${entry.fact} (第 ${entry.learnedInChapter} 章)`);
      }

      lines.push(`\n**怀疑** (${state.suspects.length} 项):`);
      for (const entry of state.suspects) {
        lines.push(`- ${entry.fact} (第 ${entry.learnedInChapter} 章)`);
      }

      lines.push(`\n**明确不知道** (${state.explicitlyDoesNotKnow.length} 项):`);
      for (const fact of state.explicitlyDoesNotKnow) {
        lines.push(`- ${fact}`);
      }

      lines.push("\n");
    }

    return lines.join("\n");
  }

  private isSameFact(fact1: string, fact2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").trim();
    return normalize(fact1) === normalize(fact2);
  }

  private textMentionsFact(text: string, fact: string): boolean {
    const textLower = text.toLowerCase();
    const factLower = fact.toLowerCase();

    // 直接包含
    if (textLower.includes(factLower)) {
      return true;
    }

    // 检查关键词
    const keywords = factLower.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length >= 2) {
      const matchCount = keywords.filter(kw => textLower.includes(kw)).length;
      return matchCount >= Math.ceil(keywords.length * 0.7);
    }

    return false;
  }

  private textTreatsAsConfirmed(text: string, fact: string): boolean {
    if (!this.textMentionsFact(text, fact)) {
      return false;
    }

    // 检查是否使用了确定性词汇
    const certaintyWords = [
      "知道", "确定", "肯定", "一定", "必然", "显然", "明显",
      "know", "knew", "certain", "sure", "definitely", "obviously", "clearly"
    ];

    const textLower = text.toLowerCase();
    return certaintyWords.some(word => textLower.includes(word));
  }

  private extractEvidence(text: string, fact: string): string {
    const sentences = text.split(/[。！？.!?]/);

    for (const sentence of sentences) {
      if (this.textMentionsFact(sentence, fact)) {
        return sentence.trim().substring(0, 100);
      }
    }

    return text.substring(0, 100);
  }
}

export function createKnowledgeTracker(bookDir: string): KnowledgeTracker {
  return new KnowledgeTracker(bookDir);
}
