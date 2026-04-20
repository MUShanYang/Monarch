import { z } from "zod";
import type { EntitiesDb } from "../types/state-types.js";
import type { BeatType, NarrativeDNA } from "../beat/beat-types.js";
import { validateProperNoun, extractCapitalizedWords, detectUnknownProperNouns } from "../state/event-sourcer.js";

export const AuditLayerSchema = z.enum([
  "rules",
  "proper_noun",
  "structure",
  "voice",
  "continuity",
]);
export type AuditLayer = z.infer<typeof AuditLayerSchema>;

export const AuditIssueSchema = z.object({
  layer: AuditLayerSchema,
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(1),
  message: z.string().min(1),
  position: z.object({
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
  }).optional(),
});
export type AuditIssue = z.infer<typeof AuditIssueSchema>;

export const AuditResultSchema = z.object({
  passed: z.boolean(),
  disqualified: z.boolean().default(false),
  issues: z.array(AuditIssueSchema).default([]),
  layerResults: z.record(z.string(), z.boolean()).default({}),
  score: z.number().min(0).max(100).default(0),
  wordCount: z.number().int().min(0).default(0),
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

export const CascadeAuditorConfigSchema = z.object({
  enableVoiceLayer: z.boolean().default(true),
  enableContinuityLayer: z.boolean().default(true),
  strictProperNoun: z.boolean().default(false),
  minWordCount: z.number().int().min(1).default(5),
  maxWordCount: z.number().int().min(1).default(2000),
  forbiddenWords: z.array(z.string()).default([]),
  requiredPov: z.enum(["first", "third", "second", "any"]).default("any"),
  requiredTense: z.enum(["past", "present", "future", "any"]).default("any"),
});
export type CascadeAuditorConfig = z.infer<typeof CascadeAuditorConfigSchema>;

interface CascadeAuditOptions {
  readonly skipVoice?: boolean;
  readonly skipContinuity?: boolean;
  readonly chapterNumber?: number;
}

const POV_PATTERNS = {
  first: /\b(I|me|my|mine|we|us|our|ours)\b/gi,
  third: /\b(he|him|his|she|her|hers|they|them|their|theirs|it|its)\b/gi,
  second: /\b(you|your|yours)\b/gi,
};

const TENSE_PATTERNS = {
  past: /\b(was|were|had|did|went|came|said|thought|felt|saw|heard|walked|ran|took|made|got|knew|found|gave|told|asked|seemed|became|left|began|showed|kept|let|brought|happened|wrote|stood|sat|lost|paid|met|included|continued|set|learned|changed|led|understood|watched|followed|stopped|created|spoke|spent|grew|opened|won|offered|remembered|loved|considered|appeared|bought|waited|served|died|sent|expected|built|stayed|fell|cut|reached|killed|remained)\b/gi,
  present: /\b(is|are|am|has|have|does|goes|comes|says|thinks|feels|sees|hears|walks|runs|takes|makes|gets|knows|finds|gives|tells|asks|seems|becomes|leaves|begins|shows|keeps|lets|brings|happens|writes|stands|sits|loses|pays|meets|includes|continues|sets|learns|changes|leads|understands|watches|follows|stops|creates|speaks|spends|grows|opens|wins|offers|remembers|loves|considers|appears|buys|waits|serves|dies|sends|expects|builds|stays|falls|cuts|reaches|kills|remains)\b/gi,
  future: /\b(will|shall|going to|about to|will be|shall be)\b/gi,
};

export class CascadeAuditor {
  private config: CascadeAuditorConfig;
  private entities: EntitiesDb | null;

  constructor(config?: Partial<CascadeAuditorConfig>, entities?: EntitiesDb) {
    this.config = CascadeAuditorConfigSchema.parse(config ?? {});
    this.entities = entities ?? null;
  }

  setEntities(entities: EntitiesDb): void {
    this.entities = entities;
  }

  audit(
    prose: string,
    dna: NarrativeDNA,
    options?: CascadeAuditOptions
  ): AuditResult {
    const issues: AuditIssue[] = [];
    const layerResults: Record<string, boolean> = {};
    let disqualified = false;

    const rulesResult = this.auditRulesLayer(prose, dna);
    issues.push(...rulesResult.issues);
    layerResults.rules = rulesResult.passed;
    if (rulesResult.disqualified) disqualified = true;

    const properNounResult = this.auditProperNounLayer(prose);
    issues.push(...properNounResult.issues);
    layerResults.proper_noun = properNounResult.passed;
    if (properNounResult.disqualified) disqualified = true;

    const structureResult = this.auditStructureLayer(prose);
    issues.push(...structureResult.issues);
    layerResults.structure = structureResult.passed;
    if (structureResult.disqualified) disqualified = true;

    const skipVoice = options?.skipVoice ?? !this.config.enableVoiceLayer;
    if (!skipVoice) {
      layerResults.voice = true;
    }

    const skipContinuity = options?.skipContinuity ?? !this.config.enableContinuityLayer;
    if (!skipContinuity) {
      const continuityResult = this.auditContinuityLayer(prose, dna, options?.chapterNumber);
      issues.push(...continuityResult.issues);
      layerResults.continuity = continuityResult.passed;
      if (continuityResult.disqualified) disqualified = true;
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 5));

    const wordCount = this.countWords(prose);
    const passed = !disqualified && errorCount === 0;

    return AuditResultSchema.parse({
      passed,
      disqualified,
      issues,
      layerResults,
      score,
      wordCount,
    });
  }

  auditRulesLayer(
    prose: string,
    dna: NarrativeDNA
  ): { passed: boolean; disqualified: boolean; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let disqualified = false;

    const wordCount = this.countWords(prose);
    if (wordCount < this.config.minWordCount) {
      issues.push({
        layer: "rules",
        severity: "error",
        code: "WORD_COUNT_UNDER",
        message: `Word count ${wordCount} below minimum ${this.config.minWordCount}`,
      });
      disqualified = true;
    }
    if (wordCount > this.config.maxWordCount) {
      issues.push({
        layer: "rules",
        severity: "warning",
        code: "WORD_COUNT_OVER",
        message: `Word count ${wordCount} exceeds maximum ${this.config.maxWordCount}`,
      });
    }

    const proseLower = prose.toLowerCase();
    for (const forbidden of this.config.forbiddenWords) {
      if (proseLower.includes(forbidden.toLowerCase())) {
        issues.push({
          layer: "rules",
          severity: "error",
          code: "FORBIDDEN_WORD",
          message: `Forbidden word found: "${forbidden}"`,
        });
        disqualified = true;
      }
    }

    for (const banned of dna.mustNotInclude) {
      if (proseLower.includes(banned.toLowerCase())) {
        issues.push({
          layer: "rules",
          severity: "error",
          code: "BANNED_WORD",
          message: `Banned word from DNA found: "${banned}"`,
        });
      }
    }

    return { passed: issues.filter((i) => i.severity === "error").length === 0, disqualified, issues };
  }

  auditProperNounLayer(
    prose: string
  ): { passed: boolean; disqualified: boolean; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let disqualified = false;

    if (!this.entities) {
      return { passed: true, disqualified: false, issues: [] };
    }

    const allowedEntities = this.buildAllowedEntities();
    const result = checkProperNounViolation(prose, allowedEntities);

    if (!result.passed) {
      for (const noun of result.violatingNouns) {
        issues.push({
          layer: "proper_noun",
          severity: "error",
          code: "UNKNOWN_PROPER_NOUN",
          message: `Unknown proper noun detected: "${noun}"`,
        });
      }
      if (this.config.strictProperNoun) {
        disqualified = true;
      }
    }

    return { passed: result.passed, disqualified, issues };
  }

  private buildAllowedEntities(): Set<string> {
    const allowed = new Set<string>();

    if (this.entities) {
      for (const char of this.entities.characters) {
        allowed.add(char.name);
        for (const alias of char.aliases) {
          allowed.add(alias);
        }
      }

      for (const loc of this.entities.locations) {
        allowed.add(loc.name);
      }

      for (const item of this.entities.items) {
        allowed.add(item.name);
      }

      for (const noun of this.entities.properNounRegistry) {
        allowed.add(noun);
      }
    }

    return allowed;
  }

  auditStructureLayer(
    prose: string
  ): { passed: boolean; disqualified: boolean; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let disqualified = false;

    if (this.config.requiredPov !== "any") {
      const povResult = this.detectPov(prose);
      if (povResult.detected !== this.config.requiredPov && povResult.confidence > 0.5) {
        issues.push({
          layer: "structure",
          severity: "error",
          code: "POV_MISMATCH",
          message: `POV mismatch: expected ${this.config.requiredPov}, detected ${povResult.detected}`,
        });
        disqualified = true;
      }
    }

    if (this.config.requiredTense !== "any") {
      const tenseResult = this.detectTense(prose);
      if (tenseResult.detected !== this.config.requiredTense && tenseResult.confidence > 0.5) {
        issues.push({
          layer: "structure",
          severity: "warning",
          code: "TENSE_MISMATCH",
          message: `Tense mismatch: expected ${this.config.requiredTense}, detected ${tenseResult.detected}`,
        });
      }
    }

    const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 0) {
      const wordCount = this.countWords(prose);
      const avgSentenceLength = wordCount / sentences.length;
      if (avgSentenceLength > 25) {
        issues.push({
          layer: "structure",
          severity: "warning",
          code: "LONG_SENTENCES",
          message: `Average sentence length ${avgSentenceLength.toFixed(1)} words is high`,
        });
      }
    }

    return { passed: issues.filter((i) => i.severity === "error").length === 0, disqualified, issues };
  }

  quickAudit(prose: string, dna: NarrativeDNA): boolean {
    const rulesResult = this.auditRulesLayer(prose, dna);
    if (!rulesResult.passed) return false;

    const properNounResult = this.auditProperNounLayer(prose);
    if (!properNounResult.passed && this.config.strictProperNoun) return false;

    return true;
  }

  private auditContinuityLayer(
    prose: string,
    _dna: NarrativeDNA,
    chapterNumber?: number,
  ): { passed: boolean; disqualified: boolean; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    if (!chapterNumber || chapterNumber <= 1) {
      return { passed: true, disqualified: false, issues };
    }

    const resetPatterns = [
      /不知道自己是谁/,
      /我是谁/,
      /这里是(?:哪里|何处)/,
      /这是(?:哪里|何处)/,
      /无名遗迹/,
      /猛地睁开眼/,
      /缓缓睁开眼/,
      /骤然睁开眼/,
      /失忆/,
      /初醒/,
    ];
    const flashbackPatterns = [
      /回忆/,
      /记忆/,
      /梦里/,
      /梦中/,
      /梦境/,
      /幻觉/,
      /想起/,
      /忆起/,
      /旧梦/,
    ];

    const resetHits = resetPatterns.filter((pattern) => pattern.test(prose));
    const flashbackLike = flashbackPatterns.some((pattern) => pattern.test(prose));

    if (resetHits.length >= 2 && !flashbackLike) {
      issues.push({
        layer: "continuity",
        severity: "error",
        code: "CHAPTER_RESET",
        message: `Detected chapter-reset prose in later chapter: ${resetHits.slice(0, 3).map((pattern) => pattern.source).join(", ")}`,
      });
      return { passed: false, disqualified: true, issues };
    }

    return { passed: true, disqualified: false, issues };
  }

  private countWords(text: string): number {
    const cleaned = text.replace(/<[^>]*>/g, "");
    const chineseChars = cleaned.replace(/[^\u4e00-\u9fff]/g, "").length;
    if (chineseChars > 0) {
      return chineseChars;
    }
    return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
  }

  private isSentenceStart(prose: string, word: string): boolean {
    const wordIndex = prose.indexOf(word);
    if (wordIndex === 0) return true;
    const before = prose.substring(Math.max(0, wordIndex - 2), wordIndex);
    return /[.!?]\s/.test(before);
  }

  private detectPov(prose: string): { detected: "first" | "third" | "second" | "unknown"; confidence: number } {
    const counts: Record<string, number> = { first: 0, third: 0, second: 0 };

    for (const [pov, pattern] of Object.entries(POV_PATTERNS)) {
      const matches = prose.match(pattern);
      if (matches) {
        counts[pov] = matches.length;
      }
    }

    const total = counts.first + counts.third + counts.second;
    if (total === 0) return { detected: "unknown", confidence: 0 };

    const maxPov = (Object.entries(counts) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0];

    return {
      detected: maxPov[0] as "first" | "third" | "second",
      confidence: maxPov[1] / total,
    };
  }

  private detectTense(prose: string): { detected: "past" | "present" | "future" | "unknown"; confidence: number } {
    const counts: Record<string, number> = { past: 0, present: 0, future: 0 };

    for (const [tense, pattern] of Object.entries(TENSE_PATTERNS)) {
      const matches = prose.match(pattern);
      if (matches) {
        counts[tense] = matches.length;
      }
    }

    const total = counts.past + counts.present + counts.future;
    if (total === 0) return { detected: "unknown", confidence: 0 };

    const maxTense = (Object.entries(counts) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0];

    return {
      detected: maxTense[0] as "past" | "present" | "future",
      confidence: maxTense[1] / total,
    };
  }
}

