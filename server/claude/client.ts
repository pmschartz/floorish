import Anthropic from "@anthropic-ai/sdk";

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
