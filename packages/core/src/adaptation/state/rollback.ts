import { z } from "zod";
import type { StateEvent, EntityStateSnapshot } from "../types/state-types.js";

export const ChapterStateDiffSchema = z.object({
  chapter: z.number().int().min(1),
  timestamp: z.string().datetime(),
  forwardEvents: z.array(z.custom<StateEvent>()),
  inverseEvents: z.array(z.custom<StateEvent>()),
  summary: z.string(),
  affectedEntities: z.array(z.string()),
});
export type ChapterStateDiff = z.infer<typeof ChapterStateDiffSchema>;

export const ChapterRollbackResultSchema = z.object({
  success: z.boolean(),
  rolledBackTo: z.number().int().min(0),
  appliedInverseEvents: z.number().int().min(0),
  newSnapshot: z.custom<EntityStateSnapshot>().optional(),
  error: z.string().optional(),
});
export type ChapterRollbackResult = z.infer<typeof ChapterRollbackResultSchema>;

export const RollbackManagerConfigSchema = z.object({
  maxStoredDiffs: z.number().int().min(1).default(50),
  enableCompression: z.boolean().default(true),
  validateBeforeApply: z.boolean().default(true),
});
export type RollbackManagerConfig = z.infer<typeof RollbackManagerConfigSchema>;

const DEFAULT_CONFIG: Required<RollbackManagerConfig> = {
  maxStoredDiffs: 50,
  enableCompression: true,
  validateBeforeApply: true,
};

export class RollbackManager {
  private diffs: Map<number, ChapterStateDiff> = new Map();
  private config: Required<RollbackManagerConfig>;

