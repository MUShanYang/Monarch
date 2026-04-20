import { z } from "zod";

export const MotifHistoryEntrySchema = z.object({
  chapter: z.number().int().min(1),
  beatId: z.string().min(1),
  emotionalVector: z.object({
    primary: z.string(),
    valence: z.number().min(-1).max(1),
  }),
  associatedCharacter: z.string().optional(),
  timestamp: z.number().int().positive().optional(),
});

export type MotifHistoryEntry = z.infer<typeof MotifHistoryEntrySchema>;

export const MotifArcSchema = z.enum(["REINFORCE", "CONTRAST", "TRANSMUTE", "DORMANT"]);

export type MotifArc = z.infer<typeof MotifArcSchema>;

export const MotifIndexEntrySchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  history: z.array(MotifHistoryEntrySchema).default([]),
  currentArc: MotifArcSchema.default("DORMANT"),
  lastAppearance: z.object({
    chapter: z.number().int().min(1),
    beatId: z.string(),
    emotion: z.string(),
  }).optional(),
});

export type MotifIndexEntry = z.infer<typeof MotifIndexEntrySchema>;

export const MotifIndexSchema = z.object({
  motifs: z.record(z.string(), MotifIndexEntrySchema).default({}),
  lastUpdated: z.number().int().positive().optional(),
  version: z.string().default("1.0.0"),
});

export type MotifIndex = z.infer<typeof MotifIndexSchema>;

export const MotifEchoSchema = z.object({
  object: z.string().min(1),
  priorEmotion: z.string(),
  directive: MotifArcSchema,
  distance: z.number().int().min(0),
});

export type MotifEcho = z.infer<typeof MotifEchoSchema>;

export const MOTIF_VOCABULARY: Record<string, string[]> = {
  rain: ["rain", "raindrop", "downpour", "drizzle", "shower", "storm", "precipitation", "rainfall"],
  fire: ["fire", "flame", "blaze", "inferno", "combustion", "burn", "burning", "wildfire"],
  blood: ["blood", "bloody", "bleeding", "gore", "crimson", "sanguine"],
  silence: ["silence", "quiet", "hush", "stillness", "mute", "speechless", "wordless"],
  darkness: ["darkness", "dark", "shadow", "shadows", "blackness", "gloom", "obscurity"],
  light: ["light", "brightness", "glow", "radiance", "illumination", "shine", "gleam"],
  wind: ["wind", "breeze", "gust", "gale", "air", "draft", "whirlwind"],
  water: ["water", "wave", "ripple", "stream", "flow", "liquid", "aquatic"],
  moon: ["moon", "lunar", "moonlight", "crescent", "full moon", "new moon"],
  sun: ["sun", "sunlight", "solar", "sunshine", "daylight", "rays"],
  death: ["death", "dying", "dead", "mortality", "demise", "passing", "grave"],
  birth: ["birth", "born", "birthright", "origin", "beginning", "creation"],
  time: ["time", "moment", "instant", "eternity", "temporal", "chronicle"],
  memory: ["memory", "remember", "recall", "reminiscence", "nostalgia", "past"],
  dream: ["dream", "nightmare", "vision", "fantasy", "illusion", "reverie"],
  mirror: ["mirror", "reflection", "reflect", "glass", "image", "duplicate"],
  mask: ["mask", "disguise", "façade", "pretense", "veil", "concealment"],
  sword: ["sword", "blade", "steel", "weapon", "edge", "cut", "sharp"],
  flower: ["flower", "bloom", "blossom", "petal", "rose", "garden"],
  winter: ["winter", "cold", "frost", "snow", "ice", "freeze", "frozen"],
  summer: ["summer", "heat", "warmth", "hot", "sunny", "blazing"],
  autumn: ["autumn", "fall", "leaves", "decay", "wither", "harvest"],
  spring: ["spring", "renewal", "growth", "bud", "sprout", "awakening"],
  stone: ["stone", "rock", "boulder", "pebble", "granite", "marble", "concrete"],
  dust: ["dust", "ash", "cinder", "particle", "remains", "residue"],
  smoke: ["smoke", "fume", "vapor", "mist", "fog", "haze"],
  echo: ["echo", "resonance", "reverberation", "repeat", "answer"],
  wound: ["wound", "injury", "scar", "hurt", "pain", "trauma"],
  hunger: ["hunger", "starvation", "craving", "desire", "emptiness", "thirst"],
  sleep: ["sleep", "slumber", "rest", "dream", "unconscious", "coma"],
  journey: ["journey", "travel", "voyage", "quest", "path", "road", "way"],
  threshold: ["threshold", "door", "gate", "portal", "entrance", "boundary"],
  cage: ["cage", "prison", "cell", "trap", "confine", "captivity"],
  key: ["key", "unlock", "open", "solution", "answer", "access"],
  crown: ["crown", "throne", "kingdom", "rule", "royal", "monarch"],
  chain: ["chain", "bind", "fetter", "shackle", "link", "bond"],
  eye: ["eye", "gaze", "stare", "watch", "see", "vision", "sight"],
  heart: ["heart", "pulse", "beat", "chest", "core", "center"],
  hand: ["hand", "finger", "palm", "grasp", "touch", "hold", "grip"],
  voice: ["voice", "speak", "whisper", "shout", "cry", "call", "utter"],
};

export function getMotifVocabulary(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [motif, aliases] of Object.entries(MOTIF_VOCABULARY)) {
    map.set(motif, new Set(aliases));
  }
  return map;
}
