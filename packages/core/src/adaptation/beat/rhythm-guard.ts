import { z } from "zod";
import type { BeatType } from "../beat/beat-types.js";

export const RhythmGuardStateSchema = z.object({
  recentTypes: z.array(z.string()).default([]),
  recentScaffolds: z.array(z.string()).default([]),
  currentBeatIndex: z.number().int().min(0).default(0),
  maxRepeatTypes: z.number().int().min(1).max(5).default(2),
  scaffoldCooldown: z.number().int().min(0).max(10).default(3),
  windowSize: z.number().int().min(2).max(20).default(10),
});
export type RhythmGuardState = z.infer<typeof RhythmGuardStateSchema>;

export const RhythmGuardResultSchema = z.object({
  allowedTypes: z.array(z.string()).default([]),
  forcedType: z.string().optional(),
  kineticScaffold: z.string().optional(),
  reason: z.string().default(""),
});
export type RhythmGuardResult = z.infer<typeof RhythmGuardResultSchema>;

const KINETIC_SCAFFOLDS: Record<BeatType, string[]> = {
  action: [
    "Without a second thought,",
    "Dust motes danced as",
    "Suddenly,",
    "In one fluid motion,",
    "Before anyone could react,",
    "The air shifted when",
    "Heart pounding,",
    "Muscles tensing,",
    "A split second later,",
    "Movement exploded as",
  ],
  dialogue: [
    '"Wait,"',
    '"Listen to me,"',
    '"I need to tell you something,"',
    '"You don\'t understand,"',
    '"That\'s not what I meant,"',
    '"Look,"',
    '"I\'ve been thinking,"',
    '"There\'s something you should know,"',
    '"Can I be honest?"',
    '"Let me explain,"',
  ],
  interiority: [
    "A thought surfaced:",
    "In the quiet of their mind,",
    "Something stirred within:",
    "The weight of the moment settled as",
    "Memories flickered:",
    "A realization dawned:",
    "Deep down,",
    "Beneath the surface,",
    "The truth of it sat heavy:",
    "Words unspoken echoed:",
  ],
  environment: [
    "Light filtered through",
    "The room held its breath as",
    "Shadows stretched across",
    "Silence draped over",
    "The air carried the scent of",
    "Beyond the window,",
    "The walls seemed to",
    "Time slowed as",
    "The space between them",
    "Everything paused when",
  ],
  transition: [
    "Moments later,",
    "By the time",
    "As the hours passed,",
    "The next morning,",
    "When they finally",
    "After a while,",
    "Soon enough,",
    "Before long,",
    "With that settled,",
    "Moving forward,",
  ],
  revelation: [
    "Then it became clear:",
    "The pieces fell into place when",
    "Everything changed with the realization that",
    "A single detail shifted everything:",
    "The truth emerged:",
    "What had been hidden now surfaced:",
    "Understanding struck:",
    "The pattern revealed itself:",
    "In that moment of clarity,",
    "The answer materialized:",
  ],
  tension: [
    "The atmosphere thickened as",
    "Something was about to break.",
    "Pressure built when",
    "The moment stretched taut:",
    "A storm gathered in the silence.",
    "Every nerve alert,",
    "The air crackled with",
    "Anticipation hung heavy:",
    "Neither moved.",
    "The standoff deepened.",
  ],
  resolution: [
    "Finally,",
    "At last,",
    "The tension broke when",
    "Relief washed over",
    "What felt like an eternity ended as",
    "The weight lifted:",
    "Peace settled in.",
    "Understanding came:",
    "The storm passed,",
    "Clarity returned as",
  ],
  "negative-space": [
    "The silence that followed",
    "Nothing moved",
    "For a long moment, nothing happened",
    "The stillness stretched",
    "A pause hung in the air",
    "The moment stretched thin",
    "Quiet descended",
    "Time seemed to slow",
    "The world held its breath",
    "A beat passed in silence",
  ],
};

const BEAT_TYPE_COMPATIBILITY: Record<BeatType, BeatType[]> = {
  action: ["dialogue", "interiority", "environment", "transition"],
  dialogue: ["action", "interiority", "environment", "revelation"],
  interiority: ["action", "dialogue", "environment", "transition"],
  environment: ["action", "dialogue", "interiority", "tension"],
  transition: ["action", "dialogue", "environment", "revelation"],
  revelation: ["dialogue", "interiority", "action", "tension"],
  tension: ["action", "dialogue", "revelation", "resolution"],
  resolution: ["transition", "environment", "interiority", "dialogue"],
  "negative-space": ["action", "dialogue", "environment", "transition"],
};

const ALL_BEAT_TYPES: BeatType[] = [
  "action", "dialogue", "interiority", "environment",
  "transition", "revelation", "tension", "resolution", "negative-space",
];

export class RhythmGuard {
  private state: RhythmGuardState;
  private randomSeed: number;

  constructor(initialState?: Partial<RhythmGuardState>, seed?: number) {
    this.state = RhythmGuardStateSchema.parse({
      recentTypes: [],
      recentScaffolds: [],
      currentBeatIndex: 0,
      maxRepeatTypes: 2,
      scaffoldCooldown: 3,
      windowSize: 10,
      ...initialState,
    });
    this.randomSeed = seed ?? Date.now();
  }

