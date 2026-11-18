import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { House, PlanSummary } from "../shared/schemas";
import { api } from "./api/client";
import { canvasApi } from "./canvas/canvasApi";
import { PlanCanvas } from "./canvas/PlanCanvas";
import { runLayoutChecks } from "./checks/layoutChecks";
import { exportPng, exportShoppingCsv, exportShoppingMarkdown } from "./model/export";
import { prepareFloorPlan } from "./model/imageFile";
import { formatLength } from "./model/units";
import { ChecksPanel } from "./panels/ChecksPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { LibraryPanel } from "./panels/LibraryPanel";
import { StylePanel } from "./panels/StylePanel";
import { confirmDialog, notify } from "./ui/dialog";
import { SpendMeter } from "./panels/SpendMeter";
import { DetectPanel } from "./panels/DetectPanel";
import { useDetect } from "./detect/detectStore";
import { useShortcuts } from "./panels/Shortcuts";
import { FloorTabs } from "./panels/FloorTabs";
import { planPage } from "./canvas/page";
import { useGridChoice } from "./state/gridChoice";
import { effectivePpi, flushSave, usePlan, type Tool, redo, undo } from "./state/planStore";

function useHashRoute(): string | null {
  const [id, setId] = useState(planIdFromHash);
  useEffect(() => {
    const on = () => setId(planIdFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return id;
}

const planIdFromHash = () => window.location.hash.match(/^#\/plan\/([\w-]+)/)?.[1] ?? null;

/** "Today, 11:01 AM", "Nov 18, 11:01 AM", or with the year when it isn't this year. */
function editedAt(iso: string): string {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `today, ${time}`;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  return `${date}, ${time}`;
}

export default function App() {
  const planId = useHashRoute();
  const plan = usePlan((s) => s.plan);
  const [error, setError] = useState("");
  const loading = useRef<string | null>(null);

  useEffect(() => {
    if (!planId) {
      // Save any last edit, then unload, unless a plan was opened in the meantime.
      void flushSave().then(() => {
        if (!planIdFromHash()) usePlan.getState().closePlan();
      });
      return;
    }
    if (plan?.id === planId || loading.current === planId) return;
    loading.current = planId;
    setError("");
    flushSave()
      .then(() => usePlan.getState().loadPlan(planId))
      .catch((e) => setError(e.message))
      .finally(() => {
        loading.current = null;
      });
  }, [planId, plan?.id]);

  if (!planId) return <Home />;
  if (error) return <div className="centered"><p className="error-text">{error}</p><a href="#/">Back to plans</a></div>;
  if (!plan || plan.id !== planId) return <div className="centered muted">Loading…</div>;
  return <Editor />;
}

// ---------------- Home: list of plans ----------------

function Home() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = () => Promise.all([api.listPlans(), api.listHouses()])
    .then(([p, h]) => { setPlans(p); setHouses(h); })
    .catch((e) => setErr(e.message));
  const byId = new Map((plans ?? []).map((p) => [p.id, p]));
  // Houses (newest edit first), each with its floors in order; then plans that aren't floors.
  const houseRows = houses
    .map((h) => ({ house: h, floors: h.floors.map((f) => byId.get(f)).filter((p): p is PlanSummary => !!p) }))
    .filter((r) => r.floors.length)
    .map((r) => ({ ...r, updatedAt: r.floors.reduce((m, f) => (f.updatedAt > m ? f.updatedAt : m), "") }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const inHouse = new Set(houseRows.flatMap((r) => r.floors.map((f) => f.id)));
  const loose = (plans ?? []).filter((p) => !inHouse.has(p.id));
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = await api.createPlan(name.trim() || "My house");
    window.location.hash = `#/plan/${p.id}`;
  };

  return (
    <div className="home">
      <header>
        <img className="brand-lockup" src="/brand/floorish-lockup.svg" alt="Floorish" />
        <h1>Make room for what you love.</h1>
        <p className="tagline">Upload a floor plan, lay out what you own, and find furniture that fits.</p>
      </header>
      <form className="new-plan" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name, e.g. Maple St house" aria-label="Plan name" />
        <button className="primary" type="submit">New plan</button>
      </form>
      {err && <p className="error-text">{err}. Is the API server running?</p>}
      {plans && plans.length === 0 && <p className="muted">No plans yet. Create one to get started.</p>}
      <ul className="plan-list">
        {houseRows.map(({ house, floors, updatedAt }) => (
          <li key={house.id} className="house-row">
            <div className="house-main">
              <a href={`#/plan/${floors[0].id}`} className="house-link">
                <strong>{house.name}</strong>
                <span className="muted small">{floors.length} {floors.length === 1 ? "floor" : "floors"} · Edited {editedAt(updatedAt)}</span>
              </a>
              <div className="house-floors">
                {floors.map((f) => <a key={f.id} href={`#/plan/${f.id}`} className="floor-chip">{f.name}</a>)}
              </div>
            </div>
            <button
              className="icon-button plan-delete"
              aria-label={`Delete ${house.name}`}
              title="Delete house"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Delete “${house.name}”?`,
                  message: `Every floor (${floors.map((f) => f.name).join(", ")}) with its rooms, furniture and floor plan image is deleted for good. This can't be undone.`,
                  confirmLabel: "Delete house",
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.deleteHouse(house.id);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
                load();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            </button>
          </li>
        ))}
        {loose.map((p) => (
          <li key={p.id}>
            <a href={`#/plan/${p.id}`}>
              <strong>{p.name}</strong>
              <span className="muted small">Edited {editedAt(p.updatedAt)}{p.hasImage ? "" : " · no floor plan"}</span>
            </a>
            <button
              className="icon-button plan-delete"
              aria-label={`Delete ${p.name}`}
              title="Delete plan"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Delete “${p.name}”?`,
                  message: "Its rooms, furniture and floor plan image are deleted for good. This can't be undone.",
                  confirmLabel: "Delete plan",
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.deletePlan(p.id);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
                load();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Editor ----------------

type Tab = "selected" | "style" | "checks";

function Editor() {
  const plan = usePlan((s) => s.plan)!;
  const units = usePlan((s) => s.units);
  const selectedItemId = usePlan((s) => s.selectedItemId);
  const selectedRoomId = usePlan((s) => s.selectedRoomId);
  const [tab, setTab] = useState<Tab>("selected");
  const gridChosen = useGridChoice((s) => s.planId === plan.id);
  const detecting = useDetect((s) => s.status !== "idle");

  const issues = useMemo(
    () => runLayoutChecks(plan.items, plan.rooms, (n) => formatLength(n, units)),
    [plan.items, plan.rooms, units],
  );

  useEffect(() => {
    if (selectedItemId || selectedRoomId) setTab("selected");
  }, [selectedItemId, selectedRoomId]);

  useGlobalShortcuts();

  const showUpload = !plan.image && !gridChosen && plan.rooms.length === 0 && plan.items.length === 0;
  const errors = issues.filter((i) => i.severity === "error").length;

  return (
    <div className="editor">
      <Toolbar />
      <div className="editor-body">
        <LibraryPanel />
        <main className="canvas-area">
          <PlanCanvas issues={issues} />
          {showUpload && <UploadOverlay onGrid={() => useGridChoice.getState().choose(plan.id)} />}
        </main>
        <aside className="panel right">
          {detecting ? (
            <div className="tab-body"><DetectPanel /></div>
          ) : (<>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "selected"} className={tab === "selected" ? "on" : ""} onClick={() => setTab("selected")}>
              {selectedItemId ? "Item" : selectedRoomId ? "Room" : "Plan"}
            </button>
            <button role="tab" aria-selected={tab === "style"} className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>House style</button>
            <button role="tab" aria-selected={tab === "checks"} className={tab === "checks" ? "on" : ""} onClick={() => setTab("checks")}>
              Checks {issues.length > 0 && <span className={`count ${errors ? "error" : "warning"}`}>{issues.length}</span>}
            </button>
          </div>
          <div className="tab-body">
            {tab === "selected" && <InspectorPanel />}
            {tab === "style" && <StylePanel />}
            {tab === "checks" && <ChecksPanel issues={issues} />}
          </div>
          </>)}
        </aside>
      </div>
    </div>
  );
}

const TOOLS: Array<{ id: Tool; label: string; key: string; title: string }> = [
  { id: "select", label: "Select", key: "V", title: "Select and move furniture" },
  { id: "pan", label: "Pan", key: "H", title: "Move around the plan" },
  { id: "calibrate", label: "Calibrate", key: "C", title: "Set the scale from a wall of known length" },
  { id: "room", label: "Room", key: "R", title: "Trace a room corner by corner" },
  { id: "room-rect", label: "Rect room", key: "B", title: "Trace a rectangular room with two clicks" },
];

function Toolbar() {
  const plan = usePlan((s) => s.plan)!;
  const tool = usePlan((s) => s.tool);
  const units = usePlan((s) => s.units);
  const saveStatus = usePlan((s) => s.saveStatus);
  const saveError = usePlan((s) => s.saveError);
  const cleanView = usePlan((s) => s.cleanView);
  const { setTool, setUnits, setCleanView } = usePlan.getState();
  const detectStatus = useDetect((s) => s.status);
  const canUndo = useStore(usePlan.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(usePlan.temporal, (s) => s.futureStates.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const ppi = effectivePpi(plan);

  const upload = useUpload(setUploading);
  // What a PNG export covers: the same page the canvas shows (just around the rooms in clean view).
  const contentPx = planPage(plan, ppi, cleanView);

  return (
    <header className="toolbar">
      <a href="#/" className="back" title="All plans" aria-label="All plans" onClick={() => void flushSave()}>
        <img src="/brand/floorish-mark.svg" alt="" />
      </a>
      <FloorTabs />
      <div className="tool-group" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? "on" : ""}
            title={`${t.title} (${t.key})`}
            disabled={(t.id === "room" || t.id === "room-rect") && !ppi || (t.id === "calibrate" && !plan.image)}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button
          disabled={!plan.image || detectStatus === "running"}
          title="Find rooms, doors and windows in the floor plan automatically"
          onClick={() => void useDetect.getState().start()}
        >
          {detectStatus === "running" ? "Detecting…" : "Auto-detect"}
        </button>
        <button
          className={cleanView ? "on" : ""}
          disabled={!ppi}
          aria-pressed={cleanView}
          title="Redraw the plan from its rooms, walls, doors and windows instead of showing the uploaded image"
          onClick={() => setCleanView(!cleanView)}
        >
          Clean view
        </button>
      </div>
      <div className="tool-group">
        <button className="icon-tool" disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo" onClick={undo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button className="icon-tool" disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo" onClick={redo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>
      <div className="tool-group">
        {/* Upload stays in view until a floor has its plan; replacing it is rare, so it lives in the File menu. */}
        {(!plan.image || uploading) && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload plan"}
          </button>
        )}
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }} />
        <details className="menu">
          <summary>File</summary>
          <div className="menu-items" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}>
            {plan.image && <button onClick={() => fileRef.current?.click()} disabled={uploading}>Replace floor plan image…</button>}
            <button onClick={() => exportPng(plan, contentPx)}>Export plan as PNG</button>
            <button onClick={() => exportShoppingMarkdown(plan, units)}>Export shopping list (Markdown)</button>
            <button onClick={() => exportShoppingCsv(plan, units)}>Export shopping list (CSV)</button>
            <hr />
            <button onClick={() => setUnits(units === "imperial" ? "metric" : "imperial")}>
              Show sizes in {units === "imperial" ? "metric (m / cm)" : "feet and inches"}
            </button>
          </div>
        </details>
      </div>
      <div className="toolbar-status">
        <SpendMeter />
        {saveStatus === "saved" ? (
          <span className="save-status saved" title="All changes saved" role="status" aria-label="All changes saved">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        ) : (
          <span className={`save-status ${saveStatus}`} title={saveError ?? undefined} role="status">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : ""}
          </span>
        )}
      </div>
    </header>
  );
}

function useUpload(setBusy: (b: boolean) => void) {
  return async (file: File) => {
    const plan = usePlan.getState().plan;
    if (!plan) return;
    if (plan.image && !(await confirmDialog({
      title: "Replace the floor plan image?",
      message: "You'll need to calibrate again. Rooms and furniture stay where they are, in inches.",
      confirmLabel: "Replace image",
    }))) return;
    setBusy(true);
    try {
      await flushSave();
      const img = await prepareFloorPlan(file);
      const updated = await api.uploadImage(plan.id, img.blob, img.width, img.height);
      usePlan.getState().setPlan(updated);
      usePlan.getState().setTool("calibrate");
    } catch (e) {
      void notify("Couldn't upload the floor plan", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
}

function UploadOverlay({ onGrid }: { onGrid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const upload = useUpload(setBusy);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`upload-overlay ${over ? "over" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
    >
      <div className="upload-card">
        <h2>Add your floor plan</h2>
        <p className="muted">Drop a PNG, JPG, SVG, or PDF here. A plan with at least one printed dimension works best.</p>
        <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Uploading…" : "Choose a file"}
        </button>
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }} />
        <button className="link" onClick={onGrid}>Or start on a blank grid</button>
      </div>
    </div>
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // ⌘+ / ⌘− / ⌘0 zoom the plan instead of the whole window (even while typing in a field).
      // Matched on the physical key too, since ⌘+ is really ⌘= on most keyboards.
      if (mod && !e.altKey && canvasApi.stage) {
        const zoomIn = e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd";
        const zoomOut = e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract";
        const reset = e.key === "0" || e.code === "Digit0" || e.code === "Numpad0";
        if (zoomIn || zoomOut || reset) {
          e.preventDefault();
          if (reset) canvasApi.fit();
          else canvasApi.zoom(zoomIn ? 1.25 : 1 / 1.25);
          return;
        }
      }
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      const s = usePlan.getState();
      const k = e.key.toLowerCase();
      if (e.key === "?" && !mod) {
        e.preventDefault();
        useShortcuts.getState().toggle();
        return;
      }

      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const sel = s.plan?.items.find((i) => i.id === s.selectedItemId);
      if (mod && k === "d" && sel) {
        e.preventDefault();
        s.duplicateItem(sel.id);
        return;
      }
      if (mod) return;
      if ((e.key === "Delete" || e.key === "Backspace") && (sel || s.selectedRoomId)) {
        e.preventDefault();
        if (sel) s.removeItem(sel.id);
        else if (s.selectedRoomId) s.removeRoom(s.selectedRoomId);
        return;
      }
      if (sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 6 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        s.updateItem(sel.id, { x: sel.x + dx, y: sel.y + dy });
        return;
      }
      const ppi = effectivePpi(s.plan);
      const toolKeys: Record<string, Tool> = { v: "select", h: "pan", c: "calibrate", r: "room", b: "room-rect" };
      const tool = toolKeys[k];
      if (tool) {
        if ((tool === "room" || tool === "room-rect") && !ppi) return;
        if (tool === "calibrate" && !s.plan?.image) return;
        s.setTool(tool);
      }
      if (k === "f") canvasApi.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
