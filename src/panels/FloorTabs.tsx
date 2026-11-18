import { useEffect, useRef, useState } from "react";
import type { PlanSummary } from "../../shared/schemas";
import { api } from "../api/client";
import { useHouse } from "../state/houseStore";
import { flushSave, usePlan } from "../state/planStore";
import { confirmDialog, notify } from "../ui/dialog";

const goTo = async (planId: string) => {
  await flushSave();
  window.location.hash = `#/plan/${planId}`;
};

/**
 * The plan's name in the toolbar. For a floor of a house: the house name, then a tab per floor
 * (double-click the open floor's tab to rename it), then + to add a floor. For a plan on its
 * own: its name, and + to turn it into a house with more floors.
 */
export function FloorTabs() {
  const plan = usePlan((s) => s.plan)!;
  const rename = usePlan((s) => s.rename);
  const house = useHouse((s) => s.house);
  const inHouse = !!house && plan.houseId === house.id;

  if (!inHouse) {
    return (
      <div className="floor-bar">
        <input className="plan-name" value={plan.name} onChange={(e) => rename(e.target.value)} aria-label="Plan name" />
        <AddFloor />
      </div>
    );
  }
  return (
    <div className="floor-bar">
      <HouseName />
      <div className="floor-tabs" role="tablist" aria-label="Floors">
        {house.floorPlans.map((f) => (f.id === plan.id ? <ActiveFloor key={f.id} /> : (
          <button key={f.id} role="tab" aria-selected="false" className="floor-tab" onClick={() => void goTo(f.id)}>{f.name}</button>
        )))}
        <AddFloor />
      </div>
    </div>
  );
}

function HouseName() {
  const house = useHouse((s) => s.house)!;
  const [name, setName] = useState(house.name);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setName(house.name), [house.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="plan-name" value={name} aria-label="House name" onChange={(e) => {
      const v = e.target.value;
      setName(v);
      useHouse.setState({ house: { ...useHouse.getState().house!, name: v } });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void api.updateHouse(house.id, { name: v }).catch(() => {}), 600);
    }} />
  );
}

/**
 * The open floor's tab. Click for its menu (rename, move, take out of the house, delete);
 * double-click to rename straight away.
 */
function ActiveFloor() {
  const plan = usePlan((s) => s.plan)!;
  const rename = usePlan((s) => s.rename);
  const house = useHouse((s) => s.house)!;
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ids = house.floorPlans.map((f) => f.id);
  const at = ids.indexOf(plan.id);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setOpen(false);
    try {
      await fn();
    } catch (e) {
      notify("Couldn't change the floors", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const move = (by: -1 | 1) => act(async () => {
    const order = [...ids];
    [order[at], order[at + by]] = [order[at + by], order[at]];
    // Show the new order straight away; the server confirms it.
    useHouse.setState({ house: { ...house, floors: order, floorPlans: order.map((id) => house.floorPlans.find((f) => f.id === id)!) } });
    useHouse.setState({ house: await api.updateHouse(house.id, { floors: order }) });
  });

  const takeOut = () => act(async () => {
    const ok = await confirmDialog({
      title: `Take “${plan.name}” out of ${house.name}?`,
      message: `It becomes a plan of its own, called “${house.name} ${plan.name}”, with its rooms and furniture. It keeps the house style but no longer shares it. You can add it back with + on any floor.`,
      confirmLabel: "Take it out",
    });
    if (!ok) return;
    await flushSave();
    await api.removeFloor(house.id, plan.id);
    await usePlan.getState().loadPlan(plan.id);
  });

  const remove = () => act(async () => {
    const ok = await confirmDialog({
      title: `Delete the ${plan.name} floor?`,
      message: `Its rooms, furniture and floor plan image are deleted for good. The rest of ${house.name} stays. This can't be undone.`,
      confirmLabel: "Delete floor",
      danger: true,
    });
    if (!ok) return;
    const next = ids[at + 1] ?? ids[at - 1];
    await api.deletePlan(plan.id);
    window.location.hash = next ? `#/plan/${next}` : "#/";
  });

  if (editing) {
    return (
      <input className="floor-tab on editing" autoFocus defaultValue={plan.name} aria-label="Floor name"
        onBlur={(e) => { rename(e.target.value.trim() || plan.name); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }} />
    );
  }
  return (
    <div className="floor-menu-anchor" ref={ref}>
      <button role="tab" aria-selected="true" aria-haspopup="menu" aria-expanded={open} className="floor-tab on"
        title="Floor options (double-click to rename)" disabled={busy}
        onClick={() => setOpen(!open)} onDoubleClick={() => { setOpen(false); setEditing(true); }}>
        {plan.name}
        <svg className="floor-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="menu-items floor-menu" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); setEditing(true); }}>Rename floor</button>
          {ids.length > 1 && (
            <>
              <button role="menuitem" disabled={at <= 0} onClick={() => void move(-1)}>Move left</button>
              <button role="menuitem" disabled={at >= ids.length - 1} onClick={() => void move(1)}>Move right</button>
            </>
          )}
          <hr />
          <button role="menuitem" onClick={() => void takeOut()}>Take out of {house.name}</button>
          <button role="menuitem" className="danger" onClick={() => void remove()}>Delete floor…</button>
        </div>
      )}
    </div>
  );
}

/** + : a new blank floor, or an existing plan as another floor of this house. */
function AddFloor() {
  const plan = usePlan((s) => s.plan)!;
  const house = useHouse((s) => s.house);
  const inHouse = !!house && plan.houseId === house.id;
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void api.listPlans().then((all) => setPlans(all.filter((p) => !p.houseId && p.id !== plan.id))).catch(() => setPlans([]));
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open, plan.id]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      await flushSave();
      const next = await fn();
      setOpen(false);
      // The server renamed this plan and gave it a house, so load it fresh even if staying on it.
      if (next === plan.id) await usePlan.getState().loadPlan(plan.id);
      else await goTo(next);
    } catch (e) {
      notify("Couldn't add the floor", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // A plan on its own becomes a house first (named after the plan), then gets the new floor.
  const houseId = async () => (inHouse ? house!.id : (await api.createHouse([plan.id], plan.name)).id);
  const newFloor = () => run(async () => (await api.addFloor(await houseId(), {})).planId);
  const addExisting = (p: PlanSummary) => run(async () => {
    if (inHouse) await api.addFloor(house!.id, { planId: p.id });
    else await api.createHouse([plan.id, p.id]);
    return plan.id;
  });

  return (
    <div className="add-floor" ref={ref}>
      <button className="floor-add" title="Add a floor" aria-label="Add a floor" aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy}>+</button>
      {open && (
        <div className="menu-items add-floor-menu" role="menu">
          <p className="menu-note">{inHouse ? `Add a floor to ${house!.name}` : "Turn this into a house with more floors. The floors share one house style."}</p>
          <button role="menuitem" onClick={() => void newFloor()} disabled={busy}>New blank floor</button>
          {plans.length > 0 && <p className="menu-note">Or add an existing plan as a floor</p>}
          {plans.map((p) => (
            <button key={p.id} role="menuitem" onClick={() => void addExisting(p)} disabled={busy}>{p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
