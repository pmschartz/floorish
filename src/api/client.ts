import type {
  DetectRequest,
  Plan,
  PlanSummary,
  RawDetection,
  RedesignRequest,
  RedesignResponse,
  RoomChatRequest,
  RoomChatResponse,
  ShopRequest,
  ShopResults,
  SuggestRoomRequest,
  SuggestRoomResponse,
} from "../../shared/schemas";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  listPlans: () => req<PlanSummary[]>("GET", "/api/plans"),
  createPlan: (name: string) => req<Plan>("POST", "/api/plans", { name }),
  getPlan: (id: string) => req<Plan>("GET", `/api/plans/${id}`),
  savePlan: (plan: Plan) => req<Plan>("PUT", `/api/plans/${plan.id}`, plan),
  deletePlan: (id: string) => req<void>("DELETE", `/api/plans/${id}`),
  uploadImage: (id: string, blob: Blob, widthPx: number, heightPx: number) => {
    const fd = new FormData();
    fd.append("image", blob, blob.type === "image/jpeg" ? "plan.jpg" : "plan.png");
    fd.append("widthPx", String(widthPx));
    fd.append("heightPx", String(heightPx));
    return req<Plan>("POST", `/api/plans/${id}/image`, fd);
  },
  shop: (body: ShopRequest, signal?: AbortSignal) => req<ShopResults>("POST", "/api/shop", body, signal),
  suggestRoom: (body: SuggestRoomRequest) => req<SuggestRoomResponse>("POST", "/api/suggest-room", body),
  detect: (body: DetectRequest, signal?: AbortSignal) => req<RawDetection>("POST", "/api/detect", body, signal),
  redesignRoom: (body: RedesignRequest) => req<RedesignResponse>("POST", "/api/redesign-room", body),
  roomChat: (body: RoomChatRequest) => req<RoomChatResponse>("POST", "/api/room-chat", body),
};
