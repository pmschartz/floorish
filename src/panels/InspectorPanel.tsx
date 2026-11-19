import { useState } from "react";
import { FIXTURE_KINDS, ITEM_STATUSES, ROOM_TYPES, type FixtureKind, type Item, type Room } from "../../shared/schemas";
import { CATEGORIES, clearancesFor, FIXTURE_LABEL, OPENING_CATEGORIES, openingKind } from "../catalog/furniture";
import { bbox, polygonArea } from "../model/geometry";
import { formatArea, formatDims, formatLength } from "../model/units";
import { usePlan } from "../state/planStore";
import { LengthInput } from "./LengthInput";
import { RoomWalls } from "./RoomWalls";
import { PlanOverview } from "./PlanOverview";
import { mergeCandidates, mergeRooms, sharedWalls } from "../model/roomEdit";
import { confirmDialog, notify } from "../ui/dialog";
import { RoomDesignPanel } from "./RoomDesignPanel";
import { RoomPaintPanel } from "./RoomPaintPanel";
import { RoomStylePanel } from "./RoomStylePanel";
import { RoomSuggestPanel } from "./RoomSuggestPanel";
import { ShopPanel } from "./ShopPanel";

const STATUS_TEXT: Record<Item["status"], string> = { existing: "Have it", planned: "Planned", "to-buy": "To buy" };

export function InspectorPanel() {
  const plan = usePlan((s) => s.plan)!;
  const itemId = usePlan((s) => s.selectedItemId);
  const roomId = usePlan((s) => s.selectedRoomId);
  const ids = usePlan((s) => s.selectedItemIds);
  const item = plan.items.find((i) => i.id === itemId);
  const room = plan.rooms.find((r) => r.id === roomId);

  if (ids.length > 1) return <MultiInspector ids={ids} />;
  if (item) return <ItemInspector key={item.id} item={item} />;
  if (room) return <RoomInspector key={room.id} room={room} />;
  return <PlanOverview />;
}

/** Several pieces selected: what they are, their status together, and duplicate or delete them all. */
function MultiInspector({ ids }: { ids: string[] }) {
  const plan = usePlan((s) => s.plan)!;
  const units = usePlan((s) => s.units);
  const { updateItems, duplicateItems, removeItems, selectItems } = usePlan.getState();
  const sel = new Set(ids);
  const items = plan.items.filter((i) => sel.has(i.id));
  const statuses = new Set(items.map((i) => i.status));
  const common = statuses.size === 1 ? items[0]?.status : null;
  return (
    <div className="inspector multi-inspector">
      <div className="room-head">
        <h2 className="multi-title">{items.length} pieces selected</h2>
        <p className="room-size muted small">Drag any of them to move them together. Shift-click to add or remove one.</p>
      </div>
      <div className="segmented" role="group" aria-label="Status of all selected pieces">
        {ITEM_STATUSES.map((s) => (
          <button key={s} className={common === s ? `on status-${s}` : ""} onClick={() => updateItems(ids, { status: s })}>
            {STATUS_TEXT[s]}
          </button>
        ))}
      </div>
      {!common && <p className="muted small">They have different statuses; pick one to set them all.</p>}
      <ul className="pick-list">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => selectItems([i.id], false)} title="Select just this piece">
              <span className="dot-blank" />
              <span className="pick-name">{i.label || i.category}</span>
              <span className="pick-meta mono">{formatDims(i.width, i.depth, units)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button onClick={() => duplicateItems(ids)}>Duplicate all</button>
        <button className="danger" onClick={() => removeItems(ids)}>Delete all</button>
      </div>
    </div>
  );
}

/** The kinds of door and opening an item can be switched between. */
const DOOR_KINDS: Array<[string, string]> = [
  ["door", "Swing door"],
  ["double door", "Double door"],
  ["sliding door", "Sliding door"],
  ["pocket door", "Pocket door"],
  ["bifold door", "Bifold door"],
  ["opening", "Opening (no door)"],
  ["garage door", "Garage door"],
];

