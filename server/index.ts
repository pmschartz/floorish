import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { DetectRequestSchema, HouseUpdateSchema, PlanSchema, RedesignRequestSchema, RoomChatRequestSchema, ShopRequestSchema, SuggestRoomRequestSchema } from "../shared/schemas";
import { AiError, toAiError } from "./claude/client";
import { detectFloorPlan } from "./claude/detectPlan";
import { redesignRoom } from "./claude/redesignRoom";
import { roomChat } from "./claude/roomChat";
import { shopForItem } from "./claude/shop";
import { suggestForRoom } from "./claude/suggestRoom";
import * as store from "./storage";
import { savedAnswer } from "./aiCache";
import { requestPlan, spendSummary } from "./usage";

const PORT = Number(process.env.API_PORT ?? 5174);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use("/api/detect", express.json({ limit: "30mb" })); // base64 floor plan image
app.use(express.json({ limit: "5mb" }));
// Remember which plan each request is for, so Claude costs can be totted up per plan.
app.use("/api", (req, _res, next) => requestPlan.run(String(req.header("x-plan-id") ?? ""), next));
app.use("/images", express.static(store.IMAGES_DIR, { maxAge: "1d", immutable: true }));

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const param = (req: Request, key: string) => String(req.params[key]);

app.get("/api/plans", route(async (_req, res) => res.json(await store.listPlans())));

app.post("/api/plans", route(async (req, res) => {
  res.status(201).json(await store.createPlan(String(req.body?.name ?? "").slice(0, 120)));
}));

app.get("/api/plans/:id", route(async (req, res) => res.json(await store.readPlan(param(req, "id")))));

app.put("/api/plans/:id", route(async (req, res) => {
  const plan = PlanSchema.parse(req.body);
  if (plan.id !== param(req, "id")) throw new AiError(400, "Plan id mismatch");
  const stored = await store.readPlan(plan.id); // 404 if it was deleted
  // A tab opened before this plan joined a house doesn't know it: keep the house, floor name and style.
  const kept = stored.houseId && !plan.houseId ? { ...plan, houseId: stored.houseId, name: stored.name, style: stored.style } : plan;
  res.json(await store.writePlan(kept));
}));

app.delete("/api/plans/:id", route(async (req, res) => {
  await store.deletePlan(param(req, "id"));
  res.status(204).end();
}));

// ---- Houses: floors that share a style ----

app.get("/api/houses", route(async (_req, res) => res.json(await store.listHouses())));

app.get("/api/houses/:id", route(async (req, res) => res.json(await store.houseView(param(req, "id")))));

/** Make a house from plans: { planIds, name? }. */
app.post("/api/houses", route(async (req, res) => {
  const planIds = Array.isArray(req.body?.planIds) ? req.body.planIds.map(String) : [];
  if (!planIds.length) throw new AiError(400, "Choose at least one plan");
  const house = await store.addFloors(planIds, { name: req.body?.name ? String(req.body.name).slice(0, 120) : undefined });
  res.status(201).json(await store.houseView(house.id));
}));

app.put("/api/houses/:id", route(async (req, res) => {
  await store.updateHouse(param(req, "id"), HouseUpdateSchema.parse(req.body));
  res.json(await store.houseView(param(req, "id")));
}));

/** Add a floor: a new blank one ({ name }) or an existing plan ({ planId }). Returns the house and the floor's plan id. */
app.post("/api/houses/:id/floors", route(async (req, res) => {
  const house = await store.readHouse(param(req, "id"));
  let planId = req.body?.planId ? String(req.body.planId) : "";
  if (!planId) planId = (await store.createPlan(String(req.body?.name ?? "").slice(0, 120) || `Floor ${house.floors.length + 1}`)).id;
  await store.addFloors([planId], { houseId: house.id });
  res.status(201).json({ house: await store.houseView(house.id), planId });
}));

/** Delete a house and every floor in it. */
app.delete("/api/houses/:id", route(async (req, res) => {
  const house = await store.readHouse(param(req, "id"));
  for (const f of house.floors) await store.deletePlan(f).catch(() => {});
  res.status(204).end();
}));

app.post("/api/plans/:id/image", upload.single("image"), route(async (req, res) => {
  const plan = await store.readPlan(param(req, "id"));
  if (!req.file) throw new AiError(400, "No image uploaded");
  const widthPx = Number(req.body.widthPx), heightPx = Number(req.body.heightPx);
  if (!(widthPx > 0 && heightPx > 0)) throw new AiError(400, "Missing image size");
  const url = await store.saveImage(plan.id, req.file.mimetype, req.file.buffer);
  if (plan.image) await store.removeImage(plan.image.url);
  // A new image means a new scale; rooms and furniture keep their inch positions.
  res.json(await store.writePlan({ ...plan, image: { url, widthPx, heightPx }, pxPerInch: null }));
}));

app.post("/api/shop", route(async (req, res) => {
  const body = ShopRequestSchema.parse(req.body);
  try {
    res.json(await shopForItem(body));
  } catch (e) {
    throw toAiError(e);
  }
}));

app.post("/api/suggest-room", route(async (req, res) => {
  const body = SuggestRoomRequestSchema.parse(req.body);
  try {
    res.json(await suggestForRoom(body));
  } catch (e) {
    throw toAiError(e);
  }
}));

app.get("/api/usage", route(async (req, res) => res.json(await spendSummary(String(req.query.planId ?? "")))));

app.post("/api/redesign-room", route(async (req, res) => {
  const { force, ...body } = RedesignRequestSchema.parse(req.body);
  try {
    const out = await savedAnswer("redesign", body, force, () => redesignRoom({ ...body, force }));
    res.setHeader("X-Saved-Answer", out.reused ? "1" : "0");
    res.json(out.value);
  } catch (e) {
    throw toAiError(e);
  }
}));

app.post("/api/room-chat", route(async (req, res) => {
  const body = RoomChatRequestSchema.parse(req.body);
  try {
    res.json(await roomChat(body));
  } catch (e) {
    throw toAiError(e);
  }
}));

app.post("/api/detect", route(async (req, res) => {
  const { force, ...body } = DetectRequestSchema.parse(req.body);
  try {
    const out = await savedAnswer("detect", body, force, () => detectFloorPlan({ ...body, force }));
    res.setHeader("X-Saved-Answer", out.reused ? "1" : "0");
    res.json(out.value);
  } catch (e) {
    throw toAiError(e);
  }
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof store.NotFound) return res.status(404).json({ error: "Not found" });
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid request", details: err.issues });
  if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
});

await store.ensureDirs();
app.listen(PORT, () => console.log(`Floorish API on http://localhost:${PORT}`));
