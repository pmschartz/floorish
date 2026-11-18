import type {
  DetectRequest,
  House,
  HouseView,
  StyleProfile,
  Plan,
  PlanSummary,
  RawDetection,
  RedesignRequest,
  RedesignResponse,
  RoomChatRequest,
  RoomChatResponse,
  ShopRequest,
  SpendSummary,
  ShopResults,
  SuggestRoomRequest,
  SuggestRoomResponse,
} from "../../shared/schemas";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let planId = "";
/** The open plan, sent with every request so Claude costs are tracked per plan. */
export const setApiPlan = (id: string) => { planId = id; };

/** Fired after every Claude call so the spend meter can refresh. */
export const SPEND_EVENT = "claude-spend";

async function send(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = { "X-Plan-Id": planId };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return res;
}

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(method, url, body, signal);
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => ({}))) as T;
}

/** A Claude call: also says whether the server reused a saved answer (no charge), and refreshes the meter. */
async function ai<T>(url: string, body: unknown, signal?: AbortSignal): Promise<{ data: T; reused: boolean }> {
  try {
    const res = await send("POST", url, body, signal);
    return { data: (await res.json()) as T, reused: res.headers.get("X-Saved-Answer") === "1" };
  } finally {
    window.dispatchEvent(new Event(SPEND_EVENT));
  }
}

export const api = {
  listPlans: () => req<PlanSummary[]>("GET", "/api/plans"),
  createPlan: (name: string) => req<Plan>("POST", "/api/plans", { name }),
  getPlan: (id: string) => req<Plan>("GET", `/api/plans/${id}`),
  savePlan: (plan: Plan) => req<Plan>("PUT", `/api/plans/${plan.id}`, plan),
  deletePlan: (id: string) => req<void>("DELETE", `/api/plans/${id}`),
  listHouses: () => req<House[]>("GET", "/api/houses"),
  getHouse: (id: string) => req<HouseView>("GET", `/api/houses/${id}`),
  createHouse: (planIds: string[], name?: string) => req<HouseView>("POST", "/api/houses", { planIds, name }),
  updateHouse: (id: string, patch: { name?: string; style?: StyleProfile; floors?: string[] }) => req<HouseView>("PUT", `/api/houses/${id}`, patch),
  addFloor: (id: string, floor: { name?: string; planId?: string }) => req<{ house: HouseView; planId: string }>("POST", `/api/houses/${id}/floors`, floor),
  deleteHouse: (id: string) => req<void>("DELETE", `/api/houses/${id}`),
  uploadImage: (id: string, blob: Blob, widthPx: number, heightPx: number) => {
    const fd = new FormData();
    fd.append("image", blob, blob.type === "image/jpeg" ? "plan.jpg" : "plan.png");
    fd.append("widthPx", String(widthPx));
    fd.append("heightPx", String(heightPx));
    return req<Plan>("POST", `/api/plans/${id}/image`, fd);
  },
  shop: async (body: ShopRequest, signal?: AbortSignal) => (await ai<ShopResults>("/api/shop", body, signal)).data,
  suggestRoom: async (body: SuggestRoomRequest) => (await ai<SuggestRoomResponse>("/api/suggest-room", body)).data,
  detect: (body: Omit<DetectRequest, "force"> & { force?: boolean }, signal?: AbortSignal) => ai<RawDetection>("/api/detect", body, signal),
  redesignRoom: (body: Omit<RedesignRequest, "force"> & { force?: boolean }) => ai<RedesignResponse>("/api/redesign-room", body),
  roomChat: async (body: RoomChatRequest) => (await ai<RoomChatResponse>("/api/room-chat", body)).data,
  spend: () => req<SpendSummary>("GET", `/api/usage?planId=${encodeURIComponent(planId)}`),
};
