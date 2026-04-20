import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type StateEvent,
  type StateDiff,
  type EntitiesDb,
  type NarrativeLedger,
  type Chronicles,
  type EntityStateSnapshot,
  type ApplyEventResult,
  type CharacterSnapshot,
  type EmotionalDebt,
  type NarrativeHook,
  type HookUrgency,
  type Subplot,
  type CharacterKnowledgeEntry,
  type EventLogEntry,
  type ChapterSummary,
  StateDiffSchema,
  EntitiesDbSchema,
  NarrativeLedgerSchema,
  ChroniclesSchema,
} from "../types/state-types.js";

export class EventSourcer {
  private readonly dbPath: string;
  private readonly runtimePath: string;

  constructor(bookDir: string) {
    this.dbPath = join(bookDir, "story", "db");
    this.runtimePath = join(bookDir, "story", "runtime");
  }

  private get entitiesDbPath(): string {
    return join(this.dbPath, "entities_db.json");
  }

  private get narrativeLedgerPath(): string {
    return join(this.dbPath, "narrative_ledger.json");
  }

  private get chroniclesPath(): string {
    return join(this.dbPath, "chronicles.json");
  }

  private getStateDiffPath(chapter: number): string {
    return join(this.runtimePath, `chapter-${String(chapter).padStart(4, "0")}`, "state-diff.json");
  }

  async loadSnapshot(): Promise<EntityStateSnapshot> {
    const [entities, ledger, chronicles] = await Promise.all([
      this.loadEntitiesDb(),
      this.loadNarrativeLedger(),
      this.loadChronicles(),
    ]);

    return { entities, ledger, chronicles };
  }

  async loadEntitiesDb(): Promise<EntitiesDb> {
    try {
      const raw = await readFile(this.entitiesDbPath, "utf-8");
      const parsed = JSON.parse(raw);
      return EntitiesDbSchema.parse(parsed);
    } catch {
      return this.createEmptyEntitiesDb();
    }
  }

  async loadNarrativeLedger(): Promise<NarrativeLedger> {
    try {
      const raw = await readFile(this.narrativeLedgerPath, "utf-8");
      const parsed = JSON.parse(raw);
      return NarrativeLedgerSchema.parse(parsed);
    } catch {
      return this.createEmptyNarrativeLedger();
    }
  }

  async loadChronicles(): Promise<Chronicles> {
    try {
      const raw = await readFile(this.chroniclesPath, "utf-8");
      const parsed = JSON.parse(raw);
      return ChroniclesSchema.parse(parsed);
    } catch {
      return this.createEmptyChronicles();
    }
  }

  async saveSnapshot(snapshot: EntityStateSnapshot): Promise<void> {
    await mkdir(this.dbPath, { recursive: true });
    await Promise.all([
      writeFile(this.entitiesDbPath, JSON.stringify(snapshot.entities, null, 2), "utf-8"),
      writeFile(this.narrativeLedgerPath, JSON.stringify(snapshot.ledger, null, 2), "utf-8"),
      writeFile(this.chroniclesPath, JSON.stringify(snapshot.chronicles, null, 2), "utf-8"),
    ]);
  }

  async saveStateDiff(diff: StateDiff): Promise<void> {
    const validated = StateDiffSchema.parse(diff);
    const diffPath = this.getStateDiffPath(validated.chapter);
    const diffDir = join(this.runtimePath, `chapter-${String(validated.chapter).padStart(4, "0")}`);
    await mkdir(diffDir, { recursive: true });
    await writeFile(diffPath, JSON.stringify(validated, null, 2), "utf-8");
  }

  async loadStateDiff(chapter: number): Promise<StateDiff | null> {
    try {
      const diffPath = this.getStateDiffPath(chapter);
      const raw = await readFile(diffPath, "utf-8");
      const parsed = JSON.parse(raw);
      return StateDiffSchema.parse(parsed);
    } catch {
      return null;
    }
  }

