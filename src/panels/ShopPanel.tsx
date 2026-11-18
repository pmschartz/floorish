import { useState } from "react";
import { create } from "zustand";
import type { FitLabel, Item } from "../../shared/schemas";
import { api } from "../api/client";
import { roomFor } from "../checks/layoutChecks";
import { formatDims, formatLength } from "../model/units";
import { usePlan, keepResult } from "../state/planStore";
import { describePaint } from "../../shared/sw";

// Searches keep running (and save their results) even if you select something else.
const useShopJobs = create<{ running: Record<string, true>; errors: Record<string, string> }>(() => ({
  running: {},
  errors: {},
}));

async function runSearch(item: Item, opts: { under: number; over: number; maxPrice: number | null }) {
  const { plan } = usePlan.getState();
  if (!plan) return;
  const room = roomFor(item, plan.rooms);
  const notes = [item.notes, item.color ? `Preferred color: ${item.color}` : ""].filter(Boolean).join("\n");
  useShopJobs.setState((s) => ({ running: { ...s.running, [item.id]: true }, errors: { ...s.errors, [item.id]: "" } }));
  try {
    const results = await api.shop({
      label: item.label,
      category: item.category,
      width: item.width,
      depth: item.depth,
      height: item.height,
      toleranceUnder: opts.under,
      toleranceOver: opts.over,
      maxPrice: opts.maxPrice,
      notes,
      roomType: room?.type ?? null,
      roomPaint: describePaint(room?.paint),
      style: plan.style,
    });
    // The item may have been deleted while the search ran.
    if (usePlan.getState().plan?.items.some((i) => i.id === item.id)) {
      keepResult((p) => ({ ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, shopResults: results } : i)) }));
    }
  } catch (e) {
    useShopJobs.setState((s) => ({ errors: { ...s.errors, [item.id]: e instanceof Error ? e.message : String(e) } }));
  } finally {
    useShopJobs.setState((s) => {
      const running = { ...s.running };
      delete running[item.id];
      return { running };
    });
  }
}

const FIT_TEXT: Record<FitLabel, string> = { fits: "Fits", tight: "Tight", "too-big": "Too big", unknown: "Size unknown" };

export function ShopPanel({ item }: { item: Item }) {
  const units = usePlan((s) => s.units);
  const running = useShopJobs((s) => !!s.running[item.id]);
  const error = useShopJobs((s) => s.errors[item.id]);
  const [under, setUnder] = useState(2);
  const [over, setOver] = useState(1);
  const [maxPrice, setMaxPrice] = useState("");
  const [showAll, setShowAll] = useState(false);

  const what = item.label || item.category;
  const res = item.shopResults;
  const stale = res && (Math.abs(res.query.width - item.width) > 0.5 || Math.abs(res.query.depth - item.depth) > 0.5);
  const products = res ? (showAll ? res.products : res.products.filter((p) => p.fit !== "too-big")) : [];
  const hidden = res ? res.products.length - products.length : 0;

  const go = () => runSearch(item, { under, over, maxPrice: Number(maxPrice) > 0 ? Number(maxPrice) : null });

  return (
    <section className="shop">
      <h3>Shop for this</h3>
      {!what ? (
        <p className="muted">Give this shape a label or category first (e.g. “bookcase”) so we know what to look for.</p>
      ) : (
        <>
          <div className="row tight">
            <label className="field small">
              <span>Smaller by up to</span>
              <input type="number" min={0} value={under} onChange={(e) => setUnder(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="field small">
              <span>Larger by up to</span>
              <input type="number" min={0} value={over} onChange={(e) => setOver(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="field small">
              <span>Max price $</span>
              <input type="number" min={0} placeholder="any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </label>
          </div>
          <p className="muted small">Tolerances are in inches.</p>
          <button className="primary wide" onClick={go} disabled={running}>
            {running ? "Searching the web…" : res ? `Search again (${formatDims(item.width, item.depth, units)})` : `Find a ${what.toLowerCase()} that fits ${formatDims(item.width, item.depth, units)}`}
          </button>
          {running && <p className="muted small">Claude is searching retailers. This usually takes 30–90 seconds and costs a few cents.</p>}
          {error && <p className="error-text">{error}</p>}
        </>
      )}

      {res && (
        <div className="shop-results">
          <p className="muted small">
            {res.summary} <br />
            Searched {new Date(res.searchedAt).toLocaleString()} for {formatDims(res.query.width, res.query.depth, units)}.
          </p>
          {stale && <p className="notice">You've resized this shape since that search. Search again for the new size.</p>}
          {products.map((p, i) => (
            <article key={i} className={`product fit-${p.fit}`}>
              <div className="product-top">
                <a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a>
                <span className={`badge fit-${p.fit}`} title={p.fitNote}>{FIT_TEXT[p.fit]}</span>
              </div>
              <div className="product-meta">
                <span>{p.retailer}</span>
                {p.price != null && <span>{p.currency === "USD" ? "$" : `${p.currency} `}{p.price.toLocaleString()}</span>}
                <span>
                  {p.widthIn != null && p.depthIn != null
                    ? `${formatLength(p.widthIn, units)} W × ${formatLength(p.depthIn, units)} D${p.heightIn != null ? ` × ${formatLength(p.heightIn, units)} H` : ""}`
                    : "dimensions not listed"}
                </span>
              </div>
              <p className="small">{p.fitNote}</p>
              {(p.color || p.material) && <p className="small muted">{[p.color, p.material].filter(Boolean).join(" · ")}</p>}
              <p className="small">{p.whyItFits}</p>
              <p className="small muted">Dimensions from: {p.dimensionsSource}. Double-check on the retailer's page.</p>
            </article>
          ))}
          {hidden > 0 && (
            <button className="link" onClick={() => setShowAll(true)}>Show {hidden} that are too big</button>
          )}
          {res.products.length === 0 && <p className="muted">No matching products found. Try loosening the tolerances.</p>}
        </div>
      )}
    </section>
  );
}
