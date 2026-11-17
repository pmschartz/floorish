import { useMemo, useState } from "react";
import { CATALOG, CUSTOM_SHAPES, type CatalogEntry } from "../catalog/furniture";
import { canvasApi, DRAG_MIME } from "../canvas/canvasApi";
import { formatDims } from "../model/units";
import { effectivePpi, usePlan } from "../state/planStore";

function ShapeIcon({ shape }: { shape: CatalogEntry["shape"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      {shape === "circle" ? <circle cx="9" cy="9" r="6.5" {...common} />
        : shape === "L" ? <path d="M2.5 2.5h13v5h-8v8h-5z" {...common} />
        : shape === "U" ? <path d="M2.5 2.5h13v13h-4v-9h-5v9h-4z" {...common} />
        : shape === "door" ? <><path d="M3 15V3" {...common} /><path d="M3 3a12 12 0 0 1 12 12" {...common} strokeDasharray="2 2" /></>
        : shape === "window" ? <><rect x="2" y="7" width="14" height="4" {...common} /><path d="M2 9h14" {...common} /></>
        : <rect x="2.5" y="4.5" width="13" height="9" rx="1" {...common} />}
    </svg>
  );
}

export function LibraryPanel() {
  const plan = usePlan((s) => s.plan)!;
  const units = usePlan((s) => s.units);
  const [q, setQ] = useState("");
  const ready = effectivePpi(plan) !== null;

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (c: CatalogEntry) => !needle || c.label.toLowerCase().includes(needle) || c.category.includes(needle);
    const out = new Map<string, CatalogEntry[]>();
    for (const c of [...CUSTOM_SHAPES, ...CATALOG].filter(match)) {
      out.set(c.group, [...(out.get(c.group) ?? []), c]);
    }
    return [...out.entries()];
  }, [q]);

  const addAtCenter = (entry: CatalogEntry) => {
    const at = canvasApi.centerInches();
    if (at) usePlan.getState().addItem(entry, at);
  };

  return (
    <aside className="panel library">
      <div className="panel-head">
        <h2>Furniture</h2>
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search furniture" />
      </div>
      {!ready && <p className="notice">Set the scale first so furniture is drawn at its real size.</p>}
      <div className="library-list">
        {groups.map(([group, entries]) => (
          <section key={group}>
            <h3>{group}</h3>
            {entries.map((c) => (
              <button
                key={c.key}
                className="library-item"
                draggable={ready}
                disabled={!ready}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, c.key);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addAtCenter(c)}
                title="Drag onto the plan, or click to add in the middle of the view"
              >
                <ShapeIcon shape={c.shape} />
                <span className="library-label">{c.label}</span>
                <span className="library-dims">{formatDims(c.width, c.depth, units)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
