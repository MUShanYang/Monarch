import { z } from "zod";
import type { Beat, NarrativeDNA } from "../beat/beat-types.js";

export const AdversarialRoleSchema = z.enum(["writer", "attacker", "referee"]);
export type AdversarialRole = z.infer<typeof AdversarialRoleSchema>;

export const AttackerFindingSchema = z.object({
  problem: z.string().min(1),
  location: z.string().optional(),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
  evidence: z.string().optional(),
});
export type AttackerFinding = z.infer<typeof AttackerFindingSchema>;

export const RefereeVerdictSchema = z.object({
  problemValid: z.boolean(),
  fixed: z.boolean(),
  introducedNewProblem: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
  note: z.string().optional(),
});
export type RefereeVerdict = z.infer<typeof RefereeVerdictSchema>;

export const RefinementRoundSchema = z.object({
  round: z.number().int().min(1).max(6),
  proseBefore: z.string().min(1),
  attackerFinding: AttackerFindingSchema.optional(),
  refereeVerdict: RefereeVerdictSchema.optional(),
  proseAfter: z.string().optional(),
  exitReason: z.string().optional(),
});
export type RefinementRound = z.infer<typeof RefinementRoundSchema>;

export const AdversarialRefinementResultSchema = z.object({
  finalProse: z.string().min(1),
  rounds: z.array(RefinementRoundSchema),
  totalRounds: z.number().int().min(0).max(6),
  exitCondition: z.enum([
    "YES_FIXED_TWICE",
    "SAME_PROBLEM_TWICE",
    "MAX_ROUNDS",
    "INTRODUCED_NEW_PROBLEM",
    "NO_PROBLEM_FOUND",
  ]),
  improvementScore: z.number().min(-1).max(1).default(0),
});
export type AdversarialRefinementResult = z.infer<typeof AdversarialRefinementResultSchema>;

export const AdversarialRefinerConfigSchema = z.object({
  maxRounds: z.number().int().min(1).max(6).default(6),
  attackerTemperature: z.number().min(0).max(2).default(0.5),
  refereeTemperature: z.number().min(0).max(2).default(0.2),
  writerTemperature: z.number().min(0).max(2).default(0.65),
  requireDoubleYes: z.boolean().default(true),
  stopOnSameProblem: z.boolean().default(true),
  stopOnNewProblem: z.boolean().default(true),
});
export type AdversarialRefinerConfig = z.infer<typeof AdversarialRefinerConfigSchema>;

const DEFAULT_CONFIG: Required<AdversarialRefinerConfig> = {
  maxRounds: 6,
  attackerTemperature: 0.5,
  refereeTemperature: 0.2,
  writerTemperature: 0.65,
  requireDoubleYes: true,
  stopOnSameProblem: true,
  stopOnNewProblem: true,
};

export interface AdversarialLLMClient {
  generateAttackerCritique(prose: string, dna: NarrativeDNA, beat: Beat): Promise<AttackerFinding | null>;
  generateRefereeVerdict(prose: string, finding: AttackerFinding, dna: NarrativeDNA): Promise<RefereeVerdict>;
  generateWriterRevision(prose: string, finding: AttackerFinding, dna: NarrativeDNA, beat: Beat): Promise<string>;
}

export class AdversarialRefiner {
  private config: Required<AdversarialRefinerConfig>;
  private llmClient: AdversarialLLMClient;
  private rounds: RefinementRound[] = [];
  private consecutiveYesFixed = 0;
  private lastProblem: string | null = null;
  private sameProblemCount = 0;

