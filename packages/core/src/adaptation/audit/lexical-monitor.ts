import { z } from "zod";

export const WordUsageEntrySchema = z.object({
  word: z.string().min(1),
  count: z.number().int().min(0),
  lastSeenBeat: z.number().int().min(0),
  firstSeenBeat: z.number().int().min(0),
});
export type WordUsageEntry = z.infer<typeof WordUsageEntrySchema>;

export const LexicalMonitorStateSchema = z.object({
  recentBeats: z.array(z.string()).default([]),
  wordUsageMap: z.map(z.string(), z.any()).default(new Map()),
  currentBeatIndex: z.number().int().min(0).default(0),
  bannedWords: z.array(z.string()).default([]),
  bannedWordExpiry: z.map(z.string(), z.number()).default(new Map()),
  windowSize: z.number().int().min(1).max(20).default(5),
  overuseThreshold: z.number().int().min(1).default(2),
  minWordLength: z.number().int().min(1).default(5),
  banDuration: z.number().int().min(1).default(10),
});
export type LexicalMonitorState = z.infer<typeof LexicalMonitorStateSchema>;

export const LexicalMonitorResultSchema = z.object({
  bannedWords: z.array(z.string()).default([]),
  newlyBanned: z.array(z.string()).default([]),
  overusedWords: z.array(z.string()).default([]),
  wordCounts: z.record(z.string(), z.number()).default({}),
});
export type LexicalMonitorResult = z.infer<typeof LexicalMonitorResultSchema>;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "it", "its", "this", "that", "these", "those", "i", "you", "he",
  "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "our", "their", "mine", "yours", "hers", "ours", "theirs", "what", "which",
  "who", "whom", "whose", "where", "when", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just", "also", "now",
  "here", "there", "then", "once", "if", "else", "because", "until", "while",
  "about", "against", "between", "into", "through", "during", "before", "after",
  "above", "below", "up", "down", "out", "off", "over", "under", "again",
  "further", "any", "being", "get", "got", "getting", "go", "goes", "going",
  "went", "come", "comes", "coming", "came", "make", "makes", "making", "made",
  "take", "takes", "taking", "took", "see", "sees", "seeing", "saw", "know",
  "knows", "knowing", "knew", "think", "thinks", "thinking", "thought", "want",
  "wants", "wanting", "wanted", "give", "gives", "giving", "gave", "use", "uses",
  "using", "used", "find", "finds", "finding", "found", "tell", "tells", "telling",
  "told", "ask", "asks", "asking", "asked", "work", "works", "working", "worked",
  "seem", "seems", "seeming", "seemed", "feel", "feels", "feeling", "felt",
  "try", "tries", "trying", "tried", "leave", "leaves", "leaving", "left",
  "call", "calls", "calling", "called", "keep", "keeps", "keeping", "kept",
  "let", "lets", "letting", "begin", "begins", "beginning", "began", "show",
  "shows", "showing", "showed", "hear", "hears", "hearing", "heard", "play",
  "plays", "playing", "played", "run", "runs", "running", "ran", "move", "moves",
  "moving", "moved", "live", "lives", "living", "lived", "believe", "believes",
  "believing", "believed", "hold", "holds", "holding", "held", "bring", "brings",
  "bringing", "brought", "happen", "happens", "happening", "happened", "write",
  "writes", "writing", "wrote", "sit", "sits", "sitting", "sat", "stand", "stands",
  "standing", "stood", "lose", "loses", "losing", "lost", "pay", "pays", "paying",
  "paid", "meet", "meets", "meeting", "met", "include", "includes", "including",
  "included", "continue", "continues", "continuing", "continued", "set", "sets",
  "setting", "learn", "learns", "learning", "learned", "change", "changes",
  "changing", "changed", "lead", "leads", "leading", "led", "understand",
  "understands", "understanding", "understood", "watch", "watches", "watching",
  "watched", "follow", "follows", "following", "followed", "stop", "stops",
  "stopping", "stopped", "create", "creates", "creating", "created", "speak",
  "speaks", "speaking", "spoke", "read", "reads", "reading", "spend", "spends",
  "spending", "spent", "grow", "grows", "growing", "grew", "open", "opens",
  "opening", "opened", "walk", "walks", "walking", "walked", "win", "wins",
  "winning", "won", "offer", "offers", "offering", "offered", "remember",
  "remembers", "remembering", "remembered", "love", "loves", "loving", "loved",
  "consider", "considers", "considering", "considered", "appear", "appears",
  "appearing", "appeared", "buy", "buys", "buying", "bought", "wait", "waits",
  "waiting", "waited", "serve", "serves", "serving", "served", "die", "dies",
  "dying", "died", "send", "sends", "sending", "sent", "expect", "expects",
  "expecting", "expected", "build", "builds", "building", "built", "stay",
  "stays", "staying", "stayed", "fall", "falls", "falling", "fell", "cut",
  "cuts", "cutting", "reach", "reaches", "reaching", "reached", "kill", "kills",
  "killing", "killed", "remain", "remains", "remaining", "remained",
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
  "自己", "这", "那", "她", "他", "它", "们", "这个", "那个", "什么", "怎么",
  "为什么", "哪", "哪里", "谁", "多少", "几", "能", "可以", "应该", "必须",
]);

