import { z } from "zod";

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.union([z.number(), z.string()]),
  chapter: z.number().int().min(1),
  description: z.string().min(1),
  characters: z.array(z.string()).default([]),
  location: z.string().optional(),
  eventType: z.enum([
    "action",
    "dialogue",
    "revelation",
    "decision",
    "discovery",
    "confrontation",
    "transition",
  ]),
  significance: z.number().min(1).max(10).default(5),
  relatedEvents: z.array(z.string()).default([]),
  isFlashback: z.boolean().default(false),
  isFlashforward: z.boolean().default(false),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const TimelineConflictSchema = z.object({
  type: z.enum(["causal", "chronological", "character_presence", "location"]),
  eventA: z.string(),
  eventB: z.string(),
  description: z.string(),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
});
export type TimelineConflict = z.infer<typeof TimelineConflictSchema>;

export const TimelineAnalysisResultSchema = z.object({
  totalEvents: z.number().int(),
  timeSpan: z.number(),
  chronologicalOrder: z.boolean(),
  conflicts: z.array(TimelineConflictSchema),
  gaps: z.array(z.object({
    start: z.number(),
    end: z.number(),
    duration: z.number(),
    description: z.string(),
  })),
  recommendations: z.array(z.string()),
});
export type TimelineAnalysisResult = z.infer<typeof TimelineAnalysisResultSchema>;

export const TimelineExplorerConfigSchema = z.object({
  allowFlashbacks: z.boolean().default(true),
  allowFlashforwards: z.boolean().default(false),
  maxTimeGap: z.number().min(0).default(48),
  timeUnit: z.enum(["hours", "days", "weeks"]).default("hours"),
});
export type TimelineExplorerConfig = z.infer<typeof TimelineExplorerConfigSchema>;

const DEFAULT_CONFIG: Required<TimelineExplorerConfig> = {
  allowFlashbacks: true,
  allowFlashforwards: false,
  maxTimeGap: 48,
  timeUnit: "hours",
};

export class TimelineExplorer {
  private config: Required<TimelineExplorerConfig>;
  private events: Map<string, TimelineEvent> = new Map();

