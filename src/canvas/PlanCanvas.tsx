import type Konva from "konva";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import type { Point } from "../../shared/schemas";
import { ALL_ENTRIES, clearancesFor, PASSIVE_CATEGORIES } from "../catalog/furniture";
import type { Issue } from "../checks/layoutChecks";
import { clearanceZone } from "../model/geometry";
import { formatLength } from "../model/units";
import { effectivePpi, usePlan } from "../state/planStore";
import { CalibrateDialog } from "./CalibrateTool";
import { canvasApi, DRAG_MIME } from "./canvasApi";
import { FurnitureShape } from "./FurnitureShape";
import { CleanRoomLayer, DraftPath, PaintBands, RoomLayer } from "./RoomLayer";
import { DetectionPreview } from "./DetectionPreview";
import { RoomLabels } from "./RoomLabels";
import { RoomEditHandles } from "./RoomEditHandles";
import { moveRoomEdge } from "../model/roomEdit";
import { useDetect } from "../detect/detectStore";
import { PLAN } from "./theme";
import { GRID_EXTENT, planPage } from "./page";
import { ShortcutsButton } from "../panels/Shortcuts";

function useHtmlImage(url: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return setImg(null);
    const el = new window.Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => {
      el.onload = null;
    };
  }, [url]);
  return img;
}

const SNAP_PX = 10; // screen pixels for snapping to existing room corners