  applyEvents(snapshot: EntityStateSnapshot, events: ReadonlyArray<StateEvent>, chapter: number): EntityStateSnapshot {
    let current = snapshot;
    const warnings: string[] = [];

    for (const event of events) {
      const result = this.applyEvent(current, event, chapter);
      if (!result.success) {
        throw new Error(`Failed to apply event ${event.action}: ${result.error}`);
      }
      if (result.warnings && result.warnings.length > 0) {
        warnings.push(...result.warnings);
      }
      current = result.snapshot!;
    }

    current.entities = { ...current.entities, lastUpdatedChapter: chapter };
    current.ledger = { ...current.ledger, lastUpdatedChapter: chapter };
    current.chronicles = { ...current.chronicles, lastUpdatedChapter: chapter };

    return current;
  }

  applyEvent(
    snapshot: EntityStateSnapshot,
    event: StateEvent,
    chapter: number,
  ): { success: boolean; error?: string; warnings?: string[]; snapshot?: EntityStateSnapshot } {
    try {
      switch (event.action) {
        case "UPDATE_EMOTION":
          return this.applyUpdateEmotion(snapshot, event, chapter);
        case "SET_EMOTIONAL_DEBT":
          return this.applySetEmotionalDebt(snapshot, event, chapter);
        case "RELEASE_EMOTIONAL_DEBT":
          return this.applyReleaseEmotionalDebt(snapshot, event, chapter);
        case "CONSUME_PARTICLE":
          return this.applyConsumeParticle(snapshot, event, chapter);
        case "OPEN_HOOK":
          return this.applyOpenHook(snapshot, event, chapter);
        case "ADVANCE_HOOK":
          return this.applyAdvanceHook(snapshot, event, chapter);
        case "RESOLVE_HOOK":
          return this.applyResolveHook(snapshot, event, chapter);
        case "UPDATE_CHARACTER_LOCATION":
          return this.applyUpdateCharacterLocation(snapshot, event, chapter);
        case "UPDATE_CHARACTER_POSTURE":
          return this.applyUpdateCharacterPosture(snapshot, event, chapter);
        case "UPDATE_CHARACTER_HANDS":
          return this.applyUpdateCharacterHands(snapshot, event, chapter);
        case "ADD_CHARACTER_KNOWLEDGE":
          return this.applyAddCharacterKnowledge(snapshot, event, chapter);
        case "REMOVE_CHARACTER_KNOWLEDGE":
          return this.applyRemoveCharacterKnowledge(snapshot, event, chapter);
        case "ADD_CHARACTER_MISCONCEPTION":
          return this.applyAddCharacterMisconception(snapshot, event, chapter);
        case "TRANSFER_ITEM":
          return this.applyTransferItem(snapshot, event, chapter);
        case "UPDATE_RELATIONSHIP":
          return this.applyUpdateRelationship(snapshot, event, chapter);
        case "REGISTER_PROPER_NOUN":
          return this.applyRegisterProperNoun(snapshot, event, chapter);
        case "LOG_EVENT":
          return this.applyLogEvent(snapshot, event, chapter);
        case "UPDATE_SUBPLOT":
          return this.applyUpdateSubplot(snapshot, event, chapter);
        case "MOVE_CHARACTER":
          return this.applyMoveCharacter(snapshot, event, chapter);
        case "ACQUIRE_PARTICLE":
          return this.applyAcquireParticle(snapshot, event, chapter);
        case "UPDATE_PHYSICAL":
          return this.applyUpdatePhysical(snapshot, event, chapter);
        case "MOTIF_REFERENCE":
          return this.applyMotifReference(snapshot, event, chapter);
        case "KNOWLEDGE_GAIN":
          return this.applyKnowledgeGain(snapshot, event, chapter);
        case "CLOSE_HOOK":
          return this.applyCloseHook(snapshot, event, chapter);
        default:
          return { success: false, error: `Unknown event action: ${(event as { action: string }).action}` };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private applyUpdateEmotion(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_EMOTION" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.target);
    if (!character) {
      return { success: false, error: `Character not found: ${event.target}` };
    }

    const updatedDebts = character.emotionalDebts.map((debt) => {
      if (debt.emotion === event.emotion) {
        const newMagnitude = Math.max(1, Math.min(10, debt.magnitude + event.delta));
        return { ...debt, magnitude: newMagnitude, beatsAccrued: debt.beatsAccrued + 1 };
      }
      return debt;
    });

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      emotionalDebts: updatedDebts,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applySetEmotionalDebt(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "SET_EMOTIONAL_DEBT" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.target);
    if (!character) {
      return { success: false, error: `Character not found: ${event.target}` };
    }

    const existingIndex = character.emotionalDebts.findIndex((d) => d.emotion === event.emotion);
    const newDebt: EmotionalDebt = {
      emotion: event.emotion,
      magnitude: event.magnitude,
      beatsAccrued: 0,
      releaseThreshold: event.releaseThreshold ?? 50,
      suppressedSinceChapter: chapter,
    };

    let updatedDebts: EmotionalDebt[];
    if (existingIndex >= 0) {
      updatedDebts = [...character.emotionalDebts];
      updatedDebts[existingIndex] = newDebt;
    } else {
      updatedDebts = [...character.emotionalDebts, newDebt];
    }

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      emotionalDebts: updatedDebts,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyReleaseEmotionalDebt(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "RELEASE_EMOTIONAL_DEBT" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.target);
    if (!character) {
      return { success: false, error: `Character not found: ${event.target}` };
    }

    const updatedDebts = character.emotionalDebts.map((debt) => {
      if (debt.emotion === event.emotion) {
        return {
          ...debt,
          magnitude: Math.max(1, debt.magnitude - 3),
          lastTriggeredChapter: chapter,
          suppressedSinceChapter: undefined,
        };
      }
      return debt;
    });

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      emotionalDebts: updatedDebts,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyConsumeParticle(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "CONSUME_PARTICLE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    return {
      success: true,
      warnings: [`CONSUME_PARTICLE event received for ${event.target}, amount: ${event.amount}. Particle system not implemented in this layer.`],
      snapshot,
    };
  }

  private applyOpenHook(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "OPEN_HOOK" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const existing = snapshot.ledger.hooks.find((h) => h.id === event.id);
    if (existing) {
      return { success: false, error: `Hook already exists: ${event.id}` };
    }

    const newHook: NarrativeHook = {
      id: event.id,
      type: event.type,
      description: event.description,
      originChapter: chapter,
      lastReferencedChapter: chapter,
      expectedPayoff: event.expectedPayoff ?? "",
      urgency: "fresh",
      status: "open",
    };

    const updatedLedger: NarrativeLedger = {
      ...snapshot.ledger,
      hooks: [...snapshot.ledger.hooks, newHook],
    };

    return {
      success: true,
      snapshot: { ...snapshot, ledger: updatedLedger },
    };
  }

  private applyAdvanceHook(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "ADVANCE_HOOK" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const hookIndex = snapshot.ledger.hooks.findIndex((h) => h.id === event.id);
    if (hookIndex < 0) {
      return { success: false, error: `Hook not found: ${event.id}` };
    }

    const existing = snapshot.ledger.hooks[hookIndex]!;
    const updatedHook: NarrativeHook = {
      ...existing,
      lastReferencedChapter: chapter,
      status: event.status ?? existing.status,
      urgency: this.calculateHookUrgency(existing, chapter),
    };

    const updatedHooks = [...snapshot.ledger.hooks];
    updatedHooks[hookIndex] = updatedHook;

    return {
      success: true,
      snapshot: { ...snapshot, ledger: { ...snapshot.ledger, hooks: updatedHooks } },
    };
  }

  private applyResolveHook(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "RESOLVE_HOOK" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const hookIndex = snapshot.ledger.hooks.findIndex((h) => h.id === event.id);
    if (hookIndex < 0) {
      return { success: false, error: `Hook not found: ${event.id}` };
    }

    const existing = snapshot.ledger.hooks[hookIndex]!;
    const updatedHook: NarrativeHook = {
      ...existing,
      status: "resolved",
      lastReferencedChapter: chapter,
      payoffChapter: chapter,
    };

    const updatedHooks = [...snapshot.ledger.hooks];
    updatedHooks[hookIndex] = updatedHook;

    return {
      success: true,
      snapshot: { ...snapshot, ledger: { ...snapshot.ledger, hooks: updatedHooks } },
    };
  }

  private applyUpdateCharacterLocation(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_CHARACTER_LOCATION" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      currentLocation: event.locationId,
      lastAppearanceChapter: chapter,
    };

    const updatedLocations = snapshot.entities.locations.map((loc) => {
      if (loc.id === event.locationId) {
        const present = new Set(loc.charactersPresent);
        present.add(event.characterId);
        return { ...loc, charactersPresent: [...present], lastMentionedChapter: chapter };
      }
      if (loc.id === character.currentLocation) {
        const present = new Set(loc.charactersPresent);
        present.delete(event.characterId);
        return { ...loc, charactersPresent: [...present] };
      }
      return loc;
    });

    return {
      success: true,
      snapshot: {
        ...this.updateCharacterInSnapshot(snapshot, updatedCharacter),
        entities: { ...snapshot.entities, locations: updatedLocations },
      },
    };
  }

  private applyUpdateCharacterPosture(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_CHARACTER_POSTURE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      spatialPosture: event.posture,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyUpdateCharacterHands(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_CHARACTER_HANDS" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      handState: event.handState,
      heldItems: event.heldItems ?? character.heldItems,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyAddCharacterKnowledge(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "ADD_CHARACTER_KNOWLEDGE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const knowledgeSet = new Set(character.knowledge);
    knowledgeSet.add(event.knowledge);

    const doesNotKnowSet = new Set(character.doesNotKnow);
    doesNotKnowSet.delete(event.knowledge);

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      knowledge: [...knowledgeSet],
      doesNotKnow: [...doesNotKnowSet],
    };

    const updatedMatrix = this.updateKnowledgeMatrix(
      snapshot.ledger.characterKnowledgeMatrix,
      event.characterId,
      (entry) => {
        const knows = new Set(entry.knows);
        const doesNotKnow = new Set(entry.doesNotKnow);
        knows.add(event.knowledge);
        doesNotKnow.delete(event.knowledge);
        return { ...entry, knows: [...knows], doesNotKnow: [...doesNotKnow] };
      },
    );

    return {
      success: true,
      snapshot: {
        ...this.updateCharacterInSnapshot(snapshot, updatedCharacter),
        ledger: { ...snapshot.ledger, characterKnowledgeMatrix: updatedMatrix },
      },
    };
  }

  private applyRemoveCharacterKnowledge(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "REMOVE_CHARACTER_KNOWLEDGE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const knowledgeSet = new Set(character.knowledge);
    knowledgeSet.delete(event.knowledge);

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      knowledge: [...knowledgeSet],
    };

    const updatedMatrix = this.updateKnowledgeMatrix(
      snapshot.ledger.characterKnowledgeMatrix,
      event.characterId,
      (entry) => {
        const knows = new Set(entry.knows);
        knows.delete(event.knowledge);
        return { ...entry, knows: [...knows] };
      },
    );

    return {
      success: true,
      snapshot: {
        ...this.updateCharacterInSnapshot(snapshot, updatedCharacter),
        ledger: { ...snapshot.ledger, characterKnowledgeMatrix: updatedMatrix },
      },
    };
  }

  private applyAddCharacterMisconception(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "ADD_CHARACTER_MISCONCEPTION" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.characterId);
    if (!character) {
      return { success: false, error: `Character not found: ${event.characterId}` };
    }

    const misconceptionSet = new Set(character.knowledge);
    misconceptionSet.add(event.misconception);

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      knowledge: [...misconceptionSet],
    };

    const updatedMatrix = this.updateKnowledgeMatrix(
      snapshot.ledger.characterKnowledgeMatrix,
      event.characterId,
      (entry) => {
        const misconceptions = new Set(entry.misconceptions);
        misconceptions.add(event.misconception);
        return { ...entry, misconceptions: [...misconceptions] };
      },
    );

    return {
      success: true,
      snapshot: {
        ...this.updateCharacterInSnapshot(snapshot, updatedCharacter),
        ledger: { ...snapshot.ledger, characterKnowledgeMatrix: updatedMatrix },
      },
    };
  }

