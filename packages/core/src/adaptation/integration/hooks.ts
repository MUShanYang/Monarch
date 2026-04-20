import { z } from "zod";
import { EventSourcer } from "../state/event-sourcer.js";
import type { EntityStateSnapshot, StateEvent } from "../types/state-types.js";
import { IntentCompiler, type IntentCompilerOutput } from "../state/intent-compiler.js";
import { DnaCompressor, type DnaCompressorInput, type DnaCompressorOutput, type LexicalState } from "../context/dna-compressor.js";
import { LexicalMonitor } from "../audit/lexical-monitor.js";
import { RhythmGuard, type RhythmGuardResult } from "../beat/rhythm-guard.js";
import { CascadeAuditor, type AuditResult, type CascadeAuditorConfig } from "../audit/cascade-auditor.js";
import {
  type Beat,
  type BeatType,
  type NarrativeDNA,
  type BeatPlan,
  type ChapterPlanInput,
  type SpeculativeVariant,
  SPECULATIVE_VARIANTS,
  createBeat,
  createNarrativeDNA,
  getDefaultWordTarget,
} from "../beat/beat-types.js";
import {
  getApiConstraintsForBeat,
  getApiConstraintsForSpeculative,
  getApiConstraintsForAudit,
  type ApiConstraints,
} from "../llm/api-constraints.js";
import { join } from "node:path";

export const AdaptationContextSchema = z.object({
  bookDir: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  beatIndex: z.number().int().min(0).default(0),
});
export type AdaptationContext = z.infer<typeof AdaptationContextSchema>;

export const PreGenerationHooksResultSchema = z.object({
  intentOutput: z.any(),
  dna: z.any(),
  rhythmResult: z.any(),
  bannedWords: z.array(z.string()).default([]),
  apiConstraints: z.any(),
  kineticScaffold: z.string().optional(),
});
export type PreGenerationHooksResult = z.infer<typeof PreGenerationHooksResultSchema>;

export const PostGenerationHooksResultSchema = z.object({
  auditResult: z.any(),
  events: z.array(z.any()).default([]),
  stateUpdated: z.boolean().default(false),
  shouldRetry: z.boolean().default(false),
  retryReason: z.string().optional(),
});
export type PostGenerationHooksResult = z.infer<typeof PostGenerationHooksResultSchema>;

export class AdaptationHooks {
  private eventSourcer: EventSourcer;
  private intentCompiler: IntentCompiler;
  private lexicalMonitor: LexicalMonitor;
  private rhythmGuard: RhythmGuard;
  private cascadeAuditor: CascadeAuditor;
  private bookDir: string;
  private currentSnapshot: EntityStateSnapshot | null = null;
  private currentIntent: IntentCompilerOutput | null = null;

  constructor(bookDir: string, seed?: number) {
    this.bookDir = bookDir;
    this.eventSourcer = new EventSourcer(bookDir);
    this.intentCompiler = new IntentCompiler(join(bookDir, "story"));
    this.lexicalMonitor = new LexicalMonitor();
    this.rhythmGuard = new RhythmGuard({}, seed);
    this.cascadeAuditor = new CascadeAuditor();
  }

  async initialize(): Promise<void> {
    console.log("[monarch] 加载实体快照...");
    this.currentSnapshot = await this.eventSourcer.loadSnapshot();
    console.log("[monarch] 编译意图...");
    this.currentIntent = await this.intentCompiler.compile();
    console.log("[monarch] 设置审计实体...");

    if (this.currentSnapshot?.entities) {
      this.cascadeAuditor.setEntities(this.currentSnapshot.entities);
    }

    console.log("[monarch] 加载 AI 词汇过滤表...");
    this.lexicalMonitor.addAiTellWords();
    console.log("[monarch] 初始化完成");
  }

  async preGenerationBeat(params: {
    beatType: BeatType;
    tensionLevel: number;
    focusCharacterIds: string[];
    primaryLocationId?: string;
    hooksToAdvance: string[];
    lastBeatSummary: string;
    chapterNumber?: number;
  }): Promise<PreGenerationHooksResult> {
    if (!this.currentSnapshot || !this.currentIntent) {
      await this.initialize();
    }

    const rhythmResult = this.rhythmGuard.guard(params.beatType);

    const effectiveBeatType = (rhythmResult.forcedType as BeatType) ?? params.beatType;

    const lexicalState: LexicalState = {
      bannedWords: this.lexicalMonitor.getBannedWords(),
      fatigueWords: [],
      recentWords: [],
      overuseThreshold: 2,
      overuseWindowBeats: 5,
    };

    const dnaInput: DnaCompressorInput = {
      snapshot: this.currentSnapshot!,
      intentOutput: this.currentIntent!,
      lexicalState,
      beatType: effectiveBeatType,
      tensionLevel: params.tensionLevel,
      chapterNumber: params.chapterNumber ?? 1,
      beatSequence: 0,
      focusCharacterIds: params.focusCharacterIds,
      primaryLocationId: params.primaryLocationId,
      hooksToAdvance: params.hooksToAdvance,
      lastBeatSummary: params.lastBeatSummary,
      maxTokens: 250,
    };

    const dnaResult = new DnaCompressor().compress(dnaInput);

    const wordTarget = getDefaultWordTarget(effectiveBeatType);
    const apiConstraints = getApiConstraintsForBeat(effectiveBeatType, wordTarget, {
      additionalStopSequences: dnaResult.dna.mustNotInclude.slice(0, 5),
    });

    return PreGenerationHooksResultSchema.parse({
      intentOutput: this.currentIntent,
      dna: dnaResult.dna,
      rhythmResult,
      bannedWords: this.lexicalMonitor.getBannedWords(),
      apiConstraints,
      kineticScaffold: rhythmResult.kineticScaffold,
    });
  }

