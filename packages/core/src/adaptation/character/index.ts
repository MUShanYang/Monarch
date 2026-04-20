export {
  KnowledgeBoundaryChecker,
  createKnowledgeBoundaryChecker,
  checkKnowledgeBreach,
} from "./knowledge-boundary.js";

export type {
  KnowledgeBoundary,
  KnowledgeBreach,
  KnowledgeCheckResult,
  KnowledgeBoundaryConfig,
} from "./knowledge-boundary.js";

export {
  KnowledgeBoundarySchema,
  KnowledgeBreachSchema,
  KnowledgeCheckResultSchema,
  KnowledgeBoundaryConfigSchema,
} from "./knowledge-boundary.js";

export {
  EmotionalDebtManager,
  createEmotionalDebtManager,
  analyzeEmotionalDebt,
} from "./emotional-debt.js";

export type {
  CharacterEmotionalDebt,
  DebtAnalysisResult,
  EmotionalDebtConfig,
} from "./emotional-debt.js";

export {
  CharacterEmotionalDebtSchema,
  DebtAnalysisResultSchema,
  EmotionalDebtConfigSchema,
} from "./emotional-debt.js";

export {
  CharacterUnconscious,
  createCharacterUnconscious,
} from "./unconscious.js";

export type {
  UnconsciousContent,
  Manifestation,
  UnconsciousAnalysis,
  UnconsciousConfig,
} from "./unconscious.js";

export {
  UnconsciousContentSchema,
  ManifestationSchema,
  UnconsciousAnalysisSchema,
  UnconsciousConfigSchema,
} from "./unconscious.js";