const AI_TELL_WORDS = new Set([
  "shiver", "shivered", "shivering", "shivers",
  "testament", "tapestry", "woven", "weave", "wove",
  "dance", "danced", "dancing", "dancer",
  "symphony", "orchestra", "melody", "harmony",
  "canvas", "paint", "painted", "painting",
  "whisper", "whispered", "whispering", "whispers",
  "echo", "echoed", "echoing", "echoes",
  "ripple", "rippled", "rippling", "ripples",
  "shimmer", "shimmered", "shimmering", "shimmers",
  "glimmer", "glimmered", "glimmering", "glimmers",
  "dance", "danced", "dancing", "dances",
  "pulse", "pulsed", "pulsing", "pulses",
  "surge", "surged", "surging", "surges",
  "tingle", "tingled", "tingling", "tingles",
  "cascade", "cascaded", "cascading", "cascades",
  "bloom", "bloomed", "blooming", "blooms",
  "unfold", "unfolded", "unfolding", "unfolds",
  "weave", "wove", "woven", "weaving", "weaves",
  "intertwine", "intertwined", "intertwining", "intertwines",
  "labyrinth", "maze", "puzzle",
  "enigma", "mystery", "mysterious",
  "ethereal", "otherworldly", "transcendent",
  "palpable", "tangible", "visceral",
  "cacophony", "discord", "dissonance",
]);

export const STATIC_BANNED_WORDS = [
  "testament", "tapestry", "delve", "pivotal", "uncharted",
  "shivers down", "intricate", "beacon", "journey", "realm",
  "shimmering", "ethereal", "labyrinth", "cacophony", "symphony",
  "tapestry", "woven", "canvas", "palpable", "visceral",
];

export class LexicalMonitor {
  private state: LexicalMonitorState;

  constructor(initialState?: Partial<LexicalMonitorState>) {
    this.state = LexicalMonitorStateSchema.parse({
      recentBeats: [],
      wordUsageMap: new Map(),
      currentBeatIndex: 0,
      bannedWords: [],
      bannedWordExpiry: new Map(),
      windowSize: 5,
      overuseThreshold: 2,
      minWordLength: 5,
      banDuration: 10,
      ...initialState,
    });
  }

  analyzeBeat(prose: string): LexicalMonitorResult {
    const words = this.tokenize(prose);
    const wordCounts = this.countWords(words);
    const overusedWords: string[] = [];
    const newlyBanned: string[] = [];

    for (const [word, count] of Object.entries(wordCounts)) {
      if (word.length >= this.state.minWordLength && count > this.state.overuseThreshold) {
        overusedWords.push(word);
        if (!this.state.bannedWords.includes(word)) {
          newlyBanned.push(word);
        }
      }
    }

    for (const word of overusedWords) {
      if (!this.state.bannedWords.includes(word)) {
        this.state.bannedWords.push(word);
        this.state.bannedWordExpiry.set(word, this.state.currentBeatIndex + this.state.banDuration);
      }
    }

    this.updateWordUsageMap(words);

    this.state.recentBeats.push(prose);
    if (this.state.recentBeats.length > this.state.windowSize) {
      this.state.recentBeats.shift();
    }

    this.state.currentBeatIndex += 1;
    this.expireBans();

    return LexicalMonitorResultSchema.parse({
      bannedWords: [...this.state.bannedWords],
      newlyBanned,
      overusedWords,
      wordCounts,
    });
  }

