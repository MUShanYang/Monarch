import { describe, expect, it, vi } from "vitest";

import { createBeat } from "../adaptation/beat/beat-types.js";
import { AdaptationPipelineOrchestrator, type PipelineContext } from "../adaptation/pipeline/adaptation-orchestrator.js";

describe("adaptation orchestrator graceful degradation", () => {
  it("moves from FULL retries to REDUCED DNA before giving up", async () => {
    const generateBeat = vi.fn(async (_beat, dna) => JSON.stringify({ mustInclude: dna.mustInclude, hookContext: dna.hookContext }));

    const simulate = vi
      .fn()
      .mockResolvedValueOnce({
        responses: [],
        allYes: false,
        allNo: true,
        majorityYes: false,
        shouldDiscard: true,
        degradationLevel: "reduced",
      })
      .mockResolvedValueOnce({
        responses: [],
        allYes: false,
        allNo: true,
        majorityYes: false,
        shouldDiscard: true,
        degradationLevel: "reduced",
      })
      .mockResolvedValueOnce({
        responses: [],
        allYes: true,
        allNo: false,
        majorityYes: true,
        shouldDiscard: false,
        degradationLevel: "none",
      });

    const orchestrator = new AdaptationPipelineOrchestrator({
      planner: {
        createBeatPlan: vi.fn(),
        getNextBeat: vi.fn(),
      },
      generator: { generateBeat },
      adversarialRefiner: {
        refine: vi.fn(async (prose) => ({
          finalProse: prose,
          rounds: [],
          totalRounds: 0,
          exitCondition: "NO_PROBLEM_FOUND" as const,
          improvementScore: 0,
        })),
      },
      readerSimulator: { simulate },
      knowledgeChecker: {
        checkBoundary: vi.fn(() => ({
          breaches: [],
          hasBreach: false,
          checkedFacts: 0,
        })),
      },
      auditor: {
        audit: vi.fn(async () => ({
          passed: true,
          disqualified: false,
          issues: [],
          score: 100,
          wordCount: 10,
          layerResults: {},
        })),
      },
      stateManager: {
        applyEvents: vi.fn((snapshot) => snapshot),
        extractEvents: vi.fn(() => []),
      },
      exitEvaluator: {
        evaluate: vi.fn(() => ({
          shouldExit: false,
          allConditions: [],
        })),
      },
      metabolism: {
        analyzeChapter: vi.fn(),
      },
      curiosityLedger: {
        checkCuriosities: vi.fn(),
        updateStaleness: vi.fn(),
      },
      driftDetector: {
        detectDrift: vi.fn(),
      },
    });

    const beat = createBeat({
      chapterNumber: 1,
      sequenceInChapter: 0,
      type: "action",
      tensionLevel: 6,
      targetWords: [60, 120],
      dna: {
        who: [],
        where: "pier",
        mustInclude: ["hook-a", "hook-b", "hook-c"],
        mustNotInclude: [],
        lastBeatSummary: "summary",
        hookContext: ["open-hook"],
        spatialConstraints: [],
      },
    });

    const context: PipelineContext = {
      chapterNumber: 1,
      sceneId: "scene-1",
      currentBeatIndex: 0,
      maxBeatsPerScene: 5,
      currentState: {
        entities: {
          schemaVersion: 1,
          lastUpdatedChapter: 0,
          characters: [],
          locations: [],
          items: [],
          properNounRegistry: [],
        },
        ledger: {
          schemaVersion: 1,
          lastUpdatedChapter: 0,
          hooks: [],
          subplots: [],
          characterKnowledgeMatrix: [],
          curiosityScore: 0,
        },
        chronicles: {
          schemaVersion: 1,
          lastUpdatedChapter: 0,
          summaries: [],
          eventLog: [],
          timeline: {},
        },
      },
      generatedBeats: [],
      chapterSummaries: [],
      characterBoundaries: [],
    };

    const result = await orchestrator.processBeat(beat, context);

    expect(result).not.toBeNull();
    expect(generateBeat).toHaveBeenCalledTimes(3);
    expect(generateBeat.mock.calls[0]?.[1].mustInclude).toEqual(["hook-a", "hook-b", "hook-c"]);
    expect(generateBeat.mock.calls[0]?.[1].hookContext).toEqual(["open-hook"]);
    expect(generateBeat.mock.calls[2]?.[1].mustInclude).toEqual(["hook-a"]);
    expect(generateBeat.mock.calls[2]?.[1].hookContext).toEqual([]);
  });
});
