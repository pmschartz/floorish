import { useState } from "react";
import { entryHex, findSw, nearestSw, searchSw, swRef, type SwColor } from "../../shared/sw";

/** A small color square for an SW reference. */
export function SwDot({ entry, size = 24 }: { entry: string; size?: number }) {
  return <span className="sw-dot" style={{ background: entryHex(entry), width: size, height: size }} />;
}

/**
 * Find a Sherwin-Williams color: search by name or number, match any picked color to its
 * nearest SW color, or pick from quick choices (such as the house palette).
 */
export function SwPicker({ onPick, disabled, placeholder, quick = [], quickLabel = "From your palette:", taken = [], autoFocus }: {
  onPick: (c: SwColor) => void;
  disabled?: boolean;
  placeholder?: string;
  /** SW references offered as one-click choices. */
  quick?: string[];
  quickLabel?: string;
  /** SW references that can't be picked again. */
  taken?: string[];
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("#8f6a48");
  const results = searchSw(query, 12);
  const nearest = nearestSw(match);
  const isTaken = (c: SwColor) => taken.includes(swRef(c));
  const pick = (c: SwColor) => {
    if (disabled || isTaken(c)) return;
    onPick(c);
    setQuery("");
  };
  const quickColors = quick.map(findSw).filter((c): c is SwColor => !!c);

  return (
    <div className="sw-picker">
      {quickColors.length > 0 && (
        <div className="sw-quick">
          <span className="muted small">{quickLabel}</span>
          {quickColors.map((c) => (
            <button key={c.number} className="sw-quick-btn" disabled={disabled || isTaken(c)} onClick={() => pick(c)}
              title={`SW ${c.number} ${c.name}`} aria-label={`Use SW ${c.number} ${c.name}`}>
              <span className="sw-dot" style={{ background: c.hex }} />
            </button>
          ))}
        </div>
      )}
      <div className="sw-search">
        <input value={query} placeholder={placeholder ?? "Name or number, e.g. Alabaster or 7008"} disabled={disabled}
          autoFocus={autoFocus} onChange={(e) => setQuery(e.target.value)} aria-label="Search Sherwin-Williams colors"
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0]); if (e.key === "Escape") setQuery(""); }} />
        {query.trim() && (
          <ul className="sw-results" role="listbox">
            {results.map((c) => (
              <li key={c.number}>
                <button onClick={() => pick(c)} disabled={isTaken(c)}>
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
        <input type="color" value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match a color to Sherwin-Williams" disabled={disabled} />
        <span className="sw-dot" style={{ background: nearest.hex }} />
        <span className="small">Closest: SW {nearest.number} {nearest.name}</span>
        <button disabled={disabled || isTaken(nearest)} onClick={() => pick(nearest)}>Use</button>
      </div>
    </div>
  );
}
