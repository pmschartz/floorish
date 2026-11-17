import type { Plan } from "../../shared/schemas";
import { canvasApi } from "../canvas/canvasApi";
import { roomFor } from "../checks/layoutChecks";
import { formatDims, type UnitSystem } from "./units";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safe = (s: string) => s.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "plan";

/** Export the whole plan (not just the visible area) as a PNG. */
export function exportPng(plan: Plan, contentPx: { w: number; h: number }) {
  const stage = canvasApi.stage;
  if (!stage) return;
  const prev = { scale: stage.scaleX(), x: stage.x(), y: stage.y(), w: stage.width(), h: stage.height() };
  const tr = stage.findOne("Transformer");
  tr?.hide();
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  stage.size({ width: contentPx.w, height: contentPx.h });
  const pixelRatio = Math.min(2, 8000 / Math.max(contentPx.w, contentPx.h));
  const url = stage.toDataURL({ x: 0, y: 0, width: contentPx.w, height: contentPx.h, pixelRatio });
  stage.scale({ x: prev.scale, y: prev.scale });
  stage.position({ x: prev.x, y: prev.y });
  stage.size({ width: prev.w, height: prev.h });
  tr?.show();
  stage.batchDraw();
  fetch(url).then((r) => r.blob()).then((b) => download(`${safe(plan.name)}.png`, b));
}

function shoppingRows(plan: Plan, units: UnitSystem) {
  return plan.items
    .filter((i) => i.status === "to-buy")
    .map((i) => {
      const picks = (i.shopResults?.products ?? []).filter((p) => p.fit === "fits" || p.fit === "tight").slice(0, 3);
      return {
        item: i.label || i.category || "Unlabeled",
        category: i.category,
        room: roomFor(i, plan.rooms)?.name ?? "",
        size: formatDims(i.width, i.depth, units) + (i.height ? ` × ${Math.round(i.height)}" H` : ""),
        notes: i.notes,
        picks,
      };
    });
}

export function exportShoppingMarkdown(plan: Plan, units: UnitSystem) {
  const rows = shoppingRows(plan, units);
  const lines = [`# Shopping list: ${plan.name}`, ""];
  if (plan.style.styles.length) lines.push(`Style: ${plan.style.styles.join(", ")}`, "");
  for (const r of rows) {
    lines.push(`## ${r.item}${r.room ? ` (${r.room})` : ""}`, `- Size: ${r.size}`);
    if (r.notes) lines.push(`- Notes: ${r.notes}`);
    for (const p of r.picks) {
      lines.push(`- [${p.name}](${p.url}) at ${p.retailer}${p.price != null ? `, $${p.price}` : ""} (${p.fit}: ${p.fitNote})`);
    }
    if (!r.picks.length) lines.push("- No saved products yet");
    lines.push("");
  }
  if (!rows.length) lines.push("Nothing is marked “To buy” yet.");
  download(`${safe(plan.name)}-shopping.md`, new Blob([lines.join("\n")], { type: "text/markdown" }));
}

export function exportShoppingCsv(plan: Plan, units: UnitSystem) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const out = [["Item", "Category", "Room", "Size", "Notes", "Product", "Retailer", "Price", "Fit", "URL"].map(esc).join(",")];
  for (const r of shoppingRows(plan, units)) {
    if (!r.picks.length) out.push([r.item, r.category, r.room, r.size, r.notes, "", "", "", "", ""].map(esc).join(","));
    for (const p of r.picks) {
      out.push([r.item, r.category, r.room, r.size, r.notes, p.name, p.retailer, p.price ?? "", p.fit, p.url].map(esc).join(","));
    }
  }
  download(`${safe(plan.name)}-shopping.csv`, new Blob([out.join("\n")], { type: "text/csv" }));
}
