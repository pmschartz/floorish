import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { emptyStyle, PlanSchema, type Plan, type PlanSummary } from "../shared/schemas";

const DATA_DIR = path.resolve(process.env.HOUSE_PLANNER_DATA ?? "data");
const PLANS_DIR = path.join(DATA_DIR, "plans");
export const IMAGES_DIR = path.join(DATA_DIR, "images");

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function ensureDirs() {
  await fs.mkdir(PLANS_DIR, { recursive: true });
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
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, hasImage: !!p.image }))
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

export async function createPlan(name: string): Promise<Plan> {
  const now = new Date().toISOString();
  return writePlan({
    id: nanoid(10),
    name: name || "Untitled plan",
    createdAt: now,
    updatedAt: now,
    image: null,
    pxPerInch: null,
    rooms: [],
    items: [],
    style: emptyStyle(),
  });
}

export async function deletePlan(id: string): Promise<void> {
  const plan = await readPlan(id);
  await fs.rm(planPath(id));
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
