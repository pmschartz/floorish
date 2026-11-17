import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { scoreFit } from "../../shared/fit";
import { ProductSchema, type ShopRequest, type ShopResults } from "../../shared/schemas";
import { AiError, anthropic, FALLBACK, MODEL } from "./client";

type Param = Anthropic.Beta.BetaMessageParam;

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

const REPORT_TOOL = {
  name: "report_products",
  description:
    "Report the products you found. Call this exactly once, after searching, with every product you recommend.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "products"],
    properties: {
      summary: {
        type: "string",
        description: "One or two sentences on what you found and any trade-offs (e.g. few options at this exact size).",
      },
      products: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name", "retailer", "url", "price", "currency", "widthIn", "depthIn", "heightIn",
            "color", "material", "whyItFits", "dimensionsSource",
          ],
          properties: {
            name: { type: "string" },
            retailer: { type: "string" },
            url: { type: "string", description: "Direct product page URL you actually saw in search results." },
            price: { ...nullableNumber, description: "Listed price, or null if not shown." },
            currency: { type: "string", description: "ISO code, e.g. USD" },
            widthIn: { ...nullableNumber, description: "Width in inches (convert from cm if needed). Null if not listed." },
            depthIn: { ...nullableNumber, description: "Depth in inches. Null if not listed." },
            heightIn: { ...nullableNumber, description: "Height in inches. Null if not listed." },
            color: { type: "string" },
            material: { type: "string" },
            whyItFits: { type: "string", description: "Short: how it matches the style, palette and size." },
            dimensionsSource: {
              type: "string",
              description: "Where the dimensions came from, e.g. 'product page', 'search snippet', or 'not listed'.",
            },
          },
        },
      },
    },
  },
} satisfies Anthropic.Beta.BetaTool;

const ReportSchema = z.object({ summary: z.string(), products: z.array(ProductSchema) });

const SYSTEM = `You are a furniture shopping assistant inside a home floor-planning app.
The user drew a shape on their floor plan and wants real products that fit it.

How to work:
- Use web search to find real, currently listed products from established retailers. Mix retailers and price points.
- Prefer listings that state dimensions. Convert metric to inches. Never guess dimensions: use null if a listing doesn't give one.
- Width is the side-to-side measurement facing the piece; depth is front to back.
- Only include URLs you actually saw in search results. Never construct or guess a URL.
- Match the user's style and palette where you can, and respect anything they want to avoid.
- Aim for 5 to 8 products. Fewer is fine if good matches are rare; say so in the summary.
- When you're done searching, call report_products once. Don't write the list as text.`;

function describe(req: ShopRequest): string {
  const s = req.style;
  const lines = [
    `Item: ${req.label || req.category}${req.label && req.category && req.label !== req.category ? ` (category: ${req.category})` : ""}`,
    `Space on the plan: ${req.width}" wide × ${req.depth}" deep${req.height ? ` × up to ${req.height}" tall` : ""}.`,
    `Acceptable size: up to ${req.toleranceOver}" larger, ideally no more than ${req.toleranceUnder}" smaller in each direction.`,
    req.roomType ? `Room: ${req.roomType}` : "",
    s.styles.length ? `Style: ${s.styles.join(", ")}` : "Style: no preference given",
    s.palette.length ? `Color palette (hex): ${s.palette.join(", ")}` : "",
    s.avoid ? `Avoid: ${s.avoid}` : "",
    req.maxPrice ? `Maximum price: $${req.maxPrice}` : s.budgetNote ? `Budget: ${s.budgetNote}` : "",
    req.notes ? `Notes: ${req.notes}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const MAX_ROUNDS = 6;

export async function shopForItem(req: ShopRequest): Promise<ShopResults> {
  const client = anthropic();
  const messages: Param[] = [{ role: "user", content: describe(req) }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        ...FALLBACK,
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, REPORT_TOOL],
        messages,
      })
      .finalMessage();

    if (msg.stop_reason === "refusal") {
      throw new AiError(422, "Claude declined this search. Try rewording the label or notes.");
    }

    const call = msg.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === REPORT_TOOL.name,
    );
    if (call) {
      if (msg.stop_reason === "max_tokens") throw new AiError(502, "The product list was cut off. Try again.");
      const parsed = ReportSchema.safeParse(call.input);
      if (!parsed.success) throw new AiError(502, "Claude returned products in an unexpected format. Try again.");
      return score(req, parsed.data);
    }

    if (msg.stop_reason === "max_tokens") throw new AiError(502, "The search ran out of room before finishing. Try again.");

    // pause_turn: a long server-side search turn paused; send it back to continue.
    // end_turn without the tool: ask once more for the report.
    messages.push({ role: "assistant", content: msg.content });
    if (msg.stop_reason !== "pause_turn") {
      messages.push({ role: "user", content: "Please call report_products now with the products you found." });
    }
  }
  throw new AiError(504, "The search didn't finish. Try again.");
}

function score(req: ShopRequest, report: z.infer<typeof ReportSchema>): ShopResults {
  const target = {
    width: req.width,
    depth: req.depth,
    height: req.height,
    toleranceUnder: req.toleranceUnder,
    toleranceOver: req.toleranceOver,
  };
  const order = { fits: 0, tight: 1, unknown: 2, "too-big": 3 } as const;
  const products = report.products
    .filter((p) => /^https?:\/\//i.test(p.url))
    .map((p) => ({ ...p, ...scoreFit(p, target) }))
    .sort((a, b) => order[a.fit] - order[b.fit]);
  return {
    searchedAt: new Date().toISOString(),
    query: { width: req.width, depth: req.depth, height: req.height },
    summary: report.summary,
    products,
  };
}
