import { z } from "zod";
import type { NarrativeDNA } from "../beat/beat-types.js";

export const AttentionMultiplierSchema = z.object({
  field: z.enum([
    "who",
    "where",
    "mustInclude",
    "mustNotInclude",
    "lastBeatSummary",
    "tensionContext",
    "hookContext",
    "emotionalContext",
    "spatialConstraints",
    "motifEcho",
  ]),
  weight: z.number().min(0).max(2).default(1),
  reason: z.string().optional(),
  source: z.enum(["intent_compiler", "user_override", "system_default"]).default("system_default"),
});
export type AttentionMultiplier = z.infer<typeof AttentionMultiplierSchema>;

export const AttentionProfileSchema = z.object({
  profileId: z.string().min(1),
  multipliers: z.array(AttentionMultiplierSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  chapterRange: z.tuple([z.number().int(), z.number().int()]).optional(),
});
export type AttentionProfile = z.infer<typeof AttentionProfileSchema>;

export const WeightedDNAFieldSchema = z.object({
  field: z.string(),
  originalValue: z.unknown(),
  weightedValue: z.unknown(),
  weight: z.number(),
  emphasis: z.enum(["reduced", "normal", "enhanced", "critical"]),
});
export type WeightedDNAField = z.infer<typeof WeightedDNAFieldSchema>;

export const AttentionMultiplierConfigSchema = z.object({
  defaultWeight: z.number().min(0).max(2).default(1),
  minWeight: z.number().min(0).max(2).default(0.1),
  maxWeight: z.number().min(0).max(2).default(2),
  enableDynamicAdjustment: z.boolean().default(true),
  adjustmentThreshold: z.number().min(0).max(1).default(0.3),
});
export type AttentionMultiplierConfig = z.infer<typeof AttentionMultiplierConfigSchema>;

const DEFAULT_CONFIG: Required<AttentionMultiplierConfig> = {
  defaultWeight: 1,
  minWeight: 0.1,
  maxWeight: 2,
  enableDynamicAdjustment: true,
  adjustmentThreshold: 0.3,
};

const SYSTEM_DEFAULTS: AttentionMultiplier[] = [
  { field: "who", weight: 1.2, reason: "Character presence is important", source: "system_default" },
  { field: "where", weight: 1.0, reason: "Location context", source: "system_default" },
  { field: "mustInclude", weight: 1.5, reason: "Required elements must appear", source: "system_default" },
  { field: "mustNotInclude", weight: 1.5, reason: "Forbidden elements must be avoided", source: "system_default" },
  { field: "lastBeatSummary", weight: 0.8, reason: "Continuity reference", source: "system_default" },
  { field: "tensionContext", weight: 1.3, reason: "Tension drives narrative", source: "system_default" },
  { field: "hookContext", weight: 1.4, reason: "Hooks need payoff", source: "system_default" },
  { field: "emotionalContext", weight: 1.1, reason: "Emotional resonance", source: "system_default" },
  { field: "spatialConstraints", weight: 1.0, reason: "Physical consistency", source: "system_default" },
  { field: "motifEcho", weight: 1.2, reason: "Thematic resonance", source: "system_default" },
];

export class AttentionMultiplierManager {
  private config: Required<AttentionMultiplierConfig>;
  private profiles: Map<string, AttentionProfile> = new Map();
  private activeProfileId: string | null = null;

  constructor(config?: AttentionMultiplierConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.createDefaultProfile();
  }

  private createDefaultProfile(): void {
    const now = new Date().toISOString();
    const defaultProfile: AttentionProfile = {
      profileId: "default",
      multipliers: [...SYSTEM_DEFAULTS],
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set("default", defaultProfile);
    this.activeProfileId = "default";
  }

  applyMultipliers(dna: NarrativeDNA, profileId?: string): WeightedDNAField[] {
    const profile = profileId ? this.profiles.get(profileId) : this.getActiveProfile();
    if (!profile) {
      return this.createUnweightedFields(dna);
    }

    const weightedFields: WeightedDNAField[] = [];

    for (const multiplier of profile.multipliers) {
      const field = this.extractField(dna, multiplier.field);
      const emphasis = this.calculateEmphasis(multiplier.weight);

      weightedFields.push({
        field: multiplier.field,
        originalValue: field,
        weightedValue: this.applyWeight(field, multiplier.weight),
        weight: multiplier.weight,
        emphasis,
      });
    }

    return weightedFields;
  }

  createProfile(
    profileId: string,
    multipliers: Omit<AttentionMultiplier, "source">[],
    chapterRange?: [number, number]
  ): AttentionProfile {
    const now = new Date().toISOString();

    const profile: AttentionProfile = {
      profileId,
      multipliers: multipliers.map((m) => ({
        ...m,
        source: "user_override",
      })),
      createdAt: now,
      updatedAt: now,
      chapterRange,
    };

    this.profiles.set(profileId, profile);
    return profile;
  }

  updateMultiplier(
    profileId: string,
    field: AttentionMultiplier["field"],
    weight: number,
    reason?: string
  ): AttentionProfile | null {
    const profile = this.profiles.get(profileId);
    if (!profile) return null;

    const existingIndex = profile.multipliers.findIndex((m) => m.field === field);
    const clampedWeight = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, weight));

    const newMultiplier: AttentionMultiplier = {
      field,
      weight: clampedWeight,
      reason,
      source: "user_override",
    };

    if (existingIndex >= 0) {
      profile.multipliers[existingIndex] = newMultiplier;
    } else {
      profile.multipliers.push(newMultiplier);
    }

    profile.updatedAt = new Date().toISOString();
    return profile;
  }

  setActiveProfile(profileId: string): boolean {
    if (!this.profiles.has(profileId)) return false;
    this.activeProfileId = profileId;
    return true;
  }

  getActiveProfile(): AttentionProfile | null {
    return this.activeProfileId ? this.profiles.get(this.activeProfileId) ?? null : null;
  }

  getProfile(profileId: string): AttentionProfile | null {
    return this.profiles.get(profileId) ?? null;
  }

  deleteProfile(profileId: string): boolean {
    if (profileId === "default") return false;
    return this.profiles.delete(profileId);
  }

  generatePromptEmphasis(weightedFields: WeightedDNAField[]): string {
    const criticalFields = weightedFields.filter((f) => f.emphasis === "critical");
    const enhancedFields = weightedFields.filter((f) => f.emphasis === "enhanced");

    const parts: string[] = [];

    if (criticalFields.length > 0) {
      parts.push("**CRITICAL FOCUS**:");
      for (const field of criticalFields) {
        parts.push(`- ${field.field}: ${this.formatValue(field.weightedValue)}`);
      }
      parts.push("");
    }

    if (enhancedFields.length > 0) {
      parts.push("**Enhanced Attention**:");
      for (const field of enhancedFields) {
        parts.push(`- ${field.field}: ${this.formatValue(field.weightedValue)}`);
      }
      parts.push("");
    }

    return parts.join("\n");
  }

  private extractField(dna: NarrativeDNA, field: AttentionMultiplier["field"]): unknown {
    switch (field) {
      case "who":
        return dna.who;
      case "where":
        return dna.where;
      case "mustInclude":
        return dna.mustInclude;
      case "mustNotInclude":
        return dna.mustNotInclude;
      case "lastBeatSummary":
        return dna.lastBeatSummary;
      case "tensionContext":
        return dna.tensionContext;
      case "hookContext":
        return dna.hookContext;
      case "emotionalContext":
        return dna.emotionalContext;
      case "spatialConstraints":
        return dna.spatialConstraints;
      case "motifEcho":
        return dna.motifEcho;
      default:
        return null;
    }
  }

  private applyWeight(value: unknown, weight: number): unknown {
    if (weight === 1) return value;

    if (Array.isArray(value)) {
      if (weight > 1) {
        const repetitions = Math.ceil(weight);
        return Array(repetitions).fill(value).flat().slice(0, value.length * 2);
      }
      return value;
    }

    if (typeof value === "string") {
      if (weight > 1.3) return `[IMPORTANT] ${value}`;
      if (weight < 0.7) return `[REFERENCE] ${value}`;
      return value;
    }

    if (typeof value === "number") {
      return value * weight;
    }

    return value;
  }

  private calculateEmphasis(weight: number): WeightedDNAField["emphasis"] {
    if (weight >= 1.5) return "critical";
    if (weight >= 1.2) return "enhanced";
    if (weight <= 0.5) return "reduced";
    return "normal";
  }

  private createUnweightedFields(dna: NarrativeDNA): WeightedDNAField[] {
    const fields: WeightedDNAField[] = [];

    for (const defaultMult of SYSTEM_DEFAULTS) {
      const value = this.extractField(dna, defaultMult.field);
      fields.push({
        field: defaultMult.field,
        originalValue: value,
        weightedValue: value,
        weight: 1,
        emphasis: "normal",
      });
    }

    return fields;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return "N/A";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  getAllProfiles(): AttentionProfile[] {
    return [...this.profiles.values()];
  }

  getConfig(): Required<AttentionMultiplierConfig> {
    return { ...this.config };
  }
}

export function createAttentionMultiplierManager(
  config?: AttentionMultiplierConfig
): AttentionMultiplierManager {
  return new AttentionMultiplierManager(config);
}

export function applyAttentionMultipliers(
  dna: NarrativeDNA,
  multipliers: AttentionMultiplier[]
): WeightedDNAField[] {
  const manager = new AttentionMultiplierManager();
  const profile = manager.createProfile("temp", multipliers);
  return manager.applyMultipliers(dna, profile.profileId);
}