  constructor(config?: TimelineExplorerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addEvent(event: Omit<TimelineEvent, "id">): TimelineEvent {
    const id = `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newEvent: TimelineEvent = { ...event, id };
    this.events.set(id, newEvent);
    return newEvent;
  }

  removeEvent(eventId: string): boolean {
    return this.events.delete(eventId);
  }

  updateEvent(eventId: string, updates: Partial<TimelineEvent>): TimelineEvent | null {
    const event = this.events.get(eventId);
    if (!event) return null;

    const updated: TimelineEvent = { ...event, ...updates };
    this.events.set(eventId, updated);
    return updated;
  }

  getEventsInRange(startTime: number, endTime: number): TimelineEvent[] {
    return [...this.events.values()]
      .filter((e) => {
        const time = typeof e.timestamp === "string" ? Date.parse(e.timestamp) : e.timestamp;
        return time >= startTime && time <= endTime;
      })
      .sort((a, b) => {
        const timeA = typeof a.timestamp === "string" ? Date.parse(a.timestamp) : a.timestamp;
        const timeB = typeof b.timestamp === "string" ? Date.parse(b.timestamp) : b.timestamp;
        return timeA - timeB;
      });
  }

  getEventsByCharacter(characterId: string): TimelineEvent[] {
    return [...this.events.values()]
      .filter((e) => e.characters.includes(characterId))
      .sort((a, b) => a.chapter - b.chapter);
  }

  getEventsByChapter(chapter: number): TimelineEvent[] {
    return [...this.events.values()]
      .filter((e) => e.chapter === chapter)
      .sort((a, b) => {
        const timeA = typeof a.timestamp === "string" ? Date.parse(a.timestamp) : a.timestamp;
        const timeB = typeof b.timestamp === "string" ? Date.parse(b.timestamp) : b.timestamp;
        return timeA - timeB;
      });
  }

  analyzeTimeline(): TimelineAnalysisResult {
    const sortedEvents = this.getChronologicallySortedEvents();
    const conflicts: TimelineConflict[] = [];
    const gaps: TimelineAnalysisResult["gaps"] = [];
    const recommendations: string[] = [];

    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const eventA = sortedEvents[i]!;
      const eventB = sortedEvents[i + 1]!;

      const timeA = typeof eventA.timestamp === "string" ? Date.parse(eventA.timestamp) : eventA.timestamp;
      const timeB = typeof eventB.timestamp === "string" ? Date.parse(eventB.timestamp) : eventB.timestamp;

      if (timeB < timeA) {
        conflicts.push({
          type: "chronological",
          eventA: eventA.id,
          eventB: eventB.id,
          description: `Event ${eventB.id} occurs before ${eventA.id} but appears later`,
          severity: "major",
        });
      }

      const timeGap = this.calculateTimeGap(timeA, timeB);
      if (timeGap > this.config.maxTimeGap) {
        gaps.push({
          start: timeA,
          end: timeB,
          duration: timeGap,
          description: `Gap of ${timeGap} ${this.config.timeUnit} between events`,
        });
        recommendations.push(`Consider adding events to fill the ${timeGap} ${this.config.timeUnit} gap`);
      }

      const characterOverlap = eventA.characters.filter((c) => eventB.characters.includes(c));
      if (characterOverlap.length > 0) {
        if (eventA.location && eventB.location && eventA.location !== eventB.location) {
          const travelTime = this.estimateTravelTime(eventA.location, eventB.location);
          if (timeGap < travelTime) {
            conflicts.push({
              type: "character_presence",
              eventA: eventA.id,
              eventB: eventB.id,
              description: `Character cannot travel from ${eventA.location} to ${eventB.location} in ${timeGap} ${this.config.timeUnit}`,
              severity: "critical",
            });
          }
        }
      }
    }

    const flashbacks = [...this.events.values()].filter((e) => e.isFlashback).length;
    const flashforwards = [...this.events.values()].filter((e) => e.isFlashforward).length;

    if (!this.config.allowFlashbacks && flashbacks > 0) {
      recommendations.push("Flashbacks are not allowed but found in timeline");
    }
    if (!this.config.allowFlashforwards && flashforwards > 0) {
      recommendations.push("Flashforwards are not allowed but found in timeline");
    }

    const timeSpan = sortedEvents.length > 0
      ? (typeof sortedEvents[sortedEvents.length - 1]!.timestamp === "string"
          ? Date.parse(sortedEvents[sortedEvents.length - 1]!.timestamp as string)
          : (sortedEvents[sortedEvents.length - 1]!.timestamp as number)) -
        (typeof sortedEvents[0]!.timestamp === "string"
          ? Date.parse(sortedEvents[0]!.timestamp as string)
          : (sortedEvents[0]!.timestamp as number))
      : 0;

    return {
      totalEvents: this.events.size,
      timeSpan,
      chronologicalOrder: conflicts.filter((c) => c.type === "chronological").length === 0,
      conflicts,
      gaps,
      recommendations,
    };
  }

  private getChronologicallySortedEvents(): TimelineEvent[] {
    return [...this.events.values()].sort((a, b) => {
      const timeA = typeof a.timestamp === "string" ? Date.parse(a.timestamp) : a.timestamp;
      const timeB = typeof b.timestamp === "string" ? Date.parse(b.timestamp) : b.timestamp;
      return timeA - timeB;
    });
  }

  private calculateTimeGap(timeA: number, timeB: number): number {
    const diffMs = Math.abs(timeB - timeA);
    switch (this.config.timeUnit) {
      case "hours":
        return diffMs / (1000 * 60 * 60);
      case "days":
        return diffMs / (1000 * 60 * 60 * 24);
      case "weeks":
        return diffMs / (1000 * 60 * 60 * 24 * 7);
      default:
        return diffMs;
    }
  }

  private estimateTravelTime(from: string, to: string): number {
    return 2;
  }

  getAllEvents(): TimelineEvent[] {
    return [...this.events.values()];
  }

  getEventById(id: string): TimelineEvent | undefined {
    return this.events.get(id);
  }

  clear(): void {
    this.events.clear();
  }

  getConfig(): Required<TimelineExplorerConfig> {
    return { ...this.config };
  }
}

export function createTimelineExplorer(config?: TimelineExplorerConfig): TimelineExplorer {
  return new TimelineExplorer(config);
}
