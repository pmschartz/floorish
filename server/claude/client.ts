import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "../usage";

export const MODEL = "claude-opus-5-5";

// Server-side fallback: if a request is declined by a safety classifier, the API
// retries it on a fallback model in the same call. Remove these two fields to opt out.
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

let client: Anthropic | null = null;

/** Credentials come from ANTHROPIC_API_KEY (in .env) or an `ant auth login` profile. */
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn SDK errors into a status + a message that makes sense to show in the UI. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError(401, "Claude rejected the API credentials. Set ANTHROPIC_API_KEY in .env (or run `ant auth login`) and restart.");
  }
  if (e instanceof Anthropic.RateLimitError) return new AiError(429, "Hit the Anthropic rate limit. Wait a minute and try again.");
  if (e instanceof Anthropic.BadRequestError) return new AiError(400, `Claude couldn't process the request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError(502, "Couldn't reach the Anthropic API. Check your connection.");
  if (e instanceof Anthropic.APIError) return new AiError(502, `Anthropic API error (${e.status ?? "?"}): ${e.message}`);
  const msg = e instanceof Error ? e.message : String(e);
  if (/api.?key|credentials|auth/i.test(msg)) {
    return new AiError(401, "No Anthropic credentials found. Copy .env.example to .env and add ANTHROPIC_API_KEY (or run `ant auth login`), then restart `npm run dev`.");
  }
  return new AiError(500, msg);
}

/** Cheaper model for simple jobs (What's missing). */
export const LIGHT_MODEL = "claude-sonnet-5-5";

/** List prices, USD per million tokens (5-minute cache writes are 1.25× input); web searches are 1¢ each. */
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
};
const WEB_SEARCH = 0.01;

interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** Estimated cost of one response, in dollars, at list price (unknown models priced as Opus). */
export function usageCost(u: UsageLike, model = MODEL): number {
  const p = PRICES[Object.keys(PRICES).find((k) => model.startsWith(k)) ?? MODEL];
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) / 1e6 +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH
  );
}

/** One line per Claude call in the server log (tokens, cache hits, estimated cost), also saved for the spend meter. */
export function logUsage(kind: string, msg: { model: string; usage: UsageLike }) {
  const u = msg.usage;
  const cost = usageCost(u, msg.model);
  void recordUsage({ kind, model: msg.model, cost });
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  console.log(
    `[claude] ${kind} ${msg.model}: in ${u.input_tokens}, cache write ${u.cache_creation_input_tokens ?? 0}, cache read ${u.cache_read_input_tokens ?? 0}, out ${u.output_tokens}` +
      (searches ? `, searches ${searches}` : "") +
      ` ≈ ${cost.toFixed(3)}`,
  );
}
