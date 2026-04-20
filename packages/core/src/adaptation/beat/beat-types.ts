import { z } from "zod";
import type { CharacterSnapshot, SpatialPosture, HandState } from "../types/state-types.js";
import type { MotifArc, MotifEcho as MotifEchoBase } from "../state/motif-types.js";
import { MotifArcSchema, MotifEchoSchema as MotifEchoSchemaBase } from "../state/motif-types.js";

export type MotifEcho = Omit<MotifEchoBase, "distance">;
export const MotifEchoSchema = MotifEchoSchemaBase.omit({ distance: true });

export const BeatTypeSchema = z.enum([
  "action",
  "dialogue",
  "interiority",
  "environment",
  "transition",
  "revelation",
  "tension",
  "resolution",
]);
export type BeatType = z.infer<typeof BeatTypeSchema>;

export const TensionLevelSchema = z.number().int().min(1).max(10);
export type TensionLevel = z.infer<typeof TensionLevelSchema>;

export const WordTargetSchema = z.tuple([z.number().int().min(1), z.number().int().min(1)]);
export type WordTarget = z.infer<typeof WordTargetSchema>;

export const CharacterSnapshotForDnaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spatialPosture: z.enum(["standing", "sitting", "lying", "crouching", "walking", "running", "fighting", "unconscious", "unknown"]).default("unknown"),
  handState: z.enum(["empty", "full", "occupied-both", "occupied-left", "occupied-right", "bound", "injured"]).default("empty"),
  heldItems: z.array(z.string()).default([]),
  currentLocation: z.string().optional(),
  emotionalState: z.string().optional(),
  activeDebts: z.array(z.string()).default([]),
  constraint: z.string().optional(),
});
export type CharacterSnapshotForDna = z.infer<typeof CharacterSnapshotForDnaSchema>;

export const SensoryEchoSchema = z.object({
  motif: z.string().min(1),
  physicalInterrupt: z.string().min(1),
  duration: z.string().default("0.5s"),
});
export type SensoryEcho = z.infer<typeof SensoryEchoSchema>;

export const NarrativeDNASchema = z.object({
  who: z.array(CharacterSnapshotForDnaSchema).default([]),
  where: z.string().max(200).default(""),
  mustInclude: z.array(z.string()).max(3).default([]),
  mustNotInclude: z.array(z.string()).default([]),
  lastBeatSummary: z.string().max(150).default(""),
  tensionContext: z.number().int().min(1).max(10).optional(),
  hookContext: z.array(z.string()).default([]),
  emotionalContext: z.string().optional(),
  spatialConstraints: z.array(z.string()).default([]),
  motifEcho: MotifEchoSchema.optional(),
  sensoryEcho: SensoryEchoSchema.optional(),
});
export type NarrativeDNA = z.infer<typeof NarrativeDNASchema>;

export const KineticScaffoldSchema = z.object({
  openingWords: z.string().min(1),
  reason: z.string().default(""),
  source: z.enum(["rhythm_guard", "manual", "transition"]).default("rhythm_guard"),
});
export type KineticScaffold = z.infer<typeof KineticScaffoldSchema>;

export const BeatSchema = z.object({
  id: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  sequenceInChapter: z.number().int().min(0),
  type: BeatTypeSchema,
  tensionLevel: TensionLevelSchema,
  targetWords: WordTargetSchema,
  dna: NarrativeDNASchema,
  kineticScaffold: KineticScaffoldSchema.optional(),
  chosen: z.string().optional(),
  candidates: z.array(z.string()).default([]),
  auditResult: z.any().optional(),
  retryCount: z.number().int().min(0).default(0),
  status: z.enum(["pending", "generated", "audited", "approved", "rejected"]).default("pending"),
});
export type Beat = z.infer<typeof BeatSchema>;

export const SpeculativeVariantSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  biasTone: z.string().min(1),
  suffix: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  stopSequences: z.array(z.string()).default([]),
});
export type SpeculativeVariant = z.infer<typeof SpeculativeVariantSchema>;

export const SPECULATIVE_VARIANTS: readonly [SpeculativeVariant, SpeculativeVariant, SpeculativeVariant] = [
  {
    id: "A",
    biasTone: "terse",
    suffix: "Short sentences. Physical detail. No interiority.",
    temperature: 0.7,
    stopSequences: ["\n\n", "###", "[END]", "Note:"],
  },
  {
    id: "B",
    biasTone: "internal",
    suffix: "Prioritize the character's inner experience.",
    temperature: 0.8,
    stopSequences: ["\n\n", "###", "[END]", "Note:"],
  },
  {
    id: "C",
    biasTone: "sensory",
    suffix: "Ground every sentence in concrete sensory detail.",
    temperature: 0.75,
    stopSequences: ["\n\n", "###", "[END]", "Note:"],
  },
] as const;

export const BeatCandidateSchema = z.object({
  variantId: z.enum(["A", "B", "C"]),
  prose: z.string().min(1),
  wordCount: z.number().int().min(0),
  passedRules: z.boolean(),
  passedProperNoun: z.boolean(),
  passedStructure: z.boolean(),
  passedVoice: z.boolean().optional(),
  passedContinuity: z.boolean().optional(),
  disqualified: z.boolean().default(false),
  disqualificationReason: z.string().optional(),
  score: z.number().min(0).default(0),
});
export type BeatCandidate = z.infer<typeof BeatCandidateSchema>;

