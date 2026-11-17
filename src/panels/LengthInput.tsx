import { useEffect, useState } from "react";
import { formatForInput, parseLength, type UnitSystem } from "../model/units";

interface Props {
  value: number | null;
  units: UnitSystem;
  onChange: (inches: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  label: string;
}

/** Text field that accepts 6' 8", 80", 203 cm, etc. Commits on blur or Enter. */
export function LengthInput({ value, units, onChange, allowEmpty, min = 1, label }: Props) {
  const shown = value == null ? "" : formatForInput(value, units);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);

  const commit = () => {
    if (text.trim() === "" && allowEmpty) {
      setBad(false);
      if (value !== null) onChange(null);
      return;
    }
    const n = parseLength(text, units);
    if (n === null || n < min) {
      setBad(true);
      return;
    }
    setBad(false);
    if (value === null || Math.abs(n - value) > 0.01) onChange(n);
    else setText(shown);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        className={bad ? "invalid" : undefined}
        value={text}
        placeholder={allowEmpty ? "optional" : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(shown);
            setBad(false);
          }
        }}
        title={bad ? "Try 6' 8\", 80\", or 203 cm" : undefined}
      />
    </label>
  );
}
