import { describe, expect, it } from "vitest";

import { createBeat } from "../adaptation/beat/beat-types.js";
import { SpeculativeGenerator } from "../adaptation/beat/speculative-generator.js";

const beat = createBeat({
  chapterNumber: 1,
  sequenceInChapter: 0,
  type: "action",
  tensionLevel: 6,
  targetWords: [60, 120],
  dna: {
    who: [],
    where: "pier",
    mustInclude: [],
    mustNotInclude: [],
    lastBeatSummary: "",
    hookContext: [],
    spatialConstraints: [],
  },
});

describe("adaptation speculative batching", () => {
  it("runs 3x3 as exactly 3 batches of 3", () => {
    const generator = new SpeculativeGenerator();
    const batches = generator.getGenerationBatches(beat);

    expect(batches).toHaveLength(3);
    expect(batches.every((batch) => batch.requests.length === 3)).toBe(true);
    expect(batches[0]?.requests.map((request) => request.semanticVariant.id)).toEqual(["A", "A", "A"]);
    expect(batches[1]?.requests.map((request) => request.semanticVariant.id)).toEqual(["B", "B", "B"]);
    expect(batches[2]?.requests.map((request) => request.semanticVariant.id)).toEqual(["C", "C", "C"]);
  });

  it("uses the dominant syntactic strategy only after 2 consecutive wins", () => {
    const generator = new SpeculativeGenerator({
      preferredSyntacticVariant: "SYN_HYPOTAXIS",
      consecutiveWins: 2,
      totalGenerations: 0,
      variantWinCounts: { SYN_HYPOTAXIS: 2 },
    });

    const batches = generator.getGenerationBatches(beat);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.requests).toHaveLength(3);
    expect(
      batches[0]?.requests.every((request) => request.syntacticVariant?.id === "SYN_HYPOTAXIS")
    ).toBe(true);
  });
});