  addAiTellWords(): void {
    for (const word of AI_TELL_WORDS) {
      if (!this.state.bannedWords.includes(word)) {
        this.state.bannedWords.push(word);
        this.state.bannedWordExpiry.set(word, this.state.currentBeatIndex + this.state.banDuration);
      }
    }
  }

  getBannedWords(): string[] {
    return [...this.state.bannedWords];
  }

  getMustNotInclude(): string[] {
    return this.getBannedWords();
  }

  getState(): LexicalMonitorState {
    return {
      ...this.state,
      wordUsageMap: new Map(this.state.wordUsageMap),
      bannedWordExpiry: new Map(this.state.bannedWordExpiry),
    };
  }

  reset(): void {
    this.state = LexicalMonitorStateSchema.parse({
      recentBeats: [],
      wordUsageMap: new Map(),
      currentBeatIndex: 0,
      bannedWords: [],
      bannedWordExpiry: new Map(),
      windowSize: this.state.windowSize,
      overuseThreshold: this.state.overuseThreshold,
      minWordLength: this.state.minWordLength,
      banDuration: this.state.banDuration,
    });
  }

  private tokenize(text: string): string[] {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.split(/\s+/).filter((word) => word.length > 0);
  }

  private countWords(words: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    const recentWords = this.getRecentWords();

    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;
      if (word.length < this.state.minWordLength) continue;

      counts[word] = (counts[word] ?? 0) + 1;
    }

    for (const word of recentWords) {
      if (STOP_WORDS.has(word)) continue;
      if (word.length < this.state.minWordLength) continue;
      counts[word] = (counts[word] ?? 0) + 1;
    }

    return counts;
  }

  private getRecentWords(): string[] {
    const allWords: string[] = [];
    for (const beat of this.state.recentBeats) {
      allWords.push(...this.tokenize(beat));
    }
    return allWords;
  }

  private updateWordUsageMap(words: string[]): void {
    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;

      const existing = this.state.wordUsageMap.get(word);
      if (existing) {
        existing.count += 1;
        existing.lastSeenBeat = this.state.currentBeatIndex;
      } else {
        this.state.wordUsageMap.set(word, {
          word,
          count: 1,
          lastSeenBeat: this.state.currentBeatIndex,
          firstSeenBeat: this.state.currentBeatIndex,
        });
      }
    }
  }

  private expireBans(): void {
    const toRemove: string[] = [];
    for (const [word, expiryBeat] of this.state.bannedWordExpiry) {
      if (this.state.currentBeatIndex >= expiryBeat) {
        toRemove.push(word);
      }
    }
    for (const word of toRemove) {
      this.state.bannedWords = this.state.bannedWords.filter((w) => w !== word);
      this.state.bannedWordExpiry.delete(word);
    }
  }
}

export function createLexicalMonitor(params?: {
  windowSize?: number;
  overuseThreshold?: number;
  minWordLength?: number;
  banDuration?: number;
}): LexicalMonitor {
  return new LexicalMonitor(params);
}

export function analyzeProseForOveruse(
  prose: string,
  recentBeats: string[],
  options?: {
    minWordLength?: number;
    overuseThreshold?: number;
  }
): string[] {
  const minWordLength = options?.minWordLength ?? 5;
  const overuseThreshold = options?.overuseThreshold ?? 2;

  const allText = [...recentBeats, prose].join(" ");
  const words = allText
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= minWordLength && !STOP_WORDS.has(w));

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const overused: string[] = [];
  for (const [word, count] of counts) {
    if (count > overuseThreshold) {
      overused.push(word);
    }
  }

  return overused;
}

export { STOP_WORDS, AI_TELL_WORDS };
