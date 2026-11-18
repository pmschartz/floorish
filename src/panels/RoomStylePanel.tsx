import { useEffect, useState } from "react";
import { STYLE_OPTIONS, type Room, type RoomStyle } from "../../shared/schemas";
import { usePlan } from "../state/planStore";

/**
 * What this room is for, in your own words, and its own styles. Claude reads both for this room
 * only (suggestions, redesigns, chat and shopping); the house style covers everything else.
 */
export function RoomStylePanel({ room }: { room: Room }) {
  const updateRoom = usePlan((s) => s.updateRoom);
  const houseStyles = usePlan((s) => s.plan!.style.styles);
  const style: RoomStyle = { about: room.style?.about ?? "", styles: room.style?.styles ?? [] };
  const save = (patch: Partial<RoomStyle>) => updateRoom(room.id, { style: { ...style, ...patch } });
  const [own, setOwn] = useState(style.styles.length > 0);
  // Switching rooms resets whether the room's own styles are showing.
  useEffect(() => setOwn((room.style?.styles ?? []).length > 0), [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (s: string) =>
    save({ styles: style.styles.includes(s) ? style.styles.filter((x) => x !== s) : [...style.styles, s] });

  return (
    <section className="room-style">
      <h3>Room style</h3>
      <label className="field">
        <span>What's this room for?</span>
        <textarea rows={2} value={style.about} maxLength={500}
          placeholder="e.g. Game and movie room: big sectional, projector, dark and cozy"
          onChange={(e) => save({ about: e.target.value })} />
      </label>
      <div className="room-style-seg" role="group" aria-label="Style for this room">
        <button className={!own ? "on" : ""} aria-pressed={!own} onClick={() => { setOwn(false); if (style.styles.length) save({ styles: [] }); }}>
          Same as the house
        </button>
        <button className={own ? "on" : ""} aria-pressed={own} onClick={() => setOwn(true)}>Its own style</button>
      </div>
      {own ? (
        <div className="chips">
          {STYLE_OPTIONS.map((s) => (
            <button key={s} className={`chip ${style.styles.includes(s) ? "on" : ""}`} aria-pressed={style.styles.includes(s)} onClick={() => toggle(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted small">{houseStyles.length ? houseStyles.join(", ") : "No house style chosen yet (House style tab)."}</p>
      )}
    </section>
  );
}
