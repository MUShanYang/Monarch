import { z } from "zod";
import type { Beat, BeatCandidate, NarrativeDNA, SpeculativeVariant } from "./beat-types.js";
import { SPECULATIVE_VARIANTS, BeatCandidateSchema } from "./beat-types.js";

export const SyntacticVariantIdSchema = z.enum(["SYN_PARATAXIS", "SYN_HYPOTAXIS", "SYN_NOMINAL"]);
export type SyntacticVariantId = z.infer<typeof SyntacticVariantIdSchema>;

export const SyntacticVariantSchema = z.object({
  id: SyntacticVariantIdSchema,
  suffix: z.string().min(1),
  description: z.string().optional(),
});
export type SyntacticVariant = z.infer<typeof SyntacticVariantSchema>;

export const SYNTACTIC_VARIANTS: readonly [SyntacticVariant, SyntacticVariant, SyntacticVariant] = [
  {
    id: "SYN_PARATAXIS",
    suffix: "Use short declarative sentences. Avoid 'and', 'but', 'however'. Parataxis.",
    description: "Short, punchy sentences. Creates urgency and directness.",
  },
  {
    id: "SYN_HYPOTAXIS",
    suffix: "Use one long sentence with subordinate clauses. Hypotaxis.",
    description: "Complex, flowing sentences. Creates depth and introspection.",
  },
  {
    id: "SYN_NOMINAL",
    suffix: "Reduce active verbs. Focus on nouns and adjectives. Nominal style.",
    description: "Static, descriptive. Creates atmosphere and stillness.",
  },
] as const;

export const GeneratorStateSchema = z.object({
  preferredSyntacticVariant: SyntacticVariantIdSchema.optional(),
  consecutiveWins: z.number().int().min(0).default(0),
  totalGenerations: z.number().int().min(0).default(0),
  variantWinCounts: z.record(z.string(), z.number()).default({}),
});
export type GeneratorState = z.infer<typeof GeneratorStateSchema>;

