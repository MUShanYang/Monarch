import { z } from "zod";
import type { KnowledgeBoundary } from "../character/knowledge-boundary.js";

export const DialogueParticipantSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().min(1),
  knowledgeBoundary: z.custom<KnowledgeBoundary>(),
  emotionalState: z.record(z.number()).default({}),
  goals: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
});
export type DialogueParticipant = z.infer<typeof DialogueParticipantSchema>;

export const DialogueLineSchema = z.object({
  speakerId: z.string().min(1),
  text: z.string().min(1),
  timestamp: z.number(),
  emotionalTone: z.string().optional(),
  subtext: z.string().optional(),
  knowledgeRevealed: z.array(z.string()).default([]),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const DialogueSceneSchema = z.object({
  id: z.string().min(1),
  location: z.string().min(1),
  participants: z.array(DialogueParticipantSchema),
  lines: z.array(DialogueLineSchema).default([]),
  context: z.string().optional(),
  tension: z.number().min(0).max(10).default(5),
  status: z.enum(["ongoing", "paused", "completed", "interrupted"]).default("ongoing"),
});
export type DialogueScene = z.infer<typeof DialogueSceneSchema>;

export const DialogueValidationResultSchema = z.object({
  isValid: z.boolean(),
  violations: z.array(z.object({
    line: z.number().int(),
    speaker: z.string(),
    issue: z.string(),
    severity: z.enum(["minor", "major", "critical"]),
  })).default([]),
  knowledgeBreaches: z.array(z.object({
    characterId: z.string(),
    breach: z.string(),
  })).default([]),
});
export type DialogueValidationResult = z.infer<typeof DialogueValidationResultSchema>;

export const DialogueArenaConfigSchema = z.object({
  maxLines: z.number().int().min(1).default(50),
  enableKnowledgeCheck: z.boolean().default(true),
  enableEmotionalTracking: z.boolean().default(true),
  strictMode: z.boolean().default(true),
});
export type DialogueArenaConfig = z.infer<typeof DialogueArenaConfigSchema>;

const DEFAULT_CONFIG: Required<DialogueArenaConfig> = {
  maxLines: 50,
  enableKnowledgeCheck: true,
  enableEmotionalTracking: true,
  strictMode: true,
};

export class DialogueArena {
  private config: Required<DialogueArenaConfig>;
  private scene: DialogueScene | null = null;

  constructor(config?: DialogueArenaConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createScene(
    location: string,
    participants: DialogueParticipant[],
    context?: string
  ): DialogueScene {
    const id = `dialogue-${Date.now()}`;
    this.scene = {
      id,
      location,
      participants,
      lines: [],
      context,
      tension: 5,
      status: "ongoing",
    };
    return this.scene;
  }

  addLine(
    speakerId: string,
    text: string,
    options?: {
      emotionalTone?: string;
      subtext?: string;
    }
  ): DialogueLine | null {
    if (!this.scene || this.scene.status !== "ongoing") return null;

    if (this.scene.lines.length >= this.config.maxLines) {
      this.scene.status = "completed";
      return null;
    }

    const participant = this.scene.participants.find((p) => p.characterId === speakerId);
    if (!participant) return null;

    const line: DialogueLine = {
      speakerId,
      text,
      timestamp: Date.now(),
      emotionalTone: options?.emotionalTone,
      subtext: options?.subtext,
      knowledgeRevealed: this.extractKnowledgeRevealed(text, participant),
    };

    this.scene.lines.push(line);
    this.updateTension(line);

    return line;
  }

  validateDialogue(): DialogueValidationResult {
    if (!this.scene) {
      return { isValid: false, violations: [], knowledgeBreaches: [] };
    }

    const violations: DialogueValidationResult["violations"] = [];
    const knowledgeBreaches: DialogueValidationResult["knowledgeBreaches"] = [];

    for (let i = 0; i < this.scene.lines.length; i++) {
      const line = this.scene.lines[i]!;
      const participant = this.scene.participants.find((p) => p.characterId === line.speakerId);

      if (!participant) {
        violations.push({
          line: i,
          speaker: line.speakerId,
          issue: "Speaker not in participants",
          severity: "critical",
        });
        continue;
      }

      if (this.config.enableKnowledgeCheck) {
        const breach = this.checkKnowledgeBreach(line, participant);
        if (breach) {
          knowledgeBreaches.push({
            characterId: line.speakerId,
            breach,
          });
          if (this.config.strictMode) {
            violations.push({
              line: i,
              speaker: line.speakerId,
              issue: `Knowledge breach: ${breach}`,
              severity: "major",
            });
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      knowledgeBreaches,
    };
  }

  pauseScene(): DialogueScene | null {
    if (!this.scene) return null;
    this.scene.status = "paused";
    return this.scene;
  }

  resumeScene(): DialogueScene | null {
    if (!this.scene) return null;
    this.scene.status = "ongoing";
    return this.scene;
  }

  completeScene(): DialogueScene | null {
    if (!this.scene) return null;
    this.scene.status = "completed";
    return this.scene;
  }

  interruptScene(reason: string): DialogueScene | null {
    if (!this.scene) return null;
    this.scene.status = "interrupted";
    return this.scene;
  }

  getScene(): DialogueScene | null {
    return this.scene;
  }

  getLinesBySpeaker(speakerId: string): DialogueLine[] {
    if (!this.scene) return [];
    return this.scene.lines.filter((l) => l.speakerId === speakerId);
  }

  getDialogueText(): string {
    if (!this.scene) return "";
    return this.scene.lines
      .map((l) => {
        const participant = this.scene!.participants.find((p) => p.characterId === l.speakerId);
        return `${participant?.name || l.speakerId}: "${l.text}"`;
      })
      .join("\n");
  }

  private extractKnowledgeRevealed(text: string, participant: DialogueParticipant): string[] {
    const revealed: string[] = [];
    for (const knowledge of participant.knowledgeBoundary.knows) {
      if (text.toLowerCase().includes(knowledge.toLowerCase())) {
        revealed.push(knowledge);
      }
    }
    return revealed;
  }

  private checkKnowledgeBreach(line: DialogueLine, participant: DialogueParticipant): string | null {
    for (const unknown of participant.knowledgeBoundary.doesNotKnow) {
      if (line.text.toLowerCase().includes(unknown.toLowerCase())) {
        return `Mentions unknown fact: ${unknown}`;
      }
    }
    return null;
  }

  private updateTension(line: DialogueLine): void {
    if (!this.scene) return;

    const tensionWords = ["angry", "furious", "betrayal", "threat", "gun", "kill", "hate", "never", "always", "why"];
    for (const word of tensionWords) {
      if (line.text.toLowerCase().includes(word)) {
        this.scene.tension = Math.min(10, this.scene.tension + 0.5);
      }
    }

    if (line.emotionalTone === "calm" || line.emotionalTone === "reconciliatory") {
      this.scene.tension = Math.max(0, this.scene.tension - 0.3);
    }
  }

  clear(): void {
    this.scene = null;
  }

  getConfig(): Required<DialogueArenaConfig> {
    return { ...this.config };
  }
}

export function createDialogueArena(config?: DialogueArenaConfig): DialogueArena {
  return new DialogueArena(config);
}
