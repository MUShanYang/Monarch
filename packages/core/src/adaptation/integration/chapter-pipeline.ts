import { z } from "zod";
import type { Beat, BeatType, BeatPlan, NarrativeDNA, TensionLevel } from "../beat/beat-types.js";
import type { EntityStateSnapshot, StateEvent } from "../types/state-types.js";
import type { IntentCompilerOutput } from "../state/intent-compiler.js";
import type { AuditResult } from "../audit/cascade-auditor.js";
import type { ApiConstraints } from "../llm/api-constraints.js";
import { AdaptationHooks, createAdaptationHooks } from "./hooks.js";
import { BeatOrchestrator, createBeatOrchestrator, type BeatGenerationRequest, type SpeculativeCandidate, type BeatSelectionResult, type BeatOrchestratorLLMInterface } from "./beat-orchestrator.js";
import { exciseExplicitMotivation } from "../beat/show-dont-tell-scalpel.js";

export interface ChapterPipelineLLMInterface extends BeatOrchestratorLLMInterface {
  callLLM(prompt: string, systemPrompt: string, constraints: ApiConstraints): Promise<string>;
}

export const ChapterGenerationConfigSchema = z.object({
  chapterNumber: z.number().int().min(1),
  targetWordRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  focusCharacterIds: z.array(z.string()).default([]),
  primaryLocationId: z.string().optional(),
  startTension: z.number().int().min(1).max(10).default(5),
  endTension: z.number().int().min(1).max(10).default(5),
  hooksToAdvance: z.array(z.string()).default([]),
  hooksToResolve: z.array(z.string()).default([]),
  beatTypes: z.array(z.string()).default([]),
  maxBeats: z.number().int().min(1).max(50).default(20),
  minBeats: z.number().int().min(1).max(50).default(5),
  llmInterface: z.any().optional(),
});
export type ChapterGenerationConfig = z.infer<typeof ChapterGenerationConfigSchema>;

export const BeatGenerationStepSchema = z.object({
  beatIndex: z.number().int().min(0),
  beatType: z.string(),
  dna: z.any(),
  kineticScaffold: z.string().optional(),
  candidates: z.array(z.any()).default([]),
  selectedProse: z.string().optional(),
  auditResult: z.any().optional(),
  events: z.array(z.any()).default([]),
  retryCount: z.number().int().min(0).default(0),
});
export type BeatGenerationStep = z.infer<typeof BeatGenerationStepSchema>;

export const ChapterGenerationResultSchema = z.object({
  chapterNumber: z.number().int().min(1),
  prose: z.string().default(""),
  wordCount: z.number().int().min(0).default(0),
  beatCount: z.number().int().min(0).default(0),
  beats: z.array(BeatGenerationStepSchema).default([]),
  events: z.array(z.any()).default([]),
  auditSummary: z.object({
    totalIssues: z.number().int().min(0).default(0),
    errorCount: z.number().int().min(0).default(0),
    warningCount: z.number().int().min(0).default(0),
  }).default({ totalIssues: 0, errorCount: 0, warningCount: 0 }),
  completed: z.boolean().default(false),
  failureReason: z.string().optional(),
});
export type ChapterGenerationResult = z.infer<typeof ChapterGenerationResultSchema>;

function stripThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
}

function countTextLength(text: string): number {
  const cleaned = text.replace(/<[^>]*>/g, "");
  const chineseChars = cleaned.replace(/[^\u4e00-\u9fff]/g, "").length;
  if (chineseChars > 0) return chineseChars;
  return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
}

export class ChapterPipelineAdapter {
  private hooks: AdaptationHooks;
  private orchestrator: BeatOrchestrator;
  private bookDir: string;

  constructor(bookDir: string) {
    this.bookDir = bookDir;
    this.hooks = createAdaptationHooks(bookDir);
    this.orchestrator = createBeatOrchestrator({
      maxRetries: 2,
      selectionStrategy: "best_score",
    });
  }

  async initialize(): Promise<void> {
    console.log("[monarch] 正在加载章节快照、意图编译、词法监控初始化...");
    await this.hooks.initialize();
    console.log("[monarch] 钩子系统初始化完成（快照 + 意图 + 审计器）");
  }

