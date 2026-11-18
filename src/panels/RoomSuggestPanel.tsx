import { useState } from "react";
import type { Plan, Room, SuggestRoomRequest, Suggestion } from "../../shared/schemas";
import { api } from "../api/client";
import { CATALOG } from "../catalog/furniture";
import { roomFor } from "../checks/layoutChecks";
import { findOpenSpot } from "../checks/placement";
import { bbox, polygonArea } from "../model/geometry";
import { normalizeCategory } from "../model/roomContext";
import { formatDims } from "../model/units";
import { keepRoomResult, usePlan } from "../state/planStore";
import { describePaint } from "../../shared/sw";

/** What Claude is told about the room: its size, furniture, paint and the house style. */
function buildRequest(plan: Plan, room: Room): SuggestRoomRequest {
  const b = bbox(room.polygon);
  const inRoom = plan.items.filter((i) => i.shape !== "door" && i.shape !== "window" && roomFor(i, [room]));
  return {
    room: {
      name: room.name,
      type: room.type,
      widthIn: b.width,
      depthIn: b.height,
      areaSqFt: Math.round(polygonArea(room.polygon) / 144),
      paint: describePaint(room.paint),
      style: { about: room.style?.about ?? "", styles: room.style?.styles ?? [] },
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
  };
}

/**
 * Short fingerprint of what matters to the suggestions: the room, which pieces are in it (not
 * where they sit), the style and the paint. Moving furniture around doesn't make them stale.
 */
function fingerprint(req: SuggestRoomRequest): string {
  const str = JSON.stringify({
    room: req.room,
    items: req.items.map((i) => [i.label, i.category, Math.round(i.widthIn), Math.round(i.depthIn)]).sort(),
    style: req.style,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

export function RoomSuggestPanel({ room }: { room: Room }) {
  const units = usePlan((s) => s.units);
  // Rebuilt whenever the plan changes, to spot when the room has changed since Claude answered.
  const currentBasis = usePlan((s) => (s.plan ? fingerprint(buildRequest(s.plan, room)) : ""));
  const saved = room.suggestions;
  const data = saved?.response ?? null;
  const stale = !!saved && saved.basis !== currentBasis;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});

  const ask = async () => {
    const plan = usePlan.getState().plan!;
    const req = buildRequest(plan, room);
    setLoading(true);
    setError("");
    try {
      const res = await api.suggestRoom(req);
      // Saved with the room (and the plan file), so it's there next time without asking again.
      keepRoomResult(room.id, { suggestions: { askedAt: new Date().toISOString(), basis: fingerprint(req), response: res, added: [] } });
      setNote({});
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
      setNote((p) => ({ ...p, [idx]: "No open spot big enough. Make room and try again." }));
      return;
    }
    // A specific category (e.g. "lighting" + "Arc floor lamp" → lamp) so catalog pieces match.
    const category = normalizeCategory(s.category, s.label);
    const match = CATALOG.find((c) => c.category === category);
    const entry = match ?? { key: "custom-rect", label: s.label, category, group: "Custom", shape: "rect" as const, width: s.widthIn, depth: s.depthIn, height: null };
    usePlan.getState().addItem(entry, spot, {
      catalogKey: match ? match.key : "custom",
      label: s.label,
      category,
      width: s.widthIn,
      depth: s.depthIn,
      rotation: spot.rotation,
      status: "to-buy",
      notes: s.placementHint,
    });
    // The new piece is one Claude suggested, so the answer still fits the room.
    const basis = fingerprint(buildRequest(usePlan.getState().plan!, room));
    if (saved) keepRoomResult(room.id, { suggestions: { ...saved, basis, added: [...saved.added, idx] } });
    setNote((p) => ({ ...p, [idx]: "Added. Move it where the hint says." }));
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
          <p className="muted small">
            Suggested {new Date(saved!.askedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.{" "}
            {stale ? "The room or your style has changed since; ask again for fresh ideas." : "Saved with the plan, so there's no need to ask again."}
          </p>
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
              {note[i] ? <p className="small">{note[i]}</p>
                : saved?.added.includes(i) ? <p className="small muted">Added to the plan.</p>
                : <button onClick={() => add(s, i)}>Add to plan</button>}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
