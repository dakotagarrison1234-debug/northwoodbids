import type { SoundFx } from "../_sound";

/**
 * The Northwood Arcade — the contract every cabinet game is built on.
 *
 * A game is a client component that fills its parent box (the cabinet screen),
 * owns its own canvas + requestAnimationFrame loop + input, and talks to the
 * arcade shell through exactly three things:
 *
 *   ref.start()        the shell calls this when the player presses START —
 *                      the game resets and begins a fresh run
 *   ref.stop()         the shell is closing the cabinet — halt the loop now
 *   props.onEnd(score) the game calls this ONCE when a run is over (time up,
 *                      lives gone). The shell takes it from there (score screen,
 *                      saving, rank). The game should freeze its last frame.
 *
 * props.onHud(...) is optional live telemetry for the cabinet's marquee
 * (score, seconds left). Throttle it to ~10 calls a second.
 *
 * Scoring — every cabinet scores on the SAME scale, so the arcade total
 * across games is fair:
 *   a first-timer's run      ≈   500 – 2,000
 *   a decent run             ≈ 3,000 – 6,000
 *   an expert run            ≈ 10,000 – 14,000
 *   hard ceiling             <  20,000 (the server rejects more)
 * Integers only. Design the run length around 45–75 seconds, or a
 * lives-based run that ends about then for a decent player.
 *
 * Input — must work with a finger and with a mouse, and keyboard where it
 * makes sense (space / arrows). Attach pointer events to the canvas, which is
 * `touch-action: none`, and call preventDefault on pointerdown so the page
 * doesn't scroll. Never rely on hover.
 *
 * Rendering — Canvas 2D only, no image assets: draw sprites procedurally
 * (shapes, gradients, shadows, a couple of animation frames) so every cabinet
 * looks like a real video game, not a slideshow. Handle devicePixelRatio and
 * a resize of the parent at any time (ResizeObserver). Clean up everything on
 * unmount.
 *
 * Family friendly — nothing scary, no blood, no gore. Buck Scope "tags" a deer
 * with a camera-flash and a TAGGED! sticker; the deer bounds off.
 *
 * Text and icons — no emojis, no glyph characters (no check marks, stars,
 * arrows or bullets drawn as text). If a game needs a shape, draw it.
 *
 * Attract mode — besides the component, every game module exports
 * `drawAttract(ctx, w, h, t)`: a cheap looping animation (t = seconds) the
 * arcade floor plays on the cabinet's little screen. Keep it under ~1ms a
 * frame; it runs for seven cabinets at once.
 */

export type GameHandle = {
  start: () => void;
  stop: () => void;
};

export type Lot = { id: string; title: string; photo: string | null; href: string | null };

export type GameProps = {
  /** Called exactly once per run with the final integer score. */
  onEnd: (score: number) => void;
  /** Optional live HUD updates for the shell, ~10/s. */
  onHud?: (hud: { score: number; timeLeft?: number; lives?: number }) => void;
  /** Shared synth sound effects (thud, ding(combo), bullseye(combo), buzz, gameOver, fanfare). */
  sfx: SoundFx;
  /** Real lots from the live auctions, for the auction-themed cabinets. May be empty. */
  lots: Lot[];
};

export type AttractFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export type GameKey = "gavel" | "buck" | "stack" | "paddles" | "flap" | "pies" | "trail";

export type GameMeta = {
  key: GameKey;
  /** Marquee name. */
  title: string;
  /** One line under the title on the floor. */
  blurb: string;
  /** Two or three words of how to play, shown on the START screen. */
  howTo: string;
  /** True for the auction-flavoured cabinets. */
  auction: boolean;
  /** Cabinet accent colour (marquee glow). */
  accent: string;
  /** Multiplier applied to the game's raw score before it's saved, so every
   *  cabinet lands on the shared scale. 1 for games built on the scale. */
  scale: number;
};

export const GAMES: GameMeta[] = [
  { key: "gavel",   title: "Gavel Slam",   blurb: "Stop the needle in the zone. Sold!",            howTo: "Tap when the needle is in the green. Bullseye for double.",     auction: true,  accent: "#f0a35a", scale: 0.4 },
  { key: "buck",    title: "Buck Scope",   blurb: "Steady the scope. Tag the big one.",            howTo: "Drag to aim, tap TAG to tag a buck. Let the does walk.", auction: false, accent: "#4a7c59", scale: 1 },
  { key: "stack",   title: "Lot Drop",     blurb: "Stack the lots on the truck. Don't tip it.",    howTo: "Tap to drop each box. Line it up for a perfect.",               auction: true,  accent: "#c47b3e", scale: 1 },
  { key: "paddles", title: "Outbid!",      blurb: "Bidders are raising paddles. Beat them to it.", howTo: "Tap every paddle that pops up. Gold ones are worth more.",      auction: true,  accent: "#e0b84a", scale: 1 },
  { key: "flap",    title: "Barn Flap",    blurb: "A chicken, a barn, and a lot of doors.",        howTo: "Tap to flap. Fly through the open doors.",                      auction: false, accent: "#d95f3b", scale: 1 },
  { key: "pies",    title: "Pie Catch",    blurb: "Grandma's baking. Catch them all.",             howTo: "Drag the basket. Catch pies, dodge the burnt ones.",            auction: false, accent: "#8a4f9e", scale: 1 },
  { key: "trail",   title: "Trail Run",    blurb: "Hay bales, logs and a very fast dog.",          howTo: "Tap to jump, hold for a big jump. Grab the bones.",             auction: false, accent: "#3b8bd9", scale: 1 },
];

export const GAME_KEYS = new Set<string>(GAMES.map((g) => g.key));
export const MAX_SCORE = 20_000;

export function gameMeta(key: string): GameMeta | null {
  return GAMES.find((g) => g.key === key) ?? null;
}
