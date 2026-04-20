import { describe, expect, it, vi } from "vitest";
import { BeatOrchestrator } from "../adaptation/integration/beat-orchestrator.js";

type ContinuationRequest = {
  beatId: string;
  chapterNumber: number;
  beatType: string;
  tensionLevel: number;
  dna: {
    who: [];
    where: string;
    mustInclude: string[];
    mustNotInclude: string[];
    lastBeatSummary: string;
    hookContext: string[];
    spatialConstraints: string[];
  };
  bannedWords: string[];
};

describe("BeatOrchestrator banned-word cleanup", () => {
  it("escapes regex metacharacters in banned words before removal", async () => {
    const orchestrator = new BeatOrchestrator({
      llmInterface: {
        callLLM: vi.fn().mockResolvedValue("保留文本 [都市网络用语腔 其余内容"),
      },
    });

    const prose = await (orchestrator as unknown as {
      callLLMWithConfig: (
        config: {
          prompt: string;
          constraints: {
            maxTokens: number;
            stopSequences: string[];
            temperature: number;
            topP: number;
            frequencyPenalty: number;
            presencePenalty: number;
            responseFormat: "text";
          };
        },
        request: {
          chapterNumber: number;
          beatType: string;
          tensionLevel: number;
          dna: {
            who: [];
            where: string;
            mustInclude: string[];
            mustNotInclude: string[];
            lastBeatSummary: string;
            hookContext: string[];
            spatialConstraints: string[];
          };
          bannedWords: string[];
        },
        hooks: unknown,
      ) => Promise<string>;
    }).callLLMWithConfig(
      {
        prompt: "prompt",
        constraints: {
          maxTokens: 100,
          stopSequences: [],
          temperature: 0.7,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseFormat: "text",
        },
      },
      {
        chapterNumber: 1,
        beatType: "dialogue",
        tensionLevel: 5,
        dna: {
          who: [],
          where: "庭院",
          mustInclude: [],
          mustNotInclude: [],
          lastBeatSummary: "",
          hookContext: [],
          spatialConstraints: [],
        },
        bannedWords: ["[都市网络用语腔"],
      },
      {},
    );

    expect(prose).toBe("保留文本  其余内容");
  });

  it("adds continuation guard and prior-beat context for later chapters", () => {
    const orchestrator = new BeatOrchestrator();

    const request: ContinuationRequest = {
      beatId: "beat-20-01",
      chapterNumber: 20,
      beatType: "dialogue",
      tensionLevel: 5,
      dna: {
        who: [],
        where: "太虚剑宗外门石阶",
        mustInclude: [],
        mustNotInclude: [],
        lastBeatSummary: "墨离刚听完林辰的告诫，准备离开石阶。",
        hookContext: [],
        spatialConstraints: [],
      },
      bannedWords: [],
    };

    const systemPrompt = (orchestrator as unknown as {
      buildSystemPrompt: (request: ContinuationRequest) => string;
    }).buildSystemPrompt(request);
    const prompt = (orchestrator as unknown as {
      buildPrompt: (
        request: ContinuationRequest,
        variant: { suffix: string },
        syntacticVariant?: { suffix: string },
      ) => string;
    }).buildPrompt(request, { suffix: "Short sentences." });

    expect(systemPrompt).toContain("这是续写章节，不是开篇");
    expect(systemPrompt).toContain("上一节拍摘要：墨离刚听完林辰的告诫");
    expect(prompt).toContain("续写约束：不要回到第一章开场");
    expect(prompt).toContain("承接上一节拍：墨离刚听完林辰的告诫");
  });

  it("counts Chinese characters when scoring candidate length", () => {
    const orchestrator = new BeatOrchestrator();

    const candidate = orchestrator.createCandidateFromProse(
      "A",
      "墨离沿着石阶往下走，没有停。",
      {
        passed: true,
        disqualified: false,
        issues: [],
        layerResults: {},
        score: 100,
        wordCount: 0,
      },
      {
        who: [],
        where: "石阶",
        mustInclude: [],
        mustNotInclude: [],
        lastBeatSummary: "",
        hookContext: [],
        spatialConstraints: [],
      },
    );

    expect(candidate.wordCount).toBe("墨离沿着石阶往下走，没有停。".replace(/[^\u4e00-\u9fff]/g, "").length);
  });
});
