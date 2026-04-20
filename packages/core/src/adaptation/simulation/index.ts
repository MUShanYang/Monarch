export {
  ReaderSimulator,
  createReaderSimulator,
  buildReaderPrompt,
  READER_PERSONAS,
} from "./reader-simulator.js";

export type {
  ReaderPersona,
  ReaderResponse,
  ReaderSimulationResult,
  ReaderSimulatorConfig,
  ReaderLLMClient,
} from "./reader-simulator.js";

export {
  ReaderPersonaSchema,
  ReaderResponseSchema,
  ReaderSimulationResultSchema,
  ReaderSimulatorConfigSchema,
} from "./reader-simulator.js";

export {
  DialogueArena,
  createDialogueArena,
} from "./dialogue-arena.js";

export type {
  DialogueParticipant,
  DialogueLine,
  DialogueScene,
  DialogueValidationResult,
  DialogueArenaConfig,
} from "./dialogue-arena.js";

export {
  DialogueParticipantSchema,
  DialogueLineSchema,
  DialogueSceneSchema,
  DialogueValidationResultSchema,
  DialogueArenaConfigSchema,
} from "./dialogue-arena.js";
