import { z } from "zod";
import type { BeatType } from "../beat/beat-types.js";

export const StopSequencesSchema = z.array(z.string()).default([]);
export type StopSequences = z.infer<typeof StopSequencesSchema>;

export const ApiConstraintsSchema = z.object({
  maxTokens: z.number().int().min(1).max(131072),
  stopSequences: StopSequencesSchema,
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(0.9),
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  presencePenalty: z.number().min(-2).max(2).default(0),
  responseFormat: z.enum(["text", "json"]).default("text"),
});
export type ApiConstraints = z.infer<typeof ApiConstraintsSchema>;

export const ConstrainedDecodingSchema = z.object({
  responseFormat: z.literal("json"),
  jsonSchema: z.record(z.unknown()).optional(),
  grammar: z.string().optional(),
});
export type ConstrainedDecoding = z.infer<typeof ConstrainedDecodingSchema>;

const DEFAULT_STOP_SEQUENCES: StopSequences = [
  "###",
  "[END]",
  "```",
];

const BEAT_TYPE_TOKEN_LIMITS: Record<BeatType, number> = {
  action: 180,
  dialogue: 220,
  interiority: 220,
  environment: 180,
  transition: 90,
  revelation: 200,
  tension: 170,
  resolution: 210,
  "negative-space": 100,
};

const AUDIT_TOKEN_LIMIT = 50;
const CHAPTER_END_RESERVE_TOKENS = 50;

const VOICE_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    matches: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["matches"],
  additionalProperties: false,
};

const CONTINUITY_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    characterConsistent: { type: "boolean" },
    locationConsistent: { type: "boolean" },
    timelineConsistent: { type: "boolean" },
    knowledgeConsistent: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["characterConsistent", "locationConsistent", "timelineConsistent", "knowledgeConsistent"],
  additionalProperties: false,
};

export function getApiConstraintsForBeat(
  beatType: BeatType,
  wordTarget: [number, number],
  options?: {
    temperature?: number;
    additionalStopSequences?: string[];
    isChapterEnd?: boolean;
  }
): ApiConstraints {
  const maxTokens = calculateMaxTokensFromWordTarget(wordTarget);

  const stopSequences = [
    ...DEFAULT_STOP_SEQUENCES,
    ...(options?.additionalStopSequences ?? []),
  ];

  return ApiConstraintsSchema.parse({
    maxTokens,
    stopSequences,
    temperature: options?.temperature ?? 0.7,
    topP: 0.9,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
    responseFormat: "text",
  });
}

export function getApiConstraintsForAudit(
  auditType: "voice" | "continuity" | "general"
): ApiConstraints & ConstrainedDecoding {
  const schemas: Record<string, Record<string, unknown>> = {
    voice: VOICE_AUDIT_SCHEMA,
    continuity: CONTINUITY_AUDIT_SCHEMA,
    general: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["passed"],
      additionalProperties: false,
    },
  };

  return {
    maxTokens: AUDIT_TOKEN_LIMIT,
    stopSequences: DEFAULT_STOP_SEQUENCES,
    temperature: 0.1,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    responseFormat: "json",
    jsonSchema: schemas[auditType] ?? schemas.general,
  };
}

export function getApiConstraintsForSpeculative(
  variantId: "A" | "B" | "C",
  wordTarget: [number, number],
  options?: {
    isChapterEnd?: boolean;
  }
): ApiConstraints {
  const variantTemps: Record<"A" | "B" | "C", number> = {
    A: 0.7,
    B: 0.8,
    C: 0.75,
  };

  return ApiConstraintsSchema.parse({
    maxTokens: calculateMaxTokensFromWordTarget(wordTarget),
    stopSequences: DEFAULT_STOP_SEQUENCES,
    temperature: variantTemps[variantId],
    topP: 0.9,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
    responseFormat: "text",
  });
}

export function getApiConstraintsForSubtext(): ApiConstraints {
  return ApiConstraintsSchema.parse({
    maxTokens: 100,
    stopSequences: DEFAULT_STOP_SEQUENCES,
    temperature: 0.5,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
    responseFormat: "text",
  });
}

export function getApiConstraintsForEventExtraction(): ApiConstraints & ConstrainedDecoding {
  const eventSchema = {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            target: { type: "string" },
            params: { type: "object" },
          },
          required: ["action"],
        },
      },
    },
    required: ["events"],
    additionalProperties: false,
  };

  return {
    maxTokens: 200,
    stopSequences: DEFAULT_STOP_SEQUENCES,
    temperature: 0.1,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    responseFormat: "json",
    jsonSchema: eventSchema,
  };
}

export function estimateTokensFromWords(wordCount: number): number {
  return Math.ceil(wordCount * 1.3);
}

export function calculateMaxTokensFromWordTarget(wordTarget: [number, number]): number {
  return Math.ceil(wordTarget[1] * 1.7) + CHAPTER_END_RESERVE_TOKENS;
}

export function estimateTokensFromText(text: string): number {
  const cleaned = text.replace(/<[^>]*>/g, "");
  const chineseChars = cleaned.replace(/[^\u4e00-\u9fff]/g, "").length;
  const words = chineseChars > 0
    ? chineseChars
    : cleaned.split(/\s+/).filter((w) => w.length > 0).length;
  return estimateTokensFromWords(words);
}

export function validateTokenBudget(
  text: string,
  maxTokens: number
): { valid: boolean; estimated: number; excess: number } {
  const estimated = estimateTokensFromText(text);
  const excess = Math.max(0, estimated - maxTokens);
  return {
    valid: estimated <= maxTokens,
    estimated,
    excess,
  };
}

export {
  DEFAULT_STOP_SEQUENCES,
  BEAT_TYPE_TOKEN_LIMITS,
  VOICE_AUDIT_SCHEMA,
  CONTINUITY_AUDIT_SCHEMA,
  CHAPTER_END_RESERVE_TOKENS,
};
