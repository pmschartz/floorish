# House Planner

Upload a floor plan, lay out the furniture you have at real scale, and find furniture that fits.

- **Floor plans**: PNG, JPG, WebP, SVG, or PDF (page 1). Or start on a blank grid.
- **Scale**: Calibrate (C) by clicking both ends of a wall you know the length of.
- **Rooms**: trace them corner by corner (R) or with two clicks for rectangles (B), then name them.
- **Furniture**: drag standard pieces from the library (beds, sofas, desks, bookcases, rugs, doors…) or draw custom rectangles, circles, and L-shapes and say what they are.
- **Layout checks**: overlaps, items through walls, walkway clearances (bed sides, drawers, chair pull-back), and door swings.
- **Shop for this**: Claude searches the web for real products that fit the shape, your style, and your palette, and labels each one Fits / Tight / Too big.
- **What's missing**: select a room and Claude suggests pieces that would fit, with one click to add them to the plan.
- **Export**: the plan as PNG, and a shopping list as Markdown or CSV.

## Run it

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY, or skip if you've run `ant auth login`
npm run dev            # http://localhost:5173
```

Plans are saved to `data/` (ignored by git). Try it with `samples/sample-floorplan.svg`: calibrate on the red 32'-0" line along the top.

Shopping and suggestions call the Claude API (`claude-opus-5-5`). A shopping search uses live web search and typically costs a few cents to about $0.30; results are saved on the item so reopening them is free. Requests use server-side fallback (`fallbacks: "default"`), so a request the model declines is retried on a fallback model; remove `FALLBACK` in `server/claude/client.ts` to turn that off.

## Develop

```bash
npm test          # unit tests (units, geometry, layout checks, fit scoring, placement)
npm run typecheck
```

- `src/` React + Konva client; `server/` Express API and Claude calls; `shared/` Zod schemas used by both.
- All lengths are stored in inches; `pxPerInch` maps them onto the floor plan image.
