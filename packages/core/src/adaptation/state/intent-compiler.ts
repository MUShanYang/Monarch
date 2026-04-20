import { z } from "zod";
import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuleStack, RuleStackSections } from "../../models/input-governance.js";

export const HardBanSchema = z.object({
  pattern: z.string().min(1),
  reason: z.string().default(""),
  scope: z.enum(["prose", "dialogue", "narration", "all"]).default("all"),
});
export type HardBan = z.infer<typeof HardBanSchema>;

export const StatCapSchema = z.object({
  stat: z.string().min(1),
  maxValue: z.number().int().min(0),
  minValue: z.number().int().min(0).default(0),
  enforceOn: z.array(z.string()).default([]),
});
export type StatCap = z.infer<typeof StatCapSchema>;

export const DnaWeightSchema = z.object({
  characterId: z.string().optional(),
  locationId: z.string().optional(),
  itemId: z.string().optional(),
  hookId: z.string().optional(),
  weight: z.number().min(0).max(10),
  reason: z.string().default(""),
  forceInclude: z.boolean().default(false),
});
export type DnaWeight = z.infer<typeof DnaWeightSchema>;

export const FocusMultiplierSchema = z.object({
  category: z.string().min(1),
  multiplier: z.number().min(0).max(5),
  description: z.string().default(""),
});
export type FocusMultiplier = z.infer<typeof FocusMultiplierSchema>;

export const TimelineWeightSchema = z.object({
  intentKeyword: z.string().min(1),
  branchBonus: z.number().default(0),
  branchPenalty: z.number().default(0),
  description: z.string().default(""),
});
export type TimelineWeight = z.infer<typeof TimelineWeightSchema>;

export const SystemWeightsSchema = z.object({
  dnaWeights: z.array(DnaWeightSchema).default([]),
  focusMultipliers: z.array(FocusMultiplierSchema).default([]),
  timelineWeights: z.array(TimelineWeightSchema).default([]),
  tensionBias: z.number().min(-5).max(5).default(0),
  pacingBias: z.enum(["slower", "normal", "faster"]).default("normal"),
  interiorityBias: z.number().min(0).max(10).default(5),
});
export type SystemWeights = z.infer<typeof SystemWeightsSchema>;

export const CompiledRulesSchema = z.object({
  hardBans: z.array(HardBanSchema).default([]),
  statCaps: z.array(StatCapSchema).default([]),
  softGuidelines: z.array(z.string()).default([]),
  auditDimensions: z.array(z.string()).default([]),
  prohibitedChapterTypes: z.array(z.string()).default([]),
  requiredElements: z.array(z.string()).default([]),
});
export type CompiledRules = z.infer<typeof CompiledRulesSchema>;

export const IntentCompilerOutputSchema = z.object({
  ruleStack: z.array(z.string()).default([]),
  systemWeights: SystemWeightsSchema,
  compiledRules: CompiledRulesSchema,
  sourceHash: z.string(),
  styleGuide: z.string().optional(),
});
export type IntentCompilerOutput = z.infer<typeof IntentCompilerOutputSchema>;

const BAN_PATTERNS = {
  zh: [
    /禁止[：:]\s*([^\n]+)/g,
    /不得[：:]\s*([^\n]+)/g,
    /严禁[：:]\s*([^\n]+)/g,
    /不可[：:]\s*([^\n]+)/g,
    /不要[：:]\s*([^\n]+)/g,
    /禁止使用[：:]\s*([^\n]+)/g,
  ],
  en: [
    /BANN?ED?[：:]\s*([^\n]+)/gi,
    /DO NOT[：:]\s*([^\n]+)/gi,
    /FORBIDDEN[：:]\s*([^\n]+)/gi,
    /PROHIBITED[：:]\s*([^\n]+)/gi,
    /NEVER[：:]\s*([^\n]+)/gi,
    /MUST NOT[：:]\s*([^\n]+)/gi,
    /AVOID[：:]\s*([^\n]+)/gi,
  ],
};

