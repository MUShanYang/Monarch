import { z } from "zod";
import type { Beat, NarrativeDNA } from "../beat/beat-types.js";

export const ReaderPersonaSchema = z.object({
  id: z.enum(["impatient", "suspicious", "visual"]),
  question: z.string().min(1),
  description: z.string().optional(),
});
export type ReaderPersona = z.infer<typeof ReaderPersonaSchema>;

export const READER_PERSONAS: readonly [ReaderPersona, ReaderPersona, ReaderPersona] = [
  {
    id: "impatient",
    question: "Did this give me a reason to read the next beat?",
    description: "Focuses on engagement and narrative momentum",
  },
  {
    id: "suspicious",
    question: "Did anything confuse me or feel inconsistent?",
    description: "Focuses on continuity and logical consistency",
  },
  {
    id: "visual",
    question: "Can I picture this scene in my mind?",
    description: "Focuses on sensory detail and imagery",
  },
] as const;

export const ReaderResponseSchema = z.object({
  personaId: z.enum(["impatient", "suspicious", "visual"]),
  answer: z.boolean(),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().optional(),
});
export type ReaderResponse = z.infer<typeof ReaderResponseSchema>;

export const ReaderSimulationResultSchema = z.object({
  responses: z.array(ReaderResponseSchema),
  allYes: z.boolean(),
  allNo: z.boolean(),
  majorityYes: z.boolean(),
  shouldDiscard: z.boolean(),
  degradationLevel: z.enum(["none", "reduced", "minimal", "scaffold"]).default("none"),
});
export type ReaderSimulationResult = z.infer<typeof ReaderSimulationResultSchema>;

export const ReaderSimulatorConfigSchema = z.object({
  requireAllYes: z.boolean().default(false),
  discardOnAllNo: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.6),
  temperature: z.number().min(0).max(2).default(0.3),
});
export type ReaderSimulatorConfig = z.infer<typeof ReaderSimulatorConfigSchema>;

const DEFAULT_CONFIG: Required<ReaderSimulatorConfig> = {
  requireAllYes: false,
  discardOnAllNo: true,
  confidenceThreshold: 0.6,
  temperature: 0.3,
};

export interface ReaderLLMClient {
  simulateReader(prose: string, persona: ReaderPersona, dna: NarrativeDNA, beat: Beat): Promise<ReaderResponse>;
}

export class ReaderSimulator {
  private config: Required<ReaderSimulatorConfig>;
  private llmClient: ReaderLLMClient;

  constructor(llmClient: ReaderLLMClient, config?: ReaderSimulatorConfig) {
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async simulate(prose: string, dna: NarrativeDNA, beat: Beat): Promise<ReaderSimulationResult> {
    const responses: ReaderResponse[] = [];

    for (const persona of READER_PERSONAS) {
      const response = await this.llmClient.simulateReader(prose, persona, dna, beat);
      responses.push(response);
    }

    return this.buildResult(responses);
  }

  async simulateParallel(prose: string, dna: NarrativeDNA, beat: Beat): Promise<ReaderSimulationResult> {
    const promises = READER_PERSONAS.map((persona) =>
      this.llmClient.simulateReader(prose, persona, dna, beat)
    );

    const responses = await Promise.all(promises);
    return this.buildResult(responses);
  }

  private buildResult(responses: ReaderResponse[]): ReaderSimulationResult {
    const yesCount = responses.filter((r) => r.answer).length;
    const allYes = yesCount === 3;
    const allNo = yesCount === 0;
    const majorityYes = yesCount >= 2;

    const shouldDiscard = allNo && this.config.discardOnAllNo;
    const degradationLevel = this.determineDegradationLevel(allNo, majorityYes);

    return ReaderSimulationResultSchema.parse({
      responses,
      allYes,
      allNo,
      majorityYes,
      shouldDiscard,
      degradationLevel,
    });
  }

  private determineDegradationLevel(allNo: boolean, majorityYes: boolean): ReaderSimulationResult["degradationLevel"] {
    if (allNo) return "reduced";
    if (!majorityYes) return "minimal";
    return "none";
  }

  getConfig(): Required<ReaderSimulatorConfig> {
    return { ...this.config };
  }
}

export function createReaderSimulator(
  llmClient: ReaderLLMClient,
  config?: ReaderSimulatorConfig
): ReaderSimulator {
  return new ReaderSimulator(llmClient, config);
}

export function buildReaderPrompt(prose: string, persona: ReaderPersona, dna: NarrativeDNA, beat: Beat): string {
  const parts: string[] = [
    `[ROLE] You are a ${persona.id} reader. ${persona.description || ""}`,
    "",
    "[QUESTION]",
    persona.question,
    "",
    "[PROSE TO EVALUATE]",
    prose,
    "",
    "[CONTEXT]",
    `Beat Type: ${beat.type}`,
    `Tension Level: ${beat.tensionLevel}/10`,
    `Characters: ${dna.who.map((c) => c.name).join(", ") || "None specified"}`,
    `Location: ${dna.where || "Not specified"}`,
    "",
    "[INSTRUCTIONS]",
    "1. Answer the question honestly as this reader persona.",
    "2. YES means the prose succeeds for this reader.",
    "3. NO means the prose fails for this reader.",
    "4. Provide a brief reason for your answer.",
    "",
    "[OUTPUT FORMAT - JSON]",
    '{"answer": boolean, "confidence": number (0-1), "reason": "string"}',
  ];

  return parts.join("\n");
}
