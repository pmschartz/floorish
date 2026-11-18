import { useState } from "react";
import { remeasureWalls } from "../detect/remeasure";
import { preparePlanImage } from "../detect/pixels";
import { usePlan } from "../state/planStore";

/** Re-measure wall thickness from the floor plan image for rooms already on the plan. Free: no Claude. */
export function RemeasureWalls() {
  const plan = usePlan((s) => s.plan)!;
  const applyPlan = usePlan((s) => s.applyPlan);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!plan.image || !plan.pxPerInch || plan.rooms.length === 0) return null;

  const run = async () => {
    setBusy(true);
    setNote("");
    try {
      const img = await preparePlanImage(plan.image!.url);
      const current = usePlan.getState().plan!;
      const r = remeasureWalls(current, img.mask, img.fill);
      applyPlan((p) => ({ ...p, rooms: r.rooms, items: r.items, wallThickness: r.wallThickness }));
      setNote(`Done. Walls between rooms now meet, and the typical wall is ${r.wallThickness}". Undo if you liked it better before.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="remeasure">
      <h3>Walls</h3>
      <p className="muted small">Walls look thin, or don't meet between rooms? Measure them again from the floor plan. Free, and doesn't ask Claude.</p>
      <button onClick={run} disabled={busy}>{busy ? "Measuring…" : "Re-measure walls"}</button>
      {note && <p className="small">{note}</p>}
    </section>
  );
}
