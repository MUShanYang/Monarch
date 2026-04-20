import { describe, expect, it } from "vitest";

import {
  calculateMaxTokensFromWordTarget,
  estimateTokensFromText,
  getApiConstraintsForBeat,
  getApiConstraintsForSpeculative,
} from "../adaptation/llm/api-constraints.js";

describe("adaptation api constraints", () => {
  it("uses ceil(targetWords[1] * 1.7) + 50 for beat maxTokens", () => {
    expect(calculateMaxTokensFromWordTarget([60, 120])).toBe(254);
    expect(getApiConstraintsForBeat("action", [60, 120]).maxTokens).toBe(254);
  });

  it("uses the same maxTokens rule for speculative generation", () => {
    expect(getApiConstraintsForSpeculative("B", [80, 150]).maxTokens).toBe(305);
  });

  it("includes required stop sequences", () => {
    const constraints = getApiConstraintsForBeat("dialogue", [80, 150]);

    expect(constraints.stopSequences).toContain("\n\n");
    expect(constraints.stopSequences).toContain("###");
  });

  it("estimates tokens from Chinese text by visible character count", () => {
    const text = "墨离沿着石阶往下走";
    const visibleChars = text.replace(/[^\u4e00-\u9fff]/g, "").length;
    expect(estimateTokensFromText(text)).toBe(Math.ceil(visibleChars * 1.3));
  });
});