  constructor(config?: RollbackManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  generateDiff(
    chapter: number,
    previousSnapshot: EntityStateSnapshot,
    currentSnapshot: EntityStateSnapshot,
    appliedEvents: StateEvent[]
  ): ChapterStateDiff {
    const inverseEvents = this.computeInverseEvents(appliedEvents, previousSnapshot, currentSnapshot);
    const affectedEntities = this.identifyAffectedEntities(appliedEvents);

    const summary = this.generateSummary(appliedEvents, affectedEntities);

    const diff: ChapterStateDiff = {
      chapter,
      timestamp: new Date().toISOString(),
      forwardEvents: appliedEvents,
      inverseEvents,
      summary,
      affectedEntities,
    };

    this.storeDiff(diff);
    return diff;
  }

  rollbackToChapter(
    targetChapter: number,
    currentSnapshot: EntityStateSnapshot
  ): ChapterRollbackResult {
    const currentChapter = Math.max(...this.diffs.keys(), 0);

    if (targetChapter >= currentChapter) {
      return {
        success: false,
        rolledBackTo: currentChapter,
        appliedInverseEvents: 0,
        error: `Target chapter ${targetChapter} is not in the past (current: ${currentChapter})`,
      };
    }

    if (targetChapter < 0) {
      return {
        success: false,
        rolledBackTo: currentChapter,
        appliedInverseEvents: 0,
        error: `Invalid target chapter: ${targetChapter}`,
      };
    }

    const snapshot = { ...currentSnapshot };
    let appliedCount = 0;

    for (let chapter = currentChapter; chapter > targetChapter; chapter--) {
      const diff = this.diffs.get(chapter);
      if (!diff) {
        return {
          success: false,
          rolledBackTo: chapter,
          appliedInverseEvents: appliedCount,
          error: `Missing diff for chapter ${chapter}`,
        };
      }

      if (this.config.validateBeforeApply) {
        const validation = this.validateInverseEvents(diff.inverseEvents, snapshot);
        if (!validation.valid) {
          return {
            success: false,
            rolledBackTo: chapter,
            appliedInverseEvents: appliedCount,
            error: `Validation failed for chapter ${chapter}: ${validation.error}`,
          };
        }
      }

      this.applyInverseEvents(diff.inverseEvents, snapshot);
      appliedCount += diff.inverseEvents.length;

      this.diffs.delete(chapter);
    }

    return {
      success: true,
      rolledBackTo: targetChapter,
      appliedInverseEvents: appliedCount,
      newSnapshot: snapshot,
    };
  }

  private computeInverseEvents(
    events: StateEvent[],
    _previousSnapshot: EntityStateSnapshot,
    _currentSnapshot: EntityStateSnapshot
  ): StateEvent[] {
    const inverseEvents: StateEvent[] = [];

    for (const event of [...events].reverse()) {
      const inverse = this.invertEvent(event);
      if (inverse) {
        inverseEvents.push(inverse);
      }
    }

    return inverseEvents;
  }

  private invertEvent(event: StateEvent): StateEvent | null {
    switch (event.action) {
      case "UPDATE_EMOTION":
        return { 
          action: "UPDATE_EMOTION", 
          target: event.target, 
          emotion: "neutral", 
          delta: -event.delta 
        };

      case "SET_EMOTIONAL_DEBT":
        return { 
          action: "RELEASE_EMOTIONAL_DEBT", 
          target: event.target, 
          emotion: event.emotion 
        };

      case "RELEASE_EMOTIONAL_DEBT":
        return { 
          action: "SET_EMOTIONAL_DEBT", 
          target: event.target, 
          emotion: event.emotion, 
          magnitude: 1 
        };

      case "CONSUME_PARTICLE":
        return { 
          action: "ACQUIRE_PARTICLE", 
          target: event.target, 
          item: "restored_item", 
          amount: event.amount 
        };

      case "OPEN_HOOK":
        return { 
          action: "CLOSE_HOOK", 
          id: event.id 
        };

      case "ADVANCE_HOOK":
        return { 
          action: "ADVANCE_HOOK", 
          id: event.id, 
          status: "open" 
        };

      case "RESOLVE_HOOK":
        return { 
          action: "OPEN_HOOK", 
          id: event.id, 
          type: "restored", 
          description: "restored hook" 
        };

      case "UPDATE_CHARACTER_LOCATION":
        return { 
          action: "UPDATE_CHARACTER_LOCATION", 
          characterId: event.characterId, 
          locationId: "previous_location" 
        };

      case "UPDATE_CHARACTER_POSTURE":
        return { 
          action: "UPDATE_CHARACTER_POSTURE", 
          characterId: event.characterId, 
          posture: "unknown" 
        };

      case "UPDATE_CHARACTER_HANDS":
        return { 
          action: "UPDATE_CHARACTER_HANDS", 
          characterId: event.characterId, 
          handState: "empty" 
        };

      case "ADD_CHARACTER_KNOWLEDGE":
        return { 
          action: "REMOVE_CHARACTER_KNOWLEDGE", 
          characterId: event.characterId, 
          knowledge: event.knowledge 
        };

      case "REMOVE_CHARACTER_KNOWLEDGE":
        return { 
          action: "ADD_CHARACTER_KNOWLEDGE", 
          characterId: event.characterId, 
          knowledge: event.knowledge 
        };

      case "ADD_CHARACTER_MISCONCEPTION":
        return { 
          action: "REMOVE_CHARACTER_KNOWLEDGE", 
          characterId: event.characterId, 
          knowledge: event.misconception 
        };

      case "TRANSFER_ITEM":
        return { 
          action: "TRANSFER_ITEM", 
          itemId: event.itemId, 
          fromCharacter: event.toCharacter, 
          toCharacter: event.fromCharacter 
        };

      case "UPDATE_RELATIONSHIP":
        return { 
          action: "UPDATE_RELATIONSHIP", 
          characterA: event.characterA, 
          characterB: event.characterB, 
          relationship: "unknown" 
        };

      case "UPDATE_SUBPLOT":
        return { 
          action: "UPDATE_SUBPLOT", 
          subplotId: event.subplotId, 
          status: "dormant" 
        };

      case "MOVE_CHARACTER":
        return { 
          action: "MOVE_CHARACTER", 
          target: event.target, 
          toLocation: "previous_location" 
        };

      case "ACQUIRE_PARTICLE":
        return { 
          action: "CONSUME_PARTICLE", 
          target: event.target, 
          amount: event.amount 
        };

      case "UPDATE_PHYSICAL":
        return { 
          action: "UPDATE_PHYSICAL", 
          target: event.target, 
          field: event.field, 
          value: "previous_value" 
        };

      case "CLOSE_HOOK":
        return { 
          action: "OPEN_HOOK", 
          id: event.id, 
          type: "restored", 
          description: "reopened hook" 
        };

      default:
        return null;
    }
  }

  private identifyAffectedEntities(events: StateEvent[]): string[] {
    const affected = new Set<string>();

    for (const event of events) {
      if ("target" in event && typeof event.target === "string") {
        affected.add(event.target);
      }
      if ("id" in event && typeof event.id === "string") {
        affected.add(event.id);
      }
      if ("characterId" in event && typeof event.characterId === "string") {
        affected.add(event.characterId);
      }
      if ("subplotId" in event && typeof event.subplotId === "string") {
        affected.add(event.subplotId);
      }
      if ("itemId" in event && typeof event.itemId === "string") {
        affected.add(event.itemId);
      }
      if ("characterA" in event && typeof event.characterA === "string") {
        affected.add(event.characterA);
        if ("characterB" in event && typeof event.characterB === "string") {
          affected.add(event.characterB);
        }
      }
    }

    return [...affected];
  }

  private generateSummary(events: StateEvent[], affectedEntities: string[]): string {
    const actionCounts: Record<string, number> = {};
    for (const event of events) {
      actionCounts[event.action] = (actionCounts[event.action] ?? 0) + 1;
    }

    const parts: string[] = [];
    for (const [action, count] of Object.entries(actionCounts)) {
      parts.push(`${count} ${action}`);
    }

    return `Chapter changes: ${parts.join(", ")}. Affected: ${affectedEntities.length} entities.`;
  }

  private validateInverseEvents(
    inverseEvents: StateEvent[],
    snapshot: EntityStateSnapshot
  ): { valid: boolean; error?: string } {
    for (const event of inverseEvents) {
      if (event.action === "REMOVE_CHARACTER_KNOWLEDGE") {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (!character) {
          return { valid: false, error: `Character ${event.characterId} not found` };
        }
      }
    }

    return { valid: true };
  }

  private applyInverseEvents(
    inverseEvents: StateEvent[],
    snapshot: EntityStateSnapshot
  ): void {
    for (const event of inverseEvents) {
      this.applyEventToSnapshot(event, snapshot);
    }
  }

  private applyEventToSnapshot(
    event: StateEvent,
    snapshot: EntityStateSnapshot
  ): void {
    switch (event.action) {
      case "UPDATE_CHARACTER_LOCATION": {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (character) {
          character.currentLocation = event.locationId;
        }
        break;
      }

      case "REMOVE_CHARACTER_KNOWLEDGE": {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (character) {
          character.knowledge = character.knowledge.filter((k) => k !== event.knowledge);
        }
        break;
      }

      case "ADD_CHARACTER_KNOWLEDGE": {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (character && !character.knowledge.includes(event.knowledge)) {
          character.knowledge.push(event.knowledge);
        }
        break;
      }

      case "UPDATE_CHARACTER_POSTURE": {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (character) {
          character.spatialPosture = event.posture;
        }
        break;
      }

      case "UPDATE_CHARACTER_HANDS": {
        const character = snapshot.entities.characters.find((c) => c.id === event.characterId);
        if (character) {
          character.handState = event.handState;
          if (event.heldItems) {
            character.heldItems = event.heldItems;
          }
        }
        break;
      }

      case "TRANSFER_ITEM": {
        const item = snapshot.entities.items.find((i) => i.id === event.itemId);
        if (item) {
          item.owner = event.toCharacter;
        }
        break;
      }

      default:
        break;
    }
  }

  private storeDiff(diff: ChapterStateDiff): void {
    this.diffs.set(diff.chapter, diff);

    const chapters = [...this.diffs.keys()].sort((a, b) => a - b);
    if (chapters.length > this.config.maxStoredDiffs) {
      const toRemove = chapters.slice(0, chapters.length - this.config.maxStoredDiffs);
      for (const chapter of toRemove) {
        this.diffs.delete(chapter);
      }
    }
  }

  getDiff(chapter: number): ChapterStateDiff | undefined {
    return this.diffs.get(chapter);
  }

  getAllDiffs(): ChapterStateDiff[] {
    return [...this.diffs.values()].sort((a, b) => a.chapter - b.chapter);
  }

  getLatestChapter(): number {
    return Math.max(...this.diffs.keys(), 0);
  }

  clear(): void {
    this.diffs.clear();
  }

  getConfig(): Required<RollbackManagerConfig> {
    return { ...this.config };
  }
}

export function createRollbackManager(config?: RollbackManagerConfig): RollbackManager {
  return new RollbackManager(config);
}
