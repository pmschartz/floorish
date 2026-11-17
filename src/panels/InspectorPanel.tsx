import { ITEM_STATUSES, ROOM_TYPES, type Item, type Room } from "../../shared/schemas";
import { CATEGORIES, clearancesFor } from "../catalog/furniture";
import { bbox, polygonArea } from "../model/geometry";
import { formatArea, formatLength } from "../model/units";
import { effectivePpi, usePlan } from "../state/planStore";
import { LengthInput } from "./LengthInput";
import { RoomSuggestPanel } from "./RoomSuggestPanel";
import { ShopPanel } from "./ShopPanel";

const STATUS_TEXT: Record<Item["status"], string> = { existing: "Have it", planned: "Planned", "to-buy": "To buy" };

export function InspectorPanel() {
  const plan = usePlan((s) => s.plan)!;
  const itemId = usePlan((s) => s.selectedItemId);
  const roomId = usePlan((s) => s.selectedRoomId);
  const item = plan.items.find((i) => i.id === itemId);
  const room = plan.rooms.find((r) => r.id === roomId);

  if (item) return <ItemInspector key={item.id} item={item} />;
  if (room) return <RoomInspector key={room.id} room={room} />;
  return <PlanOverview />;
}

function ItemInspector({ item }: { item: Item }) {
  const units = usePlan((s) => s.units);
  const { updateItem, removeItem, duplicateItem } = usePlan.getState();
  const set = (patch: Partial<Item>) => updateItem(item.id, patch);
  const rules = clearancesFor(item);
  const isOpening = item.shape === "door" || item.shape === "window" || item.shape === "opening";

  return (
    <div className="inspector">
      <label className="field">
        <span>Label</span>
        <input value={item.label} placeholder="e.g. Grandma's bookcase" onChange={(e) => set({ label: e.target.value })} />
      </label>
      {!isOpening && (
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
        {!isOpening && (
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
        {!isOpening && (
          <label className="field small">
            <span>Color</span>
            <span className="color-field">
              <input type="color" value={item.color || "#ffffff"} onChange={(e) => set({ color: e.target.value })} />
              {item.color && <button className="link" onClick={() => set({ color: "" })}>clear</button>}
            </span>
          </label>
        )}
      </div>

      {!isOpening && (
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

      {!isOpening && <ShopPanel item={item} />}
    </div>
  );
}

function RoomInspector({ room }: { room: Room }) {
  const units = usePlan((s) => s.units);
  const { updateRoom, removeRoom } = usePlan.getState();
  const b = bbox(room.polygon);
  return (
    <div className="inspector">
      <label className="field">
        <span>Room name</span>
        <input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={room.type} onChange={(e) => updateRoom(room.id, { type: e.target.value as Room["type"] })}>
          {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <p>
        {formatArea(polygonArea(room.polygon), units)} · {formatLength(b.width, units)} × {formatLength(b.height, units)}
        {room.polygon.length !== 4 && <span className="muted"> (outer size)</span>}
      </p>
      <button className="danger" onClick={() => removeRoom(room.id)}>Delete room</button>
      <RoomSuggestPanel room={room} />
    </div>
  );
}

function PlanOverview() {
  const plan = usePlan((s) => s.plan)!;
  const ppi = effectivePpi(plan);
  const toBuy = plan.items.filter((i) => i.status === "to-buy").length;
  return (
    <div className="inspector overview">
      <h3>Getting started</h3>
      <ol className="steps">
        <li className={plan.image ? "done" : ""}>Upload a floor plan (or use the blank grid).</li>
        <li className={ppi ? "done" : ""}>Calibrate: click both ends of a wall you know the length of.</li>
        <li className={plan.rooms.length ? "done" : ""}>Click Auto-detect to find rooms, doors and windows, or trace rooms yourself with the Room or Rect room tool.</li>
        <li className={plan.items.length ? "done" : ""}>Drag furniture in. Mark what you have, what's planned, and what to buy.</li>
        <li>Select a shape and use “Shop for this”, or select a room and ask what's missing.</li>
      </ol>
      <p className="muted small">
        {plan.rooms.length} rooms · {plan.items.length} items · {toBuy} to buy
      </p>
      <h3>Shortcuts</h3>
      <ul className="shortcuts">
        <li><kbd>V</kbd> select · <kbd>H</kbd> pan · <kbd>C</kbd> calibrate · <kbd>R</kbd> room · <kbd>B</kbd> rectangle room</li>
        <li><kbd>Space</kbd>+drag pans · scroll or pinch zooms</li>
        <li><kbd>⌫</kbd> delete · <kbd>⌘D</kbd> duplicate · arrows nudge 1" (<kbd>Shift</kbd> 6")</li>
        <li><kbd>⌘Z</kbd> undo · <kbd>⇧⌘Z</kbd> redo · <kbd>Alt</kbd> while dragging turns off snapping</li>
      </ul>
    </div>
  );
}
