import { z } from "zod";
import type { Beat, NarrativeDNA, BeatPlan } from "../beat/beat-types.js";
import type { EntityStateSnapshot, StateEvent, ChapterSummary } from "../types/state-types.js";
import type { AdversarialRefinementResult } from "../generation/adversarial-refiner.js";
import type { ReaderSimulationResult } from "../simulation/reader-simulator.js";
import type { AuditResult } from "../audit/cascade-auditor.js";
import type { KnowledgeBoundary, KnowledgeCheckResult } from "../character/knowledge-boundary.js";
import type { ExitEvaluationResult } from "../scene/exit-conditions.js";
import type { CuriosityCheckResult } from "../narrative/curiosity-ledger.js";
import type { MetabolismReport } from "../narrative/metabolism.js";
import type { DriftReport } from "../narrative/drift-detector.js";
import { degradeDNA, type DegradationLevel } from "../context/dna-compressor.js";

export const PipelineStageSchema = z.enum([
  "planning",
  "generation",
  "adversarial_refinement",
  "reader_simulation",
  "knowledge_check",
  "audit",
  "state_update",
  "exit_evaluation",
  "complete",
  "failed",
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const PipelineContextSchema = z.object({
  chapterNumber: z.number().int().min(1),
  sceneId: z.string().min(1),
  currentBeatIndex: z.number().int().min(0).default(0),
  maxBeatsPerScene: z.number().int().min(1).default(20),
  currentState: z.custom<EntityStateSnapshot>(),
  beatPlan: z.custom<BeatPlan>().optional(),
  generatedBeats: z.array(z.custom<Beat>()).default([]),
  chapterSummaries: z.array(z.custom<ChapterSummary>()).default([]),
  characterBoundaries: z.array(z.custom<KnowledgeBoundary>()).default([]),
});
export type PipelineContext = z.infer<typeof PipelineContextSchema>;

export const BeatProcessingResultSchema = z.object({
  beat: z.custom<Beat>(),
  stage: PipelineStageSchema,
  adversarialResult: z.custom<AdversarialRefinementResult>().optional(),
  readerResult: z.custom<ReaderSimulationResult>().optional(),
  knowledgeResult: z.custom<KnowledgeCheckResult>().optional(),
  auditResult: z.custom<AuditResult>().optional(),
  prose: z.string().min(1),
  final: z.boolean().default(false),
  events: z.array(z.custom<StateEvent>()).default([]),
});
export type BeatProcessingResult = z.infer<typeof BeatProcessingResultSchema>;

export const SceneResultSchema = z.object({
  sceneId: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  beats: z.array(BeatProcessingResultSchema),
  exitCondition: z.custom<ExitEvaluationResult>().optional(),
  metabolismReport: z.custom<MetabolismReport>().optional(),
  totalWordCount: z.number().int().min(0),
  shouldContinue: z.boolean(),
});
export type SceneResult = z.infer<typeof SceneResultSchema>;

export const ChapterResultSchema = z.object({
  chapterNumber: z.number().int().min(1),
  scenes: z.array(SceneResultSchema),
  summary: z.custom<ChapterSummary>(),
  driftReport: z.custom<DriftReport>().optional(),
  curiosityCheck: z.custom<CuriosityCheckResult>().optional(),
  totalWordCount: z.number().int().min(0),
  completed: z.boolean(),
});
export type ChapterResult = z.infer<typeof ChapterResultSchema>;

export interface AdaptationPipelineDeps {
  planner: {
    createBeatPlan(state: EntityStateSnapshot, chapterNumber: number): Promise<BeatPlan>;
    getNextBeat(plan: BeatPlan, previousBeat?: Beat): Beat;
  };
  generator: {
    generateBeat(beat: Beat, dna: NarrativeDNA): Promise<string>;
  };
  adversarialRefiner: {
    refine(prose: string, dna: NarrativeDNA, beat: Beat): Promise<AdversarialRefinementResult>;
  };
  readerSimulator: {
    simulate(prose: string, dna: NarrativeDNA, beat: Beat): Promise<ReaderSimulationResult>;
  };
  knowledgeChecker: {
    checkBoundary(dialogue: string, boundary: KnowledgeBoundary, others: KnowledgeBoundary[]): KnowledgeCheckResult;
  };
  auditor: {
    audit(prose: string, dna: NarrativeDNA, options?: { chapterNumber?: number }): Promise<AuditResult>;
  };
  stateManager: {
    applyEvents(snapshot: EntityStateSnapshot, events: StateEvent[], chapter: number): EntityStateSnapshot;
    extractEvents(prose: string, beat: Beat): StateEvent[];
  };
  exitEvaluator: {
    evaluate(context: import("../scene/exit-conditions.js").ExitConditionContext): ExitEvaluationResult;
  };
  metabolism: {
    analyzeChapter(chapter: number, beatTypes: string[], wordCount: number, tensions: number[], characters: string[]): MetabolismReport;
  };
  curiosityLedger: {
    checkCuriosities(chapter: number): CuriosityCheckResult;
    updateStaleness(chapter: number): void;
  };
  driftDetector: {
    detectDrift(recent: ChapterSummary[], baseline: ChapterSummary[]): DriftReport | null;
  };
}

export interface AdaptationPipelineConfig {
  enableAdversarialRefinement: boolean;
  enableReaderSimulation: boolean;
  enableKnowledgeBoundary: boolean;
  maxAdversarialRounds: number;
  requireAllReadersYes: boolean;
  discardOnAllReadersNo: boolean;
  strictKnowledgeBoundary: boolean;
  maxRetriesPerBeat: number;
}

const DEFAULT_PIPELINE_CONFIG: AdaptationPipelineConfig = {
  enableAdversarialRefinement: true,
  enableReaderSimulation: true,
  enableKnowledgeBoundary: true,
  maxAdversarialRounds: 6,
  requireAllReadersYes: false,
  discardOnAllReadersNo: true,
  strictKnowledgeBoundary: true,
  maxRetriesPerBeat: 2,
};

const DEGRADATION_LADDER: ReadonlyArray<{ level: DegradationLevel; retries: number }> = [
  { level: "full", retries: 2 },
  { level: "reduced", retries: 2 },
  { level: "minimal", retries: 2 },
  { level: "scaffold", retries: 1 },
] as const;

export class AdaptationPipelineOrchestrator {
  private deps: AdaptationPipelineDeps;
  private config: AdaptationPipelineConfig;

  constructor(deps: AdaptationPipelineDeps, config?: Partial<AdaptationPipelineConfig>) {
    this.deps = deps;
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  async writeChapter(context: PipelineContext): Promise<ChapterResult> {
    const scenes: SceneResult[] = [];
    let currentContext = { ...context };
    let totalWordCount = 0;

    while (scenes.length === 0 || scenes[scenes.length - 1]!.shouldContinue) {
      const sceneResult = await this.writeScene(currentContext);
      scenes.push(sceneResult);

      totalWordCount += sceneResult.totalWordCount;
      currentContext = {
        ...currentContext,
        currentState: this.updateStateFromScene(currentContext.currentState, sceneResult),
        generatedBeats: [...currentContext.generatedBeats, ...sceneResult.beats.map((b) => b.beat)],
      };

      if (scenes.length > 10) {
        break;
      }
    }

    const chapterSummary = this.createChapterSummary(context.chapterNumber, scenes, totalWordCount);
    const curiosityCheck = this.deps.curiosityLedger.checkCuriosities(context.chapterNumber);
    this.deps.curiosityLedger.updateStaleness(context.chapterNumber);

    let driftReport: DriftReport | undefined;
    if (context.chapterSummaries.length >= 5) {
      const recentSummaries = context.chapterSummaries.slice(-5);
      driftReport = this.deps.driftDetector.detectDrift(recentSummaries, context.chapterSummaries.slice(0, -5)) ?? undefined;
    }

    return ChapterResultSchema.parse({
      chapterNumber: context.chapterNumber,
      scenes,
      summary: chapterSummary,
      driftReport,
      curiosityCheck,
      totalWordCount,
      completed: true,
    });
  }

  async writeScene(context: PipelineContext): Promise<SceneResult> {
    const sceneId = `scene-${context.chapterNumber}-${Date.now()}`;
    const beatResults: BeatProcessingResult[] = [];
    let currentBeatIndex = 0;
    let totalWordCount = 0;

    if (!context.beatPlan) {
      context.beatPlan = await this.deps.planner.createBeatPlan(context.currentState, context.chapterNumber);
    }

    let previousBeat: Beat | undefined;

    while (currentBeatIndex < context.maxBeatsPerScene) {
      const beat = this.deps.planner.getNextBeat(context.beatPlan, previousBeat);
      const result = await this.processBeat(beat, context);

      if (result) {
        beatResults.push(result);
        totalWordCount += beat.targetWords[1];
        previousBeat = result.beat;

        const exitCheck = this.checkExitConditions(beatResults, context, totalWordCount);
        if (exitCheck.shouldExit) {
          return SceneResultSchema.parse({
            sceneId,
            chapterNumber: context.chapterNumber,
            beats: beatResults,
            exitCondition: exitCheck,
            totalWordCount,
            shouldContinue: false,
          });
        }
      }

      currentBeatIndex++;
    }

    const metabolismReport = this.deps.metabolism.analyzeChapter(
      context.chapterNumber,
      beatResults.map((b) => b.beat.type),
      totalWordCount,
      beatResults.map((b) => b.beat.tensionLevel),
      this.extractCharactersFromBeats(beatResults)
    );

    return SceneResultSchema.parse({
      sceneId,
      chapterNumber: context.chapterNumber,
      beats: beatResults,
      metabolismReport,
      totalWordCount,
      shouldContinue: metabolismReport.status !== "overheating",
    });
  }

  async processBeat(beat: Beat, context: PipelineContext): Promise<BeatProcessingResult | null> {
    let totalRetries = 0;

    for (const step of DEGRADATION_LADDER) {
      const retriesForLevel = step.level === "scaffold"
        ? 1
        : Math.max(1, Math.min(this.config.maxRetriesPerBeat, step.retries));

      for (let attempt = 0; attempt < retriesForLevel; attempt += 1) {
        const activeDna = degradeDNA(beat.dna, step.level);
        const activeBeat: Beat = {
          ...beat,
          dna: activeDna,
          retryCount: totalRetries,
        };

        let prose = await this.deps.generator.generateBeat(activeBeat, activeDna);
        let events: StateEvent[] = [];

        let adversarialResult: AdversarialRefinementResult | undefined;
        if (this.config.enableAdversarialRefinement) {
          adversarialResult = await this.deps.adversarialRefiner.refine(prose, activeDna, activeBeat);
          prose = adversarialResult.finalProse;
        }

        let readerResult: ReaderSimulationResult | undefined;
        if (this.config.enableReaderSimulation) {
          readerResult = await this.deps.readerSimulator.simulate(prose, activeDna, activeBeat);

          if (readerResult.shouldDiscard && this.config.discardOnAllReadersNo) {
            totalRetries += 1;
            continue;
          }
        }

        let knowledgeResult: KnowledgeCheckResult | undefined;
        if (this.config.enableKnowledgeBoundary && context.characterBoundaries.length > 0) {
          const speakerBoundary = context.characterBoundaries[0]!;
          const otherBoundaries = context.characterBoundaries.slice(1);
          knowledgeResult = this.deps.knowledgeChecker.checkBoundary(prose, speakerBoundary, otherBoundaries);

          if (knowledgeResult.hasBreach && this.config.strictKnowledgeBoundary) {
            prose = await this.fixKnowledgeBreach(prose, knowledgeResult, activeBeat);
          }
        }

        const auditResult = await this.deps.auditor.audit(prose, activeDna, {
          chapterNumber: activeBeat.chapterNumber,
        });
        if (!auditResult.passed && auditResult.disqualified) {
          totalRetries += 1;
          continue;
        }

        events = this.deps.stateManager.extractEvents(prose, activeBeat);

        const finalBeat: Beat = {
          ...activeBeat,
          chosen: prose,
          status: "approved",
          wordCount: prose.replace(/[^\u4e00-\u9fff]/g, "").length || prose.split(/\s+/).filter((word) => word.length > 0).length,
        };

        return BeatProcessingResultSchema.parse({
          beat: finalBeat,
          stage: "complete",
          adversarialResult,
          readerResult,
          knowledgeResult,
          auditResult,
          prose,
          final: true,
          events,
        });
      }
    }

    return null;
  }

  private checkExitConditions(
    beats: BeatProcessingResult[],
    context: PipelineContext,
    totalWordCount: number
  ): ExitEvaluationResult {
    const lastBeat = beats[beats.length - 1]?.beat;
    const firstBeat = beats[0]?.beat;

    const exitContext: import("../scene/exit-conditions.js").ExitConditionContext = {
      beats: beats.map((b) => b.beat),
      currentTension: lastBeat?.tensionLevel ?? 5,
      initialTension: firstBeat?.tensionLevel ?? 5,
      currentLocation: lastBeat?.dna.where ?? "",
      initialLocation: firstBeat?.dna.where ?? "",
      currentTime: new Date(),
      initialTime: new Date(),
      stateSnapshot: context.currentState,
      mandatoryHooks: lastBeat?.dna.hookContext ?? [],
      charactersPresent: lastBeat?.dna.who.map((c) => c.id) ?? [],
      initialCharacters: firstBeat?.dna.who.map((c) => c.id) ?? [],
    };

    return this.deps.exitEvaluator.evaluate(exitContext);
  }

  private async fixKnowledgeBreach(
    prose: string,
    knowledgeResult: KnowledgeCheckResult,
    beat: Beat
  ): Promise<string> {
    return prose;
  }

  private updateStateFromScene(
    state: EntityStateSnapshot,
    sceneResult: SceneResult
  ): EntityStateSnapshot {
    let updatedState = { ...state };

    for (const beatResult of sceneResult.beats) {
      if (beatResult.events.length > 0) {
        updatedState = this.deps.stateManager.applyEvents(updatedState, beatResult.events, beatResult.beat.chapterNumber);
      }
    }

    return updatedState;
  }

  private createChapterSummary(
    chapterNumber: number,
    scenes: SceneResult[],
    totalWordCount: number
  ): ChapterSummary {
    const allBeats = scenes.flatMap((s) => s.beats);
    const keyEvents = allBeats
      .filter((b) => b.beat.type === "revelation" || b.beat.type === "action")
      .map((b) => b.prose.substring(0, 100) + (b.prose.length > 100 ? "..." : ""));

    const characterAppearances = this.extractCharactersFromBeats(allBeats);
    const locationChanges = scenes
      .map((s) => s.beats[0]?.beat.dna.where)
      .filter((loc): loc is string => !!loc);

    return {
      chapter: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      wordCount: totalWordCount,
      summary: `Chapter ${chapterNumber} with ${allBeats.length} beats across ${scenes.length} scenes`,
      keyEvents,
      characterAppearances,
      locationChanges,
      stateChanges: [],
      hooksOpened: [],
      hooksResolved: [],
      mood: "",
      pacing: this.inferPacing(allBeats),
    };
  }

  private inferPacing(beats: BeatProcessingResult[]): "slow" | "medium" | "fast" | "variable" {
    const avgTension = beats.reduce((sum, b) => sum + b.beat.tensionLevel, 0) / beats.length;
    if (avgTension < 3) return "slow";
    if (avgTension > 7) return "fast";
    return "medium";
  }

  private extractCharactersFromBeats(beats: BeatProcessingResult[]): string[] {
    const characters = new Set<string>();
    for (const beat of beats) {
      for (const char of beat.beat.dna.who) {
        characters.add(char.id);
      }
    }
    return [...characters];
  }

  getConfig(): AdaptationPipelineConfig {
    return { ...this.config };
  }
}

export function createAdaptationPipelineOrchestrator(
  deps: AdaptationPipelineDeps,
  config?: Partial<AdaptationPipelineConfig>
): AdaptationPipelineOrchestrator {
  return new AdaptationPipelineOrchestrator(deps, config);
}
