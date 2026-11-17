export type UnitSystem = "imperial" | "metric";

const CM_PER_IN = 2.54;

/** Format inches for display, e.g. 80 → 6' 8"  or  203 cm */
export function formatLength(inches: number, units: UnitSystem): string {
  if (units === "metric") {
    const cm = inches * CM_PER_IN;
    return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;
  }
  const total = Math.round(inches * 2) / 2; // nearest half inch
  const neg = total < 0;
  const abs = Math.abs(total);
  const ft = Math.floor(abs / 12);
  const inch = abs - ft * 12;
  const inchStr = Number.isInteger(inch) ? `${inch}` : inch.toFixed(1);
  const s = ft > 0 ? (inch === 0 ? `${ft}'` : `${ft}' ${inchStr}"`) : `${inchStr}"`;
  return neg ? `-${s}` : s;
}

/** Short form for compact labels: 80 → 80"  or  203 */
export function formatShort(inches: number, units: UnitSystem): string {
  return units === "metric" ? `${Math.round(inches * CM_PER_IN)}` : `${Math.round(inches * 10) / 10}`;
}

export function formatDims(w: number, d: number, units: UnitSystem): string {
  const u = units === "metric" ? " cm" : '"';
  return `${formatShort(w, units)} × ${formatShort(d, units)}${u}`;
}

export function formatArea(sqIn: number, units: UnitSystem): string {
  if (units === "metric") return `${(sqIn * CM_PER_IN * CM_PER_IN / 10000).toFixed(1)} m²`;
  return `${Math.round(sqIn / 144)} sq ft`;
}

/**
 * Parse what someone types into a length field. Accepts:
 *   12'  12ft  12' 6"  12'6  12 ft 6 in  150"  150 in  150  (bare number = default unit)
 *   3.5m  203cm  2030mm
 * Returns inches, or null if it can't be read.
 */
export function parseLength(raw: string, defaultUnits: UnitSystem): number | null {
  const s = raw.trim().toLowerCase().replace(/[″”]/g, '"').replace(/[′’]/g, "'").replace(/\s+/g, " ");
  if (!s) return null;

  const metric = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m)$/);
  if (metric) {
    const n = parseFloat(metric[1]);
    const cm = metric[2] === "mm" ? n / 10 : metric[2] === "m" ? n * 100 : n;
    return cm / CM_PER_IN;
  }

  const ftIn = s.match(/^(-?\d*\.?\d+)\s*(?:'|ft|feet|foot)\s*(?:(\d*\.?\d+)\s*(?:"|in|inch|inches)?)?$/);
  if (ftIn) return parseFloat(ftIn[1]) * 12 + (ftIn[2] ? parseFloat(ftIn[2]) : 0);

  const inOnly = s.match(/^(-?\d*\.?\d+)\s*(?:"|in|inch|inches)$/);
  if (inOnly) return parseFloat(inOnly[1]);

  const bare = s.match(/^(-?\d*\.?\d+)$/);
  if (bare) {
    const n = parseFloat(bare[1]);
    return defaultUnits === "metric" ? n / CM_PER_IN : n;
  }
  return null;
}

/** Format for an editable input so parseLength reads it back exactly. */
export function formatForInput(inches: number, units: UnitSystem): string {
  if (units === "metric") return `${Math.round(inches * CM_PER_IN * 10) / 10} cm`;
  return `${Math.round(inches * 100) / 100}"`;
}
