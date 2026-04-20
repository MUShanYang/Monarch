import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PipelineRunner } from "../pipeline/runner.js";
import { StateManager } from "../state/manager.js";
import * as llmProvider from "../llm/provider.js";
import { ContinuityAuditor } from "../agents/continuity.js";
import { ChapterAnalyzerAgent } from "../agents/chapter-analyzer.js";
import { WriterAgent } from "../agents/writer.js";
import { LengthNormalizerAgent } from "../agents/length-normalizer.js";
import { StateValidatorAgent } from "../agents/state-validator.js";
import type { BookConfig } from "../models/book.js";
import { countChapterLength } from "../utils/length-metrics.js";

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

const chapterResult = {
  chapterNumber: 1,
  title: "Adaptation Title",
  wordCount: 120,
  revised: false,
  status: "ready-for-review" as const,
  auditResult: {
    passed: true,
    issues: [],
    summary: "ok",
    tokenUsage: ZERO_USAGE,
  },
};

function createAnalyzedOutput(overrides: Record<string, unknown> = {}) {
  return {
    chapterNumber: 1,
    title: "Adaptation Title",
    content: "Adaptation prose body.",
    wordCount: "Adaptation prose body.".length,
    preWriteCheck: "check",
    postSettlement: "settled",
    updatedState: "analyzed state",
    updatedLedger: "analyzed ledger",
    updatedHooks: "analyzed hooks",
    chapterSummary: "| 1 | Adaptation summary |",
    updatedSubplots: "subplots",
    updatedEmotionalArcs: "emotions",
    updatedCharacterMatrix: "matrix",
    postWriteErrors: [],
    postWriteWarnings: [],
    tokenUsage: ZERO_USAGE,
    ...overrides,
  };
}