export function PlanCanvas({ issues }: { issues: Issue[] }) {
  const plan = usePlan((s) => s.plan)!;
  const tool = usePlan((s) => s.tool);
  const units = usePlan((s) => s.units);
  const selectedItemId = usePlan((s) => s.selectedItemId);
  const selectedRoomId = usePlan((s) => s.selectedRoomId);
  const { select, updateItem, addItem, addRoom, calibrate, setTool } = usePlan.getState();

  const ppi = effectivePpi(plan);
  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId) ?? null;
  const img = useHtmlImage(plan.image?.url);
  const clean = usePlan((st) => st.cleanView) && !!ppi;
  const review = useDetect((st) => (st.status === "review" ? st : null));
  // While reviewing a detection that will replace your rooms, show only the new ones.
  const hideReplaced = !!review?.replace;
  const shownRooms = hideReplaced ? [] : plan.rooms;
  const isOpening = (shape: string) => shape === "door" || shape === "window" || shape === "opening" || shape === "fixture";

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [calib, setCalib] = useState<number | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [shiftDown, setShiftDown] = useState(false);

  // Content size in image pixels: the image (or grid), or in clean view just around the rooms.
  const content = useMemo(() => {
    if (plan.image) return { w: plan.image.widthPx, h: plan.image.heightPx };
    return { w: GRID_EXTENT.w * (ppi ?? 2), h: GRID_EXTENT.h * (ppi ?? 2) };
  }, [plan.image, ppi]);
  const page = useMemo(() => planPage(plan, ppi, clean), [plan, ppi, clean]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const pad = 40;
    const scale = Math.min((size.w - pad * 2) / page.w, (size.h - pad * 2) / page.h);
    const s = Math.max(0.05, Math.min(scale, 8));
    setView({ scale: s, x: (size.w - page.w * s) / 2 - page.x * s, y: (size.h - page.h * s) / 2 - page.y * s });
  }, [size.w, size.h, page.x, page.y, page.w, page.h]);

  // Fit when a plan or its image changes (and once the container has a real size).
  const fittedFor = useRef("");
  useEffect(() => {
    const key = `${plan.id}:${plan.image?.url ?? "grid"}:${size.w > 100}:${clean}`;
    if (fittedFor.current !== key && size.w > 100) {
      fittedFor.current = key;
      fit();
    }
  }, [plan.id, plan.image?.url, size.w, clean, fit]);

  // Reset drafts when the tool changes.
  useEffect(() => {
    setDraft([]);
    setHover(null);
  }, [tool]);

  // Forget the stage when leaving the plan, so shortcuts like ⌘+ go back to the browser.
  useEffect(() => () => { canvasApi.stage = null; }, []);

  // Expose helpers for panels.
  useEffect(() => {
    canvasApi.stage = stageRef.current;
    canvasApi.fit = fit;
    canvasApi.zoom = (f) => setView((v) => zoomAt(v, size, f));
    canvasApi.centerInches = () => {
      if (!ppi) return null;
      return { x: (size.w / 2 - view.x) / view.scale / ppi, y: (size.h / 2 - view.y) / view.scale / ppi };
    };
    canvasApi.focusItem = (id) => {
      const it = usePlan.getState().plan?.items.find((i) => i.id === id);
      if (!it || !ppi) return;
      setView((v) => ({ ...v, x: size.w / 2 - it.x * ppi * v.scale, y: size.h / 2 - it.y * ppi * v.scale }));
    };
  });

  // Attach the transformer to the selected item.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selectedItemId && tool === "select" ? stage.findOne(`#item-${selectedItemId}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedItemId, tool, plan.items]);

  // Keyboard: space to pan, Enter/Escape for drafts, shift for ortho/free-rotate.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftDown(true);
      if (typing(e)) return;
      if (e.code === "Space" && !e.repeat) {
        setSpaceDown(true);
        e.preventDefault();
      }
      if (e.key === "Escape") {
        if (draft.length) setDraft([]);
        else if (tool !== "select") setTool("select");
      }
      if (e.key === "Enter" && tool === "room" && draft.length >= 3) finishRoom(draft);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftDown(false);
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  const pointer = (): Point | null => stageRef.current?.getRelativePointerPosition() ?? null;

  /** Snap to existing room corners, and constrain to horizontal/vertical with shift. */
  const adjust = (p: Point, prev: Point | undefined, shift: boolean): Point => {
    if (ppi) {
      const tol = SNAP_PX / view.scale;
      for (const r of plan.rooms) {
        for (const v of r.polygon) {
          const vp = { x: v.x * ppi, y: v.y * ppi };
          if (Math.hypot(vp.x - p.x, vp.y - p.y) < tol) return vp;
        }
      }
    }
    if (shift && prev) {
      return Math.abs(p.x - prev.x) > Math.abs(p.y - prev.y) ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
    }
    return p;
  };

  const finishRoom = (pts: Point[]) => {
    if (!ppi || pts.length < 3) return;
    addRoom(pts.map((p) => ({ x: p.x / ppi, y: p.y / ppi })));
    setDraft([]);
    setTool("select");
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceDown) return;
    const raw = pointer();
    if (!raw) return;

    if (tool === "select") {
      const t = e.target;
      if (t === stageRef.current || t.name() === "bg") select({ item: null, room: null });
      return;
    }
    if (tool === "calibrate") {
      const p = adjust(raw, draft[0], e.evt.shiftKey);
      if (draft.length === 0) setDraft([p]);
      else {
        const len = Math.hypot(p.x - draft[0].x, p.y - draft[0].y);
        if (len < 5) return;
        setDraft([draft[0], p]);
        setCalib(len);
      }
      return;
    }
    if (!ppi) return;
    if (tool === "room-rect") {
      const p = adjust(raw, undefined, false);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        if (Math.abs(p.x - a.x) < 3 || Math.abs(p.y - a.y) < 3) return;
        finishRoom([a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }]);
      }
      return;
    }
    if (tool === "room") {
      const p = adjust(raw, draft[draft.length - 1], e.evt.shiftKey);
      if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < SNAP_PX / view.scale) {
        finishRoom(draft);
        return;
      }
      const last = draft[draft.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) return; // double-click repeats
      setDraft([...draft, p]);
    }
  };

  const onMouseMove = () => {
    if (tool === "select" || tool === "pan") return;
    const raw = pointer();
    if (!raw) return;
    if (tool === "room-rect") return setHover(raw);
    setHover(draft.length ? adjust(raw, draft[draft.length - 1], shiftDown) : raw);
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    // Pinch-zoom on trackpads arrives as ctrl+wheel; two-finger scroll pans.
    const mouseWheel = e.evt.deltaX === 0 && (e.evt.deltaMode !== 0 || Math.abs(e.evt.deltaY) >= 50);
    if (!e.evt.ctrlKey && !e.evt.metaKey && !mouseWheel) {
      setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
      return;
    }
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
    setView((v) => {
      const s = Math.max(0.03, Math.min(20, v.scale * factor));
      const mx = (pos.x - v.x) / v.scale, my = (pos.y - v.y) / v.scale;
      return { scale: s, x: pos.x - mx * s, y: pos.y - my * s };
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData(DRAG_MIME);
    const entry = ALL_ENTRIES.find((c) => c.key === key);
    const stage = stageRef.current;
    if (!entry || !stage || !ppi) return;
    stage.setPointersPositions(e.nativeEvent);
    const p = stage.getRelativePointerPosition();
    if (!p) return;
    addItem(entry, { x: p.x / ppi, y: p.y / ppi });
    setTool("select");
  };

  const issueByItem = useMemo(() => {
    const m = new Map<string, "error" | "warning">();
    for (const is of issues) {
      // Overlaps and door swings involve every piece listed; a clearance issue belongs to the first.
      const ids = is.kind === "clearance" ? is.itemIds.slice(0, 1) : is.itemIds;
      for (const id of ids) {
        if (m.get(id) !== "error") m.set(id, is.severity);
      }
    }
    return m;
  }, [issues]);

  const items = useMemo(() => {
    const rank = (c: string, s: string) => (s === "fixture" ? 0 : c === "rug" ? 0.5 : s === "door" || s === "window" || s === "opening" ? 2 : 1);
    return [...plan.items].sort((a, b) => rank(a.category, a.shape) - rank(b.category, b.shape));
  }, [plan.items]);

  const selected = plan.items.find((i) => i.id === selectedItemId);
  const panMode = tool === "pan" || spaceDown;
  const cursor = panMode ? "grab" : tool === "select" ? "default" : "crosshair";

  // Scale bar: pick a round length that's ~80–160px on screen.
  const scaleBar = useMemo(() => {
    if (!ppi) return null;
    const pxPerIn = ppi * view.scale;
    const steps = units === "metric" ? [10, 25, 50, 100, 200, 500, 1000].map((cm) => cm / 2.54) : [6, 12, 24, 36, 60, 120, 240, 480];
    const len = steps.find((s) => s * pxPerIn >= 80) ?? steps[steps.length - 1];
    return { px: len * pxPerIn, label: formatLength(len, units) };
  }, [ppi, view.scale, units]);

  const draftColor = tool === "calibrate" ? PLAN.brick : PLAN.moss;
  const s = view.scale;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      style={{ cursor }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={s}
        scaleY={s}
        x={view.x}
        y={view.y}
        draggable={panMode || tool === "select"}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onWheel={onWheel}
        onClick={onStageClick}
        onDblClick={() => tool === "room" && draft.length >= 3 && finishRoom(draft)}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <Layer listening={false}>
          {clean ? (
            <Rect x={page.x} y={page.y} width={page.w} height={page.h} fill={PLAN.paper} />
          ) : img ? (
            <KImage image={img} width={content.w} height={content.h} />
          ) : (
            <GridBackground w={content.w} h={content.h} ppi={ppi ?? 2} scale={s} />
          )}
        </Layer>
        <Layer>
          <Rect name="bg" x={-1e5} y={-1e5} width={2e5} height={2e5} fill="transparent" />
          {ppi && !clean && (
            <RoomLayer rooms={shownRooms} ppi={ppi} stageScale={s} units={units} selectedRoomId={selectedRoomId}
              interactive={tool === "select"} onSelect={(id) => select({ room: id })} />
          )}
          {ppi && clean && (
            <CleanRoomLayer rooms={shownRooms} ppi={ppi} stageScale={s} units={units} selectedRoomId={selectedRoomId}
              interactive={tool === "select"} onSelect={(id) => select({ room: id })} wallThickness={plan.wallThickness} />
          )}
          {ppi && <PaintBands rooms={shownRooms} ppi={ppi} stageScale={s} />}
        </Layer>
        <Layer>
          {ppi && selected && !PASSIVE_CATEGORIES.has(selected.category) && (
            <Group listening={false}>
              {clearancesFor(selected).map((r) => {
                const blocked = issues.some((i) => i.id === `clearance:${selected.id}:${r.side}`);
                const z = clearanceZone(selected, r.side, r.dist);
                return (
                  <Line key={r.side} points={z.flatMap((p) => [p.x * ppi, p.y * ppi])} closed
                    fill={blocked ? "rgba(166,63,41,0.12)" : "rgba(62,106,75,0.12)"}
                    stroke={blocked ? PLAN.brick : PLAN.moss} strokeWidth={1 / s} dash={[4 / s, 3 / s]} />
                );
              })}
            </Group>
          )}
          {ppi &&
            items.filter((it) => !(hideReplaced && isOpening(it.shape))).map((it) => (
              <FurnitureShape
                key={it.id}
                item={it}
                ppi={ppi}
                stageScale={s}
                units={units}
                selected={it.id === selectedItemId}
                issue={issueByItem.get(it.id) ?? null}
                draggable={tool === "select" && !spaceDown}
                clean={clean}
                onSelect={(id) => tool === "select" && select({ item: id })}
                onChange={updateItem}
              />
            ))}
          <Transformer
            ref={trRef}
            rotateEnabled
            rotationSnaps={shiftDown ? [] : Array.from({ length: 24 }, (_, i) => i * 15)}
            rotationSnapTolerance={7}
            keepRatio={false}
            flipEnabled={false}
            ignoreStroke
            anchorSize={8}
            borderStroke={PLAN.lake}
            anchorStroke={PLAN.lake}
            anchorCornerRadius={2}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? oldBox : newBox)}
          />
        </Layer>
        <Layer listening={false}>
          {ppi && (
            <RoomLabels rooms={shownRooms} items={plan.items} ppi={ppi} stageScale={s} units={units} clean={clean}
              selectedRoomId={selectedRoomId} />
          )}
          {review?.proposal && (
            <DetectionPreview proposal={review.proposal} keepRoom={review.keepRoom} keepDoors={review.keepDoors}
              keepWindows={review.keepWindows} keepOpenings={review.keepOpenings} keepFixtures={review.keepFixtures}
              ppi={review.proposal.ppi} stageScale={s} />
          )}
          {(tool === "room" || tool === "calibrate") && draft.length > 0 && (
            <DraftPath points={draft} hover={calib ? null : hover} stageScale={s} color={draftColor} />
          )}
          {tool === "room-rect" && draft.length === 1 && hover && (
            <DraftPath
              points={[draft[0], { x: hover.x, y: draft[0].y }, hover, { x: draft[0].x, y: hover.y }]}
              hover={null}
              closed
              stageScale={s}
              color={draftColor}
            />
          )}
        </Layer>
        {/* Drag a selected room's walls in or out. */}
        {ppi && tool === "select" && !review?.proposal && selectedRoom && (
          <Layer>
            <RoomEditHandles room={selectedRoom} rooms={plan.rooms} ppi={ppi} stageScale={s}
              onMoveEdge={(edge, coord) => usePlan.getState().applyPlan((p) => moveRoomEdge(p, selectedRoom.id, edge, coord))} />
          </Layer>
        )}
      </Stage>

      {scaleBar && (
        <div className="scale-bar">
          <div className="scale-bar-line" style={{ width: scaleBar.px }} />
          <span>{scaleBar.label}</span>
        </div>
      )}

      <ToolHint tool={tool} draftLen={draft.length} calibrated={!!ppi} hasImage={!!plan.image} />

      <div className="zoom-controls">
        <button title="Zoom out (⌘−)" onClick={() => setView((v) => zoomAt(v, size, 1 / 1.25))}>−</button>
        <button title="Fit plan (⌘0)" onClick={fit}>Fit</button>
        <button title="Zoom in (⌘+)" onClick={() => setView((v) => zoomAt(v, size, 1.25))}>+</button>
        <span className="zoom-sep" aria-hidden />
        <ShortcutsButton />
      </div>

      {calib !== null && (
        <CalibrateDialog
          pxLength={calib}
          units={units}
          onCancel={() => {
            setCalib(null);
            setDraft([]);
          }}
          onSubmit={(ppiNew) => {
            calibrate(ppiNew);
            setCalib(null);
            setDraft([]);
            setTool("select");
          }}
        />
      )}
    </div>
  );
}

