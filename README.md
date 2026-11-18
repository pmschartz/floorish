# Floorish

[![Tests](https://github.com/pmschartz/floorish/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/pmschartz/floorish/actions/workflows/test.yml)

Make room for what you love. Upload a floor plan, lay out the furniture you have at real scale, and find furniture that fits.

## What it does

- **Floor plans**: PNG, JPG, WebP, SVG, or PDF (page 1), or start on a blank grid. Calibrate (C) by clicking both ends of a wall you know the length of.
- **Auto-detect**: Claude reads the plan (room names and types, doors with their hinge and swing, windows, printed dimensions). The app then snaps everything to the walls it finds in the image and gives every wall a standard inside or outside thickness. You review and untick anything wrong before it's added.
- **Rooms**: trace them corner by corner (R) or with two clicks for rectangles (B). Rooms make space for each other: draw a closet inside a bedroom and the bedroom gets smaller; delete it and the bedroom gets its corner back. Drag a room's walls to resize it (the room next door follows), switch any side between a wall and open, or merge two rooms.
- **Doors and openings**: swing, double, sliding, pocket and bifold doors, plain openings, garage doors and windows. They snap into the nearest wall.
- **Furniture**: drag standard pieces from the library (bedroom, living, dining, office, gym, plants, rugs…) or draw custom rectangles, circles, L- and U-shapes and say what they are. Mark each piece as yours, planned, or to buy.
- **Clean view**: redraws the plan from its rooms, walls, doors and windows instead of the uploaded image, and exports that way too.
- **Layout checks**: overlaps, pieces through walls, walkway clearances (bed sides, drawers, chair pull-back) measured to walls and furniture, and door swings.
- **Paint**: a house palette and each room's wall, accent, trim and ceiling colors, all as Sherwin-Williams colors.
- **Design with Claude**: redesign a room into alternative layouts you can flip between, or talk a room through with the whole house in view.
- **What's missing**: select a room and Claude suggests pieces that would fit, with one click to add them.
- **Shop for this**: Claude searches the web for real products that fit the piece, your style and your palette, and labels each one Fits, Tight or Too big.
- **Plan tab**: a getting-started checklist while you set up, then a summary of rooms and what's left to buy, with prices.
- **Export**: the plan as PNG, and a shopping list (with paint) as Markdown or CSV.

Press **?** in the editor for keyboard shortcuts.

## Run it

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY, or skip if you've run `ant auth login`
npm run dev            # http://localhost:5173
```

Plans are saved to `data/` (ignored by git). Try it with `samples/sample-floorplan.svg`: calibrate on the red 32'-0" line along the top.

## Claude and cost

Auto-detect, redesigns, room chat and shopping use `claude-opus-5-5`; What's missing uses `claude-sonnet-5-5`. A shopping search uses live web search (up to 5 searches) and typically costs a few cents to about $0.30.

To keep costs down, system prompts and chat history are cached, and results are saved: shop results on the piece, suggestions and chat on the room, and identical Auto-detect and Redesign requests are answered from a 30-day cache unless you ask again. The toolbar shows what Claude has cost today (from `data/usage.jsonl`, at list price).

Requests use server-side fallback (`fallbacks: "default"`), so a request the model declines is retried on a fallback model; remove `FALLBACK` in `server/claude/client.ts` to turn that off.

## Develop

```bash
npm test          # unit tests
npm run typecheck
```

- `src/` React + Konva client; `server/` Express API and Claude calls; `shared/` Zod schemas used by both.
- All lengths are stored in inches; `pxPerInch` maps them onto the floor plan image.
- The look comes from the Floorish design system: tokens and fonts in `src/floorish.css`, canvas colors in `src/canvas/theme.ts`.
