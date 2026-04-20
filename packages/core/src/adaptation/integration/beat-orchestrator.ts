import { z } from "zod";
import type { Beat, BeatType, NarrativeDNA, BeatCandidate, SpeculativeVariant } from "../beat/beat-types.js";
import type { AuditResult } from "../audit/cascade-auditor.js";
import type { ApiConstraints } from "../llm/api-constraints.js";
import type { PreGenerationHooksResult, PostGenerationHooksResult, AdaptationHooks } from "./hooks.js";
import { SPECULATIVE_VARIANTS, getDefaultWordTarget } from "../beat/beat-types.js";
import { getApiConstraintsForSpeculative } from "../llm/api-constraints.js";

function stripThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
}

function countVisibleWords(prose: string): number {
  const cleaned = stripThinkingTags(prose);
  return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
}

export const BeatGenerationRequestSchema = z.object({
  beatId: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  beatType: z.string(),
  tensionLevel: z.number().int().min(1).max(10),
  dna: z.any(),
  kineticScaffold: z.string().optional(),
  bannedWords: z.array(z.string()).default([]),
});
export type BeatGenerationRequest = z.infer<typeof BeatGenerationRequestSchema>;

export const SpeculativeCandidateSchema = z.object({
  variantId: z.enum(["A", "B", "C"]),
  prose: z.string(),
  wordCount: z.number().int().min(0),
  auditResult: z.any().optional(),
  score: z.number().min(0).default(0),
  disqualified: z.boolean().default(false),
  disqualificationReason: z.string().optional(),
});
export type SpeculativeCandidate = z.infer<typeof SpeculativeCandidateSchema>;

export const BeatSelectionResultSchema = z.object({
  selectedVariant: z.enum(["A", "B", "C"]).optional(),
  selectedProse: z.string().optional(),
  candidates: z.array(SpeculativeCandidateSchema).default([]),
  allDisqualified: z.boolean().default(false),
  retryRecommended: z.boolean().default(false),
  retryReason: z.string().optional(),
});
export type BeatSelectionResult = z.infer<typeof BeatSelectionResultSchema>;

export const LLMCallConfigSchema = z.object({
  variantId: z.enum(["A", "B", "C"]),
  prompt: z.string(),
  constraints: z.any(),
  dna: z.any(),
  kineticScaffold: z.string().optional(),
});
export type LLMCallConfig = z.infer<typeof LLMCallConfigSchema>;

export interface BeatOrchestratorLLMInterface {
  callLLM(prompt: string, systemPrompt: string, constraints: ApiConstraints): Promise<string>;
}

export class BeatOrchestrator {
  private readonly maxRetries: number;
  private readonly selectionStrategy: "best_score" | "first_passing" | "diversity";
  private llmInterface: BeatOrchestratorLLMInterface | null = null;

  constructor(options?: {
    maxRetries?: number;
    selectionStrategy?: "best_score" | "first_passing" | "diversity";
    llmInterface?: BeatOrchestratorLLMInterface;
  }) {
    this.maxRetries = options?.maxRetries ?? 2;
    this.selectionStrategy = options?.selectionStrategy ?? "best_score";
    this.llmInterface = options?.llmInterface ?? null;
  }

  setLLMInterface(llmInterface: BeatOrchestratorLLMInterface): void {
    this.llmInterface = llmInterface;
  }

  prepareSpeculativeCalls(request: BeatGenerationRequest): LLMCallConfig[] {
    const wordTarget = getDefaultWordTarget(request.beatType as BeatType);
    const configs: LLMCallConfig[] = [];

    for (const variant of SPECULATIVE_VARIANTS) {
      const constraints = getApiConstraintsForSpeculative(variant.id, wordTarget);

      const prompt = this.buildPrompt(request, variant);

      configs.push({
        variantId: variant.id,
        prompt,
        constraints,
        dna: request.dna,
        kineticScaffold: request.kineticScaffold,
      });
    }

    return configs;
  }

