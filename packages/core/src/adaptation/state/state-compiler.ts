import { z } from "zod";
import type { EntitiesDb, NarrativeLedger, ChapterSummary } from "../types/state-types.js";

export const CompiledMdFilesSchema = z.object({
  currentState: z.string(),
  pendingHooks: z.string(),
  subplotBoard: z.string(),
  chapterSummaries: z.string(),
});
export type CompiledMdFiles = z.infer<typeof CompiledMdFilesSchema>;

export const StateCompilerConfigSchema = z.object({
  includeParticles: z.boolean().default(true),
  includeEmotionalState: z.boolean().default(true),
  includeKnowledge: z.boolean().default(true),
  maxHooksPerFile: z.number().int().min(1).default(50),
  maxSubplotsPerFile: z.number().int().min(1).default(20),
  summaryMaxLength: z.number().int().min(100).default(500),
});
export type StateCompilerConfig = z.infer<typeof StateCompilerConfigSchema>;

const DEFAULT_CONFIG: Required<StateCompilerConfig> = {
  includeParticles: true,
  includeEmotionalState: true,
  includeKnowledge: true,
  maxHooksPerFile: 50,
  maxSubplotsPerFile: 20,
  summaryMaxLength: 500,
};

export class StateCompiler {
  private config: Required<StateCompilerConfig>;

