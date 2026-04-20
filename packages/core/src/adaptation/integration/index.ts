export { AdaptationHooks, createAdaptationHooks, prepareBeatGeneration, auditGeneratedProse } from "./hooks.js";
export type { AdaptationContext, PreGenerationHooksResult, PostGenerationHooksResult } from "./hooks.js";

export { BeatOrchestrator, createBeatOrchestrator, prepareThreeParallelCalls } from "./beat-orchestrator.js";
export type { BeatGenerationRequest, SpeculativeCandidate, BeatSelectionResult, LLMCallConfig } from "./beat-orchestrator.js";

export { ChapterPipelineAdapter, createChapterPipelineAdapter, generateChapterWithAdaptation } from "./chapter-pipeline.js";
export type { ChapterGenerationConfig, BeatGenerationStep, ChapterGenerationResult } from "./chapter-pipeline.js";

export { AdaptationProgressManager } from "./progress-manager.js";