  async executeSpeculativeCalls(
    request: BeatGenerationRequest,
    hooks: AdaptationHooks
  ): Promise<BeatSelectionResult> {
    const llmConfigs = this.prepareSpeculativeCalls(request);

    console.log(`[monarch] 并行调用 3 路 LLM 候选（A/B/C）...`);
    const prosePromises = llmConfigs.map(async (config) => {
      const prose = await this.callLLMWithConfig(config, request, hooks);
      return { config, prose };
    });

    const proseResults = await Promise.all(prosePromises);

    const candidates: SpeculativeCandidate[] = [];

    for (const { config, prose } of proseResults) {
      if (!prose) {
        console.log(`[monarch] 候选 ${config.variantId}：LLM 返回空内容，跳过`);
        continue;
      }

      const wordCount = countVisibleWords(prose);
      console.log(`[monarch] 候选 ${config.variantId}：生成 ${wordCount} 字，正在审计...`);

      const postResult = await hooks.postGenerationBeat({
        prose,
        dna: request.dna,
        beatType: request.beatType as BeatType,
      });

      const passed = postResult.auditResult?.passed ? "通过" : "未通过";
      const issues = postResult.auditResult?.issues ?? [];
      const errorIssues = issues.filter((i: any) => i.severity === "error");
      const warnIssues = issues.filter((i: any) => i.severity === "warning");
      if (!passed && errorIssues.length > 0) {
        const first3 = errorIssues.slice(0, 3).map((i: any) => `[${i.code}] ${i.message}`).join("；");
        console.log(`[monarch] 候选 ${config.variantId}：审计${passed}，${errorIssues.length} 个错误，${warnIssues.length} 个警告。前 3 个错误：${first3}`);
      } else {
        console.log(`[monarch] 候选 ${config.variantId}：审计${passed}，${errorIssues.length} 个错误，${warnIssues.length} 个警告`);
      }

      const candidate = this.createCandidateFromProse(
        config.variantId,
        prose,
        postResult.auditResult,
        request.dna
      );
      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      console.log(`[monarch] 所有候选均未通过，建议重试`);
      return BeatSelectionResultSchema.parse({
        candidates: [],
        allDisqualified: true,
        retryRecommended: true,
        retryReason: "No candidates generated",
      });
    }

    return this.selectBestCandidate(candidates, request.dna);
  }

  private async callLLMWithConfig(
    config: LLMCallConfig,
    request: BeatGenerationRequest,
    hooks: AdaptationHooks
  ): Promise<string> {
    if (!this.llmInterface) {
      throw new Error("LLM interface not configured. Call setLLMInterface() first.");
    }

    const systemPrompt = this.buildSystemPrompt(request);
    const prose = await this.llmInterface.callLLM(config.prompt, systemPrompt, config.constraints);

    const cleaned = stripThinkingTags(prose);

    if (request.bannedWords.length > 0) {
      const { exciseExplicitMotivation } = await import("../beat/show-dont-tell-scalpel.js");
      let cleaned2 = exciseExplicitMotivation(cleaned);

      for (const banned of request.bannedWords) {
        const regex = new RegExp(banned, "gi");
        cleaned2 = cleaned2.replace(regex, "");
      }
      return cleaned2;
    }

    return cleaned;
  }

