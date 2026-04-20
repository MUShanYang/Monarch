import { describe, expect, it } from "vitest";

import { detectUnknownProperNouns } from "../adaptation/state/event-sourcer.js";
import type { EntitiesDb } from "../adaptation/types/state-types.js";

const EMPTY_ENTITIES: EntitiesDb = {
  schemaVersion: 1,
  lastUpdatedChapter: 0,
  characters: [],
  locations: [],
  items: [],
  properNounRegistry: [],
};

describe("adaptation proper noun firewall", () => {
  it("blocks hallucinated entities that are not in the allowed list", () => {
    const unknown = detectUnknownProperNouns(
      EMPTY_ENTITIES,
      "the lantern swayed beside Zephram while the pier stayed quiet.",
    );

    expect(unknown).toContain("Zephram");
  });

  it("does not block sentence-initial capitalization", () => {
    const unknown = detectUnknownProperNouns(
      EMPTY_ENTITIES,
      "Morning settled over the harbor. The lantern stayed dark.",
    );

    expect(unknown).toEqual([]);
  });
});
