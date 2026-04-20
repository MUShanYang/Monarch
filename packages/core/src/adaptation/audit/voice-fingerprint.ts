import { z } from "zod";

export const VoiceFeatureSchema = z.object({
  type: z.enum(["vocabulary", "sentence_length", "rhythm_pattern", "punctuation", "dialogue_style"]),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.record(z.unknown())]),
  weight: z.number().min(0).max(1).default(0.2),
});
export type VoiceFeature = z.infer<typeof VoiceFeatureSchema>;

export const VoiceFingerprintSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["reference_text", "style_guide", "author_sample"]),
  features: z.array(VoiceFeatureSchema).default([]),
  createdAt: z.string().datetime(),
  sampleSize: z.number().int().min(1).default(1),
});
export type VoiceFingerprint = z.infer<typeof VoiceFingerprintSchema>;

export const VoiceComparisonResultSchema = z.object({
  similarity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  mismatches: z.array(z.object({
    feature: z.string(),
    expected: z.unknown(),
    actual: z.unknown(),
    deviation: z.number(),
  })).default([]),
  isConsistent: z.boolean(),
  threshold: z.number().min(0).max(1),
});
export type VoiceComparisonResult = z.infer<typeof VoiceComparisonResultSchema>;

export const VoiceFingerprintConfigSchema = z.object({
  similarityThreshold: z.number().min(0).max(1).default(0.75),
  minSampleSize: z.number().int().min(1).default(100),
  featureWeights: z.record(z.number().min(0).max(1)).default({
    vocabulary: 0.25,
    sentence_length: 0.2,
    rhythm_pattern: 0.2,
    punctuation: 0.15,
    dialogue_style: 0.2,
  }),
  enableLearning: z.boolean().default(true),
});
export type VoiceFingerprintConfig = z.infer<typeof VoiceFingerprintConfigSchema>;

const DEFAULT_CONFIG: Required<VoiceFingerprintConfig> = {
  similarityThreshold: 0.75,
  minSampleSize: 100,
  featureWeights: {
    vocabulary: 0.25,
    sentence_length: 0.2,
    rhythm_pattern: 0.2,
    punctuation: 0.15,
    dialogue_style: 0.2,
  },
  enableLearning: true,
};

export class VoiceFingerprintAnalyzer {
  private config: Required<VoiceFingerprintConfig>;
  private fingerprints: Map<string, VoiceFingerprint> = new Map();