  async postGenerationBeat(params: {
    prose: string;
    dna: NarrativeDNA;
    beatType: BeatType;
    extractEvents?: boolean;
  }): Promise<PostGenerationHooksResult> {
    const lexicalResult = this.lexicalMonitor.analyzeBeat(params.prose);

    const auditResult = this.cascadeAuditor.audit(params.prose, params.dna);

    const shouldRetry = !auditResult.passed && auditResult.issues.some(
      (i) => i.severity === "error" && i.code !== "WORD_COUNT_UNDER"
    );

    let events: StateEvent[] = [];
    let stateUpdated = false;

    if (params.extractEvents) {
      events = this.extractEventsFromProse(params.prose, params.beatType);
      if (events.length > 0 && this.currentSnapshot) {
        this.currentSnapshot = this.eventSourcer.applyEvents(
          this.currentSnapshot,
          events,
          1
        );
        stateUpdated = true;
      }
    }

    return PostGenerationHooksResultSchema.parse({
      auditResult,
      events,
      stateUpdated,
      shouldRetry,
      retryReason: shouldRetry
        ? auditResult.issues.filter((i) => i.severity === "error")[0]?.message
        : undefined,
    });
  }

  getSpeculativeVariants(): SpeculativeVariant[] {
    return [...SPECULATIVE_VARIANTS];
  }

  getApiConstraintsForVariant(
    variantId: "A" | "B" | "C",
    wordTarget: [number, number]
  ): ApiConstraints {
    return getApiConstraintsForSpeculative(variantId, wordTarget);
  }

  async saveState(): Promise<void> {
    if (this.currentSnapshot) {
      await this.eventSourcer.saveSnapshot(this.currentSnapshot);
    }
  }

  getSnapshot(): EntityStateSnapshot | null {
    return this.currentSnapshot;
  }

  getIntent(): IntentCompilerOutput | null {
    return this.currentIntent;
  }

  getLexicalMonitor(): LexicalMonitor {
    return this.lexicalMonitor;
  }

  getRhythmGuard(): RhythmGuard {
    return this.rhythmGuard;
  }

  getCascadeAuditor(): CascadeAuditor {
    return this.cascadeAuditor;
  }

  private extractEventsFromProse(prose: string, beatType: BeatType): StateEvent[] {
    const events: StateEvent[] = [];

    const characterNames = this.currentSnapshot?.entities?.characters
      ? Object.values(this.currentSnapshot.entities.characters).map((c: any) => c.name)
      : [];
    const mentionedChars = characterNames.filter((name: string) => prose.includes(name));

    events.push({
      action: "LOG_EVENT",
      type: beatType,
      description: prose.substring(0, 500),
      characters: mentionedChars,
    });

    return events;
  }
}

export function createAdaptationHooks(bookDir: string, seed?: number): AdaptationHooks {
  return new AdaptationHooks(bookDir, seed);
}

export async function prepareBeatGeneration(params: {
  bookDir: string;
  beatType: BeatType;
  tensionLevel: number;
  focusCharacterIds: string[];
  primaryLocationId?: string;
  hooksToAdvance: string[];
  lastBeatSummary: string;
}): Promise<PreGenerationHooksResult> {
  const hooks = new AdaptationHooks(params.bookDir);
  await hooks.initialize();
  return hooks.preGenerationBeat({
    beatType: params.beatType,
    tensionLevel: params.tensionLevel,
    focusCharacterIds: params.focusCharacterIds,
    primaryLocationId: params.primaryLocationId,
    hooksToAdvance: params.hooksToAdvance,
    lastBeatSummary: params.lastBeatSummary,
  });
}

export async function auditGeneratedProse(params: {
  prose: string;
  dna: NarrativeDNA;
  entities?: any;
  config?: Partial<CascadeAuditorConfig>;
}): Promise<AuditResult> {
  const auditor = new CascadeAuditor(params.config, params.entities);
  return auditor.audit(params.prose, params.dna);
}
