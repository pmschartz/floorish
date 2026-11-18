import { create } from "zustand";
import type { HouseView, RoomContext } from "../../shared/schemas";

/** The house the open plan is a floor of (null for a plan on its own). Not part of Undo. */
export const useHouse = create<{ house: HouseView | null }>(() => ({ house: null }));

/** The house's other floors (name and rooms), for Claude, or [] when the plan is on its own. */
export function otherFloors(planId?: string): RoomContext["otherFloors"] {
  const h = useHouse.getState().house;
  if (!h) return [];
  return h.floorPlans.filter((f) => f.id !== planId).map((f) => ({ name: f.name, rooms: f.rooms }));
}