  private applyTransferItem(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "TRANSFER_ITEM" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const itemIndex = snapshot.entities.items.findIndex((i) => i.id === event.itemId);
    if (itemIndex < 0) {
      return { success: false, error: `Item not found: ${event.itemId}` };
    }

    const item = snapshot.entities.items[itemIndex]!;
    const updatedItem = {
      ...item,
      owner: event.toCharacter ?? item.owner,
      location: event.toLocation ?? item.location,
    };

    const updatedItems = [...snapshot.entities.items];
    updatedItems[itemIndex] = updatedItem;

    let updatedCharacters = snapshot.entities.characters;
    if (event.fromCharacter) {
      updatedCharacters = updatedCharacters.map((c) => {
        if (c.id === event.fromCharacter) {
          const heldItems = c.heldItems.filter((i) => i !== event.itemId);
          return { ...c, heldItems, handState: this.inferHandState(heldItems) };
        }
        return c;
      });
    }
    if (event.toCharacter) {
      updatedCharacters = updatedCharacters.map((c) => {
        if (c.id === event.toCharacter) {
          const heldItems = [...c.heldItems, event.itemId];
          return { ...c, heldItems, handState: this.inferHandState(heldItems) };
        }
        return c;
      });
    }

    return {
      success: true,
      snapshot: {
        ...snapshot,
        entities: { ...snapshot.entities, items: updatedItems, characters: updatedCharacters },
      },
    };
  }

