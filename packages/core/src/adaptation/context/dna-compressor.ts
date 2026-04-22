import { z } from "zod";
import type {
  EntitiesDb,
  NarrativeLedger,
  Chronicles,
  EntityStateSnapshot,
  CharacterSnapshot,
  HandState,
  SpatialPosture,
} from "../types/state-types.js";
import type {
  NarrativeDNA,
  CharacterSnapshotForDna,
  BeatType,
  TensionLevel,
  MotifEcho,
  SensoryEcho,
} from "../beat/beat-types.js";
import type { IntentCompilerOutput, SystemWeights, DnaWeight } from "../state/intent-compiler.js";
import type { MotifIndexer } from "../state/motif-indexer.js";

export const LexicalStateSchema = z.object({
  bannedWords: z.array(z.string()).default([]),
  fatigueWords: z.array(z.string()).default([]),
  recentWords: z.array(z.string()).default([]),
  overuseThreshold: z.number().int().min(1).default(3),
  overuseWindowBeats: z.number().int().min(1).default(5),
});
export type LexicalState = z.infer<typeof LexicalStateSchema>;

export const DnaCompressorInputSchema = z.object({
  snapshot: z.any(),
  intentOutput: z.any(),
  lexicalState: LexicalStateSchema,
  beatType: z.string(),
  tensionLevel: z.number().int().min(1).max(10),
  chapterNumber: z.number().int().min(1),
  beatSequence: z.number().int().min(0),
  focusCharacterIds: z.array(z.string()).default([]),
  primaryLocationId: z.string().optional(),
  hooksToAdvance: z.array(z.string()).default([]),
  lastBeatSummary: z.string().max(150).default(""),
  maxTokens: z.number().int().min(50).max(500).default(250),
  additionalMustInclude: z.array(z.string()).default([]),
  additionalMustNotInclude: z.array(z.string()).default([]),
  styleGuideOverride: z.string().optional(),
  motifIndexer: z.any().optional(),
  plannedMotif: z.string().optional(),
});
export type DnaCompressorInput = z.infer<typeof DnaCompressorInputSchema>;

