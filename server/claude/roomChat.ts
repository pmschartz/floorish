import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { RoomChatResponseSchema, type RoomChatRequest, type RoomChatResponse } from "../../shared/schemas";
import { AiError, anthropic, FALLBACK, MODEL } from "./client";
import { catalogText, describeRoom, FENG_SHUI_RULES, ROOM_DESIGN_RULES } from "./roomPrompt";

const SYSTEM = `You are an interior designer chatting with a homeowner about one room of their house, inside a floor-planning app.
You can see the room's exact shape, doors, windows, fixtures, its current furniture (with ids), the rest of the house, and their style.
You can change the furniture in the room directly.

${ROOM_DESIGN_RULES}

${FENG_SHUI_RULES}
(Bring feng shui in when it helps or when asked; don't lecture.)

How to answer
- reply: talk like a designer friend: short, specific, and practical. Say what you changed and why in a sentence or two. Plain text, no markdown headings.
- changes: the edits to make, if any. "add" a new piece (item filled in, id null); "update" an existing piece (its id, plus its complete new item: position, size, rotation, label); "remove" a piece (its id, item null).
- Only change what was asked for (and anything that must move to make room). If they're just asking a question, leave changes empty.
- Use the current furniture list as the truth; pieces may have moved since earlier messages.

Catalog (key: name, default size):
${catalogText()}`;

export async function roomChat(req: RoomChatRequest): Promise<RoomChatResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.map((m) => ({ role: m.role, content: m.text })),
    {
      role: "user",
      content: `${describeRoom(req.context)}\n\n(Version shown: "${req.versionName}".)\n\n${req.message}`,
    },
  ];
  // The API needs the conversation to start with the user.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const msg = await anthropic()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      ...FALLBACK,
      output_config: { effort: "medium", format: betaZodOutputFormat(RoomChatResponseSchema) },
      system: SYSTEM,
      messages,
    })
    .finalMessage();

  if (msg.stop_reason === "refusal") throw new AiError(422, "Claude declined this request.");
  if (msg.stop_reason === "max_tokens") throw new AiError(502, "The answer was cut off. Try a narrower question.");
  if (!msg.parsed_output) throw new AiError(502, "The answer came back in an unexpected format. Try again.");
  return msg.parsed_output;
}
