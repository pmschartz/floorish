import { nanoid } from "nanoid";
import { useMemo, useState } from "react";
import type { ChatMessage, Item, Plan, Room, RoomVersion } from "../../shared/schemas";
import { api } from "../api/client";
import { confirmDialog } from "../ui/dialog";
import { runLayoutChecks } from "../checks/layoutChecks";
import { bbox, itemCorners, pointInPolygon } from "../model/geometry";
import { applyChatChanges, buildRoomContext, placedToItems, repairLayout } from "../model/roomContext";
import {
  addVersion,
  deleteVersion,
  duplicateVersion,
  ensureVersions,
  renameVersion,
  replaceLiveFurniture,
  roomFurniture,
  switchVersion,
  versionItems,
} from "../model/versions";
import { usePlan, keepRoomResult, undo } from "../state/planStore";

/** A room's versions, the redesign brief, and the room chat. */
export function RoomDesignPanel({ room }: { room: Room }) {
  return (
    <section className="room-design">
      <h3>Design with Claude</h3>
      {/* Versions only once there's more than the room as it is. */}
      {room.versions?.length ? <VersionStrip room={room} /> : null}
      <RedesignForm room={room} />
      <RoomChat room={room} />
    </section>
  );
}

// ---------------- Versions ----------------

function Thumb({ plan, room, items, active }: { plan: Plan; room: Room; items: Item[]; active: boolean }) {
  const b = bbox(room.polygon);
  const pad = 6;
  const fixtures = plan.items.filter((i) => i.shape === "fixture" && pointInPolygon({ x: i.x, y: i.y }, room.polygon, 0));
  const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`} className={active ? "thumb active" : "thumb"}
      preserveAspectRatio="xMidYMid meet" aria-hidden>
      <polygon points={poly(room.polygon)} fill="#f6f2ec" stroke="#2b2b2b" strokeWidth={Math.max(b.width, b.height) / 40} />
      {fixtures.map((f) => <polygon key={f.id} points={poly(itemCorners(f))} fill="#e4e1dc" stroke="#9a958e" strokeWidth={0.6} />)}
      {items.map((i) => (
        <polygon key={i.id} points={poly(itemCorners(i))} fill={i.category === "rug" ? "rgba(168,85,247,0.15)" : "#9fb7c9"}
          stroke="#3c5a70" strokeWidth={0.8} />
      ))}
    </svg>
  );
}

function VersionStrip({ room }: { room: Room }) {
  const plan = usePlan((s) => s.plan)!;
  const applyPlan = usePlan((s) => s.applyPlan);
  const [renaming, setRenaming] = useState<string | null>(null);
  const versions: RoomVersion[] = room.versions?.length
    ? room.versions
    : [{ id: "__current", name: "Current", createdAt: "", brief: "", concept: "", items: [] }];
  const activeId = room.activeVersionId ?? "__current";

  const issuesFor = (items: Item[]) => {
    const built = plan.items.filter((i) => ["door", "window", "opening", "fixture"].includes(i.shape));
    return runLayoutChecks([...built, ...items], [room]).filter((i) => i.itemIds.some((id) => items.some((it) => it.id === id))).length;
  };

  return (
    <section className="versions">
      <h4>Versions</h4>
      <div className="version-strip">
        {versions.map((v) => {
          const items = v.id === "__current" ? roomFurniture(plan.items, room) : versionItems(plan, room, v);
          const active = v.id === activeId;
          const issues = issuesFor(items);
          return (
            <button key={v.id} className={`version ${active ? "on" : ""}`} title={v.concept || v.name}
              onClick={() => !active && applyPlan((p) => switchVersion(p, room.id, v.id))}>
              <Thumb plan={plan} room={room} items={items} active={active} />
              {renaming === v.id ? (
                <input autoFocus defaultValue={v.name} onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { applyPlan((p) => renameVersion(p, room.id, v.id, e.target.value || v.name)); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
              ) : (
                <span className="version-name">{v.name}</span>
              )}
              <span className="version-meta">{items.length} pieces{issues ? ` · ${issues} ${issues === 1 ? "issue" : "issues"}` : ""}</span>
            </button>
          );
        })}
      </div>
      {room.versions?.length ? (
        <div className="row version-actions">
          <button className="link" onClick={() => setRenaming(activeId)}>Rename</button>
          <button className="link" onClick={() => applyPlan((p) => {
            const { plan: p2, id } = duplicateVersion(p, room.id, activeId);
            return switchVersion(p2, room.id, id);
          })}>Duplicate</button>
          {versions.length > 1 && (
            <select value="" onChange={async (e) => {
              const id = e.target.value;
              const name = versions.find((v) => v.id === id)?.name ?? "this version";
              if (id && await confirmDialog({ title: `Delete “${name}”?`, message: "Its furniture goes with it. You can undo this.", confirmLabel: "Delete version", danger: true })) {
                applyPlan((p) => deleteVersion(p, room.id, id));
              }
            }} aria-label="Delete a version">
              <option value="">Delete…</option>
              {versions.filter((v) => v.id !== activeId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <p className="muted small">Redesign the room or chat about it to make other versions. Click one to swap it in.</p>
      )}
      {(() => {
        const active = room.versions?.find((v) => v.id === activeId);
        return active?.concept && active.name !== "Current" ? <p className="small concept">{active.concept}</p> : null;
      })()}
    </section>
  );
}

// ---------------- Redesign ----------------

function RedesignForm({ room }: { room: Room }) {
  const plan = usePlan((s) => s.plan)!;
  const applyPlan = usePlan((s) => s.applyPlan);
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [fromScratch, setFromScratch] = useState(true);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [fengShui, setFengShui] = useState(true);
  const [count, setCount] = useState(2);
  const [reusedNote, setReusedNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const current = useMemo(() => roomFurniture(plan.items, room), [plan.items, room]);

  const go = async (force = false) => {
    setBusy(true);
    setError("");
    setResult("");
    setReusedNote(false);
    try {
      const { data: res, reused } = await api.redesignRoom({
        force,
        context: buildRoomContext(plan, room),
        brief,
        keepIds: fromScratch ? [] : [...keep],
        principles: fengShui ? ["feng shui"] : [],
        count,
      });
      let moved = 0, unresolved = 0;
      // A saved answer can repeat layouts the room already has; don't add them twice.
      const existing = new Set((room.versions ?? []).map((v) => v.name + "\n" + v.concept));
      const layouts = res.layouts.filter((l) => !existing.has(l.name + "\n" + l.concept));
      if (reused) setReusedNote(true);
      if (!layouts.length) {
        setResult("You asked for exactly this before, and those layouts are already in Versions. No charge.");
        return;
      }
      applyPlan((p) => {
        let next = ensureVersions(p, room.id);
        const r = next.rooms.find((x) => x.id === room.id)!;
        let first: string | null = null;
        for (const layout of layouts) {
          const items = placedToItems(next, r, layout.items, () => nanoid(8));
          const fixed = repairLayout(next, r, items);
          moved += fixed.moved;
          unresolved += fixed.unresolved;
          const added = addVersion(next, room.id, { name: layout.name, concept: layout.concept, brief, items: fixed.items });
          next = added.plan;
          first ??= added.id;
        }
        return first ? switchVersion(next, room.id, first) : next;
      });
      setResult(
        (reused ? "Same request as before, so these are the saved layouts (no charge). " : "") +
        `Added ${layouts.length} ${layouts.length === 1 ? "version" : "versions"}; showing the first.` +
          (moved ? ` Nudged ${moved} ${moved === 1 ? "piece" : "pieces"} to fit.` : "") +
          (unresolved ? ` ${unresolved} still need a look (see Checks).` : ""),
      );
      if (!reused) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="redesign">
        <button className="primary wide" onClick={() => setOpen(true)}>Redesign this room…</button>
        {result && <p className="small">{result}</p>}
      </section>
    );
  }
  const fresh = reusedNote && (
    <p className="small">
      {result}{" "}
      <button className="link" onClick={() => void go(true)} disabled={busy}>Get new layouts instead</button> (a new, paid request).
    </p>
  );
  return (
    <section className="redesign">
      <h4>Redesign {room.name}</h4>
      <label className="field">
        <span>What do you want from this room?</span>
        <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. A calm home office for one, mid-century, room for a reading chair. Desk should face the door." />
      </label>
      <div className="checks-list">
        <label><input type="radio" checked={fromScratch} onChange={() => setFromScratch(true)} /> Start from scratch</label>
        <label><input type="radio" checked={!fromScratch} onChange={() => setFromScratch(false)} disabled={!current.length} /> Keep some of what's there</label>
        {!fromScratch && current.map((i) => (
          <label key={i.id} className="indent">
            <input type="checkbox" checked={keep.has(i.id)} onChange={(e) => {
              const k = new Set(keep);
              if (e.target.checked) k.add(i.id); else k.delete(i.id);
              setKeep(k);
            }} /> {i.label || i.category}
          </label>
        ))}
        <label><input type="checkbox" checked={fengShui} onChange={(e) => setFengShui(e.target.checked)} /> Follow feng shui (command position, open paths)</label>
        <label>
          Ideas:{" "}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="muted small">Uses your style and palette, the room's doors, windows and fixtures, and standard clearances. Takes a minute or two; a few cents.</p>
      <div className="row">
        <button className="primary" onClick={() => void go()} disabled={busy}>{busy ? "Designing…" : `Get ${count} ${count === 1 ? "layout" : "layouts"}`}</button>
        <button onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
      {busy && <p className="spinner-line small"><span className="spinner" aria-hidden /> Claude is laying out {room.name}…</p>}
      {error && <p className="error-text">{error}</p>}
      {fresh}
    </section>
  );
}

// ---------------- Chat ----------------

/** Only the most recent messages go to Claude: older ones cost more and rarely matter. */
const CHAT_HISTORY_SENT = 20;
/** How many messages a room keeps. */
const CHAT_KEPT = 60;

function RoomChat({ room }: { room: Room }) {
  const applyPlan = usePlan((s) => s.applyPlan);
  const msgs: ChatMessage[] = room.chat ?? [];
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Saved with the room (no Undo step), so a reload doesn't lose the conversation.
  const save = (m: ChatMessage[]) => keepRoomResult(room.id, { chat: m.slice(-CHAT_KEPT) });
  const at = () => new Date().toISOString();

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    const plan = usePlan.getState().plan!;
    const r = plan.rooms.find((x) => x.id === room.id)!;
    const active = r.versions?.find((v) => v.id === r.activeVersionId);
    const withUser: ChatMessage[] = [...msgs, { role: "user", text: message, changed: [], at: at() }];
    setPending(message);
    setText("");
    setBusy(true);
    setError("");
    try {
      const res = await api.roomChat({
        context: buildRoomContext(plan, r),
        versionName: active?.name ?? "Current",
        history: msgs.slice(-CHAT_HISTORY_SENT).map((m) => ({ role: m.role, text: m.changed.length ? `${m.text}\n(Changes made: ${m.changed.join(", ")})` : m.text })),
        message,
      });
      let changed: string[] = [];
      if (res.changes.length) {
        applyPlan((p) => {
          let next = ensureVersions(p, room.id);
          let rr = next.rooms.find((x) => x.id === room.id)!;
          // Keep the real-life arrangement intact: chat edits go into a copy of "Current".
          const act = rr.versions!.find((v) => v.id === rr.activeVersionId)!;
          if (act.id === rr.versions![0].id && act.name === "Current") {
            const dup = duplicateVersion(next, room.id, act.id);
            next = switchVersion(renameVersion(dup.plan, room.id, dup.id, "Chat ideas"), room.id, dup.id);
            rr = next.rooms.find((x) => x.id === room.id)!;
          }
          const out = applyChatChanges(next, rr, res.changes, () => nanoid(8));
          changed = out.summary;
          return replaceLiveFurniture(next, room.id, out.items);
        });
      }
      save([...withUser, { role: "assistant", text: res.reply, changed, at: at() }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setText(message); // put the message back so it can be sent again
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section className="room-chat">
      <h4>Talk it through</h4>
      {msgs.length === 0 && !pending && (
        <p className="muted small">
          Ask about this room with the whole house in view, e.g. “Where should the desk go for good feng shui?” or
          “Swap the armchair for a reading nook by the window.” Changes go into a version you can flip back from.
        </p>
      )}
      <div className="chat-log">
        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <p>{m.text}</p>
            {m.changed.length > 0 && (
              <p className="chat-changes small">
                Changed: {m.changed.join(", ")}.{" "}
                {i === msgs.length - 1 && <button className="link" onClick={undo}>Undo</button>}
              </p>
            )}
          </div>
        ))}
        {pending && <div className="chat-msg user"><p>{pending}</p></div>}
        {busy && <p className="spinner-line small"><span className="spinner" aria-hidden /> Thinking…</p>}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="chat-input">
        <textarea rows={2} value={text} placeholder={`Ask about ${room.name}…`} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className="primary" onClick={send} disabled={busy || !text.trim()}>Send</button>
      </div>
    </section>
  );
}
