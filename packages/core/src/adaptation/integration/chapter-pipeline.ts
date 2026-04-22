import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ChapterIntent, ContextPackage, RuleStack } from "../../models/input-governance.js";

import {
  createBeat,
  createKineticScaffold,
  type Beat,
  type BeatType,
  type NarrativeDNA,
  type TensionLevel,
} from "../beat/beat-types.js";
import type { EntityStateSnapshot, StateEvent, ChapterSummary } from "../types/state-types.js";
import type { AuditResult } from "../audit/cascade-auditor.js";
import type { ApiConstraints } from "../llm/api-constraints.js";
import { AdaptationHooks, createAdaptationHooks } from "./hooks.js";
import {
  BeatOrchestrator,
  createBeatOrchestrator,
  type BeatGenerationRequest,
  type BeatSelectionResult,
  type BeatOrchestratorLLMInterface,
} from "./beat-orchestrator.js";
import { HybridMotifSystem, createHybridMotifSystem } from "../state/motif-integration.js";
import { MotifIndexSchema } from "../state/motif-types.js";
import { StateCompiler } from "../state/state-compiler.js";
import {
  CuriosityLedgerManager,
  createCuriosityLedgerManager,
  type CuriosityCheckResult,
} from "../narrative/curiosity-ledger.js";
import { DriftDetector, type DriftReport } from "../narrative/drift-detector.js";
import { NarrativeMetabolism, type MetabolismReport } from "../narrative/metabolism.js";
import { SceneExitEvaluator } from "../scene/exit-conditions.js";
import {
  KnowledgeBoundaryChecker,
  type KnowledgeBoundary,
  type KnowledgeCheckResult,
} from "../character/knowledge-boundary.js";
import {
  AdversarialRefiner,
  type AdversarialRefinementResult,
  type AttackerFinding,
  type RefereeVerdict,
} from "../generation/adversarial-refiner.js";
import {
  ReaderSimulator,
  buildReaderPrompt,
  type ReaderResponse,
  type ReaderSimulationResult,
} from "../simulation/reader-simulator.js";
import {
  AdaptationPipelineOrchestrator,
  type PipelineContext,
} from "../pipeline/adaptation-orchestrator.js";
import { AdaptationProgressManager } from "./progress-manager.js";
import {
  SubtextEngine,
  createSubtextEngine,
  type SubtextAnalysisResult,
} from "../generation/subtext-engine.js";
import {
  EmotionalDebtManager,
  createEmotionalDebtManager,
  type DebtAnalysisResult,
} from "../character/emotional-debt.js";
import {
  CharacterUnconscious,
  createCharacterUnconscious,
  type UnconsciousAnalysis,
} from "../character/unconscious.js";
import {
  VoiceFingerprintAnalyzer,
  createVoiceFingerprintAnalyzer,
  type VoiceComparisonResult,
} from "../audit/voice-fingerprint.js";
import {
  TimelineExplorer,
  createTimelineExplorer,
  type TimelineAnalysisResult,
} from "../narrative/timeline-explorer.js";
import {
  DialogueArena,
  createDialogueArena,
  type DialogueValidationResult,
} from "../simulation/dialogue-arena.js";
import {
  HookPrioritizer,
  createHookPrioritizer,
  type HookMetadata,
  type PrioritizedHook,
} from "../narrative/hook-prioritizer.js";
import {
  BeatTypeRecommender,
  createBeatTypeRecommender,
  type BeatHistoryEntry,
  type BeatRecommendation,
} from "../beat/beat-type-recommender.js";
import {
  ChapterHealthMonitor,
  createChapterHealthMonitor,
  type HealthReport,
  type BeatSnapshot,
} from "../monitoring/chapter-health-monitor.js";
import {
  StyleConsistencyChecker,
  createStyleConsistencyChecker,
  type StyleConsistencyResult,
} from "../audit/style-consistency-checker.js";
import {
  KnowledgeTracker,
  createKnowledgeTracker,
} from "../character/knowledge-tracker.js";
import {
  KnowledgeValidator,
  createKnowledgeValidator,
  type KnowledgeValidationDecision,
} from "../character/knowledge-validator.js";
import {
  FormatNormalizer,
  createFormatNormalizer,
  type FormatNormalizationResult,
} from "../generation/format-normalizer.js";

export interface ChapterPipelineLLMInterface extends BeatOrchestratorLLMInterface {
  callLLM(
    prompt: string,
    systemPrompt: string,
    constraints: ApiConstraints & { jsonSchema?: Record<string, unknown> },
  ): Promise<string>;
}

const READER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
  },
  required: ["answer"],
  additionalProperties: false,
} as const;

const ATTACKER_FINDING_JSON_SCHEMA = {
  type: "object",
  properties: {
    problem: { type: "string" },
    location: { type: "string" },
    severity: { type: "string", enum: ["minor", "major", "critical"] },
    evidence: { type: "string" },
  },
  additionalProperties: false,
} as const;

const REFEREE_VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    problemValid: { type: "boolean" },
    fixed: { type: "boolean" },
    introducedNewProblem: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    note: { type: "string" },
  },
  required: ["problemValid", "fixed"],
  additionalProperties: false,
} as const;

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
  maxRetriesPerBeat: z.number().int().min(1).max(10).default(2),
  governedIntent: z.any().optional(),
  chapterIntent: z.string().optional(),
  contextPackage: z.any().optional(),
  ruleStack: z.any().optional(),
  llmInterface: z.any().optional(),
  previousChapterEndingSummary: z.string().max(150).default(""),
});
export type ChapterGenerationConfig = z.infer<typeof ChapterGenerationConfigSchema>;

