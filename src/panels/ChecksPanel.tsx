import type { Issue } from "../checks/layoutChecks";
import { canvasApi } from "../canvas/canvasApi";
import { usePlan } from "../state/planStore";

const KIND_TEXT: Record<Issue["kind"], string> = {
  overlap: "Overlap",
  "outside-room": "Walls",
  clearance: "Clearance",
  "door-swing": "Door",
};

export function ChecksPanel({ issues }: { issues: Issue[] }) {
  const plan = usePlan((s) => s.plan)!;
  const select = usePlan((s) => s.select);

  if (plan.items.length === 0) {
    return <div className="inspector"><p className="muted">Add furniture and the layout checks will run as you go.</p></div>;
  }
  if (issues.length === 0) {
    return (
      <div className="inspector">
        <p className="ok-text">No layout problems found.</p>
        <p className="muted small">Checked overlaps, walls{plan.rooms.length ? "" : " (trace rooms to enable)"}, walkway clearances, and door swings.</p>
      </div>
    );
  }
  return (
    <div className="inspector">
      <ul className="issues">
        {issues.map((is) => (
          <li key={is.id}>
            <button
              className={`issue ${is.severity}`}
              onClick={() => {
                select({ item: is.itemIds[0] });
                canvasApi.focusItem(is.itemIds[0]);
              }}
            >
              <span className={`badge ${is.severity}`}>{KIND_TEXT[is.kind]}</span>
              <span>{is.message}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">Click an issue to select the piece. Clearances follow common guidelines; trust your own judgment for your space.</p>
    </div>
  );
}