  setLLMInterface(llmInterface: ChapterPipelineLLMInterface): void {
    this.orchestrator.setLLMInterface(llmInterface);
  }

  async generateChapter(config: ChapterGenerationConfig): Promise<ChapterGenerationResult> {
    const result: ChapterGenerationResult = {
      chapterNumber: config.chapterNumber,
      prose: "",
      wordCount: 0,
      beatCount: 0,
      beats: [],
      events: [],
      auditSummary: { totalIssues: 0, errorCount: 0, warningCount: 0 },
      completed: false,
    };

    try {
      await this.initialize();

      const beatPlan = this.planBeats(config);
      console.log(`[monarch] 节拍规划完成：共 ${beatPlan.length} 个节拍，类型序列：${beatPlan.join(" / ")}`);

      let currentWordCount = 0;
      let lastBeatSummary = "";

      for (let i = 0; i < beatPlan.length; i++) {
        if (currentWordCount >= config.targetWordRange[1]) {
          console.log(`[monarch] 已达到目标字数上限 ${config.targetWordRange[1]}，停止生成`);
          break;
        }
        if (result.beats.length >= config.maxBeats) break;

        const beatType = beatPlan[i]!;
        const tensionLevel = this.calculateTension(i, beatPlan.length, config.startTension, config.endTension);
        console.log(`[monarch] 节拍 ${i + 1}/${beatPlan.length}：${beatType}（张力 ${tensionLevel}/10，当前字数 ${currentWordCount}）`);

        const isLastBeat = i === beatPlan.length - 1;
        const step = await this.generateBeat({
          beatIndex: i,
          beatType,
          tensionLevel,
          focusCharacterIds: config.focusCharacterIds,
          primaryLocationId: config.primaryLocationId,
          hooksToAdvance: config.hooksToAdvance,
          lastBeatSummary,
          isChapterEnd: isLastBeat,
          chapterNumber: config.chapterNumber,
        });

        result.beats.push(step);

        if (step.selectedProse) {
          const cleanProse = stripThinkingTags(step.selectedProse);
          result.prose += cleanProse + "\n\n";
          const beatWordCount = countTextLength(cleanProse);
          currentWordCount += beatWordCount;
          console.log(`[monarch] 节拍 ${i + 1} 完成：${beatWordCount} 字，累计 ${currentWordCount} 字`);
          lastBeatSummary = cleanProse.substring(0, 150);
        } else {
          console.log(`[monarch] 节拍 ${i + 1} 跳过：无有效内容`);
        }

        if (step.events.length > 0) {
          result.events.push(...step.events);
        }

        if (step.auditResult) {
          result.auditSummary.totalIssues += step.auditResult.issues.length;
          result.auditSummary.errorCount += step.auditResult.issues.filter((i: any) => i.severity === "error").length;
          result.auditSummary.warningCount += step.auditResult.issues.filter((i: any) => i.severity === "warning").length;
        }
      }

      result.wordCount = currentWordCount;
      result.beatCount = result.beats.length;
      result.completed = true;

      await this.hooks.saveState();

    } catch (error) {
      result.failureReason = error instanceof Error ? error.message : String(error);
    }

    return ChapterGenerationResultSchema.parse(result);
  }