  constructor(config?: VoiceFingerprintConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  extractFingerprint(text: string, id: string, source: VoiceFingerprint["source"]): VoiceFingerprint {
    const features: VoiceFeature[] = [];

    features.push(this.extractVocabularyFeature(text));
    features.push(this.extractSentenceLengthFeature(text));
    features.push(this.extractRhythmPattern(text));
    features.push(this.extractPunctuationFeature(text));
    features.push(this.extractDialogueStyle(text));

    const fingerprint: VoiceFingerprint = {
      id,
      source,
      features,
      createdAt: new Date().toISOString(),
      sampleSize: text.length,
    };

    this.fingerprints.set(id, fingerprint);
    return fingerprint;
  }

  compareWithFingerprint(
    text: string,
    fingerprintId: string,
    customThreshold?: number
  ): VoiceComparisonResult {
    const reference = this.fingerprints.get(fingerprintId);
    if (!reference) {
      return {
        similarity: 0,
        confidence: 0,
        mismatches: [{ feature: "reference", expected: fingerprintId, actual: "not found", deviation: 1 }],
        isConsistent: false,
        threshold: customThreshold ?? this.config.similarityThreshold,
      };
    }

    const current = this.extractFingerprint(text, `temp-${Date.now()}`, "reference_text");
    return this.compareFingerprints(current, reference, customThreshold);
  }

  compareFingerprints(
    current: VoiceFingerprint,
    reference: VoiceFingerprint,
    customThreshold?: number
  ): VoiceComparisonResult {
    const mismatches: VoiceComparisonResult["mismatches"] = [];
    let totalWeightedSimilarity = 0;
    let totalWeight = 0;

    for (const refFeature of reference.features) {
      const currentFeature = current.features.find((f) => f.type === refFeature.type);
      if (!currentFeature) continue;

      const featureWeight = this.config.featureWeights[refFeature.type] ?? 0.2;
      const similarity = this.calculateFeatureSimilarity(refFeature, currentFeature);
      const weightedSimilarity = similarity * featureWeight;

      totalWeightedSimilarity += weightedSimilarity;
      totalWeight += featureWeight;

      if (similarity < 0.5) {
        mismatches.push({
          feature: refFeature.type,
          expected: refFeature.value,
          actual: currentFeature.value,
          deviation: 1 - similarity,
        });
      }
    }

    const overallSimilarity = totalWeight > 0 ? totalWeightedSimilarity / totalWeight : 0;
    const threshold = customThreshold ?? this.config.similarityThreshold;

    return {
      similarity: overallSimilarity,
      confidence: Math.min(1, reference.sampleSize / this.config.minSampleSize),
      mismatches,
      isConsistent: overallSimilarity >= threshold,
      threshold,
    };
  }

  private extractVocabularyFeature(text: string): VoiceFeature {
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
    const uniqueWords = new Set(words);
    const wordFreq: Record<string, number> = {};

    for (const word of words) {
      wordFreq[word] = (wordFreq[word] ?? 0) + 1;
    }

    const topWords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    return {
      type: "vocabulary",
      value: topWords,
      weight: this.config.featureWeights.vocabulary ?? 0.25,
    };
  }

  private extractSentenceLengthFeature(text: string): VoiceFeature {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const lengths = sentences.map((s) => s.split(/\s+/).length);

    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length || 0;
    const shortSentences = lengths.filter((l) => l < 10).length;
    const longSentences = lengths.filter((l) => l > 25).length;

    return {
      type: "sentence_length",
      value: {
        average: Math.round(avgLength),
        distribution: {
          short: shortSentences / lengths.length,
          medium: (lengths.length - shortSentences - longSentences) / lengths.length,
          long: longSentences / lengths.length,
        },
      },
      weight: this.config.featureWeights.sentence_length ?? 0.2,
    };
  }

  private extractRhythmPattern(text: string): VoiceFeature {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const patterns: string[] = [];

    for (const sentence of sentences.slice(0, 10)) {
      const words = sentence.trim().split(/\s+/);
      const pattern = words.map((w) => {
        if (w.length <= 3) return "S";
        if (w.length <= 6) return "M";
        return "L";
      }).join("-");
      patterns.push(pattern);
    }

    return {
      type: "rhythm_pattern",
      value: patterns,
      weight: this.config.featureWeights.rhythm_pattern ?? 0.2,
    };
  }

  private extractPunctuationFeature(text: string): VoiceFeature {
    const totalChars = text.length;
    const commas = (text.match(/,/g) ?? []).length;
    const semicolons = (text.match(/;/g) ?? []).length;
    const emDashes = (text.match(/—/g) ?? []).length;
    const ellipses = (text.match(/…/g) ?? []).length;

    return {
      type: "punctuation",
      value: {
        commaDensity: commas / totalChars,
        semicolonDensity: semicolons / totalChars,
        emDashDensity: emDashes / totalChars,
        ellipsisDensity: ellipses / totalChars,
      },
      weight: this.config.featureWeights.punctuation ?? 0.15,
    };
  }

  private extractDialogueStyle(text: string): VoiceFeature {
    const dialogueMatches = text.match(/"[^"]*"/g) ?? [];
    const totalDialogue = dialogueMatches.join(" ").length;
    const totalText = text.length;

    const dialogueRatio = totalText > 0 ? totalDialogue / totalText : 0;

    const dialogueTags = text.match(/\b(said|asked|replied|muttered|shouted)\b/gi) ?? [];
    const tagRatio = dialogueMatches.length > 0 ? dialogueTags.length / dialogueMatches.length : 0;

    return {
      type: "dialogue_style",
      value: {
        dialogueRatio,
        tagRatio,
        avgDialogueLength: dialogueMatches.length > 0
          ? totalDialogue / dialogueMatches.length
          : 0,
      },
      weight: this.config.featureWeights.dialogue_style ?? 0.2,
    };
  }

  private calculateFeatureSimilarity(feature1: VoiceFeature, feature2: VoiceFeature): number {
    if (feature1.type !== feature2.type) return 0;

    const val1 = feature1.value;
    const val2 = feature2.value;

    if (Array.isArray(val1) && Array.isArray(val2)) {
      const intersection = val1.filter((v) => val2.includes(v));
      const union = new Set([...val1, ...val2]);
      return union.size > 0 ? intersection.length / union.size : 0;
    }

    if (typeof val1 === "number" && typeof val2 === "number") {
      const max = Math.max(val1, val2);
      return max > 0 ? 1 - Math.abs(val1 - val2) / max : 1;
    }

    if (typeof val1 === "object" && typeof val2 === "object" && val1 !== null && val2 !== null) {
      const keys1 = Object.keys(val1);
      const keys2 = Object.keys(val2);
      const commonKeys = keys1.filter((k) => keys2.includes(k));

      if (commonKeys.length === 0) return 0;

      let totalSimilarity = 0;
      for (const key of commonKeys) {
        const v1 = (val1 as Record<string, number>)[key];
        const v2 = (val2 as Record<string, number>)[key];
        if (typeof v1 === "number" && typeof v2 === "number") {
          const max = Math.max(v1, v2);
          totalSimilarity += max > 0 ? 1 - Math.abs(v1 - v2) / max : 1;
        }
      }

      return totalSimilarity / commonKeys.length;
    }

    return val1 === val2 ? 1 : 0;
  }

  getFingerprint(id: string): VoiceFingerprint | undefined {
    return this.fingerprints.get(id);
  }

  getAllFingerprints(): VoiceFingerprint[] {
    return [...this.fingerprints.values()];
  }

  deleteFingerprint(id: string): boolean {
    return this.fingerprints.delete(id);
  }

  getConfig(): Required<VoiceFingerprintConfig> {
    return { ...this.config };
  }
}

export function createVoiceFingerprintAnalyzer(
  config?: VoiceFingerprintConfig
): VoiceFingerprintAnalyzer {
  return new VoiceFingerprintAnalyzer(config);
}

export function extractVoiceFingerprint(
  text: string,
  id: string,
  source: VoiceFingerprint["source"]
): VoiceFingerprint {
  const analyzer = new VoiceFingerprintAnalyzer();
  return analyzer.extractFingerprint(text, id, source);
}
