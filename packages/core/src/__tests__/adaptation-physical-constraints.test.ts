import { describe, expect, it } from "vitest";

import {
  characterToDnaSnapshot,
  createNarrativeDNA,
} from "../adaptation/beat/beat-types.js";
import type { CharacterSnapshot } from "../adaptation/types/state-types.js";

function createCharacter(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    id: "char-1",
    name: "Mira",
    aliases: [],
    role: "protagonist",
    currentLocation: "pier",
    spatialPosture: "standing",
    handState: "empty",
    heldItems: [],
    emotionalDebts: [],
    knowledge: [],
    doesNotKnow: [],
    relationships: {},
    status: "active",
    notes: "",
    ...overrides,
  };
}

describe("adaptation physical constraints", () => {
  it("blocks pick-up actions when both hands are full", () => {
    const dnaCharacter = characterToDnaSnapshot(createCharacter({
      handState: "full",
      heldItems: ["lantern"],
    }));

    const dna = createNarrativeDNA({
      characters: [dnaCharacter],
      location: "pier",
    });

    expect(dnaCharacter.constraint).toContain("cannot pick up or manipulate new items");
    expect(dna.spatialConstraints).toEqual(
      expect.arrayContaining([
        expect.stringContaining("hands are full"),
        expect.stringContaining("holding: lantern"),
      ]),
    );
  });

  it("blocks running when the character is prone", () => {
    const dnaCharacter = characterToDnaSnapshot(createCharacter({
      spatialPosture: "lying",
    }));

    const dna = createNarrativeDNA({
      characters: [dnaCharacter],
      location: "pier",
    });

    expect(dnaCharacter.constraint).toContain("cannot run until posture changes");
    expect(dna.spatialConstraints).toEqual(
      expect.arrayContaining([
        expect.stringContaining("lying down"),
        expect.stringContaining("cannot run naturally"),
      ]),
    );
  });
});