  private applyUpdateRelationship(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_RELATIONSHIP" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const characterA = this.findCharacter(snapshot.entities, event.characterA);
    if (!characterA) {
      return { success: false, error: `Character not found: ${event.characterA}` };
    }

    const updatedRelationships = { ...characterA.relationships, [event.characterB]: event.relationship };
    const updatedCharacter: CharacterSnapshot = {
      ...characterA,
      relationships: updatedRelationships,
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyRegisterProperNoun(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "REGISTER_PROPER_NOUN" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const nounSet = new Set(snapshot.entities.properNounRegistry);
    nounSet.add(event.noun);

    return {
      success: true,
      snapshot: {
        ...snapshot,
        entities: { ...snapshot.entities, properNounRegistry: [...nounSet] },
      },
    };
  }

  private applyLogEvent(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "LOG_EVENT" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const newEntry: EventLogEntry = {
      chapter,
      type: event.type,
      description: event.description,
      characters: event.characters ?? [],
      location: event.location,
      timestamp: Date.now(),
    };

    return {
      success: true,
      snapshot: {
        ...snapshot,
        chronicles: {
          ...snapshot.chronicles,
          eventLog: [...snapshot.chronicles.eventLog, newEntry],
        },
      },
    };
  }

  private applyUpdateSubplot(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_SUBPLOT" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const subplotIndex = snapshot.ledger.subplots.findIndex((s) => s.id === event.subplotId);
    if (subplotIndex < 0) {
      return { success: false, error: `Subplot not found: ${event.subplotId}` };
    }

    const existing = snapshot.ledger.subplots[subplotIndex]!;
    const updatedSubplot: Subplot = {
      ...existing,
      status: event.status ?? existing.status,
      lastAdvancedChapter: chapter,
      endChapter: event.status === "resolved" || event.status === "abandoned" ? chapter : existing.endChapter,
    };

    const updatedSubplots = [...snapshot.ledger.subplots];
    updatedSubplots[subplotIndex] = updatedSubplot;

    return {
      success: true,
      snapshot: { ...snapshot, ledger: { ...snapshot.ledger, subplots: updatedSubplots } },
    };
  }

  private applyMoveCharacter(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "MOVE_CHARACTER" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.target);
    if (!character) {
      return { success: false, error: `Character not found: ${event.target}` };
    }

    const oldLocation = character.currentLocation;

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      currentLocation: event.toLocation,
      lastAppearanceChapter: chapter,
    };

    const updatedLocations = snapshot.entities.locations.map((loc) => {
      if (loc.id === event.toLocation || loc.name === event.toLocation) {
        const present = new Set(loc.charactersPresent);
        present.add(character.id);
        return { ...loc, charactersPresent: [...present], lastMentionedChapter: chapter };
      }
      if (oldLocation && (loc.id === oldLocation || loc.name === oldLocation)) {
        const present = new Set(loc.charactersPresent);
        present.delete(character.id);
        return { ...loc, charactersPresent: [...present] };
      }
      return loc;
    });

    return {
      success: true,
      snapshot: {
        ...this.updateCharacterInSnapshot(snapshot, updatedCharacter),
        entities: { ...snapshot.entities, locations: updatedLocations },
      },
    };
  }