  private async generateBeat(params: {
    beatIndex: number;
    beatType: BeatType;
    tensionLevel: TensionLevel;
    focusCharacterIds: string[];
    primaryLocationId?: string;
    hooksToAdvance: string[];
    lastBeatSummary: string;
    isChapterEnd?: boolean;
    chapterNumber?: number;
  }): Promise<BeatGenerationStep> {
    const step: BeatGenerationStep = {
      beatIndex: params.beatIndex,
      beatType: params.beatType,
      dna: null,
      candidates: [],
      events: [],
      retryCount: 0,
    };

    const preGen = await this.hooks.preGenerationBeat({
      beatType: params.beatType,
      tensionLevel: params.tensionLevel,
      focusCharacterIds: params.focusCharacterIds,
      primaryLocationId: params.primaryLocationId,
      hooksToAdvance: params.hooksToAdvance,
      lastBeatSummary: params.lastBeatSummary,
      chapterNumber: params.chapterNumber,
    });

    step.dna = preGen.dna;
    step.kineticScaffold = preGen.kineticScaffold;

    const request: BeatGenerationRequest = {
      beatId: `beat-${params.beatIndex}`,
      chapterNumber: params.chapterNumber ?? 1,
      beatType: params.beatType,
      tensionLevel: params.tensionLevel,
      dna: preGen.dna,
      kineticScaffold: preGen.kineticScaffold,
      bannedWords: preGen.bannedWords,
    };

    const selection = await this.orchestrator.executeSpeculativeCalls(request, this.hooks);

    step.selectedProse = selection.selectedProse;
    step.candidates = selection.candidates;

    if (selection.allDisqualified) {
      step.retryCount = 1;
    }

    if (step.selectedProse) {
      const postResult = await this.hooks.postGenerationBeat({
        prose: step.selectedProse,
        dna: preGen.dna,
        beatType: params.beatType,
        extractEvents: true,
      });
      step.auditResult = postResult.auditResult;
      step.events = postResult.events;
    }

    return BeatGenerationStepSchema.parse(step);
  }

  private planBeats(config: ChapterGenerationConfig): BeatType[] {
    const types: BeatType[] = [];
    const targetWords = config.targetWordRange[1];
    const avgWordsPerBeat = 100;
    const estimatedBeats = Math.ceil(targetWords / avgWordsPerBeat);
    const beatCount = Math.min(estimatedBeats, config.maxBeats);

    const typePool: BeatType[] = config.beatTypes.length > 0
      ? config.beatTypes as BeatType[]
      : ["action", "dialogue", "interiority", "environment", "transition", "revelation", "tension", "resolution"];

    for (let i = 0; i < beatCount; i++) {
      const position = i / beatCount;

      let preferredType: BeatType;
      if (position < 0.2) {
        preferredType = this.selectFrom(["environment", "dialogue", "interiority"]);
      } else if (position < 0.5) {
        preferredType = this.selectFrom(["action", "dialogue", "tension"]);
      } else if (position < 0.8) {
        preferredType = this.selectFrom(["action", "revelation", "tension"]);
      } else {
        preferredType = this.selectFrom(["resolution", "dialogue", "interiority"]);
      }

      types.push(preferredType);
    }

    return this.enforceRhythm(types);
  }

  private selectFrom(types: BeatType[]): BeatType {
    return types[Math.floor(Math.random() * types.length)]!;
  }

  private enforceRhythm(types: BeatType[]): BeatType[] {
    const result: BeatType[] = [];

    for (let i = 0; i < types.length; i++) {
      const current = types[i]!;
      const lastTwo = result.slice(-2);

      if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1] && lastTwo[1] === current) {
        const alternatives = ["dialogue", "interiority", "environment", "transition"].filter(
          (t) => t !== current
        ) as BeatType[];
        result.push(this.selectFrom(alternatives));
      } else {
        result.push(current);
      }
    }

    return result;
  }

  private calculateTension(
    beatIndex: number,
    totalBeats: number,
    startTension: number,
    endTension: number
  ): TensionLevel {
    if (totalBeats <= 1) return startTension as TensionLevel;

    const progress = beatIndex / (totalBeats - 1);
    const tension = startTension + (endTension - startTension) * progress;

    return Math.round(Math.max(1, Math.min(10, tension))) as TensionLevel;
  }

  getHooks(): AdaptationHooks {
    return this.hooks;
  }

  getOrchestrator(): BeatOrchestrator {
    return this.orchestrator;
  }
}

export function createChapterPipelineAdapter(bookDir: string): ChapterPipelineAdapter {
  return new ChapterPipelineAdapter(bookDir);
}

export async function generateChapterWithAdaptation(
  bookDir: string,
  config: ChapterGenerationConfig
): Promise<ChapterGenerationResult> {
  const adapter = new ChapterPipelineAdapter(bookDir);
  if (config.llmInterface) {
    adapter.setLLMInterface(config.llmInterface);
  }
  return adapter.generateChapter(config);
}