  guard(plannedType: BeatType): RhythmGuardResult {
    const lastTypes = this.state.recentTypes.slice(-this.state.maxRepeatTypes);
    let forcedType: BeatType | undefined;
    let reason = "";

    if (this.hasRepetition(lastTypes)) {
      const lastType = lastTypes[lastTypes.length - 1] as BeatType;
      const alternatives = this.getAlternativeTypes(lastType);
      forcedType = this.selectRandomAlternative(alternatives);
      reason = `Prevented ${this.state.maxRepeatTypes}+ consecutive "${lastType}" beats. Forced "${forcedType}".`;
    }

    const effectiveType = forcedType ?? plannedType;
    const scaffold = this.generateKineticScaffold(effectiveType);

    this.state.recentTypes.push(effectiveType);
    if (this.state.recentTypes.length > this.state.windowSize) {
      this.state.recentTypes.shift();
    }

    if (scaffold) {
      this.state.recentScaffolds.push(scaffold);
      if (this.state.recentScaffolds.length > this.state.windowSize) {
        this.state.recentScaffolds.shift();
      }
    }

    this.state.currentBeatIndex += 1;

    const allowedTypes = forcedType
      ? [forcedType]
      : this.getAllowedTypes();

    return RhythmGuardResultSchema.parse({
      allowedTypes,
      forcedType,
      kineticScaffold: scaffold,
      reason,
    });
  }

  generateKineticScaffold(beatType: BeatType): string | undefined {
    const scaffolds = KINETIC_SCAFFOLDS[beatType];
    if (!scaffolds || scaffolds.length === 0) return undefined;

    const availableScaffolds = scaffolds.filter(
      (s) => !this.state.recentScaffolds.includes(s)
    );

    if (availableScaffolds.length === 0) {
      return scaffolds[this.pseudoRandom(scaffolds.length)];
    }

    return availableScaffolds[this.pseudoRandom(availableScaffolds.length)];
  }

  getAllowedTypes(): BeatType[] {
    const lastTypes = this.state.recentTypes.slice(-this.state.maxRepeatTypes);

    if (lastTypes.length < this.state.maxRepeatTypes) {
      return [...ALL_BEAT_TYPES];
    }

    const lastType = lastTypes[lastTypes.length - 1] as BeatType;
    return this.getAlternativeTypes(lastType);
  }

  private hasRepetition(types: string[]): boolean {
    if (types.length < this.state.maxRepeatTypes) return false;
    const first = types[0];
    return types.every((t) => t === first);
  }

  private getAlternativeTypes(lastType: BeatType): BeatType[] {
    const compatible = BEAT_TYPE_COMPATIBILITY[lastType] ?? ALL_BEAT_TYPES;
    return compatible.filter((t) => t !== lastType);
  }

  private selectRandomAlternative(types: BeatType[]): BeatType {
    if (types.length === 0) {
      return ALL_BEAT_TYPES[this.pseudoRandom(ALL_BEAT_TYPES.length)];
    }
    return types[this.pseudoRandom(types.length)];
  }

  private pseudoRandom(max: number): number {
    this.randomSeed = (this.randomSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.randomSeed % max;
  }

  getState(): RhythmGuardState {
    return { ...this.state };
  }

  reset(): void {
    this.state = RhythmGuardStateSchema.parse({
      recentTypes: [],
      recentScaffolds: [],
      currentBeatIndex: 0,
      maxRepeatTypes: this.state.maxRepeatTypes,
      scaffoldCooldown: this.state.scaffoldCooldown,
      windowSize: this.state.windowSize,
    });
  }
}

export function createRhythmGuard(params?: {
  maxRepeatTypes?: number;
  scaffoldCooldown?: number;
  windowSize?: number;
  seed?: number;
}): RhythmGuard {
  return new RhythmGuard(params, params?.seed);
}

export function getKineticScaffold(beatType: BeatType, usedRecently: string[] = []): string {
  const scaffolds = KINETIC_SCAFFOLDS[beatType] ?? [];
  const available = scaffolds.filter((s) => !usedRecently.includes(s));

  if (available.length === 0) {
    return scaffolds[Math.floor(Math.random() * scaffolds.length)] ?? "";
  }

  return available[Math.floor(Math.random() * available.length)];
}

export function enforceRhythm(
  plannedType: BeatType,
  recentTypes: BeatType[],
  maxRepeat: number = 2
): { allowed: boolean; suggestedAlternative?: BeatType } {
  const lastN = recentTypes.slice(-maxRepeat);

  if (lastN.length < maxRepeat) {
    return { allowed: true };
  }

  const allSame = lastN.every((t) => t === lastN[0]);
  if (allSame && lastN[0] === plannedType) {
    const alternatives = BEAT_TYPE_COMPATIBILITY[plannedType] ?? ALL_BEAT_TYPES;
    const suggested = alternatives.filter((t) => t !== plannedType)[0];
    return { allowed: false, suggestedAlternative: suggested };
  }

  return { allowed: true };
}

export { KINETIC_SCAFFOLDS, BEAT_TYPE_COMPATIBILITY, ALL_BEAT_TYPES };
