import { z } from "zod";

export const SpatialPostureSchema = z.enum([
  "standing",
  "sitting",
  "lying",
  "crouching",
  "walking",
  "running",
  "fighting",
  "unconscious",
  "unknown",
]);
export type SpatialPosture = z.infer<typeof SpatialPostureSchema>;

export const HandStateSchema = z.enum([
  "empty",
  "full",
  "occupied-both",
  "occupied-left",
  "occupied-right",
  "bound",
  "injured",
]);
export type HandState = z.infer<typeof HandStateSchema>;

export const EmotionalDebtSchema = z.object({
  emotion: z.string().min(1),
  magnitude: z.number().int().min(1).max(10),
  beatsAccrued: z.number().int().min(0),
  releaseThreshold: z.number().int().min(1).max(100),
  lastTriggeredChapter: z.number().int().min(0).optional(),
  suppressedSinceChapter: z.number().int().min(0).optional(),
});
export type EmotionalDebt = z.infer<typeof EmotionalDebtSchema>;

export const CharacterSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: z.enum(["protagonist", "antagonist", "supporting", "minor", "unknown"]).default("unknown"),
  currentLocation: z.string().optional(),
  spatialPosture: SpatialPostureSchema.default("unknown"),
  handState: HandStateSchema.default("empty"),
  heldItems: z.array(z.string()).default([]),
  emotionalDebts: z.array(EmotionalDebtSchema).default([]),
  unconsciousContents: z.array(z.any()).default([]),
  subtextHistory: z.array(z.any()).default([]),
  voiceProfileId: z.string().optional(),
  knowledge: z.array(z.string()).default([]),
  doesNotKnow: z.array(z.string()).default([]),
  relationships: z.record(z.string(), z.string()).default({}),
  status: z.string().default("active"),
  lastAppearanceChapter: z.number().int().min(0).optional(),
  notes: z.string().default(""),
});
export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;

export const LocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["indoor", "outdoor", "vehicle", "abstract", "unknown"]).default("unknown"),
  parentLocation: z.string().optional(),
  sensoryAnchors: z.array(z.string()).default([]),
  charactersPresent: z.array(z.string()).default([]),
  itemsPresent: z.array(z.string()).default([]),
  lastMentionedChapter: z.number().int().min(0).optional(),
  notes: z.string().default(""),
});
export type Location = z.infer<typeof LocationSchema>;

export const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["weapon", "tool", "consumable", "artifact", "document", "clothing", "other"]).default("other"),
  owner: z.string().optional(),
  location: z.string().optional(),
  properties: z.record(z.string(), z.string()).default({}),
  lastMentionedChapter: z.number().int().min(0).optional(),
  notes: z.string().default(""),
});
export type Item = z.infer<typeof ItemSchema>;

export const EntitiesDbSchema = z.object({
  schemaVersion: z.literal(1),
  lastUpdatedChapter: z.number().int().min(0),
  characters: z.array(CharacterSnapshotSchema).default([]),
  locations: z.array(LocationSchema).default([]),
  items: z.array(ItemSchema).default([]),
  properNounRegistry: z.array(z.string()).default([]),
});
export type EntitiesDb = z.infer<typeof EntitiesDbSchema>;

export const HookUrgencySchema = z.enum(["fresh", "progressing", "overdue", "critical"]);
export type HookUrgency = z.infer<typeof HookUrgencySchema>;

export const NarrativeHookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  originChapter: z.number().int().min(1),
  lastReferencedChapter: z.number().int().min(0),
  expectedPayoff: z.string().default(""),
  urgency: HookUrgencySchema.default("fresh"),
  status: z.enum(["open", "progressing", "resolved", "abandoned"]).default("open"),
  payoffChapter: z.number().int().min(0).optional(),
});
export type NarrativeHook = z.infer<typeof NarrativeHookSchema>;

export const SubplotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["dormant", "active", "resolved", "abandoned"]).default("dormant"),
  startChapter: z.number().int().min(1),
  endChapter: z.number().int().min(0).optional(),
  involvedCharacters: z.array(z.string()).default([]),
  relatedHooks: z.array(z.string()).default([]),
  lastAdvancedChapter: z.number().int().min(0).optional(),
});
export type Subplot = z.infer<typeof SubplotSchema>;

