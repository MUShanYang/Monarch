import { z } from "zod";

export const UnconsciousContentSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(["trauma", "desire", "fear", "memory", "symbol", "dream"]),
  intensity: z.number().min(0).max(1).default(0.5),
  plantedChapter: z.number().int().min(1),
  manifestationCount: z.number().int().min(0).default(0),
  lastManifestedChapter: z.number().int().optional(),
  relatedMotifs: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  isRepressed: z.boolean().default(true),
});
export type UnconsciousContent = z.infer<typeof UnconsciousContentSchema>;

export const ManifestationSchema = z.object({
  unconsciousId: z.string().min(1),
  chapter: z.number().int().min(1),
  manifestation: z.string().min(1),
  subtlety: z.number().min(0).max(1).default(0.5),
});
export type Manifestation = z.infer<typeof ManifestationSchema>;

export const UnconsciousAnalysisSchema = z.object({
  characterId: z.string().min(1),
  activeContents: z.array(UnconsciousContentSchema),
  dominantTheme: z.string().optional(),
  recommendedManifestations: z.array(z.object({
    contentId: z.string(),
    suggestion: z.string(),
    subtlety: z.number(),
  })),
  psychologicalPressure: z.number().min(0).max(1),
});
export type UnconsciousAnalysis = z.infer<typeof UnconsciousAnalysisSchema>;

export const UnconsciousConfigSchema = z.object({
  manifestationThreshold: z.number().min(0).max(1).default(0.7),
  maxManifestationsPerChapter: z.number().int().min(1).default(3),
  repressionDecayRate: z.number().min(0).max(1).default(0.05),
  enableDreamSequences: z.boolean().default(true),
});
export type UnconsciousConfig = z.infer<typeof UnconsciousConfigSchema>;

const DEFAULT_CONFIG: Required<UnconsciousConfig> = {
  manifestationThreshold: 0.7,
  maxManifestationsPerChapter: 3,
  repressionDecayRate: 0.05,
  enableDreamSequences: true,
};

export class CharacterUnconscious {
  private config: Required<UnconsciousConfig>;
  private contents: Map<string, UnconsciousContent> = new Map();
  private manifestations: Manifestation[] = [];

  constructor(config?: UnconsciousConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addContent(
    characterId: string,
    content: string,
    type: UnconsciousContent["type"],
    intensity: number,
    chapter: number,
    options?: {
      relatedMotifs?: string[];
      triggers?: string[];
    }
  ): UnconsciousContent {
    const id = `unconscious-${characterId}-${Date.now()}`;

    const unconsciousContent: UnconsciousContent = {
      id,
      characterId,
      content,
      type,
      intensity: Math.max(0, Math.min(1, intensity)),
      plantedChapter: chapter,
      manifestationCount: 0,
      relatedMotifs: options?.relatedMotifs ?? [],
      triggers: options?.triggers ?? [],
      isRepressed: true,
    };

    this.contents.set(id, unconsciousContent);
    return unconsciousContent;
  }

  manifestContent(
    contentId: string,
    chapter: number,
    manifestation: string,
    subtlety: number
  ): UnconsciousContent | null {
    const content = this.contents.get(contentId);
    if (!content) return null;

    const updated: UnconsciousContent = {
      ...content,
      manifestationCount: content.manifestationCount + 1,
      lastManifestedChapter: chapter,
      isRepressed: content.isRepressed && subtlety > 0.7,
    };

    this.contents.set(contentId, updated);

    this.manifestations.push({
      unconsciousId: contentId,
      chapter,
      manifestation,
      subtlety,
    });

    return updated;
  }

  processChapterAdvancement(currentChapter: number): UnconsciousContent[] {
    const updated: UnconsciousContent[] = [];

    for (const [id, content] of this.contents) {
      if (!content.isRepressed) continue;

      const chaptersSinceManifestation = content.lastManifestedChapter
        ? currentChapter - content.lastManifestedChapter
        : currentChapter - content.plantedChapter;

      const pressure = content.intensity + (chaptersSinceManifestation * 0.1);

      if (pressure >= this.config.manifestationThreshold) {
        const updatedContent: UnconsciousContent = {
          ...content,
          intensity: Math.min(1, pressure),
        };
        this.contents.set(id, updatedContent);
        updated.push(updatedContent);
      }
    }

    return updated;
  }

  analyzeCharacter(characterId: string): UnconsciousAnalysis {
    const characterContents = this.getContentsForCharacter(characterId);
    const activeContents = characterContents.filter(
      (c) => c.isRepressed && c.intensity >= this.config.manifestationThreshold
    );

    const typeCounts: Record<string, number> = {};
    for (const content of characterContents) {
      typeCounts[content.type] = (typeCounts[content.type] ?? 0) + content.intensity;
    }

    const dominantTheme = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    const recommendedManifestations = activeContents
      .slice(0, this.config.maxManifestationsPerChapter)
      .map((content) => ({
        contentId: content.id,
        suggestion: this.generateManifestationSuggestion(content),
        subtlety: 0.5 + Math.random() * 0.3,
      }));

    const psychologicalPressure = activeContents.reduce((sum, c) => sum + c.intensity, 0) /
      Math.max(1, characterContents.length);

    return {
      characterId,
      activeContents,
      dominantTheme,
      recommendedManifestations,
      psychologicalPressure,
    };
  }

  checkTriggers(text: string, characterId: string): UnconsciousContent[] {
    const triggered: UnconsciousContent[] = [];
    const contents = this.getContentsForCharacter(characterId);

    for (const content of contents) {
      for (const trigger of content.triggers) {
        if (text.toLowerCase().includes(trigger.toLowerCase())) {
          triggered.push(content);
          break;
        }
      }
    }

    return triggered;
  }

  getContentsForCharacter(characterId: string): UnconsciousContent[] {
    return [...this.contents.values()].filter((c) => c.characterId === characterId);
  }

  getActiveContents(): UnconsciousContent[] {
    return [...this.contents.values()].filter((c) => c.isRepressed);
  }

  getContentById(id: string): UnconsciousContent | undefined {
    return this.contents.get(id);
  }

  getManifestationsForContent(contentId: string): Manifestation[] {
    return this.manifestations.filter((m) => m.unconsciousId === contentId);
  }

  private generateManifestationSuggestion(content: UnconsciousContent): string {
    const suggestions: Record<UnconsciousContent["type"], string[]> = {
      trauma: ["flinches at sudden movement", "has a nightmare", "reacts disproportionately"],
      desire: ["lingers gaze", "makes an excuse to stay", "dreams of fulfillment"],
      fear: ["checks exits", "avoids eye contact", "makes excuses to leave"],
      memory: ["stares into distance", "mentions something from the past", "has a flashback"],
      symbol: ["notices a recurring object", "draws unconsciously", "hums a tune"],
      dream: ["mentions a dream", "acts out dream content", "sees dream imagery"],
    };

    const typeSuggestions = suggestions[content.type] ?? ["behaves strangely"];
    return typeSuggestions[Math.floor(Math.random() * typeSuggestions.length)]!;
  }

  getAllContents(): UnconsciousContent[] {
    return [...this.contents.values()];
  }

  clear(): void {
    this.contents.clear();
    this.manifestations = [];
  }

  getConfig(): Required<UnconsciousConfig> {
    return { ...this.config };
  }
}

export function createCharacterUnconscious(config?: UnconsciousConfig): CharacterUnconscious {
  return new CharacterUnconscious(config);
}
