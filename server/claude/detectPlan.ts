import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RawDetectionSchema, type DetectRequest, type RawDetection } from "../../shared/schemas";
import { AiError, anthropic, FALLBACK, MODEL } from "./client";

const SYSTEM = `You read architectural floor plan images and return their layout as data for a home-planning app.
All coordinates are in pixels of the image you are given, origin at the top-left, x to the right, y down.
The app snaps your geometry to the walls it finds in the pixels, so be close (within a wall's thickness) rather than perfect.

Rooms
- One entry per labeled space, including halls, closets, pantries, laundry, stairs landings, garage, and foyer. Skip outdoor areas unless they are labeled (porch, deck).
- polygon: the room's interior outline, tracing the inside faces of its walls, corners in clockwise order. Use only horizontal and vertical edges unless a wall is really angled. An L-shaped room gets 6 corners.
- Follow every jog in the walls. If part of a room reaches into a nook (for example the space in front of a bedroom door beside a closet), the outline includes it, with as many corners as it takes. Every door should open into a room you listed.
- Closets get their own entry even when unlabeled; the room in front of a closet stops at the closet's front.
- Open-plan areas with no wall between them (e.g. kitchen, living, dining): split them where the labels, flooring, or counters suggest, using straight edges. Rooms must not overlap.
- type: pick the closest; use "closet" for W.I.C. and pantries, "entry" for foyers, "other" for stairs or anything else.
- labeledWidthIn / labeledDepthIn: if the plan prints the room's size (e.g. 14'-0" x 12'-0"), the horizontal (left-right) and vertical (top-bottom) sizes in inches. Otherwise null. Never guess.

Doors (one entry per opening in a wall that you can walk through; check every room, including baths, closets, pantries, laundry, and the garage, and include exterior doors)
- hinge and otherJamb: the two ends of the opening, on the wall's centerline. For a swing door, hinge is the end the door leaf pivots on (where the arc's center is).
- swingToward: a point a little way into the room the leaf swings into (inside its arc). Null for anything that doesn't swing.
- kind: swing, double (two leaves), sliding, pocket, bifold, opening (no door), garage (overhead door). A door drawn with a quarter-circle arc is a swing door, even in a bathroom.

Fixtures (built-in things drawn on the plan; the app redraws them)
- One entry per counter run, kitchen island, sink, range/cooktop, fridge, dishwasher, toilet, tub, shower, vanity, washer, dryer, water heater, fireplace, staircase, and closet/pantry shelving. An L-shaped counter is two entries. A sink set into a counter or vanity is its own entry on top of it.
- box: the fixture's bounding box, x0,y0 top-left and x1,y1 bottom-right.
- against: which side of the box sits against a wall (top, bottom, left, right), or none for islands and freestanding items. For a toilet it's the tank side; for a counter, its back.
- Skip furniture (beds, sofas, tables, chairs); the user adds those separately.

Windows
- start and end of each window along its wall, on the wall's centerline. Windows usually show as thin parallel lines interrupting a thick wall.

dimensionLines
- Printed dimension lines with a length (often red or with tick marks): both ends and the length in inches. Room size labels go on the room instead.

notes: one or two sentences on anything you weren't sure about.`;

export async function detectFloorPlan(req: DetectRequest): Promise<RawDetection> {
  const msg = await anthropic()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      ...FALLBACK,
      output_config: { effort: "high", format: betaZodOutputFormat(RawDetectionSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: req.mediaType, data: req.image } },
            { type: "text", text: `This floor plan image is ${req.width} × ${req.height} pixels. Return its rooms, doors, windows, fixtures, and dimension lines.` },
          ],
        },
      ],
    })
    .finalMessage();

  if (msg.stop_reason === "refusal") throw new AiError(422, "Claude declined to read this image.");
  if (msg.stop_reason === "max_tokens") throw new AiError(502, "The floor plan was too detailed to finish reading. Try again.");
  if (!msg.parsed_output) throw new AiError(502, "Claude's reading of the plan came back in an unexpected format. Try again.");
  return msg.parsed_output;
}
