import { z } from "zod";

export const TellPatternSchema = z.object({
  regex: z.instanceof(RegExp),
  replacement: z.string(),
  description: z.string().optional(),
});
export type TellPattern = z.infer<typeof TellPatternSchema>;

export const TELL_PATTERNS: TellPattern[] = [
  {
    regex: /，以此(掩饰|表达|证明|掩盖|逃避|摆脱|忘记)/g,
    replacement: "。",
    description: "Remove explicit purpose clauses with '以此'",
  },
  {
    regex: /因为(他|她|它|他们|她们)(感到|觉得|认为|知道)/g,
    replacement: "",
    description: "Remove explicit causal 'because he felt'",
  },
  {
    regex: /，仿佛在说/g,
    replacement: "。",
    description: "Remove 'as if to say'",
  },
  {
    regex: /试图以此/g,
    replacement: "",
    description: "Remove 'trying to use this to'",
  },
  {
    regex: /为了(掩饰|表达|证明|掩盖)(他的|她的|自己的)/g,
    replacement: "",
    description: "Remove explicit purpose 'in order to'",
  },
  {
    regex: /(他|她)心想：/g,
    replacement: "",
    description: "Remove explicit thought attribution",
  },
  {
    regex: /(他|她)意识到/g,
    replacement: "",
    description: "Remove explicit realization",
  },
  {
    regex: /(他|她)明白(了|到)/g,
    replacement: "",
    description: "Remove explicit understanding",
  },
  {
    regex: /(他|她)感到(一阵|一种)/g,
    replacement: "",
    description: "Remove explicit feeling introduction",
  },
  {
    regex: /内心(充满了|涌起|升起)/g,
    replacement: "",
    description: "Remove explicit internal state",
  },
  {
    regex: /(眼中|眼里)(闪过|流露出|透出)/g,
    replacement: "",
    description: "Remove explicit eye expression",
  },
  {
    regex: /，(想要|企图|试图)/g,
    replacement: "。",
    description: "Remove explicit intention",
  },
  {
    regex: /(因为|由于)(这个|那|这)/g,
    replacement: "",
    description: "Remove explicit causation",
  },
  {
    regex: /(所以|因此|于是)(他|她)/g,
    replacement: "",
    description: "Remove explicit consequence",
  },
  {
    regex: /，(原来|其实)是/g,
    replacement: "。",
    description: "Remove explicit revelation",
  },
];

export const POST_PROCESS_PATTERNS: TellPattern[] = [
  {
    regex: /，。/g,
    replacement: "。",
    description: "Clean up comma-period sequences",
  },
  {
    regex: /。。/g,
    replacement: "。",
    description: "Clean up double periods",
  },
  {
    regex: /，，/g,
    replacement: "，",
    description: "Clean up double commas",
  },
  {
    regex: /\s+/g,
    replacement: " ",
    description: "Normalize whitespace",
  },
  {
    regex: /^\s*[，。、]/g,
    replacement: "",
    description: "Remove leading punctuation",
  },
];

export interface ScalpelConfig {
  patterns?: TellPattern[];
  postProcessPatterns?: TellPattern[];
  preserveLength?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<ScalpelConfig, "patterns" | "postProcessPatterns">> & {
  patterns: TellPattern[];
  postProcessPatterns: TellPattern[];
} = {
  patterns: TELL_PATTERNS,
  postProcessPatterns: POST_PROCESS_PATTERNS,
  preserveLength: false,
};

export class ShowDontTellScalpel {
  private patterns: TellPattern[];
  private postProcessPatterns: TellPattern[];
  private preserveLength: boolean;

  constructor(config?: ScalpelConfig) {
    this.patterns = config?.patterns ?? DEFAULT_CONFIG.patterns;
    this.postProcessPatterns = config?.postProcessPatterns ?? DEFAULT_CONFIG.postProcessPatterns;
    this.preserveLength = config?.preserveLength ?? DEFAULT_CONFIG.preserveLength;
  }

  exciseExplicitMotivation(text: string): string {
    let result = text;
    const originalLength = result.length;

    for (const pattern of this.patterns) {
      result = result.replace(pattern.regex, pattern.replacement);
    }

    for (const pattern of this.postProcessPatterns) {
      result = result.replace(pattern.regex, pattern.replacement);
    }

    result = result.trim();

    if (this.preserveLength && result.length < originalLength * 0.7) {
      console.warn(
        `ShowDontTellScalpel: Text reduced by more than 30%. Original: ${originalLength} chars, Result: ${result.length} chars`
      );
    }

    return result;
  }

  analyzeText(text: string): {
    tellCount: number;
    foundPatterns: Array<{ pattern: string; matches: string[] }>;
    tellDensity: number;
  } {
    const foundPatterns: Array<{ pattern: string; matches: string[] }> = [];
    let totalMatches = 0;

    for (const pattern of this.patterns) {
      const matches: string[] = [];
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      while ((match = regex.exec(text)) !== null) {
        matches.push(match[0]);
        totalMatches++;
      }

      if (matches.length > 0) {
        foundPatterns.push({
          pattern: pattern.description ?? pattern.regex.source,
          matches,
        });
      }
    }

    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    const tellDensity = wordCount > 0 ? totalMatches / wordCount : 0;

    return {
      tellCount: totalMatches,
      foundPatterns,
      tellDensity,
    };
  }

  getPatternCount(): number {
    return this.patterns.length;
  }

  addPattern(pattern: TellPattern): void {
    this.patterns.push(pattern);
  }

  removePattern(regexSource: string): boolean {
    const index = this.patterns.findIndex((p) => p.regex.source === regexSource);
    if (index >= 0) {
      this.patterns.splice(index, 1);
      return true;
    }
    return false;
  }
}

export function exciseExplicitMotivation(text: string, config?: ScalpelConfig): string {
  const scalpel = new ShowDontTellScalpel(config);
  return scalpel.exciseExplicitMotivation(text);
}

export function createShowDontTellScalpel(config?: ScalpelConfig): ShowDontTellScalpel {
  return new ShowDontTellScalpel(config);
}
