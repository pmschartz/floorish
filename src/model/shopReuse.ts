import type { Item } from "../../shared/schemas";
import { normalizeCategory } from "./roomContext";

/** Within this many inches counts as the same size. */
const SAME_SIZE = 1;

const kind = (i: Item) => normalizeCategory(i.category || "", i.label || "");

/**
 * Another piece of the same kind and size that already has shop results (e.g. the other
 * nightstand of a pair), so its results can be reused instead of paying for a new search.
 * Size is compared with the size that piece was searched at, either way round. Newest first.
 */
export function reusableShopResults(item: Item, items: Item[]): Item | null {
  const k = kind(item);
  if (!k) return null;
  const close = (a: number, b: number) => Math.abs(a - b) <= SAME_SIZE;
  const matches = items.filter((o) => {
    const r = o.shopResults;
    if (o.id === item.id || !r || kind(o) !== k) return false;
    const { width, depth } = r.query;
    return (close(width, item.width) && close(depth, item.depth)) || (close(width, item.depth) && close(depth, item.width));
  });
  matches.sort((a, b) => Date.parse(b.shopResults!.searchedAt) - Date.parse(a.shopResults!.searchedAt));
  return matches[0] ?? null;
}
