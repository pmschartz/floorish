import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { emptyStyle, HouseSchema, PlanSchema, type House, type HouseView, type Plan, type PlanSummary, type StyleProfile } from "../shared/schemas";
import { describePaint } from "../shared/sw";

export const DATA_DIR = path.resolve(process.env.HOUSE_PLANNER_DATA ?? "data");
const PLANS_DIR = path.join(DATA_DIR, "plans");
const HOUSES_DIR = path.join(DATA_DIR, "houses");
export const IMAGES_DIR = path.join(DATA_DIR, "images");

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function ensureDirs() {
  await fs.mkdir(PLANS_DIR, { recursive: true });
  await fs.mkdir(HOUSES_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

function planPath(id: string) {
  if (!SAFE_ID.test(id)) throw new NotFound();
  return path.join(PLANS_DIR, `${id}.json`);
}

export class NotFound extends Error {}

export async function listPlans(): Promise<PlanSummary[]> {
  const files = (await fs.readdir(PLANS_DIR)).filter((f) => f.endsWith(".json"));
  const plans = await Promise.all(files.map((f) => readPlan(f.replace(/\.json$/, "")).catch(() => null)));
  return plans
    .filter((p): p is Plan => p !== null)
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, hasImage: !!p.image, houseId: p.houseId ?? null }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readPlan(id: string): Promise<Plan> {
  try {
    const raw = await fs.readFile(planPath(id), "utf8");
    return PlanSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFound();
    throw e;
  }
}

export async function writePlan(plan: Plan): Promise<Plan> {
  const saved = { ...plan, updatedAt: new Date().toISOString() };
  const file = planPath(plan.id);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(saved, null, 2));
  await fs.rename(tmp, file); // atomic replace, so a crash never leaves half a plan
  return saved;
}

export async function createPlan(name: string, house?: { id: string; style: StyleProfile }): Promise<Plan> {
  const now = new Date().toISOString();
  return writePlan({
    houseId: house?.id ?? null,
    id: nanoid(10),
    name: name || "Untitled plan",
    createdAt: now,
    updatedAt: now,
    image: null,
    pxPerInch: null,
    wallThickness: 5,
    rooms: [],
    items: [],
    style: house?.style ?? emptyStyle(),
  });
}

export async function deletePlan(id: string): Promise<void> {
  const plan = await readPlan(id);
  await fs.rm(planPath(id));
  // A deleted floor leaves its house; a house with no floors left goes too.
  if (plan.houseId) {
    const house = await readHouse(plan.houseId).catch(() => null);
    if (house) {
      const floors = house.floors.filter((f) => f !== id);
      if (floors.length) await writeHouse({ ...house, floors });
      else await fs.rm(housePath(house.id), { force: true });
    }
  }
  if (plan.image) await fs.rm(path.join(IMAGES_DIR, path.basename(plan.image.url)), { force: true });
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function saveImage(planId: string, mime: string, data: Buffer): Promise<string> {
  const ext = EXT[mime];
  if (!ext) throw new Error(`Unsupported image type ${mime}`);
  const name = `${planId}-${nanoid(6)}.${ext}`;
  await fs.writeFile(path.join(IMAGES_DIR, name), data);
  return `/images/${name}`;
}

export async function removeImage(url: string) {
  await fs.rm(path.join(IMAGES_DIR, path.basename(url)), { force: true });
}

// ---- Houses: several floor plans that share a style ----

function housePath(id: string) {
  if (!SAFE_ID.test(id)) throw new NotFound();
  return path.join(HOUSES_DIR, `${id}.json`);
}

export async function readHouse(id: string): Promise<House> {
  try {
    return HouseSchema.parse(JSON.parse(await fs.readFile(housePath(id), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFound();
    throw e;
  }
}

export async function writeHouse(house: House): Promise<House> {
  const saved = { ...house, updatedAt: new Date().toISOString() };
  const file = housePath(house.id);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(saved, null, 2));
  await fs.rename(`${file}.tmp`, file);
  return saved;
}

export async function listHouses(): Promise<House[]> {
  const files = (await fs.readdir(HOUSES_DIR)).filter((f) => f.endsWith(".json"));
  const houses = await Promise.all(files.map((f) => readHouse(f.replace(/\.json$/, "")).catch(() => null)));
  return houses.filter((h): h is House => h !== null);
}

/** The house with each floor's name and rooms. Floors whose plan is missing are skipped. */
export async function houseView(id: string): Promise<HouseView> {
  const house = await readHouse(id);
  const plans = await Promise.all(house.floors.map((f) => readPlan(f).catch(() => null)));
  return {
    ...house,
    floorPlans: plans.filter((p): p is Plan => p !== null).map((p) => ({
      id: p.id,
      name: p.name,
      hasImage: !!p.image,
      updatedAt: p.updatedAt,
      rooms: p.rooms.map((r) => ({ name: r.name, type: r.type, areaSqFt: Math.round(polygonAreaSqIn(r.polygon) / 144), paint: describePaint(r.paint, false) })),
    })),
  };
}

function polygonAreaSqIn(pts: Array<{ x: number; y: number }>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** "Oak Crest Upstairs" in house "Oak Crest" is the floor "Upstairs". */
export function floorName(planName: string, houseName: string): string {
  const rest = planName.toLowerCase().startsWith(houseName.toLowerCase()) ? planName.slice(houseName.length).replace(/^[\s\-–—:]+/, "") : "";
  return rest || planName;
}

/** The words two or more plan names start with ("Oak Crest Upstairs" + "Oak Crest Basement" → "Oak Crest"). */
export function commonName(names: string[]): string {
  const split = names.map((n) => n.trim().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < Math.min(...split.map((s) => s.length)); i++) {
    const w = split[0][i];
    if (split.every((s) => s[i].toLowerCase() === w.toLowerCase())) out.push(w); else break;
  }
  return out.join(" ");
}

/**
 * Make a house from existing plans (they become its floors, in the order given) or add plans to
 * a house. The house style is the house's own, or the first floor's that has one; every floor
 * takes it.
 */
export async function addFloors(planIds: string[], into?: { houseId?: string; name?: string }): Promise<House> {
  const plans = await Promise.all(planIds.map((id) => readPlan(id)));
  const now = new Date().toISOString();
  let house: House = into?.houseId
    ? await readHouse(into.houseId)
    : {
        id: nanoid(10),
        name: into?.name?.trim() || commonName(plans.map((p) => p.name)) || plans[0]?.name || "My house",
        createdAt: now,
        updatedAt: now,
        style: plans.find((p) => p.style.styles.length || p.style.palette.length || p.style.avoid || p.style.budgetNote)?.style ?? emptyStyle(),
        floors: [],
      };
  const hasStyle = (s: StyleProfile) => s.styles.length || s.palette.length || s.avoid || s.budgetNote;
  if (!hasStyle(house.style)) house.style = plans.find((p) => hasStyle(p.style))?.style ?? house.style;
  for (const p of plans) {
    if (p.houseId && p.houseId !== house.id) {
      // Leaving another house.
      const old = await readHouse(p.houseId).catch(() => null);
      if (old) await writeHouse({ ...old, floors: old.floors.filter((f) => f !== p.id) });
    }
    await writePlan({ ...p, houseId: house.id, name: floorName(p.name, house.name), style: house.style });
    if (!house.floors.includes(p.id)) house = { ...house, floors: [...house.floors, p.id] };
  }
  return writeHouse(house);
}

/** Rename a house, reorder its floors, or change its style (which every floor takes). */
export async function updateHouse(id: string, patch: { name?: string; style?: StyleProfile; floors?: string[] }): Promise<House> {
  const house = await readHouse(id);
  const floors = patch.floors ? patch.floors.filter((f) => house.floors.includes(f)) : house.floors;
  const next = { ...house, ...(patch.name !== undefined ? { name: patch.name || house.name } : {}), ...(patch.style ? { style: patch.style } : {}), floors: [...floors, ...house.floors.filter((f) => !floors.includes(f))] };
  if (patch.style) {
    for (const f of house.floors) {
      const p = await readPlan(f).catch(() => null);
      if (p) await writePlan({ ...p, style: patch.style });
    }
  }
  return writeHouse(next);
}