const CAP_PATTERNS = {
  zh: [
    /上限[：:]\s*(\d+)/g,
    /最大[：:]\s*(\d+)/g,
    /封顶[：:]\s*(\d+)/g,
  ],
  en: [
    /MAX[：:]\s*(\d+)/gi,
    /CAP[：:]\s*(\d+)/gi,
    /LIMIT[：:]\s*(\d+)/gi,
    /CEILING[：:]\s*(\d+)/gi,
  ],
};

export class IntentCompiler {
  constructor(private readonly storyDir: string) {}

  async compile(): Promise<IntentCompilerOutput> {
    const [authorIntent, currentFocus, bookRules, storyBible, styleGuide, volumeOutline, chapterSummaries, subplotBoard, emotionalArcs, characterMatrix, parentCanon, fanficCanon] = await Promise.all([
      this.readMarkdownFile("author_intent.md"),
      this.readMarkdownFile("current_focus.md"),
      this.readMarkdownFile("book_rules.md"),
      this.readMarkdownFile("story_bible.md"),
      this.readMarkdownFile("style_guide.md"),
      this.readMarkdownFile("volume_outline.md"),
      this.readMarkdownFile("chapter_summaries.md"),
      this.readMarkdownFile("subplot_board.md"),
      this.readMarkdownFile("emotional_arcs.md"),
      this.readMarkdownFile("character_matrix.md"),
      this.readMarkdownFile("parent_canon.md"),
      this.readMarkdownFile("fanfic_canon.md"),
    ]);

    const compiledRules = this.compileRules(bookRules, storyBible, styleGuide);
    const systemWeights = this.compileWeights(authorIntent, currentFocus, volumeOutline, chapterSummaries);
    const ruleStack = this.buildRuleStack(compiledRules, authorIntent, currentFocus, styleGuide);
    const extractedStyleGuide = this.extractStyleGuide(styleGuide, storyBible);

    const sourceHash = this.hashSources([authorIntent, currentFocus, bookRules, storyBible, styleGuide, volumeOutline, chapterSummaries, subplotBoard, emotionalArcs, characterMatrix, parentCanon, fanficCanon]);

    return IntentCompilerOutputSchema.parse({
      ruleStack,
      systemWeights,
      compiledRules,
      sourceHash,
      styleGuide: extractedStyleGuide,
    });
  }

