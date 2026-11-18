import { useState } from "react";
import type { Room, SuggestRoomResponse, Suggestion } from "../../shared/schemas";
import { api } from "../api/client";
import { CATALOG } from "../catalog/furniture";
import { roomFor } from "../checks/layoutChecks";
import { findOpenSpot } from "../checks/placement";
import { bbox, polygonArea } from "../model/geometry";
import { formatDims } from "../model/units";
import { usePlan } from "../state/planStore";
import { describePaint } from "../../shared/sw";

// Remember the last answer per room for this session so switching rooms doesn't lose it.
const cache = new Map<string, SuggestRoomResponse>();

export function RoomSuggestPanel({ room }: { room: Room }) {
  const units = usePlan((s) => s.units);
  const [data, setData] = useState<SuggestRoomResponse | null>(cache.get(room.id) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Record<number, string>>({});

  const ask = async () => {
    const plan = usePlan.getState().plan!;
    const b = bbox(room.polygon);
    const inRoom = plan.items.filter((i) => i.shape !== "door" && i.shape !== "window" && roomFor(i, [room]));
    setLoading(true);
    setError("");
    try {
      const res = await api.suggestRoom({
        room: {
          name: room.name,
          type: room.type,
          widthIn: b.width,
          depthIn: b.height,
          areaSqFt: Math.round(polygonArea(room.polygon) / 144),
          paint: describePaint(room.paint),
        },
        items: inRoom.map((i) => ({
          label: i.label || i.category || "unlabeled",
          category: i.category,
          widthIn: i.width,
          depthIn: i.depth,
          status: i.status,
          position: `${Math.round(i.x - b.minX)}" from the left wall, ${Math.round(i.y - b.minY)}" from the top wall, rotated ${Math.round(i.rotation)}°`,
        })),
        style: plan.style,
      });
      cache.set(room.id, res);
      setData(res);
      setPlaced({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const add = (s: Suggestion, idx: number) => {
    const plan = usePlan.getState().plan!;
    const spot = findOpenSpot(room, plan.items, s.widthIn, s.depthIn);
    if (!spot) {
      setPlaced((p) => ({ ...p, [idx]: "No open spot big enough. Make room and try again." }));
      return;
    }
    const match = CATALOG.find((c) => c.category === s.category.toLowerCase());
    const entry = match ?? { key: "custom-rect", label: s.label, category: s.category.toLowerCase(), group: "Custom", shape: "rect" as const, width: s.widthIn, depth: s.depthIn, height: null };
    usePlan.getState().addItem(entry, spot, {
      catalogKey: match ? match.key : "custom",
      label: s.label,
      category: s.category.toLowerCase(),
      width: s.widthIn,
      depth: s.depthIn,
      rotation: spot.rotation,
      status: "to-buy",
      notes: s.placementHint,
    });
    setPlaced((p) => ({ ...p, [idx]: "Added. Move it where the hint says." }));
  };

  return (
    <section className="suggest">
      <h3>What's missing?</h3>
      <p className="muted small">Claude looks at the room's size, what's in it, and your style, then suggests pieces.</p>
      <button className="primary wide" onClick={ask} disabled={loading}>
        {loading ? "Thinking…" : data ? "Ask again" : "Suggest furniture for this room"}
      </button>
      {error && <p className="error-text">{error}</p>}
      {data && (
        <>
          <p className="small">{data.summary}</p>
          {data.suggestions.map((s, i) => (
            <article key={i} className="suggestion">
              <div className="product-top">
                <strong>{s.label}</strong>
                <span className={`badge prio-${s.priority}`}>{s.priority}</span>
              </div>
              <p className="small muted">{formatDims(s.widthIn, s.depthIn, units)} · {s.category}</p>
              <p className="small">{s.reason}</p>
              <p className="small muted">Where: {s.placementHint}</p>
              {placed[i] ? <p className="small">{placed[i]}</p> : <button onClick={() => add(s, i)}>Add to plan</button>}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