function ItemInspector({ item }: { item: Item }) {
  const units = usePlan((s) => s.units);
  const { updateItem, removeItem, duplicateItem } = usePlan.getState();
  const set = (patch: Partial<Item>) => updateItem(item.id, patch);
  const rules = clearancesFor(item);
  const isOpening = item.shape === "door" || item.shape === "window" || item.shape === "opening";
  const isFixture = item.shape === "fixture";
  const builtIn = isOpening || isFixture; // part of the house, not furniture you shop for

  return (
    <div className="inspector">
      <label className="field">
        <span>Label</span>
        <input value={item.label} placeholder="e.g. Grandma's bookcase" onChange={(e) => set({ label: e.target.value })} />
      </label>
      {isFixture && (
        <label className="field">
          <span>Fixture</span>
          <select
            value={item.category}
            onChange={(e) => {
              const kind = e.target.value as FixtureKind;
              // Keep a custom label; replace the default one.
              const wasDefault = Object.values(FIXTURE_LABEL).includes(item.label);
              set({ category: kind, ...(wasDefault ? { label: FIXTURE_LABEL[kind] } : {}) });
            }}
          >
            {FIXTURE_KINDS.map((k) => <option key={k} value={k}>{FIXTURE_LABEL[k]}</option>)}
          </select>
        </label>
      )}
      {(item.shape === "door" || item.shape === "opening") && (
        <label className="field">
          <span>Type</span>
          <select
            value={openingKind(item)}
            onChange={(e) => {
              const kind = e.target.value;
              const swings = kind === "door" || kind === "double door";
              // Keep a custom label; replace a default one ("Door", "Opening", "Sliding door"…).
              const wasDefault = !item.label || OPENING_CATEGORIES.has(item.label.toLowerCase()) || /^(door|double door|window)\b/i.test(item.label);
              const label = kind.charAt(0).toUpperCase() + kind.slice(1);
              set({ category: kind, shape: swings ? "door" : "opening", ...(wasDefault ? { label } : {}) });
            }}
          >
            {DOOR_KINDS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
          </select>
        </label>
      )}
      {!builtIn && (
        <label className="field">
          <span>What is it?</span>
          <input
            list="categories"
            value={item.category}
            placeholder="bookcase, desk, bed…"
            onChange={(e) => set({ category: e.target.value.toLowerCase() })}
          />
          <datalist id="categories">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
      )}

      <div className="row">
        <LengthInput label="Width" value={item.width} units={units} onChange={(v) => v && set({ width: v })} />
        {!isOpening && <LengthInput label="Depth" value={item.depth} units={units} onChange={(v) => v && set({ depth: v })} />}
        {!builtIn && (
          <LengthInput label="Height" value={item.height} units={units} allowEmpty onChange={(v) => set({ height: v })} />
        )}
      </div>

      <div className="row">
        <label className="field small">
          <span>Rotation°</span>
          <input
            type="number"
            step={15}
            value={Math.round(item.rotation * 10) / 10}
            onChange={(e) => set({ rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
          />
        </label>
        <button className="icon-btn" title="Rotate 90°" onClick={() => set({ rotation: (item.rotation + 90) % 360 })}>⟳ 90°</button>
        {item.shape === "door" && (
          <button className="icon-btn" title="Move the hinge to the other end" onClick={() => set({ flip: !item.flip })}>⇋ Hinge</button>
        )}
        {!builtIn && (
          <label className="field small">
            <span>Color</span>
            <span className="color-field">
              <input type="color" value={item.color || "#ffffff"} onChange={(e) => set({ color: e.target.value })} />
              {item.color && <button className="link" onClick={() => set({ color: "" })}>clear</button>}
            </span>
          </label>
        )}
      </div>

      {!builtIn && (
        <div className="segmented" role="group" aria-label="Status">
          {ITEM_STATUSES.map((s) => (
            <button key={s} className={item.status === s ? `on status-${s}` : ""} onClick={() => set({ status: s })}>
              {STATUS_TEXT[s]}
            </button>
          ))}
        </div>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={item.notes} placeholder="Material, must-haves, link to what you own…" onChange={(e) => set({ notes: e.target.value })} />
      </label>

      {rules.length > 0 && (
        <p className="muted small">
          Needs clear space: {rules.map((r) => `${formatLength(r.dist, units)} ${r.side}`).join(", ")}. Shown in green on the plan.
        </p>
      )}

      <div className="row">
        <button onClick={() => duplicateItem(item.id)}>Duplicate</button>
        <button className="danger" onClick={() => removeItem(item.id)}>Delete</button>
      </div>

      {!builtIn && <ShopPanel item={item} />}
    </div>
  );
}

function RoomInspector({ room }: { room: Room }) {
  const units = usePlan((s) => s.units);
  const { updateRoom, removeRoom } = usePlan.getState();
  const b = bbox(room.polygon);
  return (
    <div className="inspector room-inspector">
      <div className="room-head">
        <input className="room-name" aria-label="Room name" value={room.name}
          onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
        <select aria-label="Room type" value={room.type}
          onChange={(e) => updateRoom(room.id, { type: e.target.value as Room["type"] })}>
          {ROOM_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <p className="room-size muted small">
          {formatArea(polygonArea(room.polygon), units)} · {formatLength(b.width, units)} × {formatLength(b.height, units)}
          {room.polygon.length !== 4 && " overall"}
        </p>
      </div>
      <RoomStylePanel room={room} />
      <RoomPaintPanel room={room} />
      <RoomDesignPanel room={room} />
      <RoomSuggestPanel key={room.id} room={room} />
      <RoomAdvanced room={room} remove={removeRoom} />
    </div>
  );
}

/** Walls, merging and deleting: the room's shape, kept out of the way until needed. */
function RoomAdvanced({ room, remove }: { room: Room; remove: (id: string, giveSpace?: boolean) => void }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("roomAdvancedOpen") === "1"; } catch { return false; }
  });
  return (
    <details className="room-advanced" open={open} onToggle={(e) => {
      const now = (e.target as HTMLDetailsElement).open;
      setOpen(now);
      try { localStorage.setItem("roomAdvancedOpen", now ? "1" : "0"); } catch { /* private window */ }
    }}>
      <summary>Advanced <span className="muted small">Walls, merge, delete</span></summary>
      {open && (
        <div className="room-advanced-body">
          <p className="muted small">To resize the room, drag the green handles on its walls. Rooms next to it move with them.</p>
          <RoomWalls room={room} />
          <MergeRoom room={room} />
          <DeleteRoom room={room} remove={remove} />
        </div>
      )}
    </details>
  );
}

/** Delete a room, saying which room gets its space. */
function DeleteRoom({ room, remove }: { room: Room; remove: (id: string, giveSpace?: boolean) => void }) {
  const heir = usePlan((s) => (s.plan ? sharedWalls(s.plan, room.id)[0]?.room : undefined));
  return (
    <div className="delete-room">
      <button className="danger" onClick={() => remove(room.id)}>Delete room</button>
      {heir && (
        <p className="muted small">
          Its space goes to {heir.name}.{" "}
          <button className="link" onClick={() => remove(room.id, false)}>Delete and leave it empty</button>
        </p>
      )}
    </div>
  );
}

/** Merge this room with a neighbour (e.g. fold a closet into its bedroom, or join two halves of a bath). */
function MergeRoom({ room }: { room: Room }) {
  const plan = usePlan((s) => s.plan)!;
  const candidates = mergeCandidates(plan, room.id);
  if (!candidates.length) return null;
  return (
    <label className="field">
      <span>Merge with</span>
      <select value="" onChange={async (e) => {
        const other = candidates.find((r) => r.id === e.target.value);
        if (!other) return;
        const ok = await confirmDialog({
          title: `Merge “${other.name}” into “${room.name}”?`,
          message: `They become one room called “${room.name}”, including the wall between them. Furniture stays where it is. You can undo this.`,
          confirmLabel: "Merge rooms",
        });
        if (!ok) return;
        const next = mergeRooms(usePlan.getState().plan!, room.id, other.id);
        if (!next) return void notify("Couldn't merge these rooms", "They don't connect closely enough to make one room.");
        usePlan.getState().applyPlan(() => next);
      }}>
        <option value="">Choose a neighbouring room…</option>
        {candidates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}
