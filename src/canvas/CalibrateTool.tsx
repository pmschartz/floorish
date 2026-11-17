import { useState } from "react";
import { parseLength, type UnitSystem } from "../model/units";

interface Props {
  pxLength: number;
  units: UnitSystem;
  onSubmit: (pxPerInch: number) => void;
  onCancel: () => void;
}

/** Asks how long the line the user just drew is, then reports pixels per inch. */
export function CalibrateDialog({ pxLength, units, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");
  const parsed = parseLength(value, units);
  const valid = parsed !== null && parsed > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(pxLength / parsed!);
        }}
      >
        <h3>How long is that line?</h3>
        <p className="muted">
          Use a wall with a dimension printed on the plan. Longer lines give a more accurate scale.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={units === "metric" ? "e.g. 3.6 m or 360 cm" : `e.g. 12' 6" or 150"`}
          aria-label="Length of the line"
        />
        {value && !valid && <p className="error-text">Couldn't read that. Try 12' 6", 150", or 381 cm.</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!valid}>Set scale</button>
        </div>
      </form>
    </div>
  );
}
