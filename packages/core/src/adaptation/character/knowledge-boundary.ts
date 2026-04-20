import { z } from "zod";

export const KnowledgeBoundarySchema = z.object({
  characterId: z.string().min(1),
  knows: z.array(z.string()).default([]),
  suspects: z.array(z.string()).default([]),
  doesNotKnow: z.array(z.string()).default([]),
});
export type KnowledgeBoundary = z.infer<typeof KnowledgeBoundarySchema>;

export const KnowledgeBreachSchema = z.object({
  characterId: z.string().min(1),
  breachType: z.enum(["knows", "suspects", "unknown"]),
  violatedFact: z.string().min(1),
  evidence: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]).default("major"),
});
export type KnowledgeBreach = z.infer<typeof KnowledgeBreachSchema>;

export const KnowledgeCheckResultSchema = z.object({
  breaches: z.array(KnowledgeBreachSchema).default([]),
  hasBreach: z.boolean(),
  checkedFacts: z.number().int().min(0).default(0),
});
export type KnowledgeCheckResult = z.infer<typeof KnowledgeCheckResultSchema>;

export const KnowledgeBoundaryConfigSchema = z.object({
  enableStemming: z.boolean().default(true),
  enableSynonymExpansion: z.boolean().default(true),
  similarityThreshold: z.number().min(0).max(1).default(0.72),
  useEmbeddingModel: z.boolean().default(false),
});
export type KnowledgeBoundaryConfig = z.infer<typeof KnowledgeBoundaryConfigSchema>;

const DEFAULT_CONFIG: Required<KnowledgeBoundaryConfig> = {
  enableStemming: true,
  enableSynonymExpansion: true,
  similarityThreshold: 0.72,
  useEmbeddingModel: false,
};

const SYNONYM_MAP: Record<string, string[]> = {
  knife: ["blade", "dagger", "sword", "edge", "steel"],
  blade: ["knife", "dagger", "sword", "edge"],
  murder: ["kill", "killing", "homicide", "death", "slaying"],
  kill: ["murder", "slay", "execute", "eliminate"],
  weapon: ["arm", "tool", "instrument"],
  blood: ["gore", "crimson", "sanguine"],
  dead: ["deceased", "lifeless", "corpse"],
  secret: ["hidden", "concealed", "covert"],
  truth: ["fact", "reality", "actuality"],
  lie: ["falsehood", "deception", "fabrication"],
};

function extractWordRoots(text: string): Set<string> {
  const roots = new Set<string>();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const word of words) {
    roots.add(stemWord(word));
  }

  return roots;
}

function stemWord(word: string): string {
  const suffixes = ["ing", "ed", "er", "est", "ly", "tion", "s", "es"];
  let stem = word.toLowerCase();

  for (const suffix of suffixes) {
    if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  return stem;
}

function expandWithSynonyms(roots: Set<string>): Set<string> {
  const expanded = new Set(roots);

  for (const root of roots) {
    const synonyms = SYNONYM_MAP[root];
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
        expanded.add(stemWord(synonym));
      }
    }
  }

  return expanded;
}

export class KnowledgeBoundaryChecker {
  private config: Required<KnowledgeBoundaryConfig>;

