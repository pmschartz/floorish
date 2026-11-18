import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RedesignResponseSchema, type RedesignRequest, type RedesignResponse } from "../../shared/schemas";
import { AiError, anthropic, FALLBACK, logUsage, MODEL } from "./client";
import { catalogText, describeRoom, FENG_SHUI_RULES, ROOM_DESIGN_RULES } from "./roomPrompt";

const SYSTEM = `You are an interior designer laying out furniture for one room of a house, inside a floor-planning app.
You get the room's exact shape, its doors, windows and built-in fixtures, the furniture there now, the rest of the house, and the owner's style.
Propose complete, buildable layouts: every piece placed precisely, sized realistically.

${ROOM_DESIGN_RULES}

Layouts
- Each layout is a genuinely different idea (a different arrangement or emphasis, not small shifts of the same plan). Give it a short, specific name (e.g. "Desk facing the door", "Reading nook by the window").
- concept: two or three sentences on the idea and how it uses the room.
- Include everything the room needs for how it's used, including a rug and lighting where they help. Prefer catalog pieces and sizes; use "custom" for anything else (lamps, plants, a daybed) with a realistic size.
- Reuse a piece that's there now only if the brief allows it, by setting keepId to its id (its size stays the same).

Catalog (key: name, default size):
${catalogText()}`;

export async function redesignRoom(req: RedesignRequest): Promise<RedesignResponse> {
  const keep = req.keepIds.length
    ? `Keep these existing pieces (reuse them via keepId, placed wherever works best): ${req.keepIds.join(", ")}. Don't reuse any others.`
    : "Start from scratch: don't reuse any of the existing furniture.";
  const user = [
    describeRoom(req.context),
    req.principles.includes("feng shui") ? FENG_SHUI_RULES : "",
    `Brief from the owner: ${req.brief.trim() || "(none; use the room type and style)"}`,
    keep,
    `Propose ${req.count} different layout${req.count > 1 ? "s" : ""}.`,
  ].filter(Boolean).join("\n\n");

  const msg = await anthropic()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      ...FALLBACK,
      output_config: { effort: "high", format: betaZodOutputFormat(RedesignResponseSchema) },
      // Same for every redesign, so a second run within 5 minutes reads it from the cache.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    })
    .finalMessage();
  logUsage("redesign", msg);

  if (msg.stop_reason === "refusal") throw new AiError(422, "Claude declined this request.");
  if (msg.stop_reason === "max_tokens") throw new AiError(502, "The layouts were cut off. Try asking for fewer.");
  if (!msg.parsed_output) throw new AiError(502, "The layouts came back in an unexpected format. Try again.");
  return msg.parsed_output;
}
