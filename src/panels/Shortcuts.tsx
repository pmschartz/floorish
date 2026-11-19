import { useEffect, useRef } from "react";
import { create } from "zustand";

/** Whether the keyboard shortcuts card is showing (toggled by the ? button or the ? key). */
export const useShortcuts = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

const GROUPS: Array<[string, Array<[string[], string]>]> = [
  ["Tools", [[["V"], "Select"], [["H"], "Pan"], [["C"], "Calibrate"], [["R"], "Draw a room"], [["B"], "Draw a rectangle room"]]],
  ["Selecting", [[["Shift", "click"], "Add or remove a piece"], [["drag"], "Select everything in a box"], [["⌘", "A"], "Select all furniture"], [["Esc"], "Clear the selection"]]],
  ["View", [[["Space", "drag"], "Pan"], [["Middle", "drag"], "Pan"], [["Two-finger", "scroll"], "Pan"], [["Pinch"], "Zoom (or mouse wheel)"], [["⌘", "+"], "Zoom in"], [["⌘", "−"], "Zoom out"], [["⌘", "0"], "Fit the plan"]]],
  ["Editing", [[["⌫"], "Delete"], [["⌘", "D"], "Duplicate"], [["←↑→↓"], "Nudge 1″"], [["Shift", "←↑→↓"], "Nudge 6″"], [["Alt", "drag"], "Move without snapping"]]],
  ["History", [[["⌘", "Z"], "Undo"], [["⇧", "⌘", "Z"], "Redo"]]],
];

/** A ? button that opens a card listing the keyboard shortcuts. */
export function ShortcutsButton() {
  const { open, toggle, close } = useShortcuts();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => close, [close]); // closed when leaving the plan
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open, close]);

  return (
    <div className="shortcuts-anchor" ref={ref}>
      <button className={open ? "on" : ""} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" aria-expanded={open} onClick={toggle}>?</button>
      {open && (
        <div className="shortcuts-card" role="dialog" aria-label="Keyboard shortcuts">
          <h2>Keyboard shortcuts</h2>
          {GROUPS.map(([name, rows]) => (
            <section key={name}>
              <h3>{name}</h3>
              <dl>
                {rows.map(([keys, what]) => (
                  <div key={what + keys.join()}>
                    <dt>{what}</dt>
                    <dd>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