export const VoiceProfileSchema = z.object({
  averageSentenceLength: z.number().min(1),
  sentenceLengthVariance: z.number().min(0),
  parataxisRatio: z.number().min(0).max(1).optional(),
  hypotaxisRatio: z.number().min(0).max(1).optional(),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export interface SpeculativeGeneratorConfig {
  enableSyntacticVariants?: boolean;
  autoRegressionThreshold?: number;
  maxConcurrentGenerations?: number;
}

const DEFAULT_CONFIG: Required<SpeculativeGeneratorConfig> = {
  enableSyntacticVariants: true,
  autoRegressionThreshold: 2,
  maxConcurrentGenerations: 3,
};

export interface GenerationRequest {
  beat: Beat;
  semanticVariant: SpeculativeVariant;
  syntacticVariant?: SyntacticVariant;
  voiceProfile?: VoiceProfile;
}

export interface GenerationResult {
  prose: string;
  wordCount: number;
  semanticVariantId: string;
  syntacticVariantId?: string;
  sentenceLengthVariance: number;
}

export interface GenerationBatch {
  semanticVariantId?: string;
  requests: [GenerationRequest, GenerationRequest, GenerationRequest];
}

export class SpeculativeGenerator {
  private state: GeneratorState;
  private config: Required<SpeculativeGeneratorConfig>;
  private voiceProfile: VoiceProfile | undefined;

  constructor(
    initialState?: GeneratorState,
    config?: SpeculativeGeneratorConfig,
    voiceProfile?: VoiceProfile
  ) {
    this.state = GeneratorStateSchema.parse(initialState ?? {});
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.voiceProfile = voiceProfile;
  }

  getGenerationRequests(beat: Beat): GenerationRequest[] {
    return this.getGenerationBatches(beat).flatMap((batch) => batch.requests);
  }

  getGenerationBatches(beat: Beat): GenerationBatch[] {
    const requests: GenerationRequest[] = [];

    if (!this.config.enableSyntacticVariants) {
      for (const semantic of SPECULATIVE_VARIANTS) {
        requests.push({
          beat,
          semanticVariant: semantic,
          voiceProfile: this.voiceProfile,
        });
      }
      return [
        {
          requests: requests as [GenerationRequest, GenerationRequest, GenerationRequest],
        },
      ];
    }

    if (this.state.preferredSyntacticVariant && this.state.consecutiveWins >= this.config.autoRegressionThreshold) {
      const preferredSyntactic = SYNTACTIC_VARIANTS.find((v) => v.id === this.state.preferredSyntacticVariant);
      if (preferredSyntactic) {
        for (const semantic of SPECULATIVE_VARIANTS) {
          requests.push({
            beat,
            semanticVariant: semantic,
            syntacticVariant: preferredSyntactic,
            voiceProfile: this.voiceProfile,
          });
        }
        return [
          {
            requests: requests as [GenerationRequest, GenerationRequest, GenerationRequest],
          },
        ];
      }
    }

    const batches: GenerationBatch[] = [];
    for (const semantic of SPECULATIVE_VARIANTS) {
      const batchRequests: GenerationRequest[] = [];
      for (const syntactic of SYNTACTIC_VARIANTS) {
        batchRequests.push({
          beat,
          semanticVariant: semantic,
          syntacticVariant: syntactic,
          voiceProfile: this.voiceProfile,
        });
      }
      batches.push({
        semanticVariantId: semantic.id,
        requests: batchRequests as [GenerationRequest, GenerationRequest, GenerationRequest],
      });
    }

    return batches;
  }

  buildPromptSuffix(semantic: SpeculativeVariant, syntactic?: SyntacticVariant): string {
    let suffix = semantic.suffix;
    if (syntactic) {
      suffix = `${suffix} ${syntactic.suffix}`;
    }
    return suffix;
  }

  scoreCandidate(result: GenerationResult, voiceProfile?: VoiceProfile): number {
    let score = 0;

    const wordCountScore = this.scoreWordCount(result.wordCount);
    score += wordCountScore;

    if (voiceProfile && result.sentenceLengthVariance !== undefined) {
      const varianceScore = this.scoreSentenceVariance(
        result.sentenceLengthVariance,
        voiceProfile.sentenceLengthVariance
      );
      score += varianceScore;
    }

    if (result.syntacticVariantId) {
      const variantBonus = this.getSyntacticVariantBonus(result.syntacticVariantId);
      score += variantBonus;
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreWordCount(wordCount: number): number {
    if (wordCount >= 60 && wordCount <= 120) return 30;
    if (wordCount >= 40 && wordCount <= 150) return 20;
    if (wordCount >= 30 && wordCount <= 180) return 10;
    return 0;
  }

  private scoreSentenceVariance(actual: number, target: number): number {
    const diff = Math.abs(actual - target);
    if (diff <= 2) return 20;
    if (diff <= 5) return 15;
    if (diff <= 10) return 10;
    if (diff <= 20) return 5;
    return 0;
  }

  private getSyntacticVariantBonus(variantId: string): number {
    const wins = this.state.variantWinCounts[variantId] ?? 0;
    return Math.min(10, wins * 2);
  }

  updateStateAfterSelection(
    semanticVariantId: string,
    syntacticVariantId: string | undefined,
    wasSelected: boolean
  ): void {
    this.state.totalGenerations += 1;

    if (!wasSelected || !syntacticVariantId) return;

    this.state.variantWinCounts[syntacticVariantId] = (this.state.variantWinCounts[syntacticVariantId] ?? 0) + 1;

    if (syntacticVariantId === this.state.preferredSyntacticVariant) {
      this.state.consecutiveWins += 1;
    } else {
      this.state.preferredSyntacticVariant = syntacticVariantId as SyntacticVariantId;
      this.state.consecutiveWins = 1;
    }
  }

  calculateSentenceLengthVariance(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;

    return Math.sqrt(variance);
  }

  analyzeVoiceSample(sampleText: string): VoiceProfile {
    const sentences = sampleText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) {
      return VoiceProfileSchema.parse({
        averageSentenceLength: 15,
        sentenceLengthVariance: 5,
      });
    }

    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    const conjunctions = ["and", "but", "however", "although", "because", "while", "when", "if"];
    let subordinateCount = 0;
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      for (const conj of conjunctions) {
        if (lower.includes(` ${conj} `)) {
          subordinateCount++;
          break;
        }
      }
    }

    const hypotaxisRatio = subordinateCount / sentences.length;
    const parataxisRatio = 1 - hypotaxisRatio;

    return VoiceProfileSchema.parse({
      averageSentenceLength: mean,
      sentenceLengthVariance: stdDev,
      parataxisRatio,
      hypotaxisRatio,
    });
  }

  setVoiceProfile(profile: VoiceProfile): void {
    this.voiceProfile = profile;
  }

  getState(): GeneratorState {
    return GeneratorStateSchema.parse(this.state);
  }

  loadState(state: GeneratorState): void {
    this.state = GeneratorStateSchema.parse(state);
  }

  getPreferredSyntacticVariant(): SyntacticVariantId | undefined {
    return this.state.preferredSyntacticVariant;
  }

  getConsecutiveWins(): number {
    return this.state.consecutiveWins;
  }
}

export function createSpeculativeGenerator(
  initialState?: GeneratorState,
  config?: SpeculativeGeneratorConfig,
  voiceProfile?: VoiceProfile
): SpeculativeGenerator {
  return new SpeculativeGenerator(initialState, config, voiceProfile);
}

export function buildMotifEchoPrompt(motifEcho: NarrativeDNA["motifEcho"]): string {
  if (!motifEcho) return "";

  return `[CRITICAL MOTIF ECHO]
This beat contains the motif '${motifEcho.object}'. In the past it was tied to ${motifEcho.priorEmotion}.
Directive: ${motifEcho.directive}.
Write accordingly.`;
}

export function buildSensoryEchoPrompt(sensoryEcho: NarrativeDNA["sensoryEcho"]): string {
  if (!sensoryEcho) return "";

  return `[SENSORY FLASHBACK MICRO-INJECTION]
The motif '${sensoryEcho.motif}' appears again. 
At some point in this beat, the character must experience a brief physical interruption: ${sensoryEcho.physicalInterrupt}.
Duration: ~${sensoryEcho.duration}.
DO NOT explain why. Just let it happen naturally in the body, then continue.`;
}
