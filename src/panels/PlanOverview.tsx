import { useState } from "react";
import { useDetect } from "../detect/detectStore";
import { exportShoppingMarkdown } from "../model/export";
import { onboardingSteps, planSummary, type Step } from "../model/planProgress";
import { formatArea, formatDims } from "../model/units";
import { usePlan } from "../state/planStore";
import { useGridChoice } from "../state/gridChoice";
import { RemeasureWalls } from "./RemeasureWalls";
import { SwDot } from "./SwPicker";

const hiddenKey = (planId: string) => `checklistHidden:${planId}`;
const readHidden = (planId: string) => { try { return localStorage.getItem(hiddenKey(planId)) === "1"; } catch { return false; } };
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * The Plan tab with nothing selected. While you're setting up it's a checklist; once the
 * plan has rooms it becomes a summary: rooms to jump to, and what's left to buy.
 */
export function PlanOverview() {
  const plan = usePlan((s) => s.plan)!;
  const gridChosen = useGridChoice((s) => s.planId === plan.id);
  const steps = onboardingSteps(plan, gridChosen);
  const [hidden, setHidden] = useState(() => readHidden(plan.id));
  const allDone = steps.every((s) => s.done);
  const showChecklist = !allDone && !hidden;

  return (
    <div className="inspector overview">
      {showChecklist && (
        <Checklist steps={steps} onHide={() => {
          setHidden(true);
          try { localStorage.setItem(hiddenKey(plan.id), "1"); } catch { /* private window */ }
        }} />
      )}
      {plan.rooms.length > 0 && <Summary />}
      {plan.rooms.length === 0 && !showChecklist && (
        <p className="muted">No rooms yet. Use Auto-detect, or draw them with the Room tools.</p>
      )}
    </div>
  );
}

function Checklist({ steps, onHide }: { steps: Step[]; onHide: () => void }) {
  const plan = usePlan((s) => s.plan)!;
  const setTool = usePlan((s) => s.setTool);
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.id;

  const detail: Record<Step["id"], React.ReactNode> = {
    upload: <p>Drop in an image or PDF of your floor plan, or start on a blank grid.</p>,
    calibrate: (
      <>
        <p>Click both ends of a wall you know the length of, then type its length.</p>
        <button className="primary" onClick={() => setTool("calibrate")}>Set the scale</button>
      </>
    ),
    rooms: (
      <>
        {plan.image ? (
          <>
            <p>We can find the rooms, doors and windows for you, or you can draw them.</p>
            <div className="row">
              <button className="primary" onClick={() => void useDetect.getState().start()}>Find rooms for me</button>
              <button onClick={() => setTool("room-rect")}>Draw a room</button>
            </div>
          </>
        ) : (
          <>
            <p>Drag out each room on the grid. You can type exact sizes afterwards.</p>
            <button className="primary" onClick={() => setTool("room-rect")}>Draw a room</button>
          </>
        )}
      </>
    ),
    furniture: <p>Drag pieces from the Furniture list onto the plan. Mark each one as yours, planned or to buy.</p>,
    ideas: <p>Select a room and ask what's missing, or select a piece and shop for one that fits.</p>,
  };

  return (
    <section className="checklist" aria-label="Getting started">
      <div className="checklist-head">
        <h3>Getting started</h3>
        <span className="muted small">{done} of {steps.length}</span>
      </div>
      <div className="checklist-bar" aria-hidden><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "done" : s.id === current ? "current" : ""}>
            <span className="check" aria-hidden>
              {s.done && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </span>
            <div>
              <span className="step-title">{s.title}<span className="visually-hidden">{s.done ? " (done)" : ""}</span></span>
              {s.id === current && <div className="step-detail">{detail[s.id]}</div>}
            </div>
          </li>
        ))}
      </ol>
      <button className="link small checklist-hide" onClick={onHide}>Hide checklist</button>
    </section>
  );
}

function Summary() {
  const plan = usePlan((s) => s.plan)!;
  const units = usePlan((s) => s.units);
  const select = usePlan((s) => s.select);
  const sum = planSummary(plan);
  const remeasure = !!plan.image && !!plan.pxPerInch;

  return (
    <>
      <section className="plan-stats" aria-label="This plan">
        <div><strong>{formatArea(sum.area, units)}</strong><span>Floor area</span></div>
        <div><strong>{sum.rooms.length}</strong><span>{sum.rooms.length === 1 ? "Room" : "Rooms"}</span></div>
        <div><strong>{sum.pieces}</strong><span>{sum.pieces === 1 ? "Piece" : "Pieces"}</span></div>
        <div><strong>{sum.toBuy.length}</strong><span>To buy</span></div>
      </section>

      <section className="plan-rooms">
        <h3>Rooms</h3>
        <ul className="pick-list">
          {sum.rooms.map(({ room, area, pieces }) => (
            <li key={room.id}>
              <button onClick={() => select({ room: room.id })}>
                {room.paint?.walls ? <SwDot entry={room.paint.walls} size={12} /> : <span className="dot-blank" />}
                <span className="pick-name">{room.name}</span>
                <span className="pick-meta">{pieces ? `${pieces} ${pieces === 1 ? "piece" : "pieces"} · ` : ""}<span className="mono">{formatArea(area, units)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="plan-to-buy">
        <div className="section-head">
          <h3>To buy</h3>
          {sum.estimate.priced > 0 && (
            <span className="small to-buy-total" title="The lowest saved price for each piece that's been shopped for">
              {money(sum.estimate.total)}{sum.estimate.priced < sum.toBuy.length ? ` for ${sum.estimate.priced} of ${sum.toBuy.length}` : ""}
            </span>
          )}
        </div>
        {sum.toBuy.length ? (
          <>
            <ul className="pick-list">
              {sum.toBuy.map(({ item, room, price }) => (
                <li key={item.id}>
                  <button onClick={() => select({ item: item.id })}>
                    <span className="pick-name">{item.label}</span>
                    <span className="pick-meta">
                      {room ? `${room.name} · ` : ""}<span className="mono">{formatDims(item.width, item.depth, units)}</span>
                    </span>
                    <span className="pick-price">{price != null ? `from ${money(price)}` : item.shopResults ? "No price" : "Not shopped"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => exportShoppingMarkdown(plan, units)}>Export shopping list</button>
          </>
        ) : (
          <p className="muted small">Nothing yet. Select a piece and set it to “To buy”, or ask a room what's missing.</p>
        )}
      </section>

      {remeasure && (
        <details className="room-advanced">
          <summary>Plan tools <span className="muted small">Re-measure walls</span></summary>
          <div className="room-advanced-body"><RemeasureWalls /></div>
        </details>
      )}
    </>
  );
}