  private extractStyleGuide(styleGuide: string, storyBible: string): string | undefined {
    const styleGuideContent = styleGuide || storyBible;
    if (!styleGuideContent) {
      return undefined;
    }

    // 提取风格指南内容
    const styleSections = [];
    
    // 从 style_guide.md 提取
    const styleMatch = styleGuideContent.match(/(?:风格|style)[：:]([\s\S]*?)(?=\n#|$)/i);
    if (styleMatch && styleMatch[1]) {
      styleSections.push(styleMatch[1].trim());
    }
    
    // 从 story_bible.md 提取
    const bibleStyleMatch = storyBible.match(/(?:风格|style)[：:]([\s\S]*?)(?=\n#|$)/i);
    if (bibleStyleMatch && bibleStyleMatch[1]) {
      styleSections.push(bibleStyleMatch[1].trim());
    }
    
    // 提取古代风格标记
    if (styleGuideContent.includes("古代") || styleGuideContent.includes("古风") || styleGuideContent.includes("ancient")) {
      styleSections.push("使用古代风格的词汇和表达方式，避免现代词汇和口语。语言要典雅、简洁，符合古代文学风格。");
    }
    
    if (styleSections.length > 0) {
      return styleSections.join(" ");
    }
    
    return undefined;
  }

  private async readMarkdownFile(filename: string): Promise<string> {
    try {
      const filepath = join(this.storyDir, filename);
      return await readFile(filepath, "utf-8");
    } catch {
      return "";
    }
  }

  private compileRules(bookRules: string, storyBible: string, styleGuide: string): CompiledRules {
    const hardBans: HardBan[] = [];
    const statCaps: StatCap[] = [];
    const softGuidelines: string[] = [];
    const auditDimensions: string[] = [];
    const prohibitedChapterTypes: string[] = [];
    const requiredElements: string[] = [];

    this.extractHardBans(bookRules, hardBans);
    this.extractHardBans(storyBible, hardBans);
    this.extractHardBans(styleGuide, hardBans);
    this.extractStatCaps(bookRules, statCaps);
    this.extractSoftGuidelines(bookRules, softGuidelines);
    this.extractSoftGuidelines(styleGuide, softGuidelines);
    this.extractAuditDimensions(bookRules, auditDimensions);
    this.extractProhibitedChapterTypes(bookRules, prohibitedChapterTypes);
    this.extractRequiredElements(storyBible, requiredElements);

    const yamlRules = this.parseYamlFrontmatter(bookRules);
    if (yamlRules) {
      if (yamlRules.prohibitions && Array.isArray(yamlRules.prohibitions)) {
        for (const p of yamlRules.prohibitions) {
          hardBans.push({ pattern: String(p), reason: "From book_rules.yaml", scope: "all" });
        }
      }
      if (yamlRules.fatigueWordsOverride && Array.isArray(yamlRules.fatigueWordsOverride)) {
        for (const w of yamlRules.fatigueWordsOverride) {
          hardBans.push({ pattern: String(w), reason: "Fatigue word override", scope: "prose" });
        }
      }
      if (yamlRules.additionalAuditDimensions && Array.isArray(yamlRules.additionalAuditDimensions)) {
        for (const d of yamlRules.additionalAuditDimensions) {
          auditDimensions.push(String(d));
        }
      }
    }

    return CompiledRulesSchema.parse({
      hardBans: this.deduplicateBans(hardBans),
      statCaps,
      softGuidelines,
      auditDimensions,
      prohibitedChapterTypes,
      requiredElements,
    });
  }

  private extractHardBans(content: string, bans: HardBan[]): void {
    for (const patterns of [BAN_PATTERNS.zh, BAN_PATTERNS.en]) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const rawPattern = match[1]?.trim();
          if (rawPattern) {
            const items = this.parseListItems(rawPattern);
            for (const item of items) {
              bans.push({
                pattern: this.cleanPattern(item),
                reason: `Extracted from: ${content.substring(0, 50)}...`,
                scope: "all",
              });
            }
          }
        }
      }
    }

    const listBans = this.extractListSection(content, ["禁止", "Banned", "Forbidden", "Prohibited", "Do Not"]);
    for (const item of listBans) {
      bans.push({
        pattern: this.cleanPattern(item),
        reason: "From list section",
        scope: "all",
      });
    }
  }

  private extractStatCaps(content: string, caps: StatCap[]): void {
    for (const patterns of [CAP_PATTERNS.zh, CAP_PATTERNS.en]) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const value = parseInt(match[1] ?? "0", 10);
          if (value > 0) {
            const contextStart = Math.max(0, match.index - 50);
            const context = content.substring(contextStart, match.index);
            const statMatch = context.match(/([a-zA-Z\u4e00-\u9fa5]+)[\s：:_]*$/);
            const stat = statMatch?.[1]?.trim() ?? "unknown";
            caps.push({ stat, maxValue: value, minValue: 0, enforceOn: [] });
          }
        }
      }
    }
  }

  private extractSoftGuidelines(content: string, guidelines: string[]): void {
    const sections = this.extractSections(content, ["建议", "Guidelines", "Recommendations", "Notes", "注意"]);
    for (const section of sections) {
      const items = this.parseListItems(section);
      guidelines.push(...items);
    }
  }

  private extractAuditDimensions(content: string, dimensions: string[]): void {
    const section = this.extractSection(content, ["审计维度", "Audit Dimensions", "Review Criteria"]);
    if (section) {
      const items = this.parseListItems(section);
      dimensions.push(...items);
    }
  }

  private extractProhibitedChapterTypes(content: string, prohibited: string[]): void {
    const section = this.extractSection(content, ["禁止章节类型", "Prohibited Chapter Types", "Forbidden Chapter Types"]);
    if (section) {
      const items = this.parseListItems(section);
      prohibited.push(...items);
    }
  }

  private extractRequiredElements(content: string, required: string[]): void {
    const section = this.extractSection(content, ["必需元素", "Required Elements", "Must Include"]);
    if (section) {
      const items = this.parseListItems(section);
      required.push(...items);
    }
  }

  private compileWeights(authorIntent: string, currentFocus: string, volumeOutline: string, chapterSummaries: string): SystemWeights {
    const dnaWeights: DnaWeight[] = [];
    const focusMultipliers: FocusMultiplier[] = [];
    const timelineWeights: TimelineWeight[] = [];
    let tensionBias = 0;
    let pacingBias: "slower" | "normal" | "faster" = "normal";
    let interiorityBias = 5;

    const intentKeywords = this.extractKeywords(authorIntent);
    for (const keyword of intentKeywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerKeyword.includes("isolation") || lowerKeyword.includes("孤独")) {
        timelineWeights.push({
          intentKeyword: keyword,
          branchBonus: 5,
          branchPenalty: 0,
          description: "Branches where relationships decay score higher",
        });
      }
      if (lowerKeyword.includes("action") || lowerKeyword.includes("动作")) {
        tensionBias = Math.min(5, tensionBias + 2);
        pacingBias = "faster";
      }
      if (lowerKeyword.includes("introspection") || lowerKeyword.includes("内省")) {
        interiorityBias = Math.min(10, interiorityBias + 3);
        pacingBias = "slower";
      }
    }

    const focusKeywords = this.extractKeywords(currentFocus);
    for (const keyword of focusKeywords) {
      focusMultipliers.push({
        category: keyword,
        multiplier: 2.0,
        description: "From current_focus.md",
      });
    }

    const focusCharacters = this.extractCharacterReferences(currentFocus);
    for (const charId of focusCharacters) {
      dnaWeights.push({
        characterId: charId,
        weight: 8,
        reason: "Referenced in current_focus.md",
        forceInclude: true,
      });
    }

    const focusLocations = this.extractLocationReferences(currentFocus);
    for (const locId of focusLocations) {
      dnaWeights.push({
        locationId: locId,
        weight: 6,
        reason: "Referenced in current_focus.md",
        forceInclude: true,
      });
    }

    const pacingMatch = currentFocus.match(/(?:节奏|pacing)[：:]\s*(快|慢|正常|fast|slow|normal)/i);
    if (pacingMatch) {
      const pacing = pacingMatch[1]?.toLowerCase();
      if (pacing === "快" || pacing === "fast") {
        pacingBias = "faster";
      } else if (pacing === "慢" || pacing === "slow") {
        pacingBias = "slower";
      }
    }

    // Extract character focus from chapter summaries
    const recentChapters = this.extractRecentChapters(chapterSummaries, 3);
    for (const chapter of recentChapters) {
      const chapterCharacters = this.extractCharacterReferences(chapter);
      for (const charId of chapterCharacters) {
        dnaWeights.push({
          characterId: charId,
          weight: 7,
          reason: "Referenced in recent chapters",
          forceInclude: true,
        });
      }
      
      const chapterLocations = this.extractLocationReferences(chapter);
      for (const locId of chapterLocations) {
        dnaWeights.push({
          locationId: locId,
          weight: 5,
          reason: "Referenced in recent chapters",
          forceInclude: true,
        });
      }
    }

    // Extract pacing and tension from volume outline
    if (volumeOutline.includes("高潮") || volumeOutline.includes("climax")) {
      tensionBias = Math.min(5, tensionBias + 3);
      pacingBias = "faster";
    }
    if (volumeOutline.includes("伏笔") || volumeOutline.includes("foreshadowing")) {
      focusMultipliers.push({
        category: "foreshadowing",
        multiplier: 1.5,
        description: "From volume outline",
      });
    }
    if (volumeOutline.includes("情感") || volumeOutline.includes("emotional")) {
      interiorityBias = Math.min(9, interiorityBias + 2);
    }

    return SystemWeightsSchema.parse({
      dnaWeights,
      focusMultipliers,
      timelineWeights,
      tensionBias,
      pacingBias,
      interiorityBias,
    });
  }

  private extractRecentChapters(summaries: string, count: number): string[] {
    const chapters: string[] = [];
    const lines = summaries.split('\n');
    let currentChapter = '';
    
    for (const line of lines) {
      if (line.startsWith('# ') && (line.includes('Chapter') || line.includes('章节'))) {
        if (currentChapter) {
          chapters.push(currentChapter.trim());
        }
        currentChapter = line;
      } else if (currentChapter) {
        currentChapter += ' ' + line;
      }
    }
    
    if (currentChapter) {
      chapters.push(currentChapter.trim());
    }
    
    return chapters.slice(-count);
  }

  private buildRuleStack(
    compiledRules: CompiledRules,
    authorIntent: string,
    currentFocus: string,
    styleGuide: string,
  ): RuleStack {
    const hard: string[] = [];
    const soft: string[] = [];
    const diagnostic: string[] = [];

    for (const ban of compiledRules.hardBans) {
      hard.push(`BANNED: "${ban.pattern}" (${ban.scope})`);
    }
    for (const cap of compiledRules.statCaps) {
      hard.push(`CAP: ${cap.stat} ≤ ${cap.maxValue}`);
    }
    for (const guideline of compiledRules.softGuidelines) {
      soft.push(guideline);
    }
    for (const dim of compiledRules.auditDimensions) {
      diagnostic.push(`AUDIT: ${dim}`);
    }

    if (authorIntent.trim()) {
      const intentSummary = this.extractFirstParagraph(authorIntent);
      if (intentSummary) {
        soft.push(`AUTHOR_INTENT: ${intentSummary}`);
      }
    }

    if (currentFocus.trim()) {
      const focusSummary = this.extractFirstParagraph(currentFocus);
      if (focusSummary) {
        soft.push(`CURRENT_FOCUS: ${focusSummary}`);
      }
    }

    diagnostic.push("ANTI_AI_CHECKS: No repetitive sentence structures");
    diagnostic.push("CONTINUITY_AUDIT: Verify proper noun consistency");
    diagnostic.push("STYLE_REGRESSION: Check for AI-tell words");

    return {
      layers: [
        { id: "L1", name: "hard_facts", precedence: 100, scope: "global" },
        { id: "L2", name: "author_intent", precedence: 80, scope: "book" },
        { id: "L3", name: "current_focus", precedence: 70, scope: "arc" },
        { id: "L4", name: "beat_constraints", precedence: 60, scope: "local" },
      ],
      sections: { hard, soft, diagnostic },
      overrideEdges: [
        { from: "L4", to: "L3", allowed: true, scope: "current_beat" },
        { from: "L4", to: "L2", allowed: false, scope: "current_beat" },
        { from: "L4", to: "L1", allowed: false, scope: "current_beat" },
      ],
      activeOverrides: [],
    };
  }

  private parseYamlFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) return null;
    try {
      return yaml.load(match[1] ?? "") as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private extractSections(content: string, headings: string[]): string[] {
    const results: string[] = [];
    for (const heading of headings) {
      const section = this.extractSection(content, [heading]);
      if (section) {
        results.push(section);
      }
    }
    return results;
  }

  private extractSection(content: string, headings: string[]): string | null {
    for (const heading of headings) {
      const pattern = new RegExp(
        `(?:^|\\n)#{1,3}\\s*${this.escapeRegex(heading)}[\\s\\n]+([\\s\\S]*?)(?=(?:\\n#{1,3}\\s)|$)`,
        "i"
      );
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractListSection(content: string, headings: string[]): string[] {
    const section = this.extractSection(content, headings);
    if (!section) return [];
    return this.parseListItems(section);
  }

  private parseListItems(text: string): string[] {
    const items: string[] = [];
    const lines = text.split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const listMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (listMatch && listMatch[1]) {
        items.push(listMatch[1].trim());
      } else if (trimmed.length > 0 && !trimmed.startsWith("#")) {
        const commaItems = trimmed.split(/[,，]/).map((s) => s.trim()).filter((s) => s.length > 0);
        items.push(...commaItems);
      }
    }
    return items;
  }

  private cleanPattern(raw: string): string {
    return raw
      .replace(/[「」『』""''""]/g, "")
      .replace(/^\s*[-*•]\s*/, "")
      .trim();
  }

  private deduplicateBans(bans: HardBan[]): HardBan[] {
    const seen = new Set<string>();
    const result: HardBan[] = [];
    for (const ban of bans) {
      const key = `${ban.pattern}:${ban.scope}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(ban);
      }
    }
    return result;
  }

  private extractKeywords(content: string): string[] {
    const keywords: string[] = [];
    const keywordMatch = content.match(/(?:关键词|keywords)[：:]\s*([^\n]+)/i);
    if (keywordMatch && keywordMatch[1]) {
      const parts = keywordMatch[1].split(/[,，、]/).map((s) => s.trim()).filter((s) => s.length > 0);
      keywords.push(...parts);
    }
    return keywords;
  }

  private extractCharacterReferences(content: string): string[] {
    const refs: string[] = [];
    
    // 从角色: 标记提取
    const charMatch = content.match(/(?:角色|characters?)[：:]\s*([^\n]+)/i);
    if (charMatch && charMatch[1]) {
      const parts = charMatch[1].split(/[,，、]/).map((s) => s.trim()).filter((s) => s.length > 0);
      refs.push(...parts);
    }
    
    // 从 character_matrix.md 格式提取
    const matrixMatch = content.match(/\|\s*(.+?)\s*\|/g);
    if (matrixMatch) {
      for (const match of matrixMatch) {
        const name = match.replace(/\|/g, '').trim();
        if (name && !name.toLowerCase().includes('角色') && !name.toLowerCase().includes('character')) {
          refs.push(name);
        }
      }
    }
    
    // 从 story_bible.md 格式提取
    const bibleMatch = content.match(/(?:名字|name)[：:]\s*([^\n]+)/i);
    if (bibleMatch && bibleMatch[1]) {
      const parts = bibleMatch[1].split(/[,，、]/).map((s) => s.trim()).filter((s) => s.length > 0);
      refs.push(...parts);
    }
    
    return [...new Set(refs)];
  }

  private extractLocationReferences(content: string): string[] {
    const refs: string[] = [];
    const locMatch = content.match(/(?:地点|locations?|场景|scenes?)[：:]\s*([^\n]+)/i);
    if (locMatch && locMatch[1]) {
      const parts = locMatch[1].split(/[,，、]/).map((s) => s.trim()).filter((s) => s.length > 0);
      refs.push(...parts);
    }
    return refs;
  }

  private extractFirstParagraph(content: string): string {
    const lines = content.split(/\n\n+/);
    for (const line of lines) {
      const trimmed = line.replace(/^#+\s*/, "").trim();
      if (trimmed.length > 0 && !trimmed.startsWith("---") && !trimmed.startsWith("```")) {
        return trimmed.substring(0, 200);
      }
    }
    return "";
  }

  private hashSources(sources: string[]): string {
    const combined = sources.join("|");
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

export function compileIntent(storyDir: string): Promise<IntentCompilerOutput> {
  const compiler = new IntentCompiler(storyDir);
  return compiler.compile();
}