  constructor(config?: KnowledgeBoundaryConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  checkBoundary(
    dialogue: string,
    boundary: KnowledgeBoundary,
    otherBoundaries: KnowledgeBoundary[] = []
  ): KnowledgeCheckResult {
    const breaches: KnowledgeBreach[] = [];
    const dialogueRoots = this.extractAndExpandRoots(dialogue);

    const checkedFacts = this.countCheckedFacts(boundary, otherBoundaries);

    for (const unknownFact of boundary.doesNotKnow) {
      if (this.containsKnowledge(dialogue, unknownFact, dialogueRoots)) {
        breaches.push({
          characterId: boundary.characterId,
          breachType: "knows",
          violatedFact: unknownFact,
          evidence: `Character mentioned knowledge they should not have: "${unknownFact}"`,
          severity: "critical",
        });
      }
    }

    for (const suspectFact of boundary.suspects) {
      const isConfirmed = this.containsConfirmedKnowledge(dialogue, suspectFact, dialogueRoots);
      if (isConfirmed) {
        breaches.push({
          characterId: boundary.characterId,
          breachType: "suspects",
          violatedFact: suspectFact,
          evidence: `Character treated suspicion as confirmed fact: "${suspectFact}"`,
          severity: "major",
        });
      }
    }

    for (const otherBoundary of otherBoundaries) {
      const otherBreaches = this.checkCrossCharacterLeak(dialogue, boundary, otherBoundary, dialogueRoots);
      breaches.push(...otherBreaches);
    }

    return KnowledgeCheckResultSchema.parse({
      breaches,
      hasBreach: breaches.length > 0,
      checkedFacts,
    });
  }

  private extractAndExpandRoots(text: string): Set<string> {
    let roots = extractWordRoots(text);

    if (this.config.enableSynonymExpansion) {
      roots = expandWithSynonyms(roots);
    }

    return roots;
  }

  private containsKnowledge(dialogue: string, fact: string, dialogueRoots: Set<string>): boolean {
    const factRoots = this.extractAndExpandRoots(fact);

    for (const factRoot of factRoots) {
      if (dialogueRoots.has(factRoot)) {
        return true;
      }
    }

    const factLower = fact.toLowerCase();
    const dialogueLower = dialogue.toLowerCase();

    if (dialogueLower.includes(factLower)) {
      return true;
    }

    const factWords = factLower.split(/\s+/);
    if (factWords.length > 1) {
      const allWordsPresent = factWords.every((word) => dialogueLower.includes(word));
      if (allWordsPresent) {
        return true;
      }
    }

    return false;
  }

  private containsConfirmedKnowledge(dialogue: string, suspicion: string, dialogueRoots: Set<string>): boolean {
    const certaintyWords = ["know", "knew", "sure", "certain", "fact", "true", "definitely", "absolutely"];
    const hasCertainty = certaintyWords.some((word) => dialogue.toLowerCase().includes(word));

    if (!hasCertainty) {
      return false;
    }

    return this.containsKnowledge(dialogue, suspicion, dialogueRoots);
  }

  private checkCrossCharacterLeak(
    dialogue: string,
    speakerBoundary: KnowledgeBoundary,
    otherBoundary: KnowledgeBoundary,
    dialogueRoots: Set<string>
  ): KnowledgeBreach[] {
    const breaches: KnowledgeBreach[] = [];

    for (const secret of otherBoundary.doesNotKnow) {
      if (this.containsKnowledge(dialogue, secret, dialogueRoots)) {
        const isPublicKnowledge = speakerBoundary.knows.includes(secret);

        if (!isPublicKnowledge) {
          breaches.push({
            characterId: speakerBoundary.characterId,
            breachType: "unknown",
            violatedFact: secret,
            evidence: `Character revealed ${otherBoundary.characterId}'s secret knowledge`,
            severity: "critical",
          });
        }
      }
    }

    return breaches;
  }

  private countCheckedFacts(boundary: KnowledgeBoundary, otherBoundaries: KnowledgeBoundary[]): number {
    let count = boundary.doesNotKnow.length + boundary.suspects.length;
    for (const other of otherBoundaries) {
      count += other.doesNotKnow.length;
    }
    return count;
  }

  getConfig(): Required<KnowledgeBoundaryConfig> {
    return { ...this.config };
  }
}

export function createKnowledgeBoundaryChecker(config?: KnowledgeBoundaryConfig): KnowledgeBoundaryChecker {
  return new KnowledgeBoundaryChecker(config);
}

export function checkKnowledgeBreach(
  dialogue: string,
  boundary: KnowledgeBoundary,
  otherBoundaries?: KnowledgeBoundary[]
): KnowledgeCheckResult {
  const checker = new KnowledgeBoundaryChecker();
  return checker.checkBoundary(dialogue, boundary, otherBoundaries);
}
