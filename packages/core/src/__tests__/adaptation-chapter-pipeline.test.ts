import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { generateChapterWithAdaptation } from "../adaptation/integration/chapter-pipeline.js";
import type { ChapterPipelineLLMInterface } from "../adaptation/integration/chapter-pipeline.js";

const TEST_PROSE = "rain lantern floor breath hand quiet stone";

const llmInterface: ChapterPipelineLLMInterface = {
  async callLLM(_prompt, systemPrompt) {
    if (systemPrompt.includes("strict evaluation agent")) {
      return JSON.stringify({
        personaId: "reader",
        answer: true,
        confidence: 0.95,
        reason: "clear",
      });
    }

    if (systemPrompt.includes("attacker role")) {
      return "null";
    }

    if (systemPrompt.includes("referee role")) {
      return JSON.stringify({
        problemValid: false,
        fixed: true,
        introducedNewProblem: false,
        confidence: 0.9,
      });
    }

    return TEST_PROSE;
  },
};

describe("adaptation chapter pipeline workflow", () => {
  let bookDir = "";

  afterEach(async () => {
    if (bookDir) {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("writes a chapter through the workflow and persists state diff output", async () => {
    bookDir = await mkdtemp(join(tmpdir(), "monarch-adaptation-"));
    await mkdir(join(bookDir, "story"), { recursive: true });

    const result = await generateChapterWithAdaptation(bookDir, {
      chapterNumber: 1,
      targetWordRange: [40, 60],
      focusCharacterIds: [],
      startTension: 5,
      endTension: 5,
      hooksToAdvance: [],
      hooksToResolve: [],
      beatTypes: [],
      maxBeats: 1,
      minBeats: 1,
      maxRetriesPerBeat: 1,
      llmInterface,
      previousChapterEndingSummary: "",
    });

    const diffPath = join(bookDir, "story", "runtime", "chapter-0001", "state-diff.json");
    const rawDiff = await readFile(diffPath, "utf-8");
    const diff = JSON.parse(rawDiff) as { chapter: number; events: Array<{ action: string }> };

    expect(result.completed).toBe(true);
    expect(result.failureReason).toBeUndefined();
    expect(result.prose).toContain(TEST_PROSE);
    expect(result.compiledState?.currentState.length).toBeGreaterThan(0);
    expect(result.motifsReferenced).toContain("rain");
    expect(diff.chapter).toBe(1);
    expect(diff.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "LOG_EVENT" }),
      ]),
    );
  });
});