export const CharacterKnowledgeEntrySchema = z.object({
  characterId: z.string().min(1),
  knows: z.array(z.string()).default([]),
  doesNotKnow: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
});
export type CharacterKnowledgeEntry = z.infer<typeof CharacterKnowledgeEntrySchema>;

export const NarrativeLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  lastUpdatedChapter: z.number().int().min(0),
  hooks: z.array(NarrativeHookSchema).default([]),
  subplots: z.array(SubplotSchema).default([]),
  characterKnowledgeMatrix: z.array(CharacterKnowledgeEntrySchema).default([]),
  curiosityScore: z.number().int().min(0).default(0),
});
export type NarrativeLedger = z.infer<typeof NarrativeLedgerSchema>;

export const EventLogEntrySchema = z.object({
  chapter: z.number().int().min(1),
  beatId: z.string().optional(),
  type: z.string().min(1),
  description: z.string().min(1),
  characters: z.array(z.string()).default([]),
  location: z.string().optional(),
  timestamp: z.number().int().min(0).optional(),
});
export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;

export const ChapterSummarySchema = z.object({
  chapter: z.number().int().min(1),
  title: z.string().default(""),
  wordCount: z.number().int().min(0).default(0),
  summary: z.string().default(""),
  keyEvents: z.array(z.string()).default([]),
  characterAppearances: z.array(z.string()).default([]),
  locationChanges: z.array(z.string()).default([]),
  stateChanges: z.array(z.string()).default([]),
  hooksOpened: z.array(z.string()).default([]),
  hooksResolved: z.array(z.string()).default([]),
  mood: z.string().default(""),
  pacing: z.enum(["slow", "medium", "fast", "variable"]).default("medium"),
});
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;

export const ChroniclesSchema = z.object({
  schemaVersion: z.literal(1),
  lastUpdatedChapter: z.number().int().min(0),
  summaries: z.array(ChapterSummarySchema).default([]),
  eventLog: z.array(EventLogEntrySchema).default([]),
  timeline: z.record(z.string(), z.array(z.string())).default({}),
  subtextRegistry: z.array(z.any()).default([]),
  timelineEvents: z.array(z.any()).default([]),
});
export type Chronicles = z.infer<typeof ChroniclesSchema>;

