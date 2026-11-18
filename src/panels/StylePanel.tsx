import { STYLE_OPTIONS, type StyleProfile } from "../../shared/schemas";
import { describeEntry, describePaint, entryHex, findSw, swRef, type SwColor } from "../../shared/sw";
import { SwDot, SwPicker } from "./SwPicker";
import { suggestPalettes } from "../model/palette";
import { usePlan } from "../state/planStore";

/** Sherwin-Williams palettes, light → dark. */
const PALETTES: Array<{ name: string; colors: string[] }> = [
  { name: "Warm neutrals", colors: ["SW 7008", "SW 7036", "SW 6107", "SW 7048", "SW 6258"] },
  { name: "Coastal", colors: ["SW 7005", "SW 6106", "SW 6204", "SW 6211", "SW 6244"] },
  { name: "Earthy", colors: ["SW 7012", "SW 9109", "SW 7701", "SW 6186", "SW 7069"] },
  { name: "Monochrome", colors: ["SW 7006", "SW 7015", "SW 7019", "SW 7069", "SW 6258"] },
  { name: "Jewel tones", colors: ["SW 7004", "SW 6391", "SW 7585", "SW 6244", "SW 6216"] },
];

const MAX_COLORS = 6;

export function StylePanel() {
  const style = usePlan((s) => s.plan!.style);
  const setStyle = usePlan((s) => s.setStyle);
  const rooms = usePlan((s) => s.plan!.rooms);
  const select = usePlan((s) => s.select);
  const set = (patch: Partial<StyleProfile>) => setStyle({ ...style, ...patch });
  const full = style.palette.length >= MAX_COLORS;
  const add = (c: SwColor) => {
    if (full || style.palette.includes(swRef(c))) return;
    set({ palette: [...style.palette, swRef(c)] });
  };

  const toggleStyle = (s: string) =>
    set({ styles: style.styles.includes(s) ? style.styles.filter((x) => x !== s) : [...style.styles, s] });

  return (
    <div className="inspector style-panel">
      <p className="muted small">The whole house's taste, used for shopping, suggestions and redesigns. A room can add what it's for and its own style: select the room.</p>
      <h3>Style</h3>
      <div className="chips">
        {STYLE_OPTIONS.map((s) => (
          <button key={s} className={`chip ${style.styles.includes(s) ? "on" : ""}`} onClick={() => toggleStyle(s)} aria-pressed={style.styles.includes(s)}>
            {s}
          </button>
        ))}
      </div>

      <h3>Color palette <span className="muted small">Sherwin-Williams</span></h3>
      <div className="sw-chips">
        {style.palette.map((c, i) => {
          const sw = findSw(c);
          return (
            <div key={`${c}-${i}`} className="sw-chip">
              <span className="sw-dot" style={{ background: entryHex(c) }} />
              <span className="sw-text">
                <strong>{sw ? `SW ${sw.number}` : c}</strong>
                {sw && <span className="muted small">{sw.name}</span>}
              </span>
              <button className="link" aria-label={`Remove ${describeEntry(c, false)}`} title="Remove"
                onClick={() => set({ palette: style.palette.filter((_, j) => j !== i) })}>×</button>
            </div>
          );
        })}
        {style.palette.length === 0 && <span className="muted small">No colors yet.</span>}
      </div>
      <SwPicker onPick={add} disabled={full} taken={style.palette}
        placeholder={full ? "Palette is full (6 colors)" : "Add a color: name or number, e.g. Alabaster or 7008"} />
      {style.palette.length > 0 && <button className="link" onClick={() => set({ palette: [] })}>Clear palette</button>}
      {(style.palette.length === 1 || style.palette.length === 2) && (
        <div className="palette-suggest">
          <p className="small">
            <strong>Round out your palette.</strong> Five colors give you walls, larger pieces, your{" "}
            {style.palette.length === 1 ? "color" : "colors"}, an accent and a grounding dark
            {style.styles.length ? `, tuned for ${style.styles.join(" + ")}` : ""}.
          </p>
          {suggestPalettes(style.palette, style.styles).map((p) => (
            <div key={p.name} className="suggestion-row">
              <div className="suggestion-swatches">
                {p.colors.map((c) => (
                  <span key={c} style={{ background: entryHex(c) }} title={describeEntry(c, false) + (style.palette.includes(c) ? " (yours)" : "")}
                    className={style.palette.includes(c) ? "yours" : undefined} />
                ))}
              </div>
              <div className="suggestion-text">
                <strong>{p.name}</strong>
                <span className="muted small">{p.why}</span>
                <span className="sw-names small">{p.colors.filter((c) => !style.palette.includes(c)).map((c) => describeEntry(c, false)).join(" · ")}</span>
              </div>
              <button onClick={() => set({ palette: p.colors })}>Use</button>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">Or start from a preset:</p>
      <div className="presets">
        {PALETTES.map((p) => (
          <button key={p.name} className="preset" onClick={() => set({ palette: p.colors })} title={p.colors.map((c) => describeEntry(c, false)).join("\n")}>
            {p.colors.map((c) => <span key={c} style={{ background: entryHex(c) }} />)}
            <em>{p.name}</em>
          </button>
        ))}
      </div>

      <h3>Wall colors by room</h3>
      {rooms.length === 0 ? <p className="muted small">No rooms yet.</p> : (
        <ul className="room-paint-list">
          {rooms.map((r) => (
            <li key={r.id}>
              <button className="link" onClick={() => select({ room: r.id })}>{r.name}</button>
              {r.paint?.walls ? (
                <span className="room-paint-colors" title={describePaint(r.paint, false)}>
                  {[r.paint.walls, r.paint.accent, r.paint.trim, r.paint.ceiling].filter((e): e is string => !!e).map((e, i) => <SwDot key={i} entry={e} size={16} />)}
                  <span className="small">{describeEntry(r.paint.walls, false)}</span>
                </span>
              ) : <span className="muted small">Not set</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Select a room to set its wall, accent, trim and ceiling colors.</p>

      <label className="field">
        <span>Avoid</span>
        <input value={style.avoid} placeholder="e.g. glass tops, faux leather, white upholstery" onChange={(e) => set({ avoid: e.target.value })} />
      </label>
      <label className="field">
        <span>Budget</span>
        <input value={style.budgetNote} placeholder="e.g. mid-range, under $800 per piece" onChange={(e) => set({ budgetNote: e.target.value })} />
      </label>
    </div>
  );
}