  private applyAcquireParticle(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "ACQUIRE_PARTICLE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    return {
      success: true,
      warnings: [`ACQUIRE_PARTICLE event received for ${event.target}, item: ${event.item}, amount: ${event.amount}. Particle system not fully implemented.`],
      snapshot,
    };
  }

  private applyUpdatePhysical(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "UPDATE_PHYSICAL" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.target);
    if (!character) {
      return { success: false, error: `Character not found: ${event.target}` };
    }

    let updatedCharacter: CharacterSnapshot = { ...character };

    switch (event.field) {
      case "posture":
        updatedCharacter.spatialPosture = event.value as import("../types/state-types.js").SpatialPosture;
        break;
      case "locationAnchor":
        break;
      case "handsLeft":
      case "handsRight":
        if (!updatedCharacter.heldItems.includes(event.value)) {
          updatedCharacter.heldItems = [...updatedCharacter.heldItems, event.value];
          updatedCharacter.handState = this.inferHandState(updatedCharacter.heldItems);
        }
        break;
      case "facing":
        break;
      default:
        return { success: false, error: `Unknown physical field: ${event.field}` };
    }

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyMotifReference(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "MOTIF_REFERENCE" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    return {
      success: true,
      warnings: [`MOTIF_REFERENCE event: ${event.motif} in chapter ${event.chapter}, beat ${event.beatId}`],
      snapshot,
    };
  }

  private applyKnowledgeGain(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "KNOWLEDGE_GAIN" }>,
    _chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const character = this.findCharacter(snapshot.entities, event.character);
    if (!character) {
      return { success: false, error: `Character not found: ${event.character}` };
    }

    const knowledgeSet = new Set(character.knowledge);
    knowledgeSet.add(event.fact);

    const updatedCharacter: CharacterSnapshot = {
      ...character,
      knowledge: [...knowledgeSet],
    };

    return {
      success: true,
      snapshot: this.updateCharacterInSnapshot(snapshot, updatedCharacter),
    };
  }

  private applyCloseHook(
    snapshot: EntityStateSnapshot,
    event: Extract<StateEvent, { action: "CLOSE_HOOK" }>,
    chapter: number,
  ): ApplyEventResult & { snapshot?: EntityStateSnapshot } {
    const hookIndex = snapshot.ledger.hooks.findIndex((h) => h.id === event.id);
    if (hookIndex < 0) {
      return { success: false, error: `Hook not found: ${event.id}` };
    }

    const existing = snapshot.ledger.hooks[hookIndex]!;
    const updatedHook: NarrativeHook = {
      ...existing,
      status: "resolved",
      lastReferencedChapter: chapter,
      payoffChapter: chapter,
    };

    const updatedHooks = [...snapshot.ledger.hooks];
    updatedHooks[hookIndex] = updatedHook;

    return {
      success: true,
      snapshot: { ...snapshot, ledger: { ...snapshot.ledger, hooks: updatedHooks } },
    };
  }

  findCharacter(entities: EntitiesDb, characterId: string): CharacterSnapshot | undefined {
    return entities.characters.find((c) => c.id === characterId || c.name === characterId || c.aliases.includes(characterId));
  }

  private updateCharacterInSnapshot(snapshot: EntityStateSnapshot, updatedCharacter: CharacterSnapshot): EntityStateSnapshot {
    const index = snapshot.entities.characters.findIndex((c) => c.id === updatedCharacter.id);
    if (index < 0) {
      return snapshot;
    }

    const updatedCharacters = [...snapshot.entities.characters];
    updatedCharacters[index] = updatedCharacter;

    return {
      ...snapshot,
      entities: { ...snapshot.entities, characters: updatedCharacters },
    };
  }

  private calculateHookUrgency(hook: NarrativeHook, currentChapter: number): HookUrgency {
    const chaptersSinceOrigin = currentChapter - hook.originChapter;

    if (hook.status === "resolved" || hook.status === "abandoned") {
      return "fresh";
    }

    if (chaptersSinceOrigin >= 10) {
      return "critical";
    }
    if (chaptersSinceOrigin >= 5) {
      return "overdue";
    }
    if (hook.status === "progressing") {
      return "progressing";
    }
    return "fresh";
  }

  private updateKnowledgeMatrix(
    matrix: CharacterKnowledgeEntry[],
    characterId: string,
    updater: (entry: CharacterKnowledgeEntry) => CharacterKnowledgeEntry,
  ): CharacterKnowledgeEntry[] {
    const index = matrix.findIndex((e) => e.characterId === characterId);
    if (index >= 0) {
      const updated = [...matrix];
      updated[index] = updater(matrix[index]!);
      return updated;
    }

    const newEntry: CharacterKnowledgeEntry = {
      characterId,
      knows: [],
      doesNotKnow: [],
      secrets: [],
      misconceptions: [],
    };
    return [...matrix, updater(newEntry)];
  }

  private inferHandState(heldItems: string[]): "empty" | "full" | "occupied-both" {
    if (heldItems.length === 0) return "empty";
    if (heldItems.length >= 2) return "occupied-both";
    return "full";
  }

  private createEmptyEntitiesDb(): EntitiesDb {
    return {
      schemaVersion: 1,
      lastUpdatedChapter: 0,
      characters: [],
      locations: [],
      items: [],
      properNounRegistry: [],
    };
  }

  private createEmptyNarrativeLedger(): NarrativeLedger {
    return {
      schemaVersion: 1,
      lastUpdatedChapter: 0,
      hooks: [],
      subplots: [],
      characterKnowledgeMatrix: [],
      curiosityScore: 0,
    };
  }

  private createEmptyChronicles(): Chronicles {
    return {
      schemaVersion: 1,
      lastUpdatedChapter: 0,
      summaries: [],
      eventLog: [],
      timeline: {},
    };
  }
}