export const StateEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_EMOTION"),
    target: z.string().min(1),
    emotion: z.string().min(1),
    delta: z.number().int(),
  }),
  z.object({
    action: z.literal("SET_EMOTIONAL_DEBT"),
    target: z.string().min(1),
    emotion: z.string().min(1),
    magnitude: z.number().int().min(1).max(10),
    releaseThreshold: z.number().int().min(1).max(100).optional(),
  }),
  z.object({
    action: z.literal("RELEASE_EMOTIONAL_DEBT"),
    target: z.string().min(1),
    emotion: z.string().min(1),
  }),
  z.object({
    action: z.literal("CONSUME_PARTICLE"),
    target: z.string().min(1),
    amount: z.number().int().min(1),
  }),
  z.object({
    action: z.literal("OPEN_HOOK"),
    id: z.string().min(1),
    type: z.string().min(1),
    description: z.string().min(1),
    expectedPayoff: z.string().optional(),
  }),
  z.object({
    action: z.literal("ADVANCE_HOOK"),
    id: z.string().min(1),
    status: z.enum(["open", "progressing", "resolved", "abandoned"]).optional(),
  }),
  z.object({
    action: z.literal("RESOLVE_HOOK"),
    id: z.string().min(1),
    payoffDescription: z.string().optional(),
  }),
  z.object({
    action: z.literal("UPDATE_CHARACTER_LOCATION"),
    characterId: z.string().min(1),
    locationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("UPDATE_CHARACTER_POSTURE"),
    characterId: z.string().min(1),
    posture: SpatialPostureSchema,
  }),
  z.object({
    action: z.literal("UPDATE_CHARACTER_HANDS"),
    characterId: z.string().min(1),
    handState: HandStateSchema,
    heldItems: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("ADD_CHARACTER_KNOWLEDGE"),
    characterId: z.string().min(1),
    knowledge: z.string().min(1),
  }),
  z.object({
    action: z.literal("REMOVE_CHARACTER_KNOWLEDGE"),
    characterId: z.string().min(1),
    knowledge: z.string().min(1),
  }),
  z.object({
    action: z.literal("ADD_CHARACTER_MISCONCEPTION"),
    characterId: z.string().min(1),
    misconception: z.string().min(1),
  }),
  z.object({
    action: z.literal("TRANSFER_ITEM"),
    itemId: z.string().min(1),
    fromCharacter: z.string().optional(),
    toCharacter: z.string().optional(),
    toLocation: z.string().optional(),
  }),
  z.object({
    action: z.literal("UPDATE_RELATIONSHIP"),
    characterA: z.string().min(1),
    characterB: z.string().min(1),
    relationship: z.string().min(1),
  }),
  z.object({
    action: z.literal("REGISTER_PROPER_NOUN"),
    noun: z.string().min(1),
    type: z.enum(["character", "location", "item", "other"]),
  }),
  z.object({
    action: z.literal("LOG_EVENT"),
    type: z.string().min(1),
    description: z.string().min(1),
    characters: z.array(z.string()).optional(),
    location: z.string().optional(),
  }),
  z.object({
    action: z.literal("UPDATE_SUBPLOT"),
    subplotId: z.string().min(1),
    status: z.enum(["dormant", "active", "resolved", "abandoned"]).optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("MOVE_CHARACTER"),
    target: z.string().min(1),
    toLocation: z.string().min(1),
  }),
  z.object({
    action: z.literal("ACQUIRE_PARTICLE"),
    target: z.string().min(1),
    item: z.string().min(1),
    amount: z.number().int().min(1),
  }),
  z.object({
    action: z.literal("UPDATE_PHYSICAL"),
    target: z.string().min(1),
    field: z.enum(["posture", "locationAnchor", "handsLeft", "handsRight", "facing"]),
    value: z.string().min(1),
  }),
  z.object({
    action: z.literal("MOTIF_REFERENCE"),
    motif: z.string().min(1),
    chapter: z.number().int().min(1),
    beatId: z.string().min(1),
    emotionalVector: z.object({
      primary: z.string().min(1),
      valence: z.number().min(-1).max(1),
    }),
    associatedCharacter: z.string().optional(),
  }),
  z.object({
    action: z.literal("KNOWLEDGE_GAIN"),
    character: z.string().min(1),
    fact: z.string().min(1),
  }),
  z.object({
    action: z.literal("ADD_UNCONSCIOUS_CONTENT"),
    characterId: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(["trauma", "desire", "fear", "memory", "symbol", "dream"]),
    intensity: z.number().min(0).max(1).optional(),
  }),
  z.object({
    action: z.literal("MANIFEST_UNCONSCIOUS"),
    characterId: z.string().min(1),
    contentId: z.string().min(1),
    manifestation: z.string().min(1),
  }),
  z.object({
    action: z.literal("PLANT_SUBTEXT"),
    layer: z.enum(["literal", "implied", "unconscious"]),
    surfaceText: z.string().min(1),
    subtextMeaning: z.string().min(1),
    characterId: z.string().min(1),
  }),
  z.object({
    action: z.literal("ADD_TIMELINE_EVENT"),
    timestamp: z.union([z.number(), z.string()]),
    description: z.string().min(1),
    characters: z.array(z.string()).optional(),
    location: z.string().optional(),
    eventType: z.string(),
  }),
  z.object({
    action: z.literal("CLOSE_HOOK"),
    id: z.string().min(1),
  }),
]);
export type StateEvent = z.infer<typeof StateEventSchema>;

export const StateDiffSchema = z.object({
  schemaVersion: z.literal(1),
  chapter: z.number().int().min(1),
  beatId: z.string().optional(),
  timestamp: z.number().int().min(0),
  events: z.array(StateEventSchema).default([]),
  previousStateHash: z.string().optional(),
});
export type StateDiff = z.infer<typeof StateDiffSchema>;

export type ApplyEventResult = {
  success: boolean;
  error?: string;
  warnings?: string[];
};

export type EntityStateSnapshot = {
  entities: EntitiesDb;
  ledger: NarrativeLedger;
  chronicles: Chronicles;
};