export function createCascadeAuditor(
  config?: Partial<CascadeAuditorConfig>,
  entities?: EntitiesDb
): CascadeAuditor {
  return new CascadeAuditor(config, entities);
}

export function quickAuditProse(
  prose: string,
  entities: EntitiesDb,
  options?: {
    minWordCount?: number;
    maxWordCount?: number;
    forbiddenWords?: string[];
  }
): AuditResult {
  const auditor = new CascadeAuditor(
    {
      minWordCount: options?.minWordCount ?? 30,
      maxWordCount: options?.maxWordCount ?? 200,
      forbiddenWords: options?.forbiddenWords ?? [],
      enableVoiceLayer: false,
      enableContinuityLayer: false,
    },
    entities
  );

  const dna: NarrativeDNA = {
    who: [],
    where: "",
    mustInclude: [],
    mustNotInclude: [],
    lastBeatSummary: "",
    hookContext: [],
    spatialConstraints: [],
  };

  return auditor.audit(prose, dna);
}

export function checkProperNounViolation(
  beatText: string,
  allowedEntities: Set<string>
): { passed: boolean; violatingNouns: string[] } {
  const properNounRegex = /(?<![.!?]\s)\b[A-Z][a-z]{2,}\b/g;
  const found = [...beatText.matchAll(properNounRegex)].map((m) => m[0]);
  const violating = found.filter((noun) => !allowedEntities.has(noun));
  return { passed: violating.length === 0, violatingNouns: violating };
}