  private buildSystemPrompt(request: BeatGenerationRequest): string {
    const parts: string[] = [];

    parts.push(`你是专业小说作家。你必须用中文写作。`);
    parts.push(`节拍类型：${request.beatType}`);
    parts.push(`张力等级：${request.tensionLevel}/10`);

    if (request.kineticScaffold) {
      parts.push(`你必须以以下开头开始写作："${request.kineticScaffold}"`);
    }

    // 角色名字要求
    if (request.dna?.who && request.dna.who.length > 0) {
      const characterNames = request.dna.who.map((c: { name: string }) => c.name).join("、");
      parts.push(`使用角色的完整名字，不要用"你"、"我"、"他"、"她"等代词。`);
      parts.push(`主要角色：${characterNames}`);
    }

    // 剧情参与要求
    if (request.dna?.hookContext && request.dna.hookContext.length > 0) {
      parts.push(`参考以下剧情线索：${request.dna.hookContext.slice(0, 3).join("；")}`);
    }
    if (request.dna?.mustInclude && request.dna.mustInclude.length > 0) {
      parts.push(`必须包含以下元素：${request.dna.mustInclude.join("；")}`);
    }

    // 风格要求 - 从 DNA 中读取，而不是硬编码
    if (request.dna?.styleGuide) {
      parts.push(`风格要求：${request.dna.styleGuide}`);
    }

    parts.push(`只写这个节拍的小说正文。不要包含任何元评论、解释、标题或标记。`);
    parts.push(`用适合该类型和情境的文学风格写作。`);
    parts.push(`不要使用"首先"、"其次"、"最后"等过渡词。不要解释角色的心理动机，用行动和对话展现。`);

    return parts.join("\n");
  }

  selectBestCandidate(
    candidates: SpeculativeCandidate[],
    dna: NarrativeDNA
  ): BeatSelectionResult {
    const validCandidates = candidates.filter((c) => !c.disqualified);

    if (validCandidates.length === 0) {
      console.log(`[monarch] 所有候选均被审计拒绝，降级使用得分最高的候选`);
      const bestOfBad = candidates.reduce((best, c) => c.score > best.score ? c : best, candidates[0]!);
      return BeatSelectionResultSchema.parse({
        selectedVariant: bestOfBad.variantId,
        selectedProse: bestOfBad.prose,
        candidates,
        allDisqualified: false,
        retryRecommended: true,
        retryReason: "All candidates were disqualified, fallback to best score",
      });
    }

    let selected: SpeculativeCandidate | undefined;

    switch (this.selectionStrategy) {
      case "first_passing":
        selected = validCandidates.find((c) => c.auditResult?.passed) ?? validCandidates[0];
        break;

      case "diversity":
        selected = this.selectForDiversity(validCandidates, candidates);
        break;

      case "best_score":
      default:
        selected = validCandidates.reduce((best, c) =>
          c.score > best.score ? c : best
        , validCandidates[0]!);
        break;
    }

    return BeatSelectionResultSchema.parse({
      selectedVariant: selected?.variantId,
      selectedProse: selected?.prose,
      candidates,
      allDisqualified: false,
      retryRecommended: false,
    });
  }