describe("PipelineRunner adaptation mode", () => {
  let root = "";

  beforeEach(() => {
    vi.spyOn(LengthNormalizerAgent.prototype, "normalizeChapter").mockImplementation(
      async ({ chapterContent, lengthSpec }) => ({
        normalizedContent: chapterContent,
        finalCount: countChapterLength(chapterContent, lengthSpec.countingMode),
        applied: false,
        mode: "none",
        tokenUsage: ZERO_USAGE,
      }),
    );
    vi.spyOn(StateValidatorAgent.prototype, "validate").mockResolvedValue({
      warnings: [],
      passed: true,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("routes writeNextChapter through adaptation when writeMode is adaptation", async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-adaptation-route-"));
    const state = new StateManager(root);
    const bookId = "route-book";
    const now = "2026-03-19T00:00:00.000Z";
    await state.saveBookConfig(bookId, {
      id: bookId,
      title: "Route Book",
      platform: "tomato",
      genre: "xuanhuan",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 120,
      createdAt: now,
      updatedAt: now,
    });

    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: root,
      writeMode: "adaptation",
      adaptationMaxRetries: 4,
    });

    const adaptationSpy = vi.spyOn(runner as never as {
      _writeNextChapterWithAdaptationLocked: (
        bookId: string,
        options?: { wordCount?: number; temperatureOverride?: number; maxRetries?: number },
      ) => Promise<typeof chapterResult>;
    }, "_writeNextChapterWithAdaptationLocked").mockResolvedValue(chapterResult);
    const standardSpy = vi.spyOn(runner as never as {
      _writeNextChapterStandardLocked: (
        bookId: string,
        wordCount?: number,
        temperatureOverride?: number,
      ) => Promise<typeof chapterResult>;
    }, "_writeNextChapterStandardLocked").mockResolvedValue(chapterResult);

    await runner.writeNextChapter(bookId, 180, 0.95);

    expect(adaptationSpy).toHaveBeenCalledWith(bookId, {
      wordCount: 180,
      temperatureOverride: 0.95,
      maxRetries: 4,
    });
    expect(standardSpy).not.toHaveBeenCalled();
  });

  it("routes writeNextChapter through standard mode when writeMode is not set", async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-standard-route-"));
    const state = new StateManager(root);
    const bookId = "standard-book";
    const now = "2026-03-19T00:00:00.000Z";
    await state.saveBookConfig(bookId, {
      id: bookId,
      title: "Standard Book",
      platform: "tomato",
      genre: "xuanhuan",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 120,
      createdAt: now,
      updatedAt: now,
    });

    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-standard-model",
      projectRoot: root,
    });

    const adaptationSpy = vi.spyOn(runner as never as {
      _writeNextChapterWithAdaptationLocked: (
        bookId: string,
        options?: { wordCount?: number; temperatureOverride?: number; maxRetries?: number },
      ) => Promise<typeof chapterResult>;
    }, "_writeNextChapterWithAdaptationLocked").mockResolvedValue(chapterResult);
    const standardSpy = vi.spyOn(runner as never as {
      _writeNextChapterStandardLocked: (
        bookId: string,
        wordCount?: number,
        temperatureOverride?: number,
      ) => Promise<typeof chapterResult>;
    }, "_writeNextChapterStandardLocked").mockResolvedValue(chapterResult);

    await runner.writeNextChapter(bookId, 180, 0.95);

    expect(standardSpy).toHaveBeenCalledWith(bookId, 180, 0.95);
    expect(adaptationSpy).not.toHaveBeenCalled();
  });

  it("retries adaptation text calls without stop sequences after an empty response", async () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion")
      .mockRejectedValueOnce(new Error("LLM returned empty response"))
      .mockResolvedValueOnce({ content: "retry ok", usage: ZERO_USAGE });

    const llmInterface = await (runner as never as {
      buildAdaptationLLMInterface: () => Promise<{
        callLLM: (
          prompt: string,
          systemPrompt: string,
          constraints: {
            maxTokens?: number;
            stopSequences?: string[];
            responseFormat?: "text" | "json";
          },
        ) => Promise<string>;
      }>;
    }).buildAdaptationLLMInterface();

    const content = await llmInterface.callLLM(
      "prompt",
      "system",
      {
        maxTokens: 32,
        stopSequences: ["\n\n", "###"],
        responseFormat: "text",
      },
    );

    expect(content).toBe("retry ok");
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect((chatCompletion.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(true);
    expect((chatCompletion.mock.calls[1]?.[0] as { stream?: boolean }).stream).toBe(true);
    expect((chatCompletion.mock.calls[0]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.stop).toEqual(["\n\n", "###"]);
    expect((chatCompletion.mock.calls[1]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.stop).toBeUndefined();
  });

  it("keeps adaptation JSON calls on non-stream mode", async () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: true,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({ content: "{\"ok\":true}", usage: ZERO_USAGE });

    const llmInterface = await (runner as never as {
      buildAdaptationLLMInterface: () => Promise<{
        callLLM: (
          prompt: string,
          systemPrompt: string,
          constraints: {
            maxTokens?: number;
            stopSequences?: string[];
            responseFormat?: "text" | "json";
          },
        ) => Promise<string>;
      }>;
    }).buildAdaptationLLMInterface();

    await llmInterface.callLLM(
      "prompt",
      "system",
      {
        maxTokens: 32,
        stopSequences: ["\n\n", "###"],
        responseFormat: "json",
      },
    );

    expect((chatCompletion.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(false);
    expect((chatCompletion.mock.calls[0]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.response_format).toEqual({ type: "json_object" });
  });

  it("omits json_object response_format for custom OpenAI-compatible JSON calls without schema", async () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        service: "custom:本地",
        apiFormat: "chat",
        stream: true,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({ content: "{\"ok\":true}", usage: ZERO_USAGE });

    const llmInterface = await (runner as never as {
      buildAdaptationLLMInterface: () => Promise<{
        callLLM: (
          prompt: string,
          systemPrompt: string,
          constraints: {
            maxTokens?: number;
            stopSequences?: string[];
            responseFormat?: "text" | "json";
            jsonSchema?: Record<string, unknown>;
          },
        ) => Promise<string>;
      }>;
    }).buildAdaptationLLMInterface();

    await llmInterface.callLLM(
      "prompt",
      "system",
      {
        maxTokens: 32,
        stopSequences: ["\n\n", "###"],
        responseFormat: "json",
      },
    );

    expect((chatCompletion.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(false);
    expect((chatCompletion.mock.calls[0]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.response_format).toBeUndefined();
  });

  it("uses json_schema response_format for custom OpenAI-compatible JSON calls with schema", async () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        service: "custom:本地",
        apiFormat: "chat",
        stream: true,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({ content: "{\"ok\":true}", usage: ZERO_USAGE });

    const llmInterface = await (runner as never as {
      buildAdaptationLLMInterface: () => Promise<{
        callLLM: (
          prompt: string,
          systemPrompt: string,
          constraints: {
            maxTokens?: number;
            stopSequences?: string[];
            responseFormat?: "text" | "json";
            jsonSchema?: Record<string, unknown>;
          },
        ) => Promise<string>;
      }>;
    }).buildAdaptationLLMInterface();

    await llmInterface.callLLM(
      "prompt",
      "system",
      {
        maxTokens: 32,
        stopSequences: ["\n\n", "###"],
        responseFormat: "json",
        jsonSchema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
          },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    );

    expect((chatCompletion.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(false);
    expect((chatCompletion.mock.calls[0]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "monarch_structured_output",
        schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
          },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    });
  });

  it("falls back to non-stream mode with expanded token budget after repeated empty text responses", async () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: true,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion")
      .mockRejectedValueOnce(new Error("LLM returned empty response from stream (usage=800+300)"))
      .mockRejectedValueOnce(new Error("LLM returned empty response from stream (usage=800+300)"))
      .mockResolvedValueOnce({ content: "expanded ok", usage: ZERO_USAGE });

    const llmInterface = await (runner as never as {
      buildAdaptationLLMInterface: () => Promise<{
        callLLM: (
          prompt: string,
          systemPrompt: string,
          constraints: {
            maxTokens?: number;
            stopSequences?: string[];
            responseFormat?: "text" | "json";
          },
        ) => Promise<string>;
      }>;
    }).buildAdaptationLLMInterface();

    const content = await llmInterface.callLLM(
      "prompt",
      "system",
      {
        maxTokens: 300,
        stopSequences: ["\n\n", "###"],
        responseFormat: "text",
      },
    );

    expect(content).toBe("expanded ok");
    expect(chatCompletion).toHaveBeenCalledTimes(3);
    expect(chatCompletion.mock.calls[0]?.[3]).toMatchObject({ maxTokens: 300 });
    expect(chatCompletion.mock.calls[1]?.[3]).toMatchObject({ maxTokens: 300 });
    expect(chatCompletion.mock.calls[2]?.[3]).toMatchObject({ maxTokens: 2048 });
    expect((chatCompletion.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(true);
    expect((chatCompletion.mock.calls[1]?.[0] as { stream?: boolean }).stream).toBe(true);
    expect((chatCompletion.mock.calls[2]?.[0] as { stream?: boolean }).stream).toBe(false);
    expect((chatCompletion.mock.calls[2]?.[0] as { defaults?: { extra?: Record<string, unknown> } }).defaults?.extra?.stop).toBeUndefined();
  });

  it("uses the configured pipeline client and model for adaptation write-next", { timeout: 30000 }, async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-adaptation-runner-"));
    const state = new StateManager(root);
    const bookId = "adaptation-book";
    const now = "2026-03-19T00:00:00.000Z";
    const book: BookConfig = {
      id: bookId,
      title: "Adaptation Book",
      platform: "tomato",
      genre: "xuanhuan",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 120,
      createdAt: now,
      updatedAt: now,
    };

    await state.saveBookConfig(bookId, book);
    await mkdir(join(state.bookDir(bookId), "story"), { recursive: true });
    await mkdir(join(state.bookDir(bookId), "chapters"), { recursive: true });

    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: root,
    });
    vi.spyOn(runner as never as {
      syncNarrativeMemoryIndex: () => Promise<void>;
      syncCurrentStateFactHistory: (bookId: string, chapterNumber: number) => Promise<void>;
      persistAuditDriftGuidance: (params: unknown) => Promise<void>;
      markBookActiveIfNeeded: (bookId: string) => Promise<void>;
    }, "syncNarrativeMemoryIndex").mockResolvedValue(undefined);
    vi.spyOn(runner as never as {
      syncNarrativeMemoryIndex: () => Promise<void>;
      syncCurrentStateFactHistory: (bookId: string, chapterNumber: number) => Promise<void>;
      persistAuditDriftGuidance: (params: unknown) => Promise<void>;
      markBookActiveIfNeeded: (bookId: string) => Promise<void>;
    }, "syncCurrentStateFactHistory").mockResolvedValue(undefined);
    vi.spyOn(runner as never as {
      syncNarrativeMemoryIndex: () => Promise<void>;
      syncCurrentStateFactHistory: (bookId: string, chapterNumber: number) => Promise<void>;
      persistAuditDriftGuidance: (params: unknown) => Promise<void>;
      markBookActiveIfNeeded: (bookId: string) => Promise<void>;
    }, "persistAuditDriftGuidance").mockResolvedValue(undefined);
    vi.spyOn(runner as never as {
      syncNarrativeMemoryIndex: () => Promise<void>;
      syncCurrentStateFactHistory: (bookId: string, chapterNumber: number) => Promise<void>;
      persistAuditDriftGuidance: (params: unknown) => Promise<void>;
      markBookActiveIfNeeded: (bookId: string) => Promise<void>;
    }, "markBookActiveIfNeeded").mockResolvedValue(undefined);

    const chatCompletion = vi.spyOn(llmProvider, "chatCompletion").mockImplementation(
      async (_client, _model, messages) => {
        const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
        if (systemPrompt.includes("strict evaluation agent")) {
          return { content: JSON.stringify({ answer: true, confidence: 0.9, reason: "clear" }), usage: ZERO_USAGE };
        }
        if (systemPrompt.includes("attacker role")) {
          return { content: "null", usage: ZERO_USAGE };
        }
        if (systemPrompt.includes("referee role")) {
          return {
            content: JSON.stringify({
              problemValid: false,
              fixed: true,
              introducedNewProblem: false,
              confidence: 0.9,
            }),
            usage: ZERO_USAGE,
          };
        }
        return { content: "rain lantern breath quiet harbor", usage: ZERO_USAGE };
      },
    );
    vi.spyOn(ContinuityAuditor.prototype, "auditChapter").mockResolvedValue({
      passed: true,
      issues: [],
      summary: "ok",
      tokenUsage: ZERO_USAGE,
    });
    vi.spyOn(ChapterAnalyzerAgent.prototype, "analyzeChapter").mockResolvedValue(
      createAnalyzedOutput({
        content: "rain lantern breath quiet harbor",
        wordCount: "rain lantern breath quiet harbor".length,
      }) as Awaited<ReturnType<ChapterAnalyzerAgent["analyzeChapter"]>>,
    );
    vi.spyOn(WriterAgent.prototype, "saveChapter").mockResolvedValue(undefined);
    vi.spyOn(WriterAgent.prototype, "saveNewTruthFiles").mockResolvedValue(undefined);

    const result = await runner.writeNextChapterWithAdaptation(bookId, {
      wordCount: 120,
      maxRetries: 1,
    });

    expect(result.status).toBe("ready-for-review");
    expect(result.title).toBe("Adaptation Title");
    expect(chatCompletion).toHaveBeenCalled();
    expect(chatCompletion.mock.calls.some((call) => call[1] === "configured-adaptation-model")).toBe(true);
  });

  it("uses an adaptive beat-count plan for adaptation chapters", () => {
    const runner = new PipelineRunner({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: true,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          maxTokensCap: null,
          thinkingBudget: 0,
          extra: {},
        },
      } as ConstructorParameters<typeof PipelineRunner>[0]["client"],
      model: "configured-adaptation-model",
      projectRoot: tmpdir(),
    });

    const shortPlan = (runner as never as {
      resolveAdaptationBeatPlan: (targetWordCount: number) => { minBeats: number; maxBeats: number };
    }).resolveAdaptationBeatPlan(1500);
    const longPlan = (runner as never as {
      resolveAdaptationBeatPlan: (targetWordCount: number) => { minBeats: number; maxBeats: number };
    }).resolveAdaptationBeatPlan(4000);

    expect(shortPlan).toEqual({ minBeats: 5, maxBeats: 6 });
    expect(longPlan).toEqual({ minBeats: 8, maxBeats: 10 });
  });
});
