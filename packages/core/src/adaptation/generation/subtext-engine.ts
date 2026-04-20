import { z } from "zod";

export const SubtextLayerSchema = z.enum(["literal", "implied", "unconscious"]);
export type SubtextLayer = z.infer<typeof SubtextLayerSchema>;

export const SubtextEntrySchema = z.object({
  id: z.string().min(1),
  layer: SubtextLayerSchema,
  surfaceText: z.string().min(1),
  subtextMeaning: z.string().min(1),
  characterId: z.string().min(1),
  targetCharacterId: z.string().optional(),
  emotionalUndercurrent: z.string().optional(),
  plantedChapter: z.number().int().min(1),
  payoffChapter: z.number().int().optional(),
  status: z.enum(["planted", "developed", "paid_off", "abandoned"]).default("planted"),
});
export type SubtextEntry = z.infer<typeof SubtextEntrySchema>;

export const SubtextAnalysisResultSchema = z.object({
  text: z.string().min(1),
  detectedLayers: z.array(SubtextLayerSchema),
  subtextEntries: z.array(SubtextEntrySchema),
  consistencyScore: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
});
export type SubtextAnalysisResult = z.infer<typeof SubtextAnalysisResultSchema>;

export const SubtextEngineConfigSchema = z.object({
  enableUnconsciousLayer: z.boolean().default(true),
  minSubtextDensity: z.number().min(0).max(1).default(0.1),
  maxSubtextDensity: z.number().min(0).max(1).default(0.5),
  consistencyThreshold: z.number().min(0).max(1).default(0.7),
});
export type SubtextEngineConfig = z.infer<typeof SubtextEngineConfigSchema>;

const DEFAULT_CONFIG: Required<SubtextEngineConfig> = {
  enableUnconsciousLayer: true,
  minSubtextDensity: 0.1,
  maxSubtextDensity: 0.5,
  consistencyThreshold: 0.7,
};

export class SubtextEngine {
  private config: Required<SubtextEngineConfig>;
  private entries: Map<string, SubtextEntry> = new Map();

  constructor(config?: SubtextEngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  plantSubtext(
    layer: SubtextLayer,
    surfaceText: string,
    subtextMeaning: string,
    characterId: string,
    chapter: number,
    options?: {
      targetCharacterId?: string;
      emotionalUndercurrent?: string;
    }
  ): SubtextEntry {
    const id = `subtext-${characterId}-${Date.now()}`;

    const entry: SubtextEntry = {
      id,
      layer,
      surfaceText,
      subtextMeaning,
      characterId,
      targetCharacterId: options?.targetCharacterId,
      emotionalUndercurrent: options?.emotionalUndercurrent,
      plantedChapter: chapter,
      status: "planted",
    };

    this.entries.set(id, entry);
    return entry;
  }

  developSubtext(entryId: string, chapter: number): SubtextEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status !== "planted") return null;

    const updated: SubtextEntry = { ...entry, status: "developed" };
    this.entries.set(entryId, updated);
    return updated;
  }

  payoffSubtext(entryId: string, chapter: number): SubtextEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status === "paid_off" || entry.status === "abandoned") return null;

    const updated: SubtextEntry = {
      ...entry,
      status: "paid_off",
      payoffChapter: chapter,
    };
    this.entries.set(entryId, updated);
    return updated;
  }

  analyzeText(text: string, characterId?: string): SubtextAnalysisResult {
    const detectedLayers: SubtextLayer[] = [];
    const subtextEntries: SubtextEntry[] = [];
    const recommendations: string[] = [];

    const impliedPatterns = [
      { pattern: /"[^"]*"[^.]*(?:but|however|yet)/i, layer: "implied" as const },
      { pattern: /seemed|appeared|looked like/i, layer: "implied" as const },
    ];

    for (const { pattern, layer } of impliedPatterns) {
      if (pattern.test(text)) {
        if (!detectedLayers.includes(layer)) {
          detectedLayers.push(layer);
        }
      }
    }

    if (this.config.enableUnconsciousLayer) {
      const unconsciousPatterns = [/without thinking|instinctively|automatically/i];
      for (const pattern of unconsciousPatterns) {
        if (pattern.test(text) && !detectedLayers.includes("unconscious")) {
          detectedLayers.push("unconscious");
        }
      }
    }

    if (characterId) {
      const characterEntries = this.getEntriesForCharacter(characterId);
      subtextEntries.push(...characterEntries.filter((e) => e.status === "planted"));
    }

    const subtextDensity = this.calculateSubtextDensity(text, detectedLayers);

    if (subtextDensity < this.config.minSubtextDensity) {
      recommendations.push("Consider adding more implied meaning beneath the surface text");
    } else if (subtextDensity > this.config.maxSubtextDensity) {
      recommendations.push("Subtext density is high; ensure clarity is maintained");
    }

    if (!detectedLayers.includes("implied")) {
      recommendations.push("Add implied layer for richer narrative texture");
    }

    return {
      text,
      detectedLayers,
      subtextEntries,
      consistencyScore: this.calculateConsistencyScore(detectedLayers),
      recommendations,
    };
  }

  private calculateSubtextDensity(text: string, layers: SubtextLayer[]): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    let subtextSentences = 0;
    for (const sentence of sentences) {
      if (/seemed|appeared|without thinking|instinctively/i.test(sentence)) {
        subtextSentences++;
      }
    }

    return subtextSentences / sentences.length;
  }

  private calculateConsistencyScore(layers: SubtextLayer[]): number {
    if (layers.length === 0) return 0.5;
    if (layers.length === 1) return 0.7;
    if (layers.length === 2) return 0.85;
    return 0.95;
  }

  getEntriesForCharacter(characterId: string): SubtextEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.characterId === characterId || e.targetCharacterId === characterId
    );
  }

  getActiveEntries(): SubtextEntry[] {
    return [...this.entries.values()].filter((e) => e.status === "planted" || e.status === "developed");
  }

  getEntryById(id: string): SubtextEntry | undefined {
    return this.entries.get(id);
  }

  getAllEntries(): SubtextEntry[] {
    return [...this.entries.values()];
  }

  getConfig(): Required<SubtextEngineConfig> {
    return { ...this.config };
  }
}

export function createSubtextEngine(config?: SubtextEngineConfig): SubtextEngine {
  return new SubtextEngine(config);
}
