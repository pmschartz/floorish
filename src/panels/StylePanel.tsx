import { useState } from "react";
import { STYLE_OPTIONS, type StyleProfile } from "../../shared/schemas";
import { usePlan } from "../state/planStore";

const PALETTES: Array<{ name: string; colors: string[] }> = [
  { name: "Warm neutrals", colors: ["#f5efe6", "#d9c7b0", "#a68a64", "#6b4f3a", "#2f2a26"] },
  { name: "Coastal", colors: ["#f7f7f2", "#cfe3e8", "#7fa7b5", "#2e5e73", "#d8c3a5"] },
  { name: "Earthy", colors: ["#efe6d8", "#c8a27c", "#8f6a48", "#5c6b4f", "#3b3b30"] },
  { name: "Monochrome", colors: ["#ffffff", "#d9d9d9", "#8c8c8c", "#3d3d3d", "#111111"] },
  { name: "Jewel tones", colors: ["#1f4e5f", "#7a2e3a", "#c9a227", "#2e5d3a", "#f2ece4"] },
];

const MAX_COLORS = 6;

export function StylePanel() {
  const style = usePlan((s) => s.plan!.style);
  const setStyle = usePlan((s) => s.setStyle);
  const [pick, setPick] = useState("#8f6a48");
  const set = (patch: Partial<StyleProfile>) => setStyle({ ...style, ...patch });

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

      <h3>Color palette</h3>
      <div className="swatches">
        {style.palette.map((c, i) => (
          <button key={`${c}-${i}`} className="swatch" style={{ background: c }} title={`${c}, click to remove`}
            onClick={() => set({ palette: style.palette.filter((_, j) => j !== i) })} />
        ))}
        {style.palette.length === 0 && <span className="muted small">No colors yet.</span>}
      </div>
      <div className="row">
        <input type="color" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick a color" />
        <button disabled={style.palette.length >= MAX_COLORS} onClick={() => set({ palette: [...style.palette, pick] })}>
          Add color
        </button>
        {style.palette.length > 0 && <button className="link" onClick={() => set({ palette: [] })}>Clear</button>}
      </div>
      <p className="muted small">Or start from a preset:</p>
      <div className="presets">
        {PALETTES.map((p) => (
          <button key={p.name} className="preset" onClick={() => set({ palette: p.colors })} title={p.name}>
            {p.colors.map((c) => <span key={c} style={{ background: c }} />)}
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