  constructor(config?: StateCompilerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compile(
    entitiesDb: EntitiesDb,
    narrativeLedger: NarrativeLedger,
    chapterSummaries: ChapterSummary[]
  ): CompiledMdFiles {
    return {
      currentState: this.compileCurrentState(entitiesDb),
      pendingHooks: this.compilePendingHooks(narrativeLedger),
      subplotBoard: this.compileSubplotBoard(narrativeLedger),
      chapterSummaries: this.compileChapterSummaries(chapterSummaries),
    };
  }

  private compileCurrentState(entitiesDb: EntitiesDb): string {
    const lines: string[] = [
      "# Current State",
      "",
      "> **Note**: This file is auto-generated from JSON Ledgers. Do not edit manually.",
      "",
      "## Characters",
      "",
    ];

    for (const character of entitiesDb.characters) {
      lines.push(`### ${character.name}`);
      lines.push("");

      if (character.aliases.length > 0) {
        lines.push(`**Aliases**: ${character.aliases.join(", ")}`);
        lines.push("");
      }

      lines.push(`**Current Location**: ${character.currentLocation || "Unknown"}`);
      lines.push("");

      lines.push(`**Spatial Posture**: ${character.spatialPosture}`);
      lines.push("");

      if (this.config.includeParticles && character.heldItems.length > 0) {
        lines.push("**Held Items**:");
        for (const item of character.heldItems) {
          lines.push(`- ${item}`);
        }
        lines.push("");
      }

      if (this.config.includeKnowledge && character.knowledge.length > 0) {
        lines.push("**Knowledge**:");
        for (const fact of character.knowledge.slice(0, 10)) {
          lines.push(`- ${fact}`);
        }
        if (character.knowledge.length > 10) {
          lines.push(`- ... and ${character.knowledge.length - 10} more`);
        }
        lines.push("");
      }

      if (character.emotionalDebts.length > 0) {
        lines.push("**Emotional Debts**:");
        for (const debt of character.emotionalDebts) {
          lines.push(`- ${debt.emotion} (magnitude: ${debt.magnitude})`);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    lines.push("## Locations");
    lines.push("");

    for (const location of entitiesDb.locations) {
      lines.push(`### ${location.name}`);
      lines.push("");

      if (location.charactersPresent.length > 0) {
        const characterNames = location.charactersPresent
          .map((id) => entitiesDb.characters.find((c) => c.id === id)?.name)
          .filter(Boolean);
        lines.push(`**Present**: ${characterNames.join(", ") || "None"}`);
        lines.push("");
      }

      if (location.sensoryAnchors.length > 0) {
        lines.push(`**Sensory Anchors**: ${location.sensoryAnchors.join(", ")}`);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  private compilePendingHooks(narrativeLedger: NarrativeLedger): string {
    const lines: string[] = [
      "# Pending Hooks",
      "",
      "> **Note**: This file is auto-generated from JSON Ledgers. Do not edit manually.",
      "",
    ];

    const activeHooks = narrativeLedger.hooks
      .filter((h) => h.status === "open" || h.status === "progressing")
      .slice(0, this.config.maxHooksPerFile);

    if (activeHooks.length === 0) {
      lines.push("*No pending hooks.*");
      return lines.join("\n");
    }

    for (const hook of activeHooks) {
      lines.push(`## ${hook.id}`);
      lines.push("");
      lines.push(`**Description**: ${hook.description}`);
      lines.push("");
      lines.push(`**Expected Payoff**: ${hook.expectedPayoff}`);
      lines.push("");
      lines.push(`**Planted**: Chapter ${hook.originChapter}`);
      lines.push("");
      lines.push(`**Urgency**: ${hook.urgency}`);
      lines.push("");

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  private compileSubplotBoard(narrativeLedger: NarrativeLedger): string {
    const lines: string[] = [
      "# Subplot Board",
      "",
      "> **Note**: This file is auto-generated from JSON Ledgers. Do not edit manually.",
      "",
    ];

    const sortedSubplots = [...narrativeLedger.subplots]
      .slice(0, this.config.maxSubplotsPerFile);

    if (sortedSubplots.length === 0) {
      lines.push("*No subplots.*");
      return lines.join("\n");
    }

    const statusOrder = { active: 0, dormant: 1, resolved: 2, abandoned: 3 };

    for (const subplot of sortedSubplots.sort(
      (a, b) => statusOrder[a.status] - statusOrder[b.status]
    )) {
      const statusEmoji = {
        active: "🔥",
        dormant: "💤",
        resolved: "✅",
        abandoned: "❌",
      };

      lines.push(`## ${statusEmoji[subplot.status]} ${subplot.id}`);
      lines.push("");
      lines.push(`**Status**: ${subplot.status}`);
      lines.push("");

      if (subplot.involvedCharacters.length > 0) {
        lines.push(`**Involved**: ${subplot.involvedCharacters.join(", ")}`);
        lines.push("");
      }

      if (subplot.lastAdvancedChapter !== undefined) {
        lines.push(`**Last Active**: Chapter ${subplot.lastAdvancedChapter}`);
        lines.push("");
      }

      if (subplot.endChapter !== undefined) {
        lines.push(`**Ended**: Chapter ${subplot.endChapter}`);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  private compileChapterSummaries(chapterSummaries: ChapterSummary[]): string {
    const lines: string[] = [
      "# Chapter Summaries",
      "",
      "> **Note**: This file is auto-generated from JSON Ledgers. Do not edit manually.",
      "",
    ];

    const sortedSummaries = [...chapterSummaries].sort((a, b) => a.chapter - b.chapter);

    for (const summary of sortedSummaries) {
      lines.push(`## Chapter ${summary.chapter}: ${summary.title || "Untitled"}`);
      lines.push("");

      if (summary.summary) {
        const text = summary.summary.length > this.config.summaryMaxLength
          ? summary.summary.substring(0, this.config.summaryMaxLength) + "..."
          : summary.summary;
        lines.push(text);
        lines.push("");
      }

      if (summary.keyEvents.length > 0) {
        lines.push("### Key Events");
        lines.push("");
        for (const event of summary.keyEvents) {
          lines.push(`- ${event}`);
        }
        lines.push("");
      }

      if (summary.characterAppearances.length > 0) {
        lines.push(`**Characters**: ${summary.characterAppearances.join(", ")}`);
        lines.push("");
      }

      if (summary.locationChanges.length > 0) {
        lines.push(`**Locations**: ${summary.locationChanges.join(", ")}`);
        lines.push("");
      }

      lines.push(`**Word Count**: ${summary.wordCount}`);
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  getConfig(): Required<StateCompilerConfig> {
    return { ...this.config };
  }
}

export function createStateCompiler(config?: StateCompilerConfig): StateCompiler {
  return new StateCompiler(config);
}

export function compileStateToMarkdown(
  entitiesDb: EntitiesDb,
  narrativeLedger: NarrativeLedger,
  chapterSummaries: ChapterSummary[],
  config?: StateCompilerConfig
): CompiledMdFiles {
  const compiler = new StateCompiler(config);
  return compiler.compile(entitiesDb, narrativeLedger, chapterSummaries);
}