export const BeatGenerationStepSchema = z.object({
  beatIndex: z.number().int().min(0),
  beatType: z.string(),
  beat: z.any().optional(),
  dna: z.any(),
  kineticScaffold: z.string().optional(),
  candidates: z.array(z.any()).default([]),
  selectedProse: z.string().optional(),
  auditResult: z.any().optional(),
  adversarialResult: z.any().optional(),
  readerResult: z.any().optional(),
  knowledgeResult: z.any().optional(),
  subtextAnalysis: z.any().optional(),
  voiceCheck: z.any().optional(),
  dialogueValidation: z.any().optional(),
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
  generatedTitle: z.string().optional(),
  auditSummary: z.object({
    totalIssues: z.number().int().min(0).default(0),
    errorCount: z.number().int().min(0).default(0),
    warningCount: z.number().int().min(0).default(0),
  }).default({ totalIssues: 0, errorCount: 0, warningCount: 0 }),
  metabolismReport: z.any().optional(),
  curiosityCheck: z.any().optional(),
  driftReport: z.any().optional(),
  chapterSummary: z.any().optional(),
  compiledState: z.object({
    currentState: z.string(),
    pendingHooks: z.string(),
    subplotBoard: z.string(),
    chapterSummaries: z.string(),
  }).optional(),
  emotionalDebtAnalysis: z.record(z.any()).optional(),
  unconsciousAnalysis: z.record(z.any()).optional(),
  timelineAnalysis: z.any().optional(),
  subtextSummary: z.object({
    totalEntries: z.number().int().default(0),
    byLayer: z.record(z.number()).default({}),
  }).optional(),
  voiceConsistency: z.object({
    averageSimilarity: z.number().min(0).max(1).optional(),
    inconsistentBeats: z.number().int().default(0),
  }).optional(),
  dialogueIssues: z.array(z.object({
    beatIndex: z.number().int(),
    violations: z.array(z.any()),
  })).default([]),
  motifsReferenced: z.array(z.string()).default([]),
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

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidates = [trimmed, extractBalancedJson(trimmed)].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

const VALID_BEAT_TYPES: ReadonlySet<BeatType> = new Set([
  "action",
  "dialogue",
  "interiority",
  "environment",
  "transition",
  "revelation",
  "tension",
  "resolution",
  "negative-space",
]);

export class ChapterPipelineAdapter {
  private readonly hooks: AdaptationHooks;
  private readonly orchestrator: BeatOrchestrator;
  private readonly bookDir: string;
  private readonly maxRetriesPerBeat: number;
  private llmInterface: ChapterPipelineLLMInterface | null = null;
  private workflow: AdaptationPipelineOrchestrator | null = null;
  private currentSnapshot: EntityStateSnapshot | null = null;
  private readonly motifSystem: HybridMotifSystem;
  private curiosityLedger: CuriosityLedgerManager = createCuriosityLedgerManager();
  private readonly driftDetector = new DriftDetector();
  private readonly metabolism = new NarrativeMetabolism();
  private readonly sceneExitEvaluator = new SceneExitEvaluator();
  private readonly knowledgeChecker = new KnowledgeBoundaryChecker();
  private readerSimulator: ReaderSimulator | null = null;
  private adversarialRefiner: AdversarialRefiner | null = null;
  private readonly subtextEngine = createSubtextEngine();
  private readonly emotionalDebtManager = createEmotionalDebtManager();
  private readonly characterUnconscious = createCharacterUnconscious();
  private voiceFingerprintAnalyzer: VoiceFingerprintAnalyzer | null = null;
  private readonly timelineExplorer = createTimelineExplorer();
  private dialogueArena: DialogueArena | null = null;
  private lastSelection: BeatSelectionResult | null = null;
  private lastWorkflowContext: PipelineContext | null = null;
  private currentProgress: AdaptationProgressManager | null = null;
  private readonly hookPrioritizer = createHookPrioritizer();
  private readonly beatTypeRecommender = createBeatTypeRecommender();
  private healthMonitor: ChapterHealthMonitor | null = null;
  private readonly styleChecker = createStyleConsistencyChecker();
  private readonly knowledgeTracker: KnowledgeTracker;
  private knowledgeValidator: KnowledgeValidator | null = null;
  private readonly formatNormalizer = createFormatNormalizer();

  constructor(bookDir: string, options?: { maxRetriesPerBeat?: number }) {
    this.bookDir = bookDir;
    this.maxRetriesPerBeat = Math.max(1, options?.maxRetriesPerBeat ?? 2);
    this.hooks = createAdaptationHooks(bookDir);
    this.orchestrator = createBeatOrchestrator({
      maxRetries: this.maxRetriesPerBeat,
      selectionStrategy: "best_score",
    });
    this.motifSystem = createHybridMotifSystem(bookDir);
    this.knowledgeTracker = createKnowledgeTracker(bookDir);
  }

  async initialize(): Promise<void> {
    const progress = new AdaptationProgressManager();
    progress.startPhase("loading", "正在加载章节快照、意图编译、词法监控初始化...");
    await this.hooks.initialize();
    this.currentSnapshot = this.hooks.getSnapshot();
    await this.motifSystem.initialize();
    await this.knowledgeTracker.load();
    this.knowledgeValidator = createKnowledgeValidator(this.knowledgeTracker, {
      strictMode: false,
      autoRetry: true,
      maxRetries: 2,
    });
    this.rebuildCuriosityLedger();

    if (this.llmInterface) {
      this.workflow = this.createWorkflow();
    }

    progress.completePhase("初始化完成");
  }

  setLLMInterface(llmInterface: ChapterPipelineLLMInterface): void {
    this.llmInterface = llmInterface;
    this.orchestrator.setLLMInterface(llmInterface);
    this.readerSimulator = null;
    this.adversarialRefiner = null;
    this.workflow = this.currentSnapshot ? this.createWorkflow() : null;
  }

  async generateChapter(config: ChapterGenerationConfig): Promise<ChapterGenerationResult> {
    const progress = new AdaptationProgressManager();
    this.currentProgress = progress;
    const result: ChapterGenerationResult = {
      chapterNumber: config.chapterNumber,
      prose: "",
      wordCount: 0,
      beatCount: 0,
      beats: [],
      events: [],
      motifsReferenced: [],
      auditSummary: { totalIssues: 0, errorCount: 0, warningCount: 0 },
      dialogueIssues: [],
      completed: false,
    };

    try {
      await this.initialize();

      // 初始化健康监控器
      this.healthMonitor = createChapterHealthMonitor(config.maxBeats);

      // 使用 Hook 优先级调整器
      const prioritizedHooks = this.prioritizeHooks(config);
      progress.log(`Hook 优先级调整完成：${prioritizedHooks.length} 个待推进线索`);

      const beatPlan = this.planBeatsWithRecommender(config, prioritizedHooks);
      progress.log(`节拍规划完成：共 ${beatPlan.length} 个节拍，类型序列：${beatPlan.join(" / ")}`);

      let currentWordCount = 0;
      let lastBeatSummary = config.previousChapterEndingSummary || "";

      for (let i = 0; i < beatPlan.length; i += 1) {
        if (currentWordCount >= config.targetWordRange[1]) {
          progress.log(`已达到目标字数上限 ${config.targetWordRange[1]}，停止生成`);
          break;
        }
        if (result.beats.length >= config.maxBeats) {
          break;
        }

        const plannedType = beatPlan[i]!;
        const beatType = this.adjustBeatType(plannedType, result.beats);
        const tensionLevel = this.calculateTension(i, beatPlan.length, config.startTension, config.endTension);
        progress.startPhase("writing", `节拍 ${i + 1}/${beatPlan.length}：${beatType}（张力 ${tensionLevel}/10）`);

        const step = await this.generateBeat({
          beatIndex: i,
          beatType,
          tensionLevel,
          focusCharacterIds: config.focusCharacterIds,
          primaryLocationId: config.primaryLocationId,
          hooksToAdvance: [
            ...new Set([
              ...config.hooksToAdvance,
              ...(config.governedIntent?.hookAgenda?.mustAdvance ?? []),
            ]),
          ],
          lastBeatSummary,
          chapterNumber: config.chapterNumber,
          governedIntent: config.governedIntent,
          contextPackage: config.contextPackage,
          ruleStack: config.ruleStack,
        });

        result.beats.push(step);

        if (step.selectedProse) {
          let cleanProse = stripThinkingTags(step.selectedProse);

          // 应用格式规范化
          const normalizationResult = this.formatNormalizer.normalize(cleanProse);
          if (normalizationResult.issuesFound > 0) {
            cleanProse = normalizationResult.normalized;
            progress.log(`格式规范化：修复了 ${normalizationResult.issuesFound} 个问题 (${normalizationResult.changes.join(", ")})`);
          }

          result.prose += `${cleanProse}\n\n`;
          const beatWordCount = countTextLength(cleanProse);
          currentWordCount += beatWordCount;
          progress.completePhase(`节拍 ${i + 1} 完成：${beatWordCount} 字，累计 ${currentWordCount} 字`);
          lastBeatSummary = cleanProse.substring(0, 150);
          this.updateMotifsFromBeat(step, config.chapterNumber);

          // 知识边界验证
          if (this.knowledgeValidator && step.beat) {
            const beat = step.beat as Beat;
            const validation = await this.knowledgeValidator.validateBeat(
              cleanProse,
              beat,
              config.chapterNumber,
              i
            );

            if (validation.action === "reject") {
              progress.log(`❌ 节拍 ${i + 1} 知识边界严重违规，拒绝`);
              for (const violation of validation.violations.slice(0, 3)) {
                progress.log(`  - ${violation.characterName}: ${violation.violatedFact}`);
              }
            } else if (validation.action === "warn") {
              progress.log(`⚠️ 节拍 ${i + 1} 知识边界警告 (得分: ${validation.score})`);
              for (const violation of validation.violations.slice(0, 2)) {
                progress.log(`  - ${violation.characterName}: ${violation.violatedFact}`);
              }
            } else if (validation.violations.length > 0) {
              progress.log(`✓ 节拍 ${i + 1} 知识验证通过 (${validation.violations.length} 个轻微问题)`);
            }

            // 提取并更新知识
            this.knowledgeValidator.extractAndUpdateKnowledge(cleanProse, beat, config.chapterNumber);
          }

          // 更新健康监控器
          if (this.healthMonitor && step.beat) {
            const beat = step.beat as Beat;
            this.healthMonitor.addBeat({
              type: beat.type,
              tensionLevel: beat.tensionLevel,
              wordCount: beatWordCount,
              hasDialogue: beat.type === "dialogue" || cleanProse.includes("：") || cleanProse.includes(":"),
              hasAction: beat.type === "action",
              characterCount: beat.dna.who.length,
            });

            // 每 3 个 beat 生成一次健康报告
            if ((i + 1) % 3 === 0) {
              const healthReport = this.healthMonitor.generateReport();
              if (healthReport.overallStatus !== "healthy") {
                progress.log(`健康度：${healthReport.overallStatus}，${healthReport.warnings.length} 个警告`);
                for (const suggestion of healthReport.suggestions.slice(0, 2)) {
                  progress.log(`建议：${suggestion}`);
                }
              }
            }
          }
        } else {
          progress.log(`节拍 ${i + 1} 跳过：无有效内容`);
        }

        if (step.events.length > 0) {
          result.events.push(...step.events);
        }

        if (step.auditResult) {
          result.auditSummary.totalIssues += step.auditResult.issues.length;
          result.auditSummary.errorCount += step.auditResult.issues.filter((issue: any) => issue.severity === "error").length;
          result.auditSummary.warningCount += step.auditResult.issues.filter((issue: any) => issue.severity === "warning").length;
        }

        if (this.shouldExitScene(result.beats, currentWordCount, config.targetWordRange[0])) {
          progress.log("scene exit 条件已满足，结束本章 adaptation 生成");
          break;
        }
      }

      progress.cleanup();
      this.currentProgress = null;

      result.wordCount = currentWordCount;
      result.beatCount = result.beats.length;

      // 并行生成章节标题、摘要和代谢报告
      const chapterContent = result.beats.map((step) => step.selectedProse).filter(Boolean).join("\n\n");
      const [generatedTitle, chapterSummary, metabolismReport] = await Promise.all([
        // 生成章节标题
        this.generateChapterTitle(
          config.chapterNumber,
          chapterContent,
          this.currentSnapshot?.chronicles.summaries.map((s) => s.title) ?? [],
        ),

        // 构建章节摘要
        Promise.resolve(this.buildChapterSummary(config.chapterNumber, result.beats, currentWordCount)),

        // 代谢分析
        Promise.resolve(this.metabolism.analyzeChapter(
          config.chapterNumber,
          result.beats.map((step) => step.beatType),
          currentWordCount,
          result.beats.map((step) => (step.beat as Beat | undefined)?.tensionLevel ?? config.startTension),
          result.beats.flatMap((step) => ((step.beat as Beat | undefined)?.dna.who ?? []).map((character) => character.id)),
        )),
      ]);

      result.generatedTitle = generatedTitle;
      result.chapterSummary = chapterSummary;
      result.metabolismReport = metabolismReport;

      if (this.currentSnapshot) {
        this.currentSnapshot.chronicles.summaries = [
          ...this.currentSnapshot.chronicles.summaries.filter((summary) => summary.chapter !== config.chapterNumber),
          result.chapterSummary as ChapterSummary,
        ].sort((left, right) => left.chapter - right.chapter);
        result.compiledState = new StateCompiler().compile(
          this.currentSnapshot.entities,
          this.currentSnapshot.ledger,
          this.currentSnapshot.chronicles.summaries,
        );
      }

      this.rebuildCuriosityLedger();
      // 并行执行章节后处理分析
      const [curiosityCheck, driftReport, emotionalDebtAnalysis, unconsciousAnalysis, timelineAnalysis] = await Promise.all([
        // Curiosity Check
        Promise.resolve(this.curiosityLedger.checkCuriosities(config.chapterNumber)),

        // Drift Report
        Promise.resolve(this.buildDriftReport(config.chapterNumber, result.chapterSummary as ChapterSummary)),

        // Emotional Debt Analysis
        Promise.resolve().then(() => {
          const analysis: Record<string, DebtAnalysisResult> = {};
          if (this.currentSnapshot) {
            for (const character of this.currentSnapshot.entities.characters) {
              const charAnalysis = this.emotionalDebtManager.analyzeCharacterDebts(character.id);
              if (charAnalysis.urgentDebts.length > 0 || Math.abs(charAnalysis.netBalance) > 0.5) {
                analysis[character.id] = charAnalysis;
              }
            }
            this.emotionalDebtManager.processChapterAdvancement(config.chapterNumber);
          }
          return analysis;
        }),

        // Unconscious Content Analysis
        Promise.resolve().then(() => {
          const analysis: Record<string, UnconsciousAnalysis> = {};
          if (this.currentSnapshot) {
            for (const character of this.currentSnapshot.entities.characters) {
              const charAnalysis = this.characterUnconscious.analyzeCharacter(character.id);
              if (charAnalysis.activeContents.length > 0) {
                analysis[character.id] = charAnalysis;
              }
            }
            this.characterUnconscious.processChapterAdvancement(config.chapterNumber);
          }
          return analysis;
        }),

        // Timeline Analysis
        Promise.resolve().then(() => {
          if (this.currentSnapshot) {
            for (const step of result.beats) {
              if (step.beat) {
                const beat = step.beat as Beat;
                this.timelineExplorer.addEvent({
                  timestamp: Date.now(),
                  chapter: config.chapterNumber,
                  description: step.selectedProse?.slice(0, 100) ?? "",
                  characters: beat.dna.who.map(c => c.id),
                  location: beat.dna.where,
                  eventType: step.beatType as any,
                  significance: beat.tensionLevel,
                  relatedEvents: [],
                  isFlashback: false,
                  isFlashforward: false,
                });
              }
            }
            return this.timelineExplorer.analyzeTimeline();
          }
          return undefined;
        }),
      ]);

      result.curiosityCheck = curiosityCheck;
      result.driftReport = driftReport;
      result.emotionalDebtAnalysis = emotionalDebtAnalysis;
      result.unconsciousAnalysis = unconsciousAnalysis;
      result.timelineAnalysis = timelineAnalysis;

      // Voice Fingerprint Extraction (first chapter only)
      if (config.chapterNumber === 1 && !this.voiceFingerprintAnalyzer) {
        const chapterContent = result.beats.map(s => s.selectedProse).filter(Boolean).join("\n\n");
        this.voiceFingerprintAnalyzer = createVoiceFingerprintAnalyzer();
        this.voiceFingerprintAnalyzer.extractFingerprint(
          chapterContent,
          "reference",
          "reference_text",
        );
      }

      // Subtext Summary
      const activeSubtexts = this.subtextEngine.getActiveEntries();
      result.subtextSummary = {
        totalEntries: activeSubtexts.length,
        byLayer: {
          literal: activeSubtexts.filter(e => e.layer === "literal").length,
          implied: activeSubtexts.filter(e => e.layer === "implied").length,
          unconscious: activeSubtexts.filter(e => e.layer === "unconscious").length,
        },
      };

      // Voice Consistency Summary
      const voiceChecks = result.beats
        .map(b => b.voiceCheck)
        .filter((v): v is VoiceComparisonResult => Boolean(v));
      if (voiceChecks.length > 0) {
        result.voiceConsistency = {
          averageSimilarity: voiceChecks.reduce((sum, v) => sum + v.similarity, 0) / voiceChecks.length,
          inconsistentBeats: voiceChecks.filter(v => !v.isConsistent).length,
        };
      }

      // Dialogue Issues Summary
      result.dialogueIssues = result.beats
        .map((b, i) => ({ beatIndex: i, validation: b.dialogueValidation }))
        .filter(({ validation }) => validation && !validation.isValid)
        .map(({ beatIndex, validation }) => ({
          beatIndex,
          violations: validation!.violations,
        }));

      result.motifsReferenced = this.motifSystem.getTopMotifs(20);

      // 风格一致性检查
      await this.checkStyleConsistency(result.prose, config.chapterNumber);

      // 并行保存所有状态
      const lastBeat = result.beats[result.beats.length - 1]?.beat as Beat | undefined;
      await Promise.all([
        // 保存知识追踪状态
        this.knowledgeValidator
          ? this.knowledgeTracker.save().then(() => progress.log("✓ 知识追踪状态已保存"))
          : Promise.resolve(),

        // 保存 Motif 索引
        this.saveMotifIndex(),

        // 保存状态差异
        this.hooks.saveStateDiff({
          chapter: config.chapterNumber,
          beatId: lastBeat?.id,
          events: result.events,
        }),

        // 保存状态
        this.hooks.saveState(),
      ]);

      result.completed = true;
    } catch (error) {
      this.currentProgress = null;
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
    chapterNumber: number;
    governedIntent?: ChapterIntent;
    contextPackage?: ContextPackage;
    ruleStack?: RuleStack;
  }): Promise<BeatGenerationStep> {
    if (!this.workflow || !this.currentSnapshot) {
      throw new Error("Adaptation workflow not initialized.");
    }

    const governedDirectives = this.buildGovernedDirectives(
      params.governedIntent,
      params.contextPackage,
      params.ruleStack,
    );
    const plannedMotif = this.selectPlannedMotif(params.lastBeatSummary);
    const preGen = await this.hooks.preGenerationBeat({
      beatType: params.beatType,
      tensionLevel: params.tensionLevel,
      focusCharacterIds: params.focusCharacterIds,
      primaryLocationId: params.primaryLocationId,
      hooksToAdvance: params.hooksToAdvance,
      lastBeatSummary: params.lastBeatSummary,
      chapterNumber: params.chapterNumber,
      motifIndexer: this.motifSystem,
      plannedMotif,
      maxTokens: Math.ceil(getTargetWordRange(params.beatType)[1] * 1.7) + 50,
      additionalMustInclude: governedDirectives.additionalMustInclude,
      additionalMustNotInclude: governedDirectives.additionalMustNotInclude,
      styleGuideOverride: governedDirectives.styleGuideOverride,
    });

    const beat = createBeat({
      chapterNumber: params.chapterNumber,
      sequenceInChapter: params.beatIndex,
      type: params.beatType,
      tensionLevel: params.tensionLevel,
      targetWords: getTargetWordRange(params.beatType),
      dna: preGen.dna,
      kineticScaffold: preGen.kineticScaffold
        ? createKineticScaffold(preGen.kineticScaffold, "chapter pipeline workflow")
        : undefined,
    });

    const context: PipelineContext = {
      chapterNumber: params.chapterNumber,
      sceneId: `scene-${params.chapterNumber}-1`,
      currentBeatIndex: params.beatIndex,
      maxBeatsPerScene: 20,
      currentState: this.currentSnapshot,
      generatedBeats: [],
      chapterSummaries: this.currentSnapshot.chronicles.summaries,
      characterBoundaries: this.buildKnowledgeBoundaries(params.focusCharacterIds, preGen.dna),
    };

    this.lastSelection = null;
    const processed = await this.workflow.processBeat(beat, context);
    const selectionCandidates = this.getLastSelectionCandidates();

    if (!processed) {
      return BeatGenerationStepSchema.parse({
        beatIndex: params.beatIndex,
        beatType: params.beatType,
        beat,
        dna: preGen.dna,
        kineticScaffold: preGen.kineticScaffold,
        candidates: selectionCandidates,
        events: [],
        retryCount: 1,
      });
    }

    if (processed.adversarialResult) {
      const rounds = processed.adversarialResult.totalRounds ?? 0;
      console.log(`  [monarch] 对抗精炼：${rounds} 轮`);
    }
    if (processed.readerResult) {
      const approved = processed.readerResult.responses.filter((r: any) => r.answer).length;
      console.log(`  [monarch] 读者模拟：${approved}/3 通过`);
    }
    if (processed.knowledgeResult && processed.knowledgeResult.hasBreach) {
      console.log(`  [monarch] 知识边界：检测到越界`);
    }

    // Subtext Analysis (for dialogue beats)
    let subtextAnalysis: SubtextAnalysisResult | undefined;
    if (params.beatType === "dialogue" && processed.prose) {
      subtextAnalysis = this.subtextEngine.analyzeText(
        processed.prose,
        params.focusCharacterIds[0],
      );

      for (const entry of subtextAnalysis.subtextEntries) {
        this.subtextEngine.plantSubtext(
          entry.layer,
          entry.surfaceText,
          entry.subtextMeaning,
          entry.characterId,
          params.chapterNumber,
        );
      }

      if (subtextAnalysis.subtextEntries.length > 0) {
        console.log(`  [monarch] 潜台词：${subtextAnalysis.subtextEntries.length} 个条目`);
      }
    }

    // Voice Consistency Check
    let voiceCheck: VoiceComparisonResult | undefined;
    if (this.voiceFingerprintAnalyzer && processed.prose) {
      voiceCheck = this.voiceFingerprintAnalyzer.compareWithFingerprint(
        processed.prose,
        "reference",
      );

      if (!voiceCheck.isConsistent) {
        console.log(`  [monarch] 声音指纹：相似度 ${(voiceCheck.similarity * 100).toFixed(1)}%`);
      }
    }

    // Dialogue Arena Validation (for dialogue beats)
    let dialogueValidation: DialogueValidationResult | undefined;
    if (params.beatType === "dialogue" && processed.prose && this.currentSnapshot) {
      const arena = this.getDialogueArena();
      const participants = params.focusCharacterIds.map(id => {
        const char = this.currentSnapshot!.entities.characters.find(c => c.id === id);
        return {
          characterId: id,
          name: char?.name ?? id,
          knowledgeBoundary: {
            characterId: id,
            knows: char?.knowledge ?? [],
            suspects: [],
            doesNotKnow: char?.doesNotKnow ?? [],
          },
          emotionalState: {},
          goals: [],
          secrets: [],
        };
      });

      const scene = arena.createScene(
        params.primaryLocationId || "unknown",
        participants,
      );

      const lines = processed.prose.split(/\n/).filter(l => l.trim());
      for (const line of lines) {
        const match = line.match(/^(.+?)[:：](.+)$/);
        if (match) {
          const speaker = match[1]!.trim();
          const text = match[2]!.trim();
          const speakerId = participants.find(p => p.name === speaker)?.characterId;
          if (speakerId) {
            arena.addLine(speakerId, text);
          }
        }
      }

      dialogueValidation = arena.validateDialogue();

      if (dialogueValidation && !dialogueValidation.isValid) {
        console.log(`  [monarch] 对话验证：${dialogueValidation.violations.length} 个违规`);
      }
    }

    if (processed.events.length > 0) {
      const updated = this.hooks.applyEvents(processed.events, params.chapterNumber);
      if (updated) {
        this.currentSnapshot = updated;
      }
    }

    this.lastWorkflowContext = context;

    return BeatGenerationStepSchema.parse({
      beatIndex: params.beatIndex,
      beatType: params.beatType,
      beat: processed.beat,
      dna: processed.beat.dna,
      kineticScaffold: preGen.kineticScaffold,
      candidates: selectionCandidates,
      selectedProse: processed.prose,
      auditResult: processed.auditResult,
      adversarialResult: processed.adversarialResult,
      readerResult: processed.readerResult,
      knowledgeResult: processed.knowledgeResult,
      subtextAnalysis,
      voiceCheck,
      dialogueValidation,
      events: processed.events,
      retryCount: processed.beat.retryCount,
    });
  }

  private createWorkflow(): AdaptationPipelineOrchestrator {
    return new AdaptationPipelineOrchestrator({
      planner: {
        createBeatPlan: async () => {
          throw new Error("ChapterPipelineAdapter does not use orchestrator-level chapter planning.");
        },
        getNextBeat: () => {
          throw new Error("ChapterPipelineAdapter supplies beats directly.");
        },
      },
      generator: {
        generateBeat: async (beat: Beat, dna: NarrativeDNA) => {
          const request: BeatGenerationRequest = {
            beatId: beat.id,
            chapterNumber: beat.chapterNumber,
            beatType: beat.type,
            tensionLevel: beat.tensionLevel,
            dna,
            kineticScaffold: beat.kineticScaffold?.openingWords,
            bannedWords: dna.mustNotInclude,
          };

          this.lastSelection = await this.orchestrator.executeSpeculativeCalls(request, this.hooks, this.currentProgress ?? undefined);
          if (!this.lastSelection.selectedProse) {
            throw new Error(`No speculative candidate selected for beat ${beat.id}`);
          }

          return this.lastSelection.selectedProse;
        },
      },
      adversarialRefiner: {
        refine: async (prose: string, dna: NarrativeDNA, beat: Beat) =>
          this.getAdversarialRefiner().refine(prose, dna, beat),
      },
      readerSimulator: {
        simulate: async (prose: string, dna: NarrativeDNA, beat: Beat) =>
          this.getReaderSimulator().simulateParallel(prose, dna, beat),
      },
      knowledgeChecker: {
        checkBoundary: (dialogue: string, boundary: KnowledgeBoundary, others: KnowledgeBoundary[]) =>
          this.knowledgeChecker.checkBoundary(dialogue, boundary, others),
      },
      auditor: {
        audit: async (
          prose: string,
          dna: NarrativeDNA,
          options?: { chapterNumber?: number },
        ) => this.hooks.getCascadeAuditor().audit(prose, dna, options),
      },
      stateManager: {
        applyEvents: (snapshot: EntityStateSnapshot, events: StateEvent[], chapter: number) => {
          const updated = this.hooks.applyEvents(events, chapter);
          return updated ?? snapshot;
        },
        extractEvents: (prose: string, beat: Beat) => this.hooks.extractEventsFromProse(prose, beat.type),
      },
      exitEvaluator: {
        evaluate: (exitContext) => this.sceneExitEvaluator.evaluate(exitContext),
      },
      metabolism: {
        analyzeChapter: (chapter, beatTypes, wordCount, tensions, characters) =>
          this.metabolism.analyzeChapter(chapter, beatTypes, wordCount, tensions, characters),
      },
      curiosityLedger: {
        checkCuriosities: (chapter) => this.curiosityLedger.checkCuriosities(chapter),
        updateStaleness: (chapter) => this.curiosityLedger.updateStaleness(chapter),
      },
      driftDetector: {
        detectDrift: (recent, baseline) => this.driftDetector.detectDrift(recent, baseline),
      },
    }, {
      maxRetriesPerBeat: this.maxRetriesPerBeat,
    });
  }

  private getReaderSimulator(): ReaderSimulator {
    if (this.readerSimulator) {
      return this.readerSimulator;
    }
    if (!this.llmInterface) {
      throw new Error("LLM interface not configured for reader simulation.");
    }

    this.readerSimulator = new ReaderSimulator({
      simulateReader: async (prose, persona, dna, beat): Promise<ReaderResponse> => {
        const response = await this.llmInterface!.callLLM(
          buildReaderPrompt(prose, persona, dna, beat),
          "You are a strict evaluation agent. Return a single JSON object only.",
          {
            maxTokens: 120,
            stopSequences: ["\n\n", "###"],
            responseFormat: "json",
            jsonSchema: READER_RESPONSE_JSON_SCHEMA,
            temperature: 0.2,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
        );

        const parsed = parseJsonObject<Partial<ReaderResponse>>(response);
        return {
          personaId: persona.id,
          answer: Boolean(parsed?.answer),
          confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0.5,
          reason: typeof parsed?.reason === "string" ? parsed.reason : undefined,
        };
      },
    });

    return this.readerSimulator;
  }

  private getAdversarialRefiner(): AdversarialRefiner {
    if (this.adversarialRefiner) {
      return this.adversarialRefiner;
    }
    if (!this.llmInterface) {
      throw new Error("LLM interface not configured for adversarial refinement.");
    }

    this.adversarialRefiner = new AdversarialRefiner({
      generateAttackerCritique: async (prose, dna, beat): Promise<AttackerFinding | null> => {
        const response = await this.llmInterface!.callLLM(
          [
            "Return one JSON object only. If there is no important problem, return {}.",
            `Beat Type: ${beat.type}`,
            `Location: ${dna.where || "none"}`,
            `Must Include: ${dna.mustInclude.join(", ") || "none"}`,
            `Must Not Include: ${dna.mustNotInclude.join(", ") || "none"}`,
            "",
            prose,
          ].join("\n"),
          "You are the attacker role. Find exactly one important problem in the prose. If there is no important problem, return an empty JSON object.",
          {
            maxTokens: 160,
            stopSequences: ["\n\n", "###"],
            responseFormat: "json",
            jsonSchema: ATTACKER_FINDING_JSON_SCHEMA,
            temperature: 0.3,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
        );

        const trimmed = response.trim().toLowerCase();
        if (trimmed === "null") {
          return null;
        }

        const parsed = parseJsonObject<Partial<AttackerFinding>>(response);
        if (!parsed?.problem) {
          return null;
        }

        return {
          problem: parsed.problem,
          location: typeof parsed.location === "string" ? parsed.location : undefined,
          severity: parsed.severity === "critical" || parsed.severity === "major" ? parsed.severity : "minor",
          evidence: typeof parsed.evidence === "string" ? parsed.evidence : undefined,
        };
      },
      generateRefereeVerdict: async (prose, finding, dna): Promise<RefereeVerdict> => {
        const response = await this.llmInterface!.callLLM(
          [
            "Return one JSON object only.",
            `Problem: ${finding.problem}`,
            `Severity: ${finding.severity}`,
            `Evidence: ${finding.evidence ?? "none"}`,
            `Location: ${finding.location ?? "none"}`,
            `DNA mustInclude: ${dna.mustInclude.join(", ") || "none"}`,
            "",
            prose,
          ].join("\n"),
          "You are the referee role. Decide whether the finding is valid, whether the prose is already fixed, and whether a new problem was introduced.",
          {
            maxTokens: 120,
            stopSequences: ["\n\n", "###"],
            responseFormat: "json",
            jsonSchema: REFEREE_VERDICT_JSON_SCHEMA,
            temperature: 0.1,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
        );

        const parsed = parseJsonObject<Partial<RefereeVerdict>>(response);
        return {
          problemValid: Boolean(parsed?.problemValid),
          fixed: Boolean(parsed?.fixed),
          introducedNewProblem: Boolean(parsed?.introducedNewProblem),
          confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0.5,
          note: typeof parsed?.note === "string" ? parsed.note : undefined,
        };
      },
      generateWriterRevision: async (prose, finding, dna, beat): Promise<string> => {
        const response = await this.llmInterface!.callLLM(
          [
            `Beat Type: ${beat.type}`,
            `Location: ${dna.where || "none"}`,
            `Must Include: ${dna.mustInclude.join(", ") || "none"}`,
            `Must Not Include: ${dna.mustNotInclude.join(", ") || "none"}`,
            `Fix this problem: ${finding.problem}`,
            `Evidence: ${finding.evidence ?? "none"}`,
            "",
            prose,
          ].join("\n"),
          "You are the writer role. Rewrite the whole beat to fix the problem while preserving continuity. Return prose only.",
          {
            maxTokens: Math.ceil(beat.targetWords[1] * 1.7) + 50,
            stopSequences: ["\n\n", "###"],
            responseFormat: "text",
            temperature: 0.65,
            topP: 0.9,
            frequencyPenalty: 0.2,
            presencePenalty: 0.1,
          },
        );

        return stripThinkingTags(response).trim();
      },
    });

    return this.adversarialRefiner;
  }

  private getDialogueArena(): DialogueArena {
    if (!this.dialogueArena) {
      this.dialogueArena = createDialogueArena({
        maxLines: 50,
        enableKnowledgeCheck: true,
        enableEmotionalTracking: true,
        strictMode: true,
      });
    }
    return this.dialogueArena;
  }

  private buildKnowledgeBoundaries(focusCharacterIds: string[], dna: NarrativeDNA): KnowledgeBoundary[] {
    if (!this.currentSnapshot) {
      return [];
    }

    const candidateIds = focusCharacterIds.length > 0
      ? focusCharacterIds
      : dna.who.map((character) => character.id);

    return candidateIds
      .map((characterId) => {
        const character = this.currentSnapshot!.entities.characters.find((entry) => entry.id === characterId);
        const matrix = this.currentSnapshot!.ledger.characterKnowledgeMatrix.find((entry) => entry.characterId === characterId);
        if (!character && !matrix) {
          return null;
        }

        return {
          characterId,
          knows: [...new Set([...(character?.knowledge ?? []), ...(matrix?.knows ?? [])])],
          suspects: matrix?.misconceptions ?? [],
          doesNotKnow: [...new Set([...(character?.doesNotKnow ?? []), ...(matrix?.doesNotKnow ?? [])])],
        };
      })
      .filter((boundary): boundary is KnowledgeBoundary => Boolean(boundary));
  }

  private rebuildCuriosityLedger(): void {
    if (!this.currentSnapshot) {
      this.curiosityLedger = createCuriosityLedgerManager();
      return;
    }

    const manager = createCuriosityLedgerManager();
    for (const hook of this.currentSnapshot.ledger.hooks) {
      if (hook.status === "resolved" || hook.status === "abandoned") {
        continue;
      }
      manager.addEntry({
        id: hook.id,
        question: hook.description,
        plantedChapter: hook.originChapter,
        relatedCharacters: [],
        relatedSubplots: [],
        priority: hook.urgency === "critical" ? 9 : hook.urgency === "overdue" ? 7 : 5,
        isMandatory: hook.urgency === "critical",
        humanOverride: false,
      });
      manager.referenceEntry(hook.id, hook.lastReferencedChapter);
    }

    this.curiosityLedger = manager;
  }

  private buildDriftReport(chapterNumber: number, chapterSummary: ChapterSummary): DriftReport | undefined {
    if (!this.currentSnapshot) {
      return undefined;
    }

    const allSummaries = [
      ...this.currentSnapshot.chronicles.summaries.filter((summary) => summary.chapter !== chapterNumber),
      chapterSummary,
    ].sort((left, right) => left.chapter - right.chapter);

    if (allSummaries.length < 6) {
      return undefined;
    }

    const recent = allSummaries.slice(-5);
    const baseline = allSummaries.slice(0, -5);
    return this.driftDetector.detectDrift(recent, baseline) ?? undefined;
  }

  private updateMotifsFromBeat(step: BeatGenerationStep, chapterNumber: number): void {
    if (!step.selectedProse || !step.beat) {
      return;
    }

    const motifs = this.motifSystem.scanMotifs(step.selectedProse);
    if (motifs.length === 0) {
      return;
    }

    const beat = step.beat as Beat;
    const primaryEmotion = beat.dna.who[0]?.emotionalState ?? "neutral";
    const valence = beat.tensionLevel >= 6 ? -0.4 : 0.4;

    for (const motif of motifs) {
      this.motifSystem.getStaticIndexer().updateMotifHistory(
        motif,
        chapterNumber,
        beat.id,
        { primary: primaryEmotion, valence },
        beat.dna.who[0]?.id,
      );
    }
  }

  private selectPlannedMotif(lastBeatSummary: string): string | undefined {
    const motifs = this.motifSystem.scanMotifs(lastBeatSummary);
    return motifs[0];
  }

  private shouldExitScene(steps: BeatGenerationStep[], currentWordCount: number, targetMinWords: number): boolean {
    if (!this.currentSnapshot || steps.length < 3) {
      return false;
    }

    const beats = steps
      .map((step) => step.beat as Beat | undefined)
      .filter((beat): beat is Beat => Boolean(beat));
    if (beats.length < 3) {
      return false;
    }

    const first = beats[0]!;
    const last = beats[beats.length - 1]!;
    const evaluation = this.sceneExitEvaluator.evaluate({
      beats,
      currentTension: last.tensionLevel,
      initialTension: first.tensionLevel,
      currentLocation: last.dna.where,
      initialLocation: first.dna.where,
      currentTime: new Date(),
      initialTime: new Date(),
      stateSnapshot: this.currentSnapshot,
      mandatoryHooks: last.dna.hookContext,
      charactersPresent: last.dna.who.map((character) => character.id),
      initialCharacters: first.dna.who.map((character) => character.id),
    });

    const ratio = targetMinWords <= 2000 ? 0.8 : 0.7;
    const minThreshold = Math.max(400, targetMinWords * ratio);
    return evaluation.shouldExit && currentWordCount >= minThreshold;
  }

  private async generateChapterTitle(
    chapterNumber: number,
    chapterContent: string,
    existingTitles: string[],
  ): Promise<string> {
    if (!this.llmInterface) {
      return `第${chapterNumber}章`;
    }

    const contentPreview = chapterContent.slice(0, 1500);
    const recentTitles = existingTitles.slice(-10).join("、");

    const prompt = [
      `请为第${chapterNumber}章生成一个简短的章节标题（3-8个字）。`,
      ``,
      `要求：`,
      `1. 标题要体现本章的核心事件或转折点`,
      `2. 不要包含"第X章"字样`,
      `3. 避免与已有标题重复或相似`,
      `4. 避免使用高频词汇和意象`,
      ``,
      recentTitles ? `最近章节标题：${recentTitles}` : "",
      ``,
      `章节内容预览：`,
      contentPreview,
      ``,
      `只输出标题文字，不要其他内容。`,
    ].filter(Boolean).join("\n");

    try {
      const response = await this.llmInterface.callLLM(
        prompt,
        "你是小说章节标题生成助手。根据章节内容生成简短、准确、不重复的标题。",
        {
          maxTokens: 30,
          stopSequences: ["\n", "。", "，"],
          responseFormat: "text",
          temperature: 0.7,
          topP: 0.9,
          frequencyPenalty: 0.5,
          presencePenalty: 0.3,
        },
      );

      const title = response.trim().replace(/^["'《]|["'》]$/g, "");
      return title.length > 0 && title.length <= 20 ? title : `第${chapterNumber}章`;
    } catch (error) {
      console.warn(`[monarch] 标题生成失败，使用默认标题: ${error}`);
      return `第${chapterNumber}章`;
    }
  }

  private buildChapterSummary(chapterNumber: number, steps: BeatGenerationStep[], wordCount: number): ChapterSummary {
    const keyEvents = steps
      .map((step) => step.selectedProse?.split(/[。.!?]/)[0]?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, 6);

    const characterAppearances = [
      ...new Set(
        steps.flatMap((step) =>
          ((step.beat as Beat | undefined)?.dna.who ?? []).map((character) => character.name),
        ),
      ),
    ];
    const locationChanges = [
      ...new Set(
        steps
          .map((step) => (step.beat as Beat | undefined)?.dna.where)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    return {
      chapter: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      wordCount,
      summary: keyEvents.join(" / ").slice(0, 500),
      keyEvents,
      characterAppearances,
      locationChanges,
      stateChanges: steps.flatMap((step) => step.events.map((event) => event.action)),
      hooksOpened: steps.flatMap((step) =>
        step.events.filter((event) => event.action === "OPEN_HOOK").map((event) => ("id" in event ? event.id : "")),
      ).filter(Boolean),
      hooksResolved: steps.flatMap((step) =>
        step.events.filter((event) => event.action === "CLOSE_HOOK").map((event) => ("id" in event ? event.id : "")),
      ).filter(Boolean),
      mood: this.inferMood(steps),
      pacing: wordCount > 1800 ? "fast" : wordCount < 900 ? "slow" : "medium",
    };
  }

  private inferMood(steps: BeatGenerationStep[]): string {
    const avgTension = steps.reduce((sum, step) => sum + (((step.beat as Beat | undefined)?.tensionLevel) ?? 5), 0) /
      Math.max(1, steps.length);

    if (avgTension >= 8) return "oppressive";
    if (avgTension >= 6) return "tense";
    if (avgTension <= 3) return "quiet";
    return "balanced";
  }

  /**
   * 使用 Hook 优先级调整器
   */
  private prioritizeHooks(config: ChapterGenerationConfig): PrioritizedHook[] {
    if (!this.currentSnapshot) {
      return [];
    }

    const hooks: HookMetadata[] = this.currentSnapshot.ledger.hooks.map(hook => ({
      id: hook.id,
      originChapter: hook.originChapter,
      lastReferencedChapter: hook.lastReferencedChapter,
      status: hook.status as "open" | "progressing" | "resolved" | "abandoned" | "deferred",
      urgency: hook.urgency,
      description: hook.description,
      type: hook.type,
      relatedCharacters: [],
      tags: [],
      plannedResolutionChapter: (hook as any).plannedResolutionChapter,
      isLongTerm: (hook as any).isLongTerm || false,
    }));

    const targetChapters = 100; // 可以从配置中读取
    const prioritized = this.hookPrioritizer.prioritizeHooks(hooks, config.chapterNumber);

    // 获取应该在当前章节推进的 hooks
    const forThisChapter = this.hookPrioritizer.getHooksForChapter(
      hooks,
      config.chapterNumber,
      3
    );

    return forThisChapter;
  }

  /**
   * 使用 Beat 类型推荐器规划 beats
   */
  private planBeatsWithRecommender(
    config: ChapterGenerationConfig,
    prioritizedHooks: PrioritizedHook[]
  ): BeatType[] {
    const types: BeatType[] = [];
    const avgWordsPerBeat = 100;
    const estimatedBeats = Math.ceil(config.targetWordRange[1] / avgWordsPerBeat);
    const beatCount = Math.max(config.minBeats, Math.min(estimatedBeats, config.maxBeats));

    const hooks: HookMetadata[] = prioritizedHooks.map(ph => ph.hook);

    for (let i = 0; i < beatCount; i += 1) {
      const progress = i / Math.max(1, beatCount);
      const currentTension = this.calculateTension(i, beatCount, config.startTension, config.endTension);

      // 构建 beat 历史
      const beatHistory: BeatHistoryEntry[] = types.map((type, index) => ({
        type,
        tensionLevel: this.calculateTension(index, beatCount, config.startTension, config.endTension),
        wordCount: 100,
        hasDialogue: type === "dialogue",
        hasAction: type === "action",
      }));

      // 使用推荐器
      const recommendation = this.beatTypeRecommender.recommendNextBeat(
        beatHistory,
        currentTension,
        hooks,
        progress
      );

      types.push(recommendation.type as BeatType);
    }

    return this.enforceRhythm(types);
  }

  /**
   * 风格一致性检查
   */
  private async checkStyleConsistency(
    newChapterContent: string,
    chapterNumber: number
  ): Promise<void> {
    try {
      // 如果是第一章，建立风格档案
      if (chapterNumber === 1) {
        this.styleChecker.buildProfile([newChapterContent]);
        console.log("[monarch] 风格档案已建立");
        return;
      }

      // 加载之前的章节建立风格档案
      if (chapterNumber === 2) {
        const previousChapters: string[] = [];
        const chaptersDir = join(this.bookDir, "chapters");

        try {
          const { readdir } = await import("node:fs/promises");
          const files = await readdir(chaptersDir);

          for (let i = 1; i < chapterNumber; i++) {
            const paddedNum = String(i).padStart(4, "0");
            const chapterFile = files.find(f => f.startsWith(paddedNum) && f.endsWith(".md"));

            if (chapterFile) {
              const content = await readFile(join(chaptersDir, chapterFile), "utf-8");
              previousChapters.push(content);
            }
          }

          if (previousChapters.length > 0) {
            this.styleChecker.buildProfile(previousChapters);
            console.log(`[monarch] 风格档案已建立（基于 ${previousChapters.length} 章）`);
          }
        } catch (error) {
          console.warn("[monarch] 无法加载之前章节，跳过风格档案建立");
          return;
        }
      }

      // 检查风格一致性
      const profile = this.styleChecker.getProfile();
      if (!profile) {
        return;
      }

      const result = this.styleChecker.checkConsistency(newChapterContent);

      if (!result.isConsistent) {
        console.log(`[monarch] 风格一致性：${result.overallScore}/100`);

        for (const deviation of result.deviations.slice(0, 3)) {
          console.log(`  - ${deviation.dimension}: ${deviation.message} (${deviation.severity})`);
        }

        if (result.suggestions.length > 0) {
          console.log(`[monarch] 建议：`);
          for (const suggestion of result.suggestions.slice(0, 2)) {
            console.log(`  - ${suggestion}`);
          }
        }
      } else {
        console.log(`[monarch] 风格一致性检查通过（${result.overallScore}/100）`);
      }
    } catch (error) {
      console.warn("[monarch] 风格一致性检查失败:", error);
    }
  }

  private async loadMotifIndex(): Promise<void> {
    // HybridMotifSystem 自己管理持久化，不需要手动加载
  }

  private async saveMotifIndex(): Promise<void> {
    // HybridMotifSystem 自己管理持久化，不需要手动保存
  }

  private getMotifIndexPath(): string {
    return join(this.bookDir, "story", "db", "motif_index.json");
  }

  private planBeats(config: ChapterGenerationConfig): BeatType[] {
    const types: BeatType[] = [];
    const avgWordsPerBeat = 100;
    const estimatedBeats = Math.ceil(config.targetWordRange[1] / avgWordsPerBeat);
    const beatCount = Math.max(config.minBeats, Math.min(estimatedBeats, config.maxBeats));
    const configuredBeatTypes = config.beatTypes
      .filter((type): type is BeatType => VALID_BEAT_TYPES.has(type as BeatType));

    for (let i = 0; i < beatCount; i += 1) {
      const position = i / Math.max(1, beatCount);
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

      if (configuredBeatTypes.length > 0) {
        const constrained = configuredBeatTypes.includes(preferredType)
          ? preferredType
          : this.selectFrom(configuredBeatTypes);
        types.push(constrained);
      } else {
        types.push(preferredType);
      }
    }

    return this.enforceRhythm(types);
  }

  private buildGovernedDirectives(
    intent?: ChapterIntent,
    contextPackage?: ContextPackage,
    ruleStack?: RuleStack,
  ): {
    additionalMustInclude: string[];
    additionalMustNotInclude: string[];
    styleGuideOverride?: string;
  } {
    const additionalMustInclude: string[] = [];
    const additionalMustNotInclude: string[] = [];
    const styleGuideLines: string[] = [];

    if (intent) {
      // 明确的章节目标作为剧情推进指令
      additionalMustInclude.push(`本章目标: ${intent.goal}`);

      // 冲突推进指令
      if (intent.conflicts.length > 0) {
        const primaryConflict = intent.conflicts[0];
        if (primaryConflict) {
          additionalMustInclude.push(`推进冲突: ${primaryConflict.type} - ${primaryConflict.resolution}`);
        }
      }

      additionalMustInclude.push(...intent.mustKeep.slice(0, 1));
      additionalMustNotInclude.push(...intent.mustAvoid.slice(0, 4));

      if (intent.styleEmphasis.length > 0) {
        styleGuideLines.push(`风格重点: ${intent.styleEmphasis.join(" / ")}`);
      }
      if (intent.sceneDirective) {
        styleGuideLines.push(`场景指令: ${intent.sceneDirective}`);
      }
      if (intent.arcDirective) {
        styleGuideLines.push(`弧线指令: ${intent.arcDirective}`);
      }
      if (intent.moodDirective) {
        styleGuideLines.push(`情绪指令: ${intent.moodDirective}`);
      }
      if (intent.titleDirective) {
        styleGuideLines.push(`标题指令: ${intent.titleDirective}`);
      }
      if (intent.conflicts.length > 1) {
        styleGuideLines.push(
          `次要冲突: ${intent.conflicts.slice(1).map((conflict) => `${conflict.type}: ${conflict.resolution}`).join(" / ")}`,
        );
      }
    }

    if (ruleStack) {
      for (const hardRule of ruleStack.sections.hard) {
        const bannedMatch = hardRule.match(/^BANNED:\s*"(.+?)"/);
        if (bannedMatch?.[1]) {
          additionalMustNotInclude.push(bannedMatch[1]);
        }
      }
      if (ruleStack.sections.soft.length > 0) {
        styleGuideLines.push(`Soft constraints: ${ruleStack.sections.soft.slice(0, 4).join(" / ")}`);
      }
      if (ruleStack.sections.diagnostic.length > 0) {
        styleGuideLines.push(`Diagnostic checks: ${ruleStack.sections.diagnostic.slice(0, 4).join(" / ")}`);
      }
    }

    if (contextPackage && contextPackage.selectedContext.length > 0) {
      const contextLines = contextPackage.selectedContext
        .slice(0, 3)
        .map((entry) => `${entry.reason}: ${(entry.excerpt ?? entry.source).replace(/\s+/g, " ").slice(0, 120)}`);
      styleGuideLines.push(`Context anchors: ${contextLines.join(" / ")}`);
    }

    const styleGuideOverride = styleGuideLines.length > 0
      ? [...new Set(styleGuideLines)].join("\n")
      : undefined;

    return {
      additionalMustInclude: [...new Set(additionalMustInclude)].slice(0, 4),
      additionalMustNotInclude: [...new Set(additionalMustNotInclude)].slice(0, 8),
      styleGuideOverride,
    };
  }

  private adjustBeatType(plannedType: BeatType, steps: BeatGenerationStep[]): BeatType {
    if (steps.length < 2) {
      return plannedType;
    }

    const previous = steps[steps.length - 1]?.beat as Beat | undefined;
    const beforePrevious = steps[steps.length - 2]?.beat as Beat | undefined;
    const highestDebt = this.currentSnapshot?.entities.characters
      .flatMap((character) => character.emotionalDebts)
      .sort((left, right) => right.magnitude - left.magnitude)[0];

    if (plannedType !== "negative-space" &&
        previous?.tensionLevel && beforePrevious?.tensionLevel &&
        previous.tensionLevel >= 8 &&
        beforePrevious.tensionLevel >= 8 &&
        (highestDebt?.magnitude ?? 0) > 5) {
      return "negative-space";
    }

    const lastMetabolism = steps.length > 0
      ? this.metabolism.analyzeChapter(
          1,
          steps.map((step) => step.beatType),
          steps.reduce((sum, step) => sum + countTextLength(step.selectedProse ?? ""), 0),
          steps.map((step) => ((step.beat as Beat | undefined)?.tensionLevel) ?? 5),
          steps.flatMap((step) => ((step.beat as Beat | undefined)?.dna.who ?? []).map((character) => character.id)),
        )
      : null;

    return (lastMetabolism?.suggestedBeatType as BeatType | undefined) ?? plannedType;
  }

  private selectFrom(types: BeatType[]): BeatType {
    return types[Math.floor(Math.random() * types.length)]!;
  }

  private enforceRhythm(types: BeatType[]): BeatType[] {
    const result: BeatType[] = [];

    for (let i = 0; i < types.length; i += 1) {
      const current = types[i]!;
      const lastTwo = result.slice(-2);
      if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1] && lastTwo[1] === current) {
        result.push(this.selectFrom(["dialogue", "interiority", "environment", "transition"].filter((type) => type !== current) as BeatType[]));
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
    endTension: number,
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

  private getLastSelectionCandidates(): unknown[] {
    return this.lastSelection ? [...this.lastSelection.candidates] : [];
  }
}

function getTargetWordRange(beatType: BeatType): [number, number] {
  const ranges: Record<BeatType, [number, number]> = {
    action: [60, 120],
    dialogue: [80, 150],
    interiority: [50, 100],
    environment: [40, 80],
    transition: [30, 60],
    revelation: [70, 130],
    tension: [60, 110],
    resolution: [80, 140],
    "negative-space": [40, 60],
  };

  return ranges[beatType];
}

export function createChapterPipelineAdapter(
  bookDir: string,
  options?: { maxRetriesPerBeat?: number },
): ChapterPipelineAdapter {
  return new ChapterPipelineAdapter(bookDir, options);
}

export async function generateChapterWithAdaptation(
  bookDir: string,
  config: ChapterGenerationConfig,
): Promise<ChapterGenerationResult> {
  const adapter = new ChapterPipelineAdapter(bookDir, {
    maxRetriesPerBeat: config.maxRetriesPerBeat,
  });
  if (config.llmInterface) {
    adapter.setLLMInterface(config.llmInterface);
  }
  return adapter.generateChapter(config);
}
