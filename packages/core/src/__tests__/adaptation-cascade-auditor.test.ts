import { describe, expect, it } from "vitest";

import { CascadeAuditor } from "../adaptation/audit/cascade-auditor.js";

const baseDna = {
  who: [],
  where: "太虚剑宗外门",
  mustInclude: [],
  mustNotInclude: [],
  lastBeatSummary: "",
  hookContext: [],
  spatialConstraints: [],
};

describe("adaptation cascade auditor continuity guard", () => {
  it("disqualifies chapter-reset prose in later chapters", () => {
    const auditor = new CascadeAuditor();

    const result = auditor.audit(
      "墨离猛地睁开眼，心里一片空白，不知道自己是谁。四周是无名遗迹的断壁残垣。这是哪里？",
      baseDna,
      { chapterNumber: 20 },
    );

    expect(result.passed).toBe(false);
    expect(result.disqualified).toBe(true);
    expect(result.issues.some((issue) => issue.code === "CHAPTER_RESET")).toBe(true);
  });

  it("does not treat explicit flashbacks as chapter reset", () => {
    const auditor = new CascadeAuditor();

    const result = auditor.audit(
      "墨离在梦中又看见无名遗迹，想起自己初醒时的茫然与刺痛，梦醒后仍站在太虚剑宗的廊下。",
      baseDna,
      { chapterNumber: 20 },
    );

    expect(result.issues.some((issue) => issue.code === "CHAPTER_RESET")).toBe(false);
  });
});
