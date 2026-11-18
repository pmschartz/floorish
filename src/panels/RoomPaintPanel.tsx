import { useState } from "react";
import { WALL_SIDES, type Room, type RoomPaint } from "../../shared/schemas";
import { findSw, swRef, type SwColor } from "../../shared/sw";
import { usePlan } from "../state/planStore";
import { SwDot, SwPicker } from "./SwPicker";

const EMPTY: RoomPaint = { walls: null, accent: null, accentSide: null, trim: null, ceiling: null };
type Slot = "walls" | "accent" | "trim" | "ceiling";
const SLOT_LABEL: Record<Slot, string> = { walls: "Walls", accent: "Accent wall", trim: "Trim", ceiling: "Ceiling" };

/** The room's paint: wall color, plus an optional accent wall, trim and ceiling. */
export function RoomPaintPanel({ room }: { room: Room }) {
  const palette = usePlan((s) => s.plan!.style.palette);
  const otherRooms = usePlan((s) => s.plan!.rooms).filter((r) => r.id !== room.id && r.paint?.walls);
  const updateRoom = usePlan((s) => s.updateRoom);
  const paint = { ...EMPTY, ...room.paint };
  const [editing, setEditing] = useState<Slot | null>(null);
  const [more, setMore] = useState(!!(paint.accent || paint.trim || paint.ceiling));

  const save = (patch: Partial<RoomPaint>) => updateRoom(room.id, { paint: { ...paint, ...patch } });
  const pick = (slot: Slot) => (c: SwColor) => {
    save({ [slot]: swRef(c), ...(slot === "accent" && !paint.accentSide ? { accentSide: "top" as const } : {}) });
    setEditing(null);
  };
  // Colors already on other rooms' walls, so connected rooms can share or flow.
  const used = [...new Set(otherRooms.map((r) => r.paint!.walls!))].filter((e) => !palette.includes(e)).slice(0, 6);

  const row = (slot: Slot) => {
    const value = paint[slot];
    const sw = value ? findSw(value) : undefined;
    return (
      <div className="paint-row" key={slot}>
        <span className="paint-slot">{SLOT_LABEL[slot]}</span>
        {value ? (
          <span className="paint-value">
            <SwDot entry={value} size={22} />
            <span className="sw-text">
              <strong>{sw ? `SW ${sw.number}` : value}</strong>
              {sw && <span className="muted small">{sw.name}</span>}
            </span>
          </span>
        ) : <span className="muted small paint-value">Not set</span>}
        <span className="paint-actions">
          <button className="link" onClick={() => setEditing(editing === slot ? null : slot)}>{editing === slot ? "Cancel" : value ? "Change" : "Set"}</button>
          {value && <button className="link" aria-label={`Clear ${SLOT_LABEL[slot].toLowerCase()} color`}
            onClick={() => save({ [slot]: null, ...(slot === "accent" ? { accentSide: null } : {}) })}>×</button>}
        </span>
        {slot === "accent" && value && (
          <label className="paint-side">
            <span className="muted small">Which wall</span>
            <select value={paint.accentSide ?? "top"} onChange={(e) => save({ accentSide: e.target.value as RoomPaint["accentSide"] })}>
              {WALL_SIDES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)} (as on the plan)</option>)}
            </select>
          </label>
        )}
        {editing === slot && (
          <div className="paint-picker">
            <SwPicker onPick={pick(slot)} quick={[...palette, ...used]} autoFocus
              quickLabel={used.length ? (palette.length ? "Your palette, then other rooms:" : "Other rooms:") : "From your palette:"} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="room-paint">
      <h3>Paint <span className="muted small">Sherwin-Williams</span></h3>
      {row("walls")}
      {more ? (["accent", "trim", "ceiling"] as Slot[]).map(row) : (
        <button className="link small" onClick={() => setMore(true)}>+ Accent wall, trim and ceiling</button>
      )}
    </div>
  );
}