  constructor(llmClient: AdversarialLLMClient, config?: AdversarialRefinerConfig) {
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async refine(prose: string, dna: NarrativeDNA, beat: Beat): Promise<AdversarialRefinementResult> {
    this.reset();
    let currentProse = prose;

    for (let roundNum = 1; roundNum <= this.config.maxRounds; roundNum++) {
      const round: RefinementRound = {
        round: roundNum,
        proseBefore: currentProse,
      };

      const finding = await this.llmClient.generateAttackerCritique(
        currentProse,
        dna,
        beat
      );

      if (!finding) {
        round.exitReason = "No problem found by Attacker";
        this.rounds.push(round);
        return this.buildResult(currentProse, "NO_PROBLEM_FOUND");
      }

      round.attackerFinding = finding;

      const verdict = await this.llmClient.generateRefereeVerdict(
        currentProse,
        finding,
        dna
      );
      round.refereeVerdict = verdict;

      if (!verdict.problemValid) {
        this.consecutiveYesFixed = 0;
        round.exitReason = "Referee rejected Attacker's finding";
        this.rounds.push(round);
        continue;
      }

      if (verdict.fixed) {
        this.consecutiveYesFixed++;
        if (this.consecutiveYesFixed >= 2 && this.config.requireDoubleYes) {
          round.exitReason = "YES_FIXED achieved twice consecutively";
          this.rounds.push(round);
          return this.buildResult(currentProse, "YES_FIXED_TWICE");
        }
      } else {
        this.consecutiveYesFixed = 0;
      }

      if (verdict.introducedNewProblem && this.config.stopOnNewProblem) {
        round.exitReason = "New problem introduced in revision";
        this.rounds.push(round);
        return this.buildResult(currentProse, "INTRODUCED_NEW_PROBLEM");
      }

      if (this.isSameProblem(finding.problem)) {
        this.sameProblemCount++;
        if (this.sameProblemCount >= 2 && this.config.stopOnSameProblem) {
          round.exitReason = "Same problem identified twice";
          this.rounds.push(round);
          return this.buildResult(currentProse, "SAME_PROBLEM_TWICE");
        }
      } else {
        this.sameProblemCount = 0;
        this.lastProblem = finding.problem;
      }

      const revisedProse = await this.llmClient.generateWriterRevision(
        currentProse,
        finding,
        dna,
        beat
      );
      round.proseAfter = revisedProse;
      this.rounds.push(round);

      currentProse = revisedProse;
    }

    return this.buildResult(currentProse, "MAX_ROUNDS");
  }

  private isSameProblem(problem: string): boolean {
    if (!this.lastProblem) return false;
    const normalizedCurrent = problem.toLowerCase().trim();
    const normalizedLast = this.lastProblem.toLowerCase().trim();
    return normalizedCurrent === normalizedLast ||
           normalizedCurrent.includes(normalizedLast) ||
           normalizedLast.includes(normalizedCurrent);
  }

  private reset(): void {
    this.rounds = [];
    this.consecutiveYesFixed = 0;
    this.lastProblem = null;
    this.sameProblemCount = 0;
  }

  private buildResult(
    finalProse: string,
    exitCondition: AdversarialRefinementResult["exitCondition"]
  ): AdversarialRefinementResult {
    const improvementScore = this.calculateImprovementScore();

    return AdversarialRefinementResultSchema.parse({
      finalProse,
      rounds: this.rounds,
      totalRounds: this.rounds.length,
      exitCondition,
      improvementScore,
    });
  }

  private calculateImprovementScore(): number {
    if (this.rounds.length === 0) return 0;

    let score = 0;
    for (const round of this.rounds) {
      if (round.refereeVerdict?.fixed) {
        score += 0.2;
      }
      if (round.refereeVerdict?.introducedNewProblem) {
        score -= 0.3;
      }
    }

    return Math.max(-1, Math.min(1, score));
  }

  getRounds(): RefinementRound[] {
    return [...this.rounds];
  }

  getConfig(): Required<AdversarialRefinerConfig> {
    return { ...this.config };
  }
}

export function createAdversarialRefiner(
  llmClient: AdversarialLLMClient,
  config?: AdversarialRefinerConfig
): AdversarialRefiner {
  return new AdversarialRefiner(llmClient, config);
}

export function buildAttackerPrompt(prose: string, dna: NarrativeDNA, beat: Beat): string {
  const parts: string[] = [
    "[ROLE] You are an Attacker. Your job is to find ONE specific problem in the prose.",
    "",
    "[CONTEXT]",
    `Beat Type: ${beat.type}`,
    `Tension Level: ${beat.tensionLevel}/10`,
    `Target Words: ${beat.targetWords[0]}-${beat.targetWords[1]}`,
    "",
    "[DNA CONTEXT]",
    `Characters: ${dna.who.map((c) => c.name).join(", ") || "None specified"}`,
    `Location: ${dna.where || "Not specified"}`,
    `Must Include: ${dna.mustInclude.join(", ") || "None"}`,
    `Must Not Include: ${dna.mustNotInclude.join(", ") || "None"}`,
    "",
    "[PROSE TO ANALYZE]",
    prose,
    "",
    "[INSTRUCTIONS]",
    "1. Identify exactly ONE problem. Never more than one.",
    "2. Be specific: quote the problematic text and explain why it's a problem.",
    "3. Focus on: voice consistency, factual errors, awkward phrasing, or missed DNA constraints.",
    "4. If no significant problem exists, return null (no finding).",
    "5. Severity levels: minor (style), major (clarity), critical (logic/voice break).",
    "",
    "[OUTPUT FORMAT]",
    "problem: [clear description of the single problem]",
    "location: [relevant quote from prose]",
    "severity: [minor|major|critical]",
    "evidence: [why this is a problem]",
  ];

  return parts.join("\n");
}

export function buildRefereePrompt(prose: string, finding: AttackerFinding, dna: NarrativeDNA): string {
  const parts: string[] = [
    "[ROLE] You are a Referee. Judge the Attacker's finding and the prose quality.",
    "",
    "[ATTACKER'S FINDING]",
    `Problem: ${finding.problem}`,
    `Location: ${finding.location || "Not specified"}`,
    `Severity: ${finding.severity}`,
    `Evidence: ${finding.evidence || "Not provided"}`,
    "",
    "[PROSE TO EVALUATE]",
    prose,
    "",
    "[DNA CONTEXT]",
    `Characters: ${dna.who.map((c) => c.name).join(", ") || "None specified"}`,
    `Must Include: ${dna.mustInclude.join(", ") || "None"}`,
    `Must Not Include: ${dna.mustNotInclude.join(", ") || "None"}`,
    "",
    "[INSTRUCTIONS]",
    "1. Is the Attacker's problem valid? (problemValid: true/false)",
    "2. If valid, has this problem been fixed in the prose? (fixed: true/false)",
    "3. Did fixing it introduce any new problems? (introducedNewProblem: true/false)",
    "4. Rate your confidence in this verdict (0-1).",
    "",
    "[OUTPUT FORMAT - JSON]",
    '{"problemValid": boolean, "fixed": boolean, "introducedNewProblem": boolean, "confidence": number, "note": "string"}',
  ];

  return parts.join("\n");
}

export function buildWriterPrompt(prose: string, finding: AttackerFinding, dna: NarrativeDNA, beat: Beat): string {
  const parts: string[] = [
    "[ROLE] You are a Writer. Fix the identified problem while preserving everything else.",
    "",
    "[PROBLEM TO FIX]",
    `Issue: ${finding.problem}`,
    `Location: ${finding.location || "See prose"}`,
    `Severity: ${finding.severity}`,
    "",
    "[CURRENT PROSE]",
    prose,
    "",
    "[DNA CONSTRAINTS]",
    `Beat Type: ${beat.type}`,
    `Tension: ${beat.tensionLevel}/10`,
    `Target Words: ${beat.targetWords[0]}-${beat.targetWords[1]}`,
    `Characters: ${dna.who.map((c) => c.name).join(", ") || "None specified"}`,
    `Must Include: ${dna.mustInclude.join(", ") || "None"}`,
    `Must Not Include: ${dna.mustNotInclude.join(", ") || "None"}`,
    dna.motifEcho ? `[MOTIF ECHO] ${dna.motifEcho.object} - ${dna.motifEcho.directive}` : "",
    "",
    "[INSTRUCTIONS]",
    "1. Fix ONLY the identified problem. Do not change anything else.",
    "2. Maintain the original voice, style, and tone.",
    "3. Keep the word count within target range.",
    "4. Respect all DNA constraints (mustInclude, mustNotInclude).",
    "5. Do not introduce new problems while fixing.",
    "",
    "[OUTPUT]",
    "Return the complete revised prose only. No explanations, no meta-commentary.",
  ];

  return parts.join("\n");
}
