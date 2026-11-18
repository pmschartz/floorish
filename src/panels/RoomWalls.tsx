import { create } from "zustand";
import type { Room } from "../../shared/schemas";
import { roomEdges, type RoomEdge } from "../detect/walls";
import { setEdgeWall } from "../model/roomEdit";
import { usePlan } from "../state/planStore";

/** The wall being hovered in the list, so the canvas can highlight it. */
export const useWallHover = create<{ roomId: string | null; edge: number | null }>(() => ({ roomId: null, edge: null }));

const SIDE_LABEL: Record<string, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

/** Each straight wall of the room, with a switch between a wall and open to the next room. */
export function RoomWalls({ room }: { room: Room }) {
  const applyPlan = usePlan((s) => s.applyPlan);
  const edges = roomEdges([room]);
  if (!edges.length) return null;
  const xs = room.polygon.map((p) => p.x), ys = room.polygon.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Name each wall by its side, as seen on the plan; tell them apart when a side has several.
  const sideOf = (e: RoomEdge) =>
    e.axis === "h" ? (Math.abs(e.coord - minY) <= Math.abs(e.coord - maxY) ? "top" : "bottom")
      : (Math.abs(e.coord - minX) <= Math.abs(e.coord - maxX) ? "left" : "right");
  const named = edges.map((e) => ({ e, side: sideOf(e) }));
  const label = (x: (typeof named)[number]) => {
    const same = named.filter((y) => y.side === x.side).sort((a, b) => a.e.span[0] - b.e.span[0]);
    const base = SIDE_LABEL[x.side];
    if (same.length < 2) return base;
    const k = same.indexOf(x);
    const horizontal = x.side === "top" || x.side === "bottom";
    const parts = same.length === 2 ? (horizontal ? ["left part", "right part"] : ["upper part", "lower part"]) : [];
    return `${base} (${parts[k] ?? `part ${k + 1} of ${same.length}`})`;
  };

  return (
    <section className="room-walls" onMouseLeave={() => useWallHover.setState({ roomId: null, edge: null })}>
      <h3>Walls</h3>
      <ul>
        {named.map((x) => {
          const on = room.walls ? room.walls[x.e.edge] !== null : true;
          return (
            <li key={x.e.edge} onMouseEnter={() => useWallHover.setState({ roomId: room.id, edge: x.e.edge })}>
              <span>{label(x)}</span>
              <div className="seg" role="group" aria-label={`${label(x)} wall`}>
                <button className={on ? "on" : ""} aria-pressed={on}
                  onClick={() => { if (!on) applyPlan((p) => setEdgeWall(p, room.id, x.e.edge, true)); }}>Wall</button>
                <button className={!on ? "on" : ""} aria-pressed={!on}
                  onClick={() => { if (on) applyPlan((p) => setEdgeWall(p, room.id, x.e.edge, false)); }}>Open</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Open means no wall between this room and the next (like a kitchen open to the living room). A side with nothing beyond it is always an outside wall.</p>
    </section>
  );
}
