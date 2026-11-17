import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { PlanSummary } from "../shared/schemas";
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
import { DetectPanel } from "./panels/DetectPanel";
import { useDetect } from "./detect/detectStore";
import { effectivePpi, flushSave, GRID_PPI, usePlan, type Tool } from "./state/planStore";

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
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.listPlans().then(setPlans).catch((e) => setErr(e.message));
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
        <h1>House Planner</h1>
        <p className="muted">Upload a floor plan, lay out what you own, and find furniture that fits.</p>
      </header>
      <form className="new-plan" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name, e.g. Maple St house" aria-label="Plan name" />
        <button className="primary" type="submit">New plan</button>
      </form>
      {err && <p className="error-text">{err}. Is the API server running?</p>}
      {plans && plans.length === 0 && <p className="muted">No plans yet. Create one to get started.</p>}
      <ul className="plan-list">
        {plans?.map((p) => (
          <li key={p.id}>
            <a href={`#/plan/${p.id}`}>
              <strong>{p.name}</strong>
              <span className="muted small">Edited {new Date(p.updatedAt).toLocaleString()}{p.hasImage ? "" : " · no floor plan"}</span>
            </a>
            <button
              className="link danger"
              onClick={async () => {
                if (!confirm(`Delete “${p.name}”? This can't be undone.`)) return;
                await api.deletePlan(p.id);
                load();
              }}
            >
              Delete
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
  const [gridChosen, setGridChosen] = useState(false);
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
          {showUpload && <UploadOverlay onGrid={() => setGridChosen(true)} />}
        </main>
        <aside className="panel right">
          {detecting ? (
            <div className="tab-body"><DetectPanel /></div>
          ) : (<>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "selected"} className={tab === "selected" ? "on" : ""} onClick={() => setTab("selected")}>
              {selectedItemId ? "Item" : selectedRoomId ? "Room" : "Plan"}
            </button>
            <button role="tab" aria-selected={tab === "style"} className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Style</button>
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
  const { setTool, setUnits, rename, setCleanView } = usePlan.getState();
  const detectStatus = useDetect((s) => s.status);
  const canUndo = useStore(usePlan.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(usePlan.temporal, (s) => s.futureStates.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const ppi = effectivePpi(plan);

  const upload = useUpload(setUploading);
  const contentPx = plan.image ? { w: plan.image.widthPx, h: plan.image.heightPx } : { w: 600 * (ppi ?? GRID_PPI), h: 480 * (ppi ?? GRID_PPI) };

  return (
    <header className="toolbar">
      <a href="#/" className="back" title="All plans" onClick={() => void flushSave()}>←</a>
      <input className="plan-name" value={plan.name} onChange={(e) => rename(e.target.value)} aria-label="Plan name" />
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
        <button disabled={!canUndo} title="Undo (⌘Z)" onClick={() => usePlan.temporal.getState().undo()}>Undo</button>
        <button disabled={!canRedo} title="Redo (⇧⌘Z)" onClick={() => usePlan.temporal.getState().redo()}>Redo</button>
      </div>
      <div className="tool-group">
        <button onClick={() => setUnits(units === "imperial" ? "metric" : "imperial")} title="Switch units">
          {units === "imperial" ? "ft / in" : "m / cm"}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : plan.image ? "Replace plan" : "Upload plan"}
        </button>
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }} />
        <details className="menu">
          <summary>Export</summary>
          <div className="menu-items" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}>
            <button onClick={() => exportPng(plan, contentPx)}>Plan as PNG</button>
            <button onClick={() => exportShoppingMarkdown(plan, units)}>Shopping list (Markdown)</button>
            <button onClick={() => exportShoppingCsv(plan, units)}>Shopping list (CSV)</button>
          </div>
        </details>
      </div>
      <span className={`save-status ${saveStatus}`} title={saveError ?? undefined}>
        {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : saveStatus === "saved" ? "Saved" : ""}
      </span>
    </header>
  );
}

function useUpload(setBusy: (b: boolean) => void) {
  return async (file: File) => {
    const plan = usePlan.getState().plan;
    if (!plan) return;
    if (plan.image && !confirm("Replace the floor plan image? You'll need to calibrate again; rooms and furniture stay where they are in inches.")) return;
    setBusy(true);
    try {
      await flushSave();
      const img = await prepareFloorPlan(file);
      const updated = await api.uploadImage(plan.id, img.blob, img.width, img.height);
      usePlan.getState().setPlan(updated);
      usePlan.getState().setTool("calibrate");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      const s = usePlan.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) usePlan.temporal.getState().redo();
        else usePlan.temporal.getState().undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        usePlan.temporal.getState().redo();
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
