import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { SpendSummary } from "../shared/schemas";
import { DATA_DIR } from "./storage";

const FILE = path.join(DATA_DIR, "usage.jsonl");

/** The plan a request is for (from the X-Plan-Id header), so costs can be totted up per plan. */
export const requestPlan = new AsyncLocalStorage<string>();

export interface UsageRecord { at: string; kind: string; planId: string; model: string; cost: number; reused?: boolean }

export async function recordUsage(r: Omit<UsageRecord, "at" | "planId">) {
  const rec: UsageRecord = { at: new Date().toISOString(), planId: requestPlan.getStore() ?? "", ...r };
  await appendFile(FILE, JSON.stringify(rec) + "\n").catch((e) => console.error("Couldn't record usage:", e));
}

export async function spendSummary(planId: string): Promise<SpendSummary> {
  const text = await readFile(FILE, "utf8").catch(() => "");
  const today = new Date().toDateString();
  const out: SpendSummary = { today: 0, plan: 0, total: 0, calls: 0, byKind: [] };
  const kinds = new Map<string, { cost: number; calls: number }>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r: UsageRecord;
    try { r = JSON.parse(line); } catch { continue; }
    out.total += r.cost;
    if (new Date(r.at).toDateString() === today) out.today += r.cost;
    if (planId && r.planId === planId) {
      out.plan += r.cost;
      out.calls += 1;
      const kind = r.kind.replace(/ round \d+$/, "");
      const k = kinds.get(kind) ?? { cost: 0, calls: 0 };
      k.cost += r.cost;
      k.calls += 1;
      kinds.set(kind, k);
    }
  }
  out.byKind = [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.cost - a.cost);
  return out;
}