export const BeatPlanSchema = z.object({
  chapterNumber: z.number().int().min(1),
  totalBeats: z.number().int().min(1),
  beats: z.array(BeatSchema).default([]),
  tensionCurve: z.array(z.number().int().min(1).max(10)).default([]),
  pacingDirective: z.enum(["slow", "medium", "fast", "variable"]).default("medium"),
  estimatedWordCount: z.number().int().min(0),
  sceneExitConditions: z.array(z.string()).default([]),
});
export type BeatPlan = z.infer<typeof BeatPlanSchema>;

export const ChapterPlanInputSchema = z.object({
  chapterNumber: z.number().int().min(1),
  intent: z.string().min(1),
  targetWordRange: WordTargetSchema,
  focusCharacters: z.array(z.string()).default([]),
  primaryLocation: z.string().optional(),
  tensionStart: TensionLevelSchema.default(5),
  tensionEnd: TensionLevelSchema.default(5),
  hooksToAdvance: z.array(z.string()).default([]),
  hooksToResolve: z.array(z.string()).default([]),
  requiredBeats: z.array(BeatTypeSchema).default([]),
  prohibitedBeats: z.array(BeatTypeSchema).default([]),
});
export type ChapterPlanInput = z.infer<typeof ChapterPlanInputSchema>;

export function createNarrativeDNA(params: {
  characters: CharacterSnapshotForDna[];
  location: string;
  mustInclude?: string[];
  mustNotInclude?: string[];
  lastBeatSummary?: string;
  tensionContext?: number;
  hookContext?: string[];
  emotionalContext?: string;
  motifEcho?: MotifEcho;
  sensoryEcho?: SensoryEcho;
}): NarrativeDNA {
  return NarrativeDNASchema.parse({
    who: params.characters,
    where: params.location.substring(0, 200),
    mustInclude: (params.mustInclude ?? []).slice(0, 3),
    mustNotInclude: params.mustNotInclude ?? [],
    lastBeatSummary: (params.lastBeatSummary ?? "").substring(0, 150),
    tensionContext: params.tensionContext,
    hookContext: params.hookContext ?? [],
    emotionalContext: params.emotionalContext,
    spatialConstraints: extractSpatialConstraints(params.characters),
    motifEcho: params.motifEcho,
    sensoryEcho: params.sensoryEcho,
  });
}

export function createBeat(params: {
  chapterNumber: number;
  sequenceInChapter: number;
  type: BeatType;
  tensionLevel: TensionLevel;
  targetWords: WordTarget;
  dna: NarrativeDNA;
  kineticScaffold?: KineticScaffold;
}): Beat {
  return BeatSchema.parse({
    id: `beat-${params.chapterNumber}-${String(params.sequenceInChapter).padStart(2, "0")}`,
    chapterNumber: params.chapterNumber,
    sequenceInChapter: params.sequenceInChapter,
    type: params.type,
    tensionLevel: params.tensionLevel,
    targetWords: params.targetWords,
    dna: params.dna,
    kineticScaffold: params.kineticScaffold,
    status: "pending",
    retryCount: 0,
    candidates: [],
  });
}

export function createKineticScaffold(openingWords: string, reason?: string): KineticScaffold {
  return KineticScaffoldSchema.parse({
    openingWords,
    reason: reason ?? "",
    source: "rhythm_guard",
  });
}

export function characterToDnaSnapshot(char: CharacterSnapshot): CharacterSnapshotForDna {
  return {
    id: char.id,
    name: char.name,
    spatialPosture: char.spatialPosture,
    handState: char.handState,
    heldItems: char.heldItems,
    currentLocation: char.currentLocation,
    emotionalState: char.emotionalDebts.length > 0 ? char.emotionalDebts[0]?.emotion : undefined,
    activeDebts: char.emotionalDebts.map((d) => d.emotion),
    constraint: char.handState !== "empty" ? `${char.name} cannot pick up or manipulate new items.` : undefined,
  };
}

function extractSpatialConstraints(characters: CharacterSnapshotForDna[]): string[] {
  const constraints: string[] = [];
  for (const char of characters) {
    if (char.handState !== "empty" && char.handState !== "injured") {
      constraints.push(`${char.name}'s hands are ${char.handState === "full" ? "full" : `occupied (${char.handState})`}.`);
    }
    if (char.heldItems.length > 0) {
      constraints.push(`${char.name} is holding: ${char.heldItems.join(", ")}.`);
    }
    if (char.constraint) {
      constraints.push(char.constraint);
    }
  }
  return constraints;
}

export const DEFAULT_WORD_TARGETS: Record<BeatType, WordTarget> = {
  action: [60, 120],
  dialogue: [80, 150],
  interiority: [50, 100],
  environment: [40, 80],
  transition: [30, 60],
  revelation: [70, 130],
  tension: [60, 110],
  resolution: [80, 140],
};

export const TENSION_MODIFIERS: Record<BeatType, number> = {
  action: 2,
  dialogue: 0,
  interiority: -1,
  environment: -2,
  transition: -1,
  revelation: 3,
  tension: 2,
  resolution: -3,
};

export function getDefaultWordTarget(beatType: BeatType): WordTarget {
  return DEFAULT_WORD_TARGETS[beatType] ?? [60, 120];
}

export function calculateTensionDelta(beatType: BeatType): number {
  return TENSION_MODIFIERS[beatType] ?? 0;
}
