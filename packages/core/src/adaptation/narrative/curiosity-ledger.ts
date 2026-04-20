import { z } from "zod";

export const CuriosityStatusSchema = z.enum(["dormant", "warm", "urgent", "overdue"]);
export type CuriosityStatus = z.infer<typeof CuriosityStatusSchema>;

export const CuriosityEntrySchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  plantedChapter: z.number().int().min(1),
  lastReferencedChapter: z.number().int().min(0),
  staleness: z.number().int().min(0).default(0),
  status: CuriosityStatusSchema.default("dormant"),
  relatedCharacters: z.array(z.string()).default([]),
  relatedSubplots: z.array(z.string()).default([]),
  priority: z.number().min(1).max(10).default(5),
  isMandatory: z.boolean().default(false),
  humanOverride: z.boolean().default(false),
});
export type CuriosityEntry = z.infer<typeof CuriosityEntrySchema>;

export const CuriosityLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(CuriosityEntrySchema).default([]),
  lastUpdatedChapter: z.number().int().min(0).default(0),
  totalScore: z.number().int().min(0).default(0),
});
export type CuriosityLedger = z.infer<typeof CuriosityLedgerSchema>;

export const CuriosityCheckResultSchema = z.object({
  urgentEntries: z.array(CuriosityEntrySchema),
  overdueEntries: z.array(CuriosityEntrySchema),
  recommendedReferences: z.array(CuriosityEntrySchema),
  mandatoryReferences: z.array(CuriosityEntrySchema),
  totalActive: z.number().int(),
  averageStaleness: z.number(),
});
export type CuriosityCheckResult = z.infer<typeof CuriosityCheckResultSchema>;

export const CuriosityLedgerConfigSchema = z.object({
  dormantThreshold: z.number().int().min(1).default(3),
  warmThreshold: z.number().int().min(1).default(5),
  urgentThreshold: z.number().int().min(1).default(8),
  overdueThreshold: z.number().int().min(1).default(10),
  maxStaleness: z.number().int().min(1).default(20),
});
export type CuriosityLedgerConfig = z.infer<typeof CuriosityLedgerConfigSchema>;

const DEFAULT_CONFIG: Required<CuriosityLedgerConfig> = {
  dormantThreshold: 3,
  warmThreshold: 5,
  urgentThreshold: 8,
  overdueThreshold: 10,
  maxStaleness: 20,
};

export class CuriosityLedgerManager {
  private ledger: CuriosityLedger;
  private config: Required<CuriosityLedgerConfig>;

  constructor(ledger?: CuriosityLedger, config?: CuriosityLedgerConfig) {
    this.ledger = ledger ?? CuriosityLedgerSchema.parse({ schemaVersion: 1, entries: [] });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addEntry(entry: Omit<CuriosityEntry, "status" | "staleness" | "lastReferencedChapter">): CuriosityEntry {
    const newEntry: CuriosityEntry = CuriosityEntrySchema.parse({
      ...entry,
      status: "dormant",
      staleness: 0,
      lastReferencedChapter: entry.plantedChapter,
    });

    this.ledger.entries.push(newEntry);
    this.updateTotalScore();

    return newEntry;
  }

  updateStaleness(currentChapter: number): void {
    for (const entry of this.ledger.entries) {
      const chaptersSinceReference = currentChapter - entry.lastReferencedChapter;
      entry.staleness = chaptersSinceReference;
      entry.status = this.calculateStatus(entry.staleness);
    }

    this.ledger.lastUpdatedChapter = currentChapter;
    this.updateTotalScore();
  }

  referenceEntry(entryId: string, chapter: number): CuriosityEntry | null {
    const entry = this.ledger.entries.find((e) => e.id === entryId);
    if (!entry) return null;

    entry.lastReferencedChapter = chapter;
    entry.staleness = 0;
    entry.status = "dormant";

    this.updateTotalScore();
    return entry;
  }

  checkCuriosities(currentChapter: number): CuriosityCheckResult {
    this.updateStaleness(currentChapter);

    const activeEntries = this.ledger.entries.filter((e) => e.status !== "dormant");

    const urgentEntries = activeEntries.filter((e) => e.status === "urgent" && !e.isMandatory);
    const overdueEntries = activeEntries.filter((e) => e.status === "overdue");
    const mandatoryReferences = activeEntries.filter((e) => e.isMandatory && e.status !== "dormant");

    const recommendedReferences = [...urgentEntries]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);

    const totalStaleness = activeEntries.reduce((sum, e) => sum + e.staleness, 0);
    const averageStaleness = activeEntries.length > 0 ? totalStaleness / activeEntries.length : 0;

    return CuriosityCheckResultSchema.parse({
      urgentEntries,
      overdueEntries,
      recommendedReferences,
      mandatoryReferences,
      totalActive: activeEntries.length,
      averageStaleness,
    });
  }

  resolveEntry(entryId: string): boolean {
    const index = this.ledger.entries.findIndex((e) => e.id === entryId);
    if (index < 0) return false;

    this.ledger.entries.splice(index, 1);
    this.updateTotalScore();
    return true;
  }

  setHumanOverride(entryId: string, override: boolean): CuriosityEntry | null {
    const entry = this.ledger.entries.find((e) => e.id === entryId);
    if (!entry) return null;

    entry.humanOverride = override;
    return entry;
  }

  private calculateStatus(staleness: number): CuriosityStatus {
    if (staleness < this.config.dormantThreshold) return "dormant";
    if (staleness < this.config.warmThreshold) return "warm";
    if (staleness < this.config.urgentThreshold) return "urgent";
    return "overdue";
  }

  private updateTotalScore(): void {
    this.ledger.totalScore = this.ledger.entries.reduce((sum, e) => sum + e.staleness, 0);
  }

  getLedger(): CuriosityLedger {
    return CuriosityLedgerSchema.parse(this.ledger);
  }

  getEntriesByStatus(status: CuriosityStatus): CuriosityEntry[] {
    return this.ledger.entries.filter((e) => e.status === status);
  }

  getEntriesByCharacter(characterId: string): CuriosityEntry[] {
    return this.ledger.entries.filter((e) => e.relatedCharacters.includes(characterId));
  }

  getConfig(): Required<CuriosityLedgerConfig> {
    return { ...this.config };
  }
}

export function createCuriosityLedgerManager(
  ledger?: CuriosityLedger,
  config?: CuriosityLedgerConfig
): CuriosityLedgerManager {
  return new CuriosityLedgerManager(ledger, config);
}

export function createEmptyCuriosityLedger(): CuriosityLedger {
  return CuriosityLedgerSchema.parse({
    schemaVersion: 1,
    entries: [],
    lastUpdatedChapter: 0,
    totalScore: 0,
  });
}
