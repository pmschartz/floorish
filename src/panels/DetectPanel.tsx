import { ROOM_TYPES, type Room } from "../../shared/schemas";
import { TYPICAL_DOOR_IN } from "../detect/buildProposal";
import { useDetect } from "../detect/detectStore";
import { bbox, polygonArea } from "../model/geometry";
import { formatArea, formatLength } from "../model/units";
import { usePlan } from "../state/planStore";

/** "2 Toilets, Bathtub, 3 Counters" */
function fixtureSummary(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${n} ${l}${l.endsWith("s") ? "" : "s"}` : l)).join(", ");
}

/** Right-hand panel while auto-detect runs and while you review what it found. */
export function DetectPanel() {
  const s = useDetect();
  const units = usePlan((st) => st.units);
  const plan = usePlan((st) => st.plan)!;

  if (s.status === "running") {
    return (
      <div className="inspector">
        <h3>Detecting rooms, doors and windows</h3>
        <p className="spinner-line"><span className="spinner" aria-hidden /> {s.step}</p>
        <p className="muted small">
          Claude reads the whole plan, then the app snaps everything to the walls it finds in the image.
          This usually takes one to two minutes and costs a few cents.
        </p>
        <button onClick={s.cancel}>Cancel</button>
      </div>
    );
  }

  if (s.status === "error") {
    return (
      <div className="inspector">
        <h3>Auto-detect didn't finish</h3>
        <p className="error-text">{s.error}</p>
        <div className="row">
          <button className="primary" onClick={() => void s.start()}>Try again</button>
          <button onClick={s.cancel}>Close</button>
        </div>
      </div>
    );
  }

  const p = s.proposal;
  if (!p) return null;
  const count = (shape: string) => p.openings.filter((o) => o.shape === shape).length;
  const doors = count("door"), windows = count("window"), others = count("opening");
  const keptRooms = s.keepRoom.filter(Boolean).length;
  const existingRooms = plan.rooms.length;
  const existingOpenings = plan.items.filter((i) => ["door", "window", "opening", "fixture"].includes(i.shape)).length;
  const off = p.scaleDisagreement ? Math.abs(1 - p.scaleDisagreement) : 0;

  const setRoom = (i: number, patch: Partial<Room>) => {
    const rooms = p.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r));
    s.set({ proposal: { ...p, rooms } });
  };

  return (
    <div className="inspector detect-review">
      <h3>Review what was found</h3>
      <p className="small">
        {p.rooms.length} rooms, {doors} doors, {windows} windows{others ? `, ${others} other openings` : ""}, {p.fixtures.length} fixtures.
        Outlined in teal on the plan. Untick anything that's wrong; you can fix the rest afterwards.
      </p>
      {(p.correctedDoors > 0 || p.addedDoors > 0 || p.addedWindows > 0) && (
        <p className="small muted">
          Checked against the drawing:{" "}
          {[
            p.correctedDoors > 0 && `fixed the hinge or swing of ${p.correctedDoors} ${p.correctedDoors === 1 ? "door" : "doors"}`,
            p.addedDoors > 0 && `found ${p.addedDoors} more ${p.addedDoors === 1 ? "door or opening" : "doors and openings"}`,
            p.addedWindows > 0 && `found ${p.addedWindows} more ${p.addedWindows === 1 ? "window" : "windows"}`,
          ].filter(Boolean).join(", ")}.
        </p>
      )}

      <p className={`small ${p.ppiSource === "doors" || off > 0.08 ? "notice" : "muted"}`}>
        {p.ppiSource === "plan" && "Using your calibrated scale."}
        {p.ppiSource === "printed" && "Scale set from the dimensions printed on the plan."}
        {p.ppiSource === "doors" && `No printed dimensions, so the scale is estimated from door widths (assuming ${TYPICAL_DOOR_IN}" doors). Calibrate afterwards for accuracy.`}
        {off > 0.08 && ` The printed dimensions suggest a scale ${Math.round(off * 100)}% different from your calibration; consider recalibrating.`}
        {" "}Walls about {formatLength(p.wallThickness, units)} thick.
      </p>

      <ul className="detect-rooms">
        {p.rooms.map((r, i) => {
          const b = bbox(r.polygon);
          return (
            <li key={i} className={s.keepRoom[i] ? "" : "off"}>
              <input
                type="checkbox"
                checked={s.keepRoom[i]}
                onChange={(e) => s.set({ keepRoom: s.keepRoom.map((k, j) => (j === i ? e.target.checked : k)) })}
                aria-label={`Keep ${r.name}`}
              />
              <input className="room-name" value={r.name} onChange={(e) => setRoom(i, { name: e.target.value })} aria-label="Room name" />
              <select value={r.type} onChange={(e) => setRoom(i, { type: e.target.value as Room["type"] })} aria-label="Room type">
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="muted small">
                {formatArea(polygonArea(r.polygon), units)} · {formatLength(b.width, units)} × {formatLength(b.height, units)}
                {s.detectedName[i] && ` · kept your name (Claude saw “${s.detectedName[i]}”)`}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="checks-list">
        <label><input type="checkbox" checked={s.keepDoors} onChange={(e) => s.set({ keepDoors: e.target.checked })} /> Doors ({doors})</label>
        <label><input type="checkbox" checked={s.keepWindows} onChange={(e) => s.set({ keepWindows: e.target.checked })} /> Windows ({windows})</label>
        {others > 0 && (
          <label><input type="checkbox" checked={s.keepOpenings} onChange={(e) => s.set({ keepOpenings: e.target.checked })} /> Other openings ({others})</label>
        )}
        {p.fixtures.length > 0 && (
          <label>
            <input type="checkbox" checked={s.keepFixtures} onChange={(e) => s.set({ keepFixtures: e.target.checked })} />{" "}
            Fixtures ({fixtureSummary(p.fixtures.map((f) => f.label))})
          </label>
        )}
        {(existingRooms > 0 || existingOpenings > 0) && (
          <label>
            <input type="checkbox" checked={s.replace} onChange={(e) => s.set({ replace: e.target.checked })} />{" "}
            Replace my {existingRooms} {existingRooms === 1 ? "room" : "rooms"} and {existingOpenings} doors, windows and fixtures (furniture stays)
          </label>
        )}
      </div>

      {p.orphanDoorsNear.length > 0 && (
        <p className="small notice">
          {p.orphanDoorsNear.length === 1 ? "A door swings" : `${p.orphanDoorsNear.length} doors swing`} into space that isn't part of any room
          (off {[...new Set(p.orphanDoorsNear)].join(", ")}). A room outline is probably missing a corner there; try Auto-detect again, or untick that room and trace it yourself.
        </p>
      )}
      {p.notes && <p className="muted small">Claude's note: {p.notes}</p>}

      <div className="row">
        <button className="primary" onClick={s.apply} disabled={keptRooms === 0 && !s.keepDoors && !s.keepWindows}>
          Add {keptRooms} {keptRooms === 1 ? "room" : "rooms"} to the plan
        </button>
        <button onClick={s.cancel}>Discard</button>
      </div>
      <p className="muted small">This switches on Clean view. Undo (⌘Z) takes it all back.</p>
    </div>
  );
}
