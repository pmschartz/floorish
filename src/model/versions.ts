import { nanoid } from "nanoid";
import type { Item, Plan, Room, RoomVersion } from "../../shared/schemas";
import { pointInPolygon } from "./geometry";

const BUILT_IN = new Set<Item["shape"]>(["door", "window", "opening", "fixture"]);

/** Furniture whose center is in the room (not doors, windows or fixtures, which belong to the house). */
export function roomFurniture(items: Item[], room: Room): Item[] {
  return items.filter((i) => !BUILT_IN.has(i.shape) && pointInPolygon({ x: i.x, y: i.y }, room.polygon, 0));
}

const withRoom = (plan: Plan, roomId: string, fn: (r: Room) => Room): Plan => ({
  ...plan,
  rooms: plan.rooms.map((r) => (r.id === roomId ? fn(r) : r)),
});

/** The room's versions, creating "Current" (active, holding today's furniture) the first time. */
export function ensureVersions(plan: Plan, roomId: string): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room || room.versions?.length) return plan;
  const current: RoomVersion = {
    id: nanoid(8), name: "Current", createdAt: new Date().toISOString(), brief: "", concept: "The furniture as it is now.", items: [],
  };
  return withRoom(plan, roomId, (r) => ({ ...r, versions: [current], activeVersionId: current.id }));
}

/** Items to show for a version: the live furniture for the active one, the stored copy otherwise. */
export function versionItems(plan: Plan, room: Room, version: RoomVersion): Item[] {
  return version.id === room.activeVersionId ? roomFurniture(plan.items, room) : version.items;
}

/**
 * Switch a room to another version: the room's live furniture is put away into the version
 * that was active, and the chosen version's furniture comes out onto the plan.
 */
export function switchVersion(plan: Plan, roomId: string, versionId: string): Plan {
  const p = ensureVersions(plan, roomId);
  const room = p.rooms.find((r) => r.id === roomId)!;
  if (room.activeVersionId === versionId) return p;
  const next = room.versions!.find((v) => v.id === versionId);
  if (!next) return p;
  const live = roomFurniture(p.items, room);
  const liveIds = new Set(live.map((i) => i.id));
  return {
    ...p,
    items: [...p.items.filter((i) => !liveIds.has(i.id)), ...next.items],
    rooms: p.rooms.map((r) =>
      r.id !== roomId
        ? r
        : {
            ...r,
            activeVersionId: versionId,
            versions: r.versions!.map((v) =>
              v.id === room.activeVersionId ? { ...v, items: live } : v.id === versionId ? { ...v, items: [] } : v,
            ),
          },
    ),
  };
}

/** Add a version (not active). Items get fresh ids so versions never share pieces. */
export function addVersion(plan: Plan, roomId: string, v: Omit<RoomVersion, "id" | "createdAt">): { plan: Plan; id: string } {
  const p = ensureVersions(plan, roomId);
  const id = nanoid(8);
  const version: RoomVersion = { ...v, id, createdAt: new Date().toISOString(), items: v.items.map((i) => ({ ...i, id: nanoid(8) })) };
  return { plan: withRoom(p, roomId, (r) => ({ ...r, versions: [...(r.versions ?? []), version] })), id };
}

/** Copy a version (the active one's live furniture, or a stored one) as a new version. */
export function duplicateVersion(plan: Plan, roomId: string, versionId: string): { plan: Plan; id: string } {
  const p = ensureVersions(plan, roomId);
  const room = p.rooms.find((r) => r.id === roomId)!;
  const src = room.versions!.find((v) => v.id === versionId)!;
  return addVersion(p, roomId, { name: `${src.name} copy`, brief: src.brief, concept: src.concept, items: versionItems(p, room, src) });
}

export function renameVersion(plan: Plan, roomId: string, versionId: string, name: string): Plan {
  return withRoom(plan, roomId, (r) => ({ ...r, versions: r.versions?.map((v) => (v.id === versionId ? { ...v, name } : v)) }));
}

/** Delete an inactive version. (Switch away from a version before deleting it.) */
export function deleteVersion(plan: Plan, roomId: string, versionId: string): Plan {
  return withRoom(plan, roomId, (r) =>
    r.activeVersionId === versionId ? r : { ...r, versions: r.versions?.filter((v) => v.id !== versionId) },
  );
}

/** Replace the room's live furniture (the active version) with these items. */
export function replaceLiveFurniture(plan: Plan, roomId: string, items: Item[]): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  const liveIds = new Set(roomFurniture(plan.items, room).map((i) => i.id));
  return { ...plan, items: [...plan.items.filter((i) => !liveIds.has(i.id)), ...items] };
}