export const DnaCompressorOutputSchema = z.object({
  dna: z.any(),
  tokenCount: z.number().int().min(0),
  droppedFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type DnaCompressorOutput = z.infer<typeof DnaCompressorOutputSchema>;

export const DegradationLevelSchema = z.enum(["full", "reduced", "minimal", "scaffold", "human_gate"]);
export type DegradationLevel = z.infer<typeof DegradationLevelSchema>;

const TOKENS_PER_WORD = 1.3;
const MAX_WHO_CHARACTERS = 3;
const MAX_WHERE_WORDS = 20;
const MAX_MUST_INCLUDE = 3;
const MAX_MUST_NOT_INCLUDE = 10;
const MAX_LAST_BEAT_SUMMARY_WORDS = 25;
const MAX_HOOK_CONTEXT = 2;
const MAX_KNOWLEDGE_PER_CHARACTER = 2;

export class DnaCompressor {
  compress(input: DnaCompressorInput): DnaCompressorOutput {
    const droppedFields: string[] = [];
    const warnings: string[] = [];

    const mustNotInclude = this.buildMustNotInclude(
      input.lexicalState,
      input.intentOutput,
      input.additionalMustNotInclude,
    );
    const who = this.selectCharacters(input.snapshot, input.intentOutput, input.focusCharacterIds);
    const where = this.buildLocation(input.snapshot, input.primaryLocationId, input.intentOutput);
    const mustInclude = this.buildMustInclude(
      input.intentOutput,
      input.hooksToAdvance,
      input.additionalMustInclude,
    );
    const hookContext = this.selectHooks(input.snapshot.ledger, input.hooksToAdvance);
    const emotionalContext = this.buildEmotionalContext(who);
    const spatialConstraints = this.extractSpatialConstraints(who);
    const motifEcho = this.buildMotifEcho(input.motifIndexer, input.plannedMotif);
    const sensoryEcho = this.buildSensoryEcho(input.motifIndexer, input.plannedMotif);

    let dna: NarrativeDNA = {
      who,
      where,
      mustInclude,
      mustNotInclude,
      lastBeatSummary: this.truncateSummary(input.lastBeatSummary),
      tensionContext: input.tensionLevel,
      hookContext,
      emotionalContext,
      spatialConstraints,
      motifEcho,
      sensoryEcho,
      styleGuide: this.mergeStyleGuides(input.intentOutput.styleGuide, input.styleGuideOverride),
    };

    let tokenCount = this.calculateTokenCount(dna);

    if (tokenCount > input.maxTokens) {
      const result = this.enforceBudget(dna, tokenCount, input.maxTokens);
      dna = result.dna;
      tokenCount = result.tokenCount;
      droppedFields.push(...result.dropped);
      warnings.push(...result.warnings);
    }

    return DnaCompressorOutputSchema.parse({
      dna,
      tokenCount,
      droppedFields,
      warnings,
    });
  }

  private buildMustNotInclude(
    lexical: LexicalState,
    intentOutput: IntentCompilerOutput,
    additionalMustNotInclude: string[],
  ): string[] {
    const items: string[] = [];

    for (const item of additionalMustNotInclude) {
      items.push(item);
    }

    for (const word of lexical.bannedWords) {
      items.push(word);
    }

    for (const word of lexical.fatigueWords) {
      items.push(word);
    }

    for (const ban of intentOutput.compiledRules.hardBans) {
      items.push(ban.pattern);
    }

    const unique = [...new Set(items)];
    return unique.slice(0, MAX_MUST_NOT_INCLUDE);
  }

  private selectCharacters(
    snapshot: EntityStateSnapshot,
    intentOutput: IntentCompilerOutput,
    focusIds: string[],
  ): CharacterSnapshotForDna[] {
    const entities = snapshot.entities as EntitiesDb;
    const selected: CharacterSnapshotForDna[] = [];
    const seen = new Set<string>();

    const weightedIds = new Map<string, number>();
    for (const weight of intentOutput.systemWeights.dnaWeights) {
      if (weight.characterId && weight.forceInclude) {
        weightedIds.set(weight.characterId, Math.max(weightedIds.get(weight.characterId) ?? 0, weight.weight));
      }
    }

    for (const charId of focusIds) {
      const char = this.findCharacter(entities, charId);
      if (char && !seen.has(char.id)) {
        selected.push(this.toDnaSnapshot(char));
        seen.add(char.id);
      }
    }

    for (const [charId, _weight] of weightedIds) {
      if (seen.has(charId)) continue;
      const char = this.findCharacter(entities, charId);
      if (char) {
        selected.push(this.toDnaSnapshot(char));
        seen.add(char.id);
      }
    }

    if (selected.length === 0) {
      const protagonist = entities.characters.find((c) => c.role === "protagonist");
      if (protagonist && !seen.has(protagonist.id)) {
        selected.push(this.toDnaSnapshot(protagonist));
        seen.add(protagonist.id);
      }
    }

    for (const char of entities.characters) {
      if (seen.has(char.id)) continue;
      if (selected.length >= MAX_WHO_CHARACTERS) break;
      if (char.status === "active" && char.lastAppearanceChapter) {
        selected.push(this.toDnaSnapshot(char));
        seen.add(char.id);
      }
    }

    return selected.slice(0, MAX_WHO_CHARACTERS);
  }

  private buildLocation(
    snapshot: EntityStateSnapshot,
    primaryLocationId: string | undefined,
    intentOutput: IntentCompilerOutput,
  ): string {
    const entities = snapshot.entities as EntitiesDb;
    let locationStr = "";

    const weightedLocation = intentOutput.systemWeights.dnaWeights.find(
      (w) => w.locationId && w.forceInclude
    );
    if (weightedLocation?.locationId) {
      const loc = entities.locations.find((l) => l.id === weightedLocation.locationId);
      if (loc) {
        locationStr = this.formatLocation(loc.name, loc.sensoryAnchors);
      }
    }

    if (!locationStr && primaryLocationId) {
      const loc = entities.locations.find((l) => l.id === primaryLocationId);
      if (loc) {
        locationStr = this.formatLocation(loc.name, loc.sensoryAnchors);
      }
    }

    if (!locationStr) {
      const firstLocation = entities.locations[0];
      if (firstLocation) {
        locationStr = this.formatLocation(firstLocation.name, firstLocation.sensoryAnchors);
      }
    }

    return this.truncateToWordCount(locationStr, MAX_WHERE_WORDS);
  }

  private formatLocation(name: string, sensoryAnchors: string[]): string {
    if (sensoryAnchors.length > 0) {
      const anchor = sensoryAnchors[0];
      return `${name}. ${anchor}.`;
    }
    return name;
  }

  private buildMustInclude(
    intentOutput: IntentCompilerOutput,
    hooksToAdvance: string[],
    additionalMustInclude: string[],
  ): string[] {
    const items: string[] = [];

    for (const item of additionalMustInclude) {
      items.push(item);
    }

    for (const hookId of hooksToAdvance.slice(0, 2)) {
      items.push(`Advance hook: ${hookId}`);
    }

    for (const weight of intentOutput.systemWeights.dnaWeights) {
      if (weight.forceInclude && weight.itemId) {
        items.push(`Include item: ${weight.itemId}`);
      }
    }

    for (const elem of intentOutput.compiledRules.requiredElements.slice(0, 2)) {
      items.push(elem);
    }

    return [...new Set(items)].slice(0, MAX_MUST_INCLUDE);
  }

  private mergeStyleGuides(baseStyleGuide: string | undefined, styleGuideOverride: string | undefined): string | undefined {
    const parts = [baseStyleGuide, styleGuideOverride]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (parts.length === 0) {
      return undefined;
    }

    return [...new Set(parts)].join("\n");
  }

  private selectHooks(ledger: NarrativeLedger, hooksToAdvance: string[]): string[] {
    const hooks: string[] = [];

    for (const hookId of hooksToAdvance) {
      const hook = ledger.hooks.find((h) => h.id === hookId);
      if (hook && hook.status !== "resolved") {
        hooks.push(`${hook.type}: ${hook.description}`);
      }
    }

    if (hooks.length === 0) {
      const openHooks = ledger.hooks
        .filter((h) => h.status === "open" || h.status === "progressing")
        .sort((a, b) => {
          const urgencyOrder = { critical: 0, overdue: 1, progressing: 2, fresh: 3 };
          return (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4);
        });

      for (const hook of openHooks.slice(0, MAX_HOOK_CONTEXT)) {
        hooks.push(`${hook.type}: ${hook.description}`);
      }
    }

    return hooks.slice(0, MAX_HOOK_CONTEXT);
  }

  private buildEmotionalContext(characters: CharacterSnapshotForDna[]): string | undefined {
    for (const char of characters) {
      if (char.activeDebts.length > 0) {
        return `${char.name}'s suppressed ${char.activeDebts[0]} may surface.`;
      }
    }
    return undefined;
  }

  private buildMotifEcho(
    motifIndexer: any | undefined,
    plannedMotif: string | undefined
  ): MotifEcho | undefined {
    if (!motifIndexer || !plannedMotif) {
      return undefined;
    }

    return motifIndexer.getMotifEcho(plannedMotif) ?? undefined;
  }

  private buildSensoryEcho(
    motifIndexer: any | undefined,
    plannedMotif: string | undefined
  ): SensoryEcho | undefined {
    if (!motifIndexer || !plannedMotif) {
      return undefined;
    }

    const motifEcho = motifIndexer.getMotifEcho(plannedMotif);
    if (!motifEcho) {
      return undefined;
    }

    const physicalInterrupts: Record<string, string[]> = {
      rain: ["指尖一顿", "呼吸微滞", "目光凝住"],
      fire: ["瞳孔微缩", "呼吸急促", "手指微颤"],
      blood: ["面色微变", "呼吸停顿", "眼神一凛"],
      silence: ["动作一滞", "呼吸放轻", "目光游移"],
      darkness: ["瞳孔放大", "身体微僵", "手指收紧"],
      light: ["眯起眼睛", "微微侧首", "呼吸屏住"],
      wind: ["衣摆微动", "发丝轻扬", "目光飘远"],
      water: ["喉头微动", "眼神恍惚", "指尖轻颤"],
      moon: ["仰首望天", "目光迷离", "呼吸放缓"],
      sun: ["微微眯眼", "侧身避光", "手遮眉骨"],
      death: ["面色苍白", "呼吸凝滞", "手指冰凉"],
      memory: ["目光涣散", "动作停顿", "嘴角微抿"],
      dream: ["眼神迷离", "呼吸不匀", "眉头微蹙"],
      wound: ["面色微变", "手下意识护住", "呼吸急促"],
      hunger: ["腹部微紧", "喉头滚动", "目光灼灼"],
      sleep: ["眼皮微垂", "呼吸放缓", "身体松弛"],
      journey: ["目光远眺", "脚步微顿", "背脊挺直"],
      threshold: ["脚步停住", "手按门框", "呼吸屏住"],
      cage: ["目光游移", "手指抓紧", "呼吸急促"],
      key: ["目光一亮", "手指微动", "呼吸加快"],
    };

    const interrupts = physicalInterrupts[plannedMotif] ?? ["动作微滞", "目光一凝", "呼吸停顿"];
    const randomInterrupt = interrupts[Math.floor(Math.random() * interrupts.length)] ?? "动作微滞";

    return {
      motif: plannedMotif,
      physicalInterrupt: randomInterrupt,
      duration: "0.5s",
    };
  }

  private extractSpatialConstraints(characters: CharacterSnapshotForDna[]): string[] {
    const constraints: string[] = [];

    for (const char of characters) {
      if (char.handState !== "empty" && char.handState !== "injured") {
        if (char.handState === "full" || char.handState === "occupied-both") {
          constraints.push(`${char.name}'s hands are occupied. Cannot pick up or manipulate new items.`);
        } else if (char.handState === "occupied-left") {
          constraints.push(`${char.name}'s left hand is occupied. Can only use right hand.`);
        } else if (char.handState === "occupied-right") {
          constraints.push(`${char.name}'s right hand is occupied. Can only use left hand.`);
        } else if (char.handState === "bound") {
          constraints.push(`${char.name}'s hands are bound. Cannot manipulate objects.`);
        }
      }

      if (char.heldItems.length > 0) {
        constraints.push(`${char.name} is holding: ${char.heldItems.join(", ")}.`);
      }

      if (char.constraint) {
        constraints.push(char.constraint);
      }

      if (char.spatialPosture === "lying" || char.spatialPosture === "unconscious") {
        constraints.push(`${char.name} is ${char.spatialPosture}. Movement is limited.`);
      } else if (char.spatialPosture === "crouching") {
        constraints.push(`${char.name} is crouching. Standing requires an action.`);
      }
    }

    return constraints;
  }

  private findCharacter(entities: EntitiesDb, idOrName: string): CharacterSnapshot | undefined {
    return entities.characters.find(
      (c) => c.id === idOrName || c.name === idOrName || c.aliases.includes(idOrName)
    );
  }

  private toDnaSnapshot(char: CharacterSnapshot): CharacterSnapshotForDna {
    return {
      id: char.id,
      name: char.name,
      spatialPosture: char.spatialPosture,
      handState: char.handState,
      heldItems: char.heldItems,
      currentLocation: char.currentLocation,
      emotionalState: char.emotionalDebts.length > 0 ? char.emotionalDebts[0]?.emotion : undefined,
      activeDebts: char.emotionalDebts.map((d) => d.emotion),
      constraint: this.inferConstraint(char),
    };
  }

  private inferConstraint(char: CharacterSnapshot): string | undefined {
    if (char.handState !== "empty" && char.handState !== "injured") {
      return `${char.name} cannot pick up or manipulate new items.`;
    }
    return undefined;
  }

  private truncateSummary(summary: string): string {
    return this.truncateToWordCount(summary, MAX_LAST_BEAT_SUMMARY_WORDS);
  }

  private truncateToWordCount(text: string, maxWords: number): string {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ");
  }

  private calculateTokenCount(dna: NarrativeDNA): number {
    let totalWords = 0;

    for (const char of dna.who) {
      totalWords += this.countWords(char.name);
      totalWords += this.countWords(char.spatialPosture);
      totalWords += this.countWords(char.handState);
      totalWords += char.heldItems.reduce((sum, item) => sum + this.countWords(item), 0);
      if (char.constraint) totalWords += this.countWords(char.constraint);
    }

    totalWords += this.countWords(dna.where);

    for (const item of dna.mustInclude) {
      totalWords += this.countWords(item);
    }

    for (const item of dna.mustNotInclude) {
      totalWords += this.countWords(item);
    }

    totalWords += this.countWords(dna.lastBeatSummary);

    if (dna.tensionContext) totalWords += 2;

    for (const hook of dna.hookContext) {
      totalWords += this.countWords(hook);
    }

    if (dna.emotionalContext) {
      totalWords += this.countWords(dna.emotionalContext);
    }

    for (const constraint of dna.spatialConstraints) {
      totalWords += this.countWords(constraint);
    }

    return Math.ceil(totalWords * TOKENS_PER_WORD);
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  private enforceBudget(
    dna: NarrativeDNA,
    currentTokens: number,
    maxTokens: number,
  ): { dna: NarrativeDNA; tokenCount: number; dropped: string[]; warnings: string[] } {
    const dropped: string[] = [];
    const warnings: string[] = [];
    let workingDna = { ...dna };
    let tokens = currentTokens;

    if (workingDna.hookContext.length > 0) {
      const saved = this.estimateTokenSavings(workingDna.hookContext);
      workingDna = { ...workingDna, hookContext: [] };
      tokens -= saved;
      dropped.push("hookContext");
      warnings.push(`Dropped hookContext to save ~${Math.round(saved)} tokens`);
    }

    if (tokens > maxTokens && workingDna.mustInclude.length > 2) {
      const original = workingDna.mustInclude;
      const saved = this.estimateTokenSavings(original.slice(2));
      workingDna = { ...workingDna, mustInclude: original.slice(0, 2) };
      tokens -= saved;
      dropped.push("mustInclude[2+]");
      warnings.push(`Truncated mustInclude to 2 items`);
    }

    if (tokens > maxTokens) {
      workingDna = {
        ...workingDna,
        who: workingDna.who.map((char) => ({
          ...char,
          activeDebts: char.activeDebts.slice(0, 1),
        })),
      };
      dropped.push("character.activeDebts[1+]");
      warnings.push("Truncated character active debts to 1 each");
      tokens = this.calculateTokenCount(workingDna);
    }

    if (tokens > maxTokens && workingDna.mustInclude.length > 1) {
      const original = workingDna.mustInclude;
      const saved = this.estimateTokenSavings(original.slice(1));
      workingDna = { ...workingDna, mustInclude: original.slice(0, 1) };
      tokens -= saved;
      dropped.push("mustInclude[1+]");
      warnings.push(`Truncated mustInclude to 1 item`);
    }

    if (tokens > maxTokens && workingDna.where.length > 10) {
      const original = workingDna.where;
      const truncated = this.truncateToWordCount(original, 10);
      const saved = this.countWords(original) - this.countWords(truncated);
      workingDna = { ...workingDna, where: truncated };
      tokens -= Math.ceil(saved * TOKENS_PER_WORD);
      dropped.push("where (truncated)");
      warnings.push("Truncated location description to 10 words");
    }

    if (tokens > maxTokens && workingDna.who.length > 1) {
      const saved = this.estimateCharacterTokenSavings(workingDna.who.slice(1));
      workingDna = { ...workingDna, who: workingDna.who.slice(0, 1) };
      tokens -= saved;
      dropped.push("who[1+]");
      warnings.push("Reduced to 1 character in context");
    }

    tokens = this.calculateTokenCount(workingDna);

    if (tokens > maxTokens) {
      warnings.push(`WARNING: DNA still exceeds budget (${tokens} > ${maxTokens}). Critical fields preserved.`);
    }

    return { dna: workingDna, tokenCount: tokens, dropped, warnings };
  }

  private estimateTokenSavings(items: string[]): number {
    const words = items.reduce((sum, item) => sum + this.countWords(item), 0);
    return Math.ceil(words * TOKENS_PER_WORD);
  }

  private estimateCharacterTokenSavings(characters: CharacterSnapshotForDna[]): number {
    let words = 0;
    for (const char of characters) {
      words += this.countWords(char.name);
      words += this.countWords(char.spatialPosture);
      words += this.countWords(char.handState);
      words += char.heldItems.reduce((sum, item) => sum + this.countWords(item), 0);
      if (char.constraint) words += this.countWords(char.constraint);
    }
    return Math.ceil(words * TOKENS_PER_WORD);
  }
}

export function compressDna(input: DnaCompressorInput): DnaCompressorOutput {
  const compressor = new DnaCompressor();
  return compressor.compress(input);
}

export function degradeDNA(dna: NarrativeDNA, level: DegradationLevel): NarrativeDNA {
  switch (level) {
    case "reduced":
      return {
        ...dna,
        hookContext: [],
        mustInclude: dna.mustInclude.slice(0, 1),
      };
    case "minimal":
      return {
        who: dna.who,
        where: dna.where,
        mustInclude: [],
        mustNotInclude: dna.mustNotInclude,
        lastBeatSummary: dna.lastBeatSummary,
        tensionContext: dna.tensionContext,
        hookContext: [],
        spatialConstraints: [],
      };
    case "scaffold":
      return {
        who: dna.who.map((character) => ({
          ...character,
          activeDebts: [],
        })),
        where: dna.where,
        mustInclude: [],
        mustNotInclude: dna.mustNotInclude,
        lastBeatSummary: "",
        tensionContext: dna.tensionContext,
        hookContext: [],
        spatialConstraints: dna.spatialConstraints.slice(0, 1),
      };
    case "human_gate":
      return degradeDNA(dna, "scaffold");
    case "full":
    default:
      return dna;
  }
}

export function createLexicalState(params: {
  bannedWords?: string[];
  fatigueWords?: string[];
  recentWords?: string[];
}): LexicalState {
  return LexicalStateSchema.parse({
    bannedWords: params.bannedWords ?? [],
    fatigueWords: params.fatigueWords ?? [],
    recentWords: params.recentWords ?? [],
  });
}