export function validateProperNoun(entities: EntitiesDb, word: string): boolean {
  const normalized = word.trim();
  if (normalized.length === 0) return false;

  return entities.properNounRegistry.includes(normalized) ||
    entities.characters.some((c) => c.name === normalized || c.aliases.includes(normalized)) ||
    entities.locations.some((l) => l.name === normalized) ||
    entities.items.some((i) => i.name === normalized);
}

export function extractCapitalizedWords(text: string): string[] {
  const words: string[] = [];
  const regex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    words.push(match[0]);
  }
  return words;
}

export function detectUnknownProperNouns(entities: EntitiesDb, text: string): string[] {
  const candidates = extractCapitalizedWords(text);
  const unknown: string[] = [];

  for (const word of candidates) {
    if (!validateProperNoun(entities, word)) {
      unknown.push(word);
    }
  }

  return unknown;
}

export function createParallel3<T>(): <T1, T2, T3>(
  tasks: [() => Promise<T1>, () => Promise<T2>, () => Promise<T3>]
) => Promise<[T1, T2, T3]> {
  return <T1, T2, T3>(
    tasks: [() => Promise<T1>, () => Promise<T2>, () => Promise<T3>]
  ): Promise<[T1, T2, T3]> => {
    return Promise.all([tasks[0](), tasks[1](), tasks[2]()]) as Promise<[T1, T2, T3]>;
  };
}

export const parallel3 = createParallel3();
