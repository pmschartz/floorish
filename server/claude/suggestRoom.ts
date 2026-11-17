import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SuggestRoomResponseSchema, type SuggestRoomRequest, type SuggestRoomResponse } from "../../shared/schemas";
import { AiError, anthropic, FALLBACK, MODEL } from "./client";

const SYSTEM = `You are an interior design assistant inside a home floor-planning app.
Given one room's size, what's already in it, and the owner's style, suggest what the room is missing.

- Base suggestions on how the room is used (a bedroom usually needs bedside surfaces and lighting; a living room needs somewhere to set a drink near each seat).
- Only suggest things that will physically fit in the open floor space. Give realistic sizes in inches for each piece.
- Don't suggest anything that's already there unless the room clearly needs more of it.
- Order by priority. Keep it to the 3 to 7 most useful pieces.
- placementHint should say where it goes relative to what's there (e.g. "left of the sofa, against the wall").`;

export async function suggestForRoom(req: SuggestRoomRequest): Promise<SuggestRoomResponse> {
  const s = req.style;
  const lines = [
    `Room: ${req.room.name} (${req.room.type}), about ${Math.round(req.room.widthIn)}" × ${Math.round(req.room.depthIn)}", ${req.room.areaSqFt} sq ft.`,
    req.items.length
      ? `Currently in the room:\n${req.items.map((i) => `- ${i.label} (${i.category || "uncategorized"}, ${Math.round(i.widthIn)}" × ${Math.round(i.depthIn)}", ${i.status}) at ${i.position}`).join("\n")}`
      : "The room is empty.",
    s.styles.length ? `Style: ${s.styles.join(", ")}` : "",
    s.palette.length ? `Palette (hex): ${s.palette.join(", ")}` : "",
    s.avoid ? `Avoid: ${s.avoid}` : "",
    s.budgetNote ? `Budget: ${s.budgetNote}` : "",
  ].filter(Boolean);

  const msg = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(SuggestRoomResponseSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: lines.join("\n\n") }],
  });

  if (msg.stop_reason === "refusal") throw new AiError(422, "Claude declined this request.");
  if (!msg.parsed_output) throw new AiError(502, "Claude's suggestions came back in an unexpected format. Try again.");
  return msg.parsed_output;
}
