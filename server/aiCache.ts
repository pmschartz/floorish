import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./storage";
import { recordUsage } from "./usage";

const DIR = path.join(DATA_DIR, "ai-cache");
const KEEP_DAYS = 30;
const running = new Map<string, Promise<unknown>>();

/**
 * Answers Claude already gave, keyed by the exact request. Asking the same thing again (a reload
 * mid-run, a second click, "Try again" with nothing changed) returns the saved answer for free;
 * two identical requests at once share one call. `force` skips the saved answer.
 */
export async function savedAnswer<T>(kind: string, request: unknown, force: boolean, run: () => Promise<T>): Promise<{ value: T; reused: boolean }> {
  const key = createHash("sha256").update(kind + "\n" + JSON.stringify(request)).digest("hex").slice(0, 32);
  const file = path.join(DIR, `${kind}-${key}.json`);
  if (!force) {
    const saved = await readFile(file, "utf8").then((t) => JSON.parse(t) as { at: string; value: T }).catch(() => null);
    if (saved && Date.now() - Date.parse(saved.at) < KEEP_DAYS * 864e5) {
      console.log(`[claude] ${kind}: reused a saved answer ≈ $0.000`);
      void recordUsage({ kind, model: "saved answer", cost: 0, reused: true });
      return { value: saved.value, reused: true };
    }
    const inFlight = running.get(key) as Promise<T> | undefined;
    if (inFlight) return { value: await inFlight, reused: true };
  }
  const p = run();
  running.set(key, p);
  try {
    const value = await p;
    await mkdir(DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: new Date().toISOString(), value }));
    return { value, reused: false };
  } finally {
    running.delete(key);
  }
}
