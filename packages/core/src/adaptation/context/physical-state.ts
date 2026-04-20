import { z } from "zod";

export const PhysicalStateSchema = z.object({
  posture: z.enum(["standing", "sitting", "prone", "walking", "running", "kneeling"]),
  locationAnchor: z.string().optional(),
  hands: z.object({
    left: z.string().nullable(),
    right: z.string().nullable(),
  }),
  facing: z.string().nullable(),
});
export type PhysicalState = z.infer<typeof PhysicalStateSchema>;

export function createDefaultPhysicalState(): PhysicalState {
  return {
    posture: "standing",
    locationAnchor: undefined,
    hands: { left: null, right: null },
    facing: null,
  };
}

export function derivePhysicalConstraints(state: PhysicalState): string[] {
  const constraints: string[] = [];

  if (state.hands.left && state.hands.right) {
    constraints.push("双手都被占用，无法拿起或操作新物品。");
  }

  if (state.posture === "prone") {
    constraints.push("角色在地上，站起来需要明确的动作节拍。");
  }

  if (state.posture === "sitting" && state.locationAnchor) {
    constraints.push(`角色坐在${state.locationAnchor}，移动需要先站起来。`);
  }

  return constraints;
}

export function updatePhysicalState(
  current: PhysicalState,
  field: keyof PhysicalState,
  value: any
): PhysicalState {
  return { ...current, [field]: value };
}