  scoreCandidate(
    candidate: SpeculativeCandidate,
    auditResult: AuditResult,
    dna: NarrativeDNA
  ): number {
    let score = 100;

    if (!auditResult.passed) {
      score -= 50;
    }

    const errorCount = auditResult.issues.filter((i) => i.severity === "error").length;
    score -= errorCount * 10;

    const warningCount = auditResult.issues.filter((i) => i.severity === "warning").length;
    score -= warningCount * 3;

    const wordTarget = getDefaultWordTarget(countVisibleWords(candidate.prose) > 100 ? "dialogue" : "action");
    const wordCount = candidate.wordCount;
    const targetMid = (wordTarget[0] + wordTarget[1]) / 2;
    const deviation = Math.abs(wordCount - targetMid);
    score -= Math.min(deviation * 0.5, 20);

    if (dna.mustInclude.length > 0) {
      const proseLower = candidate.prose.toLowerCase();
      const includedCount = dna.mustInclude.filter((item) =>
        proseLower.includes(item.toLowerCase())
      ).length;
      score += includedCount * 5;
    }

    if (dna.mustNotInclude.length > 0) {
      const proseLower = candidate.prose.toLowerCase();
      const violationCount = dna.mustNotInclude.filter((item) =>
        proseLower.includes(item.toLowerCase())
      ).length;
      score -= violationCount * 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  createCandidateFromProse(
    variantId: "A" | "B" | "C",
    prose: string,
    auditResult?: AuditResult,
    dna?: NarrativeDNA
  ): SpeculativeCandidate {
    const wordCount = countVisibleWords(prose);

    let score = 0;
    let disqualified = false;
    let disqualificationReason: string | undefined;

    if (auditResult) {
      if (auditResult.disqualified) {
        disqualified = true;
        disqualificationReason = auditResult.issues[0]?.message;
      }
      if (dna) {
        score = this.scoreCandidate(
          { variantId, prose, wordCount, score: 0, disqualified },
          auditResult,
          dna
        );
      }
    }

    return SpeculativeCandidateSchema.parse({
      variantId,
      prose,
      wordCount,
      auditResult,
      score,
      disqualified,
      disqualificationReason,
    });
  }

  private buildPrompt(request: BeatGenerationRequest, variant: SpeculativeVariant): string {
    const parts: string[] = [];

    if (request.kineticScaffold) {
      parts.push(`开头：${request.kineticScaffold}`);
    }

    if (request.dna.who.length > 0) {
      const charNames = request.dna.who.map((c: any) => c.name).join("、");
      parts.push(`出场角色：${charNames}`);
    }

    if (request.dna.where) {
      parts.push(`地点：${request.dna.where}`);
    }

    if (request.dna.mustInclude.length > 0) {
      parts.push(`必须包含：${request.dna.mustInclude.join("；")}`);
    }

    if (request.dna.mustNotInclude.length > 0) {
      parts.push(`禁止使用：${request.dna.mustNotInclude.slice(0, 5).join("、")}`);
    }

    if (request.dna.spatialConstraints.length > 0) {
      parts.push(`空间约束：${request.dna.spatialConstraints.join(" ")}`);
    }

    if (request.dna.emotionalContext) {
      parts.push(`情绪背景：${request.dna.emotionalContext}`);
    }

    if (request.dna.motifEcho) {
      parts.push(`[关键母题回响]`);
      parts.push(`本节拍出现母题"${request.dna.motifEcho.object}"，之前与${request.dna.motifEcho.priorEmotion}相关。`);
      parts.push(`指令：${request.dna.motifEcho.directive}。`);
    }

    if (request.dna.sensoryEcho) {
      parts.push(`[感官闪回微剂量注入]`);
      parts.push(`母题"${request.dna.sensoryEcho.motif}"再次出现。`);
      parts.push(`角色需要经历短暂的身体干扰：${request.dna.sensoryEcho.physicalInterrupt}。`);
      parts.push(`持续约${request.dna.sensoryEcho.duration}。`);
      parts.push(`不要解释原因，让它在身体里自然发生，然后继续。`);
    }

    parts.push(`风格：${variant.suffix}`);

    return parts.join("\n");
  }

  private selectForDiversity(
    validCandidates: SpeculativeCandidate[],
    allCandidates: SpeculativeCandidate[]
  ): SpeculativeCandidate {
    const scored = validCandidates.sort((a, b) => b.score - a.score);

    if (scored.length === 1) return scored[0]!;

    const variantTypes = new Set(scored.map((c) => c.variantId));
    if (variantTypes.size > 1 && scored.length >= 2) {
      const secondBest = scored[1]!;
      if (secondBest.score >= scored[0]!.score - 10) {
        return secondBest;
      }
    }

    return scored[0]!;
  }
}

export function createBeatOrchestrator(options?: {
  maxRetries?: number;
  selectionStrategy?: "best_score" | "first_passing" | "diversity";
  llmInterface?: BeatOrchestratorLLMInterface;
}): BeatOrchestrator {
  return new BeatOrchestrator(options);
}

export function prepareThreeParallelCalls(request: BeatGenerationRequest): LLMCallConfig[] {
  const orchestrator = new BeatOrchestrator();
  return orchestrator.prepareSpeculativeCalls(request);
}
