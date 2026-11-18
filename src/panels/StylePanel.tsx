import { useState } from "react";
import { STYLE_OPTIONS, type StyleProfile } from "../../shared/schemas";
import { describeEntry, entryHex, findSw, nearestSw, searchSw, swRef, type SwColor } from "../../shared/sw";
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
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("#8f6a48");
  const set = (patch: Partial<StyleProfile>) => setStyle({ ...style, ...patch });
  const full = style.palette.length >= MAX_COLORS;
  const add = (c: SwColor) => {
    if (full || style.palette.includes(swRef(c))) return;
    set({ palette: [...style.palette, swRef(c)] });
    setQuery("");
  };
  const results = searchSw(query, 12);
  const nearest = nearestSw(match);

  const toggleStyle = (s: string) =>
    set({ styles: style.styles.includes(s) ? style.styles.filter((x) => x !== s) : [...style.styles, s] });

  return (
    <div className="inspector style-panel">
      <p className="muted small">Used for shopping and room suggestions across the whole plan.</p>
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
      <div className="sw-search">
        <input value={query} placeholder={full ? "Palette is full (6 colors)" : "Add a color: name or number, e.g. Alabaster or 7008"}
          disabled={full} onChange={(e) => setQuery(e.target.value)} aria-label="Search Sherwin-Williams colors"
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) add(results[0]); if (e.key === "Escape") setQuery(""); }} />
        {query.trim() && (
          <ul className="sw-results" role="listbox">
            {results.map((c) => (
              <li key={c.number}>
                <button onClick={() => add(c)} disabled={style.palette.includes(swRef(c))}>
                  <span className="sw-dot" style={{ background: c.hex }} />
                  <span>SW {c.number} <strong>{c.name}</strong></span>
                  <span className="muted small">{c.family || ""}{c.family ? " · " : ""}LRV {c.lrv}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="muted small">No Sherwin-Williams color matches “{query}”.</li>}
          </ul>
        )}
      </div>
      <div className="row sw-match">
        <input type="color" value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match a color to Sherwin-Williams" />
        <span className="sw-dot" style={{ background: nearest.hex }} />
        <span className="small">Closest: SW {nearest.number} {nearest.name}</span>
        <button disabled={full || style.palette.includes(swRef(nearest))} onClick={() => add(nearest)}>Add</button>
        {style.palette.length > 0 && <button className="link" onClick={() => set({ palette: [] })}>Clear</button>}
      </div>
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
