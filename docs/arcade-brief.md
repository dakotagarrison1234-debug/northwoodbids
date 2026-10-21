# Northwood Arcade — build brief for cabinet games

Read `app/play/games/types.ts` first; it is the contract. This page is the
practical checklist. Rule #1 is still Rule #1: the site is live, nothing you
write may break the build.

## What a game file looks like

`app/play/games/<Name>.tsx`, `"use client"`, two exports:

```ts
"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GameHandle, GameProps, AttractFn } from "./types";

export const drawAttract: AttractFn = (ctx, w, h, t) => { /* cheap loop */ };

const Game = forwardRef<GameHandle, GameProps>(function Game({ onEnd, onHud, sfx, lots }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ... all game state in refs (never React state per frame)
  useImperativeHandle(ref, () => ({ start, stop }));
  useEffect(() => { /* ResizeObserver + DPR, pointer/keyboard listeners, cleanup */ }, []);
  return (
    <div className="absolute inset-0 bg-black">
      <canvas ref={canvasRef} className="block w-full h-full touch-none select-none" />
    </div>
  );
});
export default Game;
```

- The parent is `position: relative` and sized by the shell (full cabinet screen,
  portrait on phones, roughly 16:10 landscape on desktop). Read the canvas's
  `getBoundingClientRect()` on every resize; set `canvas.width/height` to
  CSS size × `devicePixelRatio` (cap DPR at 2) and `ctx.setTransform(dpr,0,0,dpr,0,0)`.
  Design the game to play well in BOTH portrait (≈ 390×700) and landscape (≈ 900×560).
- Before `start()` is called, draw a still of the game world (no HUD) so the
  cabinet isn't black. After `onEnd`, freeze on the last frame.
- `start()` may be called again after a run ended — reset everything.
- `stop()` cancels the RAF and listeners' side effects; the component may
  unmount right after.
- Clamp `dt` to 50 ms. Use `performance.now()`.
- Keep `onHud` calls to ~10 a second (throttle with a timestamp).
- Sound: `sfx.thud()` for hits/landings, `sfx.ding(combo)` for points,
  `sfx.bullseye(combo)` for perfect/bonus, `sfx.buzz()` for a miss,
  `sfx.gameOver()` when the run ends (the shell plays `fanfare` for a new best —
  don't). Don't spam: no sound more than ~8 times a second.
- Fonts in canvas: `900 <px>px system-ui, -apple-system, sans-serif`. Text is
  words and numbers only — no emojis, no glyph characters.
- `lots` (auction cabinets): an array of `{ id, title, photo, href }` from the
  live auctions, possibly empty. Use the TITLES only (draw them as labels).
  Do NOT `drawImage` the photos (CORS). Have a fallback list of 10 fun country
  lot names when `lots` is empty.
- Lint rules that bite: no `setState` inside `useEffect` synchronously; no
  unused vars; `react-hooks/exhaustive-deps`. Prefer refs for everything that
  changes per frame. `npx tsc --noEmit -p .` and `npx eslint app/play/games/<Name>.tsx`
  must both be clean for your file.

## Feel

"Real video game", not a tech demo: a background with depth (sky gradient,
parallax hills / trees / shelves, ground with texture), sprites with 2–4
animation frames and squash-and-stretch, drop shadows, particles on hits,
a quick screen flash on big moments, a HUD with the score counting up and a
time bar, and a short "GO!" countdown (3-2-1) inside the game after `start()`.
Difficulty ramps over the run. Night-time or dusk palettes look great on a
cabinet screen; the arcade room around the screen is dark.

## Scoring (all cabinets share one scale)

- first-timer ≈ 500–2,000 · decent ≈ 3,000–6,000 · expert ≈ 10,000–14,000 ·
  never above 20,000. Integers.
- Runs last 45–75 seconds (timed) or end on lives with similar length for a
  decent player.
- Combos/multipliers are welcome but keep the ceiling in range.

## Attract mode (`drawAttract`)

A 4–6 second loop of the game's world with the hero sprite moving — the
cabinet's little screen on the arcade floor plays it. It gets a ~200×130 CSS px
canvas. No text except maybe the title. Under 1 ms a frame.

## Family friendly

Nothing scary, no blood, no injuries drawn. Buck Scope tags deer with a
camera-flash and a sticker; nothing is harmed.
