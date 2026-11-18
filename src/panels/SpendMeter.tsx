import { useEffect, useState } from "react";
import type { SpendSummary } from "../../shared/schemas";
import { api, SPEND_EVENT } from "../api/client";
import { usePlan } from "../state/planStore";

const money = (n: number) => (n < 0.995 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(2)}`);

/** What Claude has cost (list price): today across all plans, and on this plan so far. */
export function SpendMeter() {
  const planId = usePlan((s) => s.plan?.id);
  const [spend, setSpend] = useState<SpendSummary | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api.spend().then((s) => live && setSpend(s)).catch(() => {});
    void load();
    window.addEventListener(SPEND_EVENT, load);
    window.addEventListener("focus", load);
    return () => { live = false; window.removeEventListener(SPEND_EVENT, load); window.removeEventListener("focus", load); };
  }, [planId]);

  if (!spend) return null;
  const detail = [
    "Claude spend, estimated at list price:",
    `Today (all plans): ${money(spend.today)}`,
    `This plan: ${money(spend.plan)} over ${spend.calls} ${spend.calls === 1 ? "call" : "calls"}`,
    ...spend.byKind.map((k) => `  ${k.kind}: ${money(k.cost)} (${k.calls})`),
    `All time: ${money(spend.total)}`,
  ].join("\n");
  return (
    <span className="spend-meter" title={detail} aria-label={detail}>
      Claude {money(spend.today)} today
    </span>
  );
}