function zoomAt(v: { scale: number; x: number; y: number }, size: { w: number; h: number }, f: number) {
  const s = Math.max(0.03, Math.min(20, v.scale * f));
  const cx = size.w / 2, cy = size.h / 2;
  return { scale: s, x: cx - ((cx - v.x) / v.scale) * s, y: cy - ((cy - v.y) / v.scale) * s };
}

function GridBackground({ w, h, ppi, scale }: { w: number; h: number; ppi: number; scale: number }) {
  const lines: React.ReactNode[] = [];
  const step = 12 * ppi; // 1 ft
  for (let x = 0, i = 0; x <= w + 0.1; x += step, i++) {
    lines.push(<Line key={`v${i}`} points={[x, 0, x, h]} stroke={i % 5 === 0 ? PLAN.gridMajor : PLAN.grid} strokeWidth={1 / scale} />);
  }
  for (let y = 0, i = 0; y <= h + 0.1; y += step, i++) {
    lines.push(<Line key={`h${i}`} points={[0, y, w, y]} stroke={i % 5 === 0 ? PLAN.gridMajor : PLAN.grid} strokeWidth={1 / scale} />);
  }
  return (
    <>
      <Rect width={w} height={h} fill={PLAN.floor} />
      {lines}
    </>
  );
}

function ToolHint({ tool, draftLen, calibrated, hasImage }: { tool: string; draftLen: number; calibrated: boolean; hasImage: boolean }) {
  let text = "";
  if (hasImage && !calibrated && tool !== "calibrate") text = "Set the scale first: choose Calibrate (C), then click both ends of a wall with a known length.";
  else if (tool === "calibrate") text = draftLen === 0 ? "Click one end of a wall whose length you know." : "Click the other end. Hold Shift to keep it straight.";
  else if (tool === "room") text = draftLen < 3 ? "Click each corner of the room. Shift keeps lines straight." : "Click the first corner, double-click, or press Enter to finish. Esc cancels.";
  else if (tool === "room-rect") text = draftLen === 0 ? "Click one corner of the room." : "Click the opposite corner.";
  else if (tool === "pan") text = "Drag to move around. Scroll or pinch to zoom.";
  if (!text) return null;
  return <div className="tool-hint">{text}</div>;
}
