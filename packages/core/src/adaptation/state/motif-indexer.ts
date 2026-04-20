import { z } from "zod";
import type {
  MotifIndex,
  MotifIndexEntry,
  MotifHistoryEntry,
  MotifEcho,
  MotifArc,
} from "./motif-types.js";
import { MotifIndexSchema, MotifIndexEntrySchema, MotifHistoryEntrySchema, MOTIF_VOCABULARY } from "./motif-types.js";

export interface MotifIndexerConfig {
  maxHistoryPerMotif?: number;
  reinforceThreshold?: number;
  contrastThreshold?: number;
}

const DEFAULT_CONFIG: Required<MotifIndexerConfig> = {
  maxHistoryPerMotif: 20,
  reinforceThreshold: 3,
  contrastThreshold: 2,
};

export class MotifIndexer {
  private index: MotifIndex;
  private vocabulary: Map<string, Set<string>>;
  private reverseVocabulary: Map<string, string>;
  private config: Required<MotifIndexerConfig>;

  constructor(initialIndex?: MotifIndex, config?: MotifIndexerConfig) {
    this.index = initialIndex ?? MotifIndexSchema.parse({ motifs: {} });
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vocabulary = this.buildVocabulary();
    this.reverseVocabulary = this.buildReverseVocabulary();
  }

  private buildVocabulary(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const [motif, aliases] of Object.entries(MOTIF_VOCABULARY)) {
      map.set(motif, new Set(aliases));
    }
    return map;
  }

  private buildReverseVocabulary(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [motif, aliases] of Object.entries(MOTIF_VOCABULARY)) {
      for (const alias of aliases) {
        map.set(alias.toLowerCase(), motif);
      }
    }
    return map;
  }

  scanMotifs(beatText: string): string[] {
    const found: string[] = [];
    const lowerText = beatText.toLowerCase();
    const seen = new Set<string>();

    for (const [alias, motif] of this.reverseVocabulary) {
      if (lowerText.includes(alias) && !seen.has(motif)) {
        found.push(motif);
        seen.add(motif);
      }
    }

    return found;
  }

  updateMotifHistory(
    motif: string,
    chapter: number,
    beatId: string,
    emotionalVector: { primary: string; valence: number },
    associatedCharacter?: string
  ): void {
    let entry = this.index.motifs[motif];

    if (!entry) {
      entry = MotifIndexEntrySchema.parse({
        name: motif,
        aliases: MOTIF_VOCABULARY[motif] ?? [],
        history: [],
        currentArc: "DORMANT",
      });
      this.index.motifs[motif] = entry;
    }

    const historyEntry: MotifHistoryEntry = MotifHistoryEntrySchema.parse({
      chapter,
      beatId,
      emotionalVector,
      associatedCharacter,
      timestamp: Date.now(),
    });

    entry.history.push(historyEntry);

    if (entry.history.length > this.config.maxHistoryPerMotif) {
      entry.history = entry.history.slice(-this.config.maxHistoryPerMotif);
    }

    entry.currentArc = this.calculateArc(entry.history);
    entry.lastAppearance = {
      chapter,
      beatId,
      emotion: emotionalVector.primary,
    };

    this.index.lastUpdated = Date.now();
  }

  private calculateArc(history: MotifHistoryEntry[]): MotifArc {
    if (history.length < 2) {
      return "DORMANT";
    }

    const recent = history.slice(-this.config.reinforceThreshold);
    const valences = recent.map((h) => h.emotionalVector.valence);

    let sameDirectionCount = 0;
    let oppositeDirectionCount = 0;

    for (let i = 1; i < valences.length; i++) {
      const prev = valences[i - 1];
      const curr = valences[i];
      if (prev !== undefined && curr !== undefined) {
        if ((prev > 0 && curr > 0) || (prev < 0 && curr < 0)) {
          sameDirectionCount++;
        } else if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
          oppositeDirectionCount++;
        }
      }
    }

    if (sameDirectionCount >= this.config.reinforceThreshold - 1) {
      return "REINFORCE";
    }

    if (oppositeDirectionCount >= this.config.contrastThreshold) {
      return "CONTRAST";
    }

    if (history.length >= 3) {
      return "TRANSMUTE";
    }

    return "DORMANT";
  }

  getMotifEcho(motif: string): MotifEcho | null {
    const entry = this.index.motifs[motif];
    if (!entry || !entry.lastAppearance) {
      return null;
    }

    return {
      object: motif,
      priorEmotion: entry.lastAppearance.emotion,
      directive: entry.currentArc,
      distance: entry.history.length > 0 ? entry.history.length : 0,
    };
  }

  getMotifEchoForText(text: string): MotifEcho | null {
    const motifs = this.scanMotifs(text);
    if (motifs.length === 0) {
      return null;
    }

    for (const motif of motifs) {
      const echo = this.getMotifEcho(motif);
      if (echo) {
        return echo;
      }
    }

    return null;
  }

  getIndex(): MotifIndex {
    return MotifIndexSchema.parse(this.index);
  }

  loadIndex(index: MotifIndex): void {
    this.index = MotifIndexSchema.parse(index);
  }

  getMotifEntry(motif: string): MotifIndexEntry | undefined {
    return this.index.motifs[motif];
  }

  getAllMotifs(): string[] {
    return Object.keys(this.index.motifs);
  }

  getMotifsByArc(arc: MotifArc): string[] {
    return Object.entries(this.index.motifs)
      .filter(([_, entry]) => entry.currentArc === arc)
      .map(([name, _]) => name);
  }

  clear(): void {
    this.index = MotifIndexSchema.parse({ motifs: {} });
  }
}

export function createMotifIndexer(initialIndex?: MotifIndex, config?: MotifIndexerConfig): MotifIndexer {
  return new MotifIndexer(initialIndex, config);
}
