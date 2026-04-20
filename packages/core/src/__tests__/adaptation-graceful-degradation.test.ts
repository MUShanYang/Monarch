import { describe, expect, it } from "vitest";

import { degradeDNA } from "../adaptation/context/dna-compressor.js";
import type { NarrativeDNA } from "../adaptation/beat/beat-types.js";

const baseDna: NarrativeDNA = {
  who: [
    {
      id: "char-1",
      name: "Lin",
      spatialPosture: "standing",
      handState: "full",
      heldItems: ["lantern"],
      currentLocation: "dock",
      emotionalState: "tense",
      activeDebts: ["grief", "anger"],
      constraint: "Lin cannot pick up anything else.",
    },
  ],
  where: "Night dock with cold mist",
  mustInclude: ["hook-a", "hook-b", "hook-c"],
  mustNotInclude: ["felt", "because"],
  lastBeatSummary: "Lin arrived and saw blood on the pier.",
  tensionContext: 7,
  hookContext: ["murder clue", "missing ledger"],
  emotionalContext: "Grief sits under every line.",
  spatialConstraints: ["Lin's hands are full."],
  styleGuide: "Spare and physical.",
};

describe("adaptation graceful degradation", () => {
  it("REDUCED drops hookContext and extra mustInclude items", () => {
    const reduced = degradeDNA(baseDna, "reduced");

    expect(reduced.hookContext).toEqual([]);
    expect(reduced.mustInclude).toEqual(["hook-a"]);
    expect(reduced.mustNotInclude).toEqual(baseDna.mustNotInclude);
  });

  it("MINIMAL keeps only the core fields CLAUDE.md requires", () => {
    const minimal = degradeDNA(baseDna, "minimal");

    expect(minimal.who).toEqual(baseDna.who);
    expect(minimal.where).toBe(baseDna.where);
    expect(minimal.lastBeatSummary).toBe(baseDna.lastBeatSummary);
    expect(minimal.mustNotInclude).toEqual(baseDna.mustNotInclude);
    expect(minimal.mustInclude).toEqual([]);
    expect(minimal.hookContext).toEqual([]);
    expect(minimal.spatialConstraints).toEqual([]);
    expect(minimal.emotionalContext).toBeUndefined();
  });
});
