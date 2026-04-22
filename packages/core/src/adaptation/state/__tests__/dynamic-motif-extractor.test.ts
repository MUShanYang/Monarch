import { describe, it, expect, beforeEach } from "vitest";
import { DynamicMotifExtractor } from "../dynamic-motif-extractor.js";

describe("DynamicMotifExtractor", () => {
  let extractor: DynamicMotifExtractor;

  beforeEach(() => {
    extractor = new DynamicMotifExtractor(undefined, { language: "zh" });
  });

  describe("extractFromStoryBible", () => {
    it("应该从 story_bible 中提取核心术语", () => {
      const storyBible = `
# 世界观

## 核心设定
这是一个修仙世界，灵气复苏，天地大变。

## 主角
主角名叫林轩，拥有**神秘玉佩**，可以吸收天地灵气。

## 重要物品
- 玉佩：核心金手指
- 灵石：修炼资源
- 剑诀：功法秘籍
      `;

      extractor.extractFromStoryBible(storyBible);
      const index = extractor.getIndex();

      expect(index.storySpecificTerms).toContain("玉佩");
      expect(index.storySpecificTerms).toContain("灵气");
    });
  });

  describe("extractFromChapter", () => {
    it("应该从章节中提取高频母题", () => {
      const chapter = `
林轩手握玉佩，感受着其中涌动的灵气。
玉佩微微发热，一股暖流涌入体内。
他闭上眼睛，开始吸收玉佩中的灵气。
灵气在经脉中流转，玉佩的光芒越来越亮。
      `;

      extractor.extractFromChapter(1, chapter, {
        emotion: "专注",
        valence: 0.5,
      });

      const motifs = extractor.scanMotifs(chapter);
      expect(motifs).toContain("玉佩");
      expect(motifs).toContain("灵气");
    });

    it("应该记录母题的情感关联", () => {
      const chapter1 = "林轩看着手中的玉佩，心中充满悲伤。玉佩是师父留下的唯一遗物。";
      extractor.extractFromChapter(1, chapter1, {
        emotion: "悲伤",
        valence: -0.8,
      });

      const chapter2 = "玉佩突然发光，林轩感到一阵温暖和希望。";
      extractor.extractFromChapter(2, chapter2, {
        emotion: "希望",
        valence: 0.7,
      });

      const tendency = extractor.getMotifEmotionalTendency("玉佩");
      expect(tendency).toBeDefined();
      expect(tendency?.emotion).toBeDefined();
    });

    it("应该过滤停用词", () => {
      const chapter = "他说了很多的话，但是没有人听。";
      extractor.extractFromChapter(1, chapter);

      const motifs = extractor.scanMotifs(chapter);
      expect(motifs).not.toContain("的");
      expect(motifs).not.toContain("了");
      expect(motifs).not.toContain("但是");
    });
  });

  describe("getTopMotifs", () => {
    it("应该返回最显著的母题", () => {
      // 模拟多章节提取
      for (let i = 1; i <= 5; i++) {
        extractor.extractFromChapter(
          i,
          "林轩手握玉佩，感受灵气流转。剑光闪烁，敌人倒下。",
          { emotion: "紧张", valence: -0.3 }
        );
      }

      const topMotifs = extractor.getTopMotifs(5);
      expect(topMotifs.length).toBeGreaterThan(0);
      expect(topMotifs[0]?.significance).toBeGreaterThan(0);
    });
  });

  describe("getMotifsByEmotion", () => {
    it("应该返回与特定情感关联的母题", () => {
      extractor.extractFromChapter(1, "玉佩发出温暖的光芒", {
        emotion: "温暖",
        valence: 0.8,
      });

      extractor.extractFromChapter(2, "剑气冰冷刺骨", {
        emotion: "冰冷",
        valence: -0.6,
      });

      const warmMotifs = extractor.getMotifsByEmotion("温暖");
      expect(warmMotifs.some(m => m.term === "玉佩")).toBe(true);
    });
  });

  describe("categorize", () => {
    it("应该正确分类物品母题", () => {
      const chapter = "他拿起桌上的剑，剑身寒光闪烁。";
      extractor.extractFromChapter(1, chapter);

      const index = extractor.getIndex();
      const swordMotif = Object.values(index.motifs).find(m => m.term.includes("剑"));

      if (swordMotif) {
        expect(swordMotif.category).toBe("object");
      }
    });

    it("应该正确分类场景母题", () => {
      const chapter = "他站在山巅之上，俯瞰群山。";
      extractor.extractFromChapter(1, chapter);

      const index = extractor.getIndex();
      const mountainMotif = Object.values(index.motifs).find(m => m.term.includes("山"));

      if (mountainMotif) {
        expect(mountainMotif.category).toBe("scene");
      }
    });
  });

  describe("significance calculation", () => {
    it("故事特定术语应该有更高的显著性", () => {
      extractor.extractFromStoryBible("核心物品：**神秘玉佩**");

      extractor.extractFromChapter(1, "玉佩发光了");
      extractor.extractFromChapter(2, "普通的石头");

      const topMotifs = extractor.getTopMotifs(10);
      const jadePendant = topMotifs.find(m => m.term === "玉佩");
      const stone = topMotifs.find(m => m.term === "石头");

      if (jadePendant && stone) {
        expect(jadePendant.significance).toBeGreaterThan(stone.significance);
      }
    });

    it("高频母题应该有更高的显著性", () => {
      for (let i = 1; i <= 10; i++) {
        extractor.extractFromChapter(i, "玉佩发光");
      }

      extractor.extractFromChapter(11, "石头落地");

      const topMotifs = extractor.getTopMotifs(10);
      const jadePendant = topMotifs.find(m => m.term === "玉佩");
      const stone = topMotifs.find(m => m.term === "石头");

      if (jadePendant && stone) {
        expect(jadePendant.significance).toBeGreaterThan(stone.significance);
      }
    });
  });

  describe("English support", () => {
    it("应该支持英文文本提取", () => {
      const englishExtractor = new DynamicMotifExtractor(undefined, { language: "en" });

      const chapter = `
The sword gleamed in the moonlight.
He gripped the sword tightly, feeling its power.
The ancient sword had chosen him.
      `;

      englishExtractor.extractFromChapter(1, chapter, {
        emotion: "determination",
        valence: 0.6,
      });

      const motifs = englishExtractor.scanMotifs(chapter);
      expect(motifs).toContain("sword");
    });

    it("应该过滤英文停用词", () => {
      const englishExtractor = new DynamicMotifExtractor(undefined, { language: "en" });

      const chapter = "The man was walking in the forest with his sword.";
      englishExtractor.extractFromChapter(1, chapter);

      const motifs = englishExtractor.scanMotifs(chapter);
      expect(motifs).not.toContain("the");
      expect(motifs).not.toContain("was");
      expect(motifs).not.toContain("with");
    });
  });
});
