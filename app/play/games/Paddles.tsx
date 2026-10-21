"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps, Lot } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Outbid! — whack-a-mole with bidder paddles. You are the
   auctioneer looking out at nine seats (3x3) in a barn at night.
   Bidders raise numbered paddles; tap one before it drops to take
   the bid. Gold paddles (star card) are worth more; a red NO SALE
   paddle costs you if you tap it. Consecutive catches build a
   combo with multipliers; combo 15 starts a five-second GAVEL
   FRENZY where everything is worth x1.5.

   All layout is derived from a `Layout` recomputed on resize, so a
   rotate mid-run just re-flows the room.
   ───────────────────────────────────────────────────────────── */

const RUN_TIME = 60;
const COUNTDOWN = 3.6; // 3-2-1 then "GO!" for the last 0.6 s
const RISE_T = 0.22; // paddle rise (ease-out)
const DROP_T = 0.18; // paddle drop (ease-in)
const SOLD_T = 0.55; // card fly-away after a catch
const CHEER_T = 0.8; // bidder arms-up after a catch
const HOLD_START = 1.3; // seconds a paddle stays up at the start
const HOLD_END = 0.55; // ... and at the end of the run
const GAP_START = 1.55; // seconds between spawns at the start
const GAP_END = 0.78; // ... and at the end
const FRENZY_GAP = 0.55;
const FRENZY_T = 5;
const FRENZY_AT = 15; // combo that triggers the frenzy
const SIGN_EVERY = 8; // seconds per NOW SELLING title
const PTS_BID = 100;
const PTS_GOLD = 300;
const PENALTY = 200;
const P_GOLD = 0.1;
const MIN_HIT = 64; // minimum hit box (px)

const FALLBACK_LOTS = [
  "Antique Milk Can",
  "Cast Iron Skillet Set",
  "Vintage Tackle Box",
  "Oak Rocking Chair",
  "Barn Lantern",
  "Hand Stitched Quilt",
  "Maple Syrup Taps",
  "Stoneware Crock",
  "Pair of Snowshoes",
  "Pine Blanket Chest",
];

const SKINS = ["#f1c9a5", "#e0a883", "#c68a5e", "#9c6a44", "#6f4a30", "#f5d7b8"];
const SHIRTS = ["#c94b3f", "#3b6fb6", "#3f8f4e", "#d08a2e", "#7a4fa3", "#2f8f8a", "#b53f7a", "#8c6a3c"];
const HAT_COLORS = ["#2b2b2b", "#8a2e2e", "#2f4f8f", "#5b3a1e", "#c7922b", "#3f6b3f", "#6b2e6b"];
const HAIR = ["#2a1b10", "#5a3a1e", "#c99a4a", "#8c8c8c"];

const TAU = Math.PI * 2;
const FONT = (px: number) => `900 ${px}px system-ui, -apple-system, sans-serif`;

/* ───────────── helpers ───────────── */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
/** Deterministic 0..1 noise for scenery. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const multFor = (combo: number) => (combo >= 10 ? 2 : combo >= 5 ? 1.5 : 1);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  color: string,
  align: CanvasTextAlign = "left",
  outline = true,
) {
  ctx.font = FONT(px);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (outline) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, px * 0.2);
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Shorten `text` with "..." until it fits `maxW` in the current font. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "...").width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "...";
}

/** fitText is called every frame for the NOW SELLING sign; cache it by (title, width, font px). */
const fitCache = new Map<string, { text: string; width: number }>();
function fitTextCached(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number) {
  const key = px + "|" + Math.round(maxW) + "|" + text;
  const hit = fitCache.get(key);
  if (hit) return hit;
  const fitted = fitText(ctx, text, maxW);
  const entry = { text: fitted, width: ctx.measureText(fitted).width };
  if (fitCache.size > 64) fitCache.clear();
  fitCache.set(key, entry);
  return entry;
}

/* ───────────── types ───────────── */

type Kind = 0 | 1 | 2; // 0 bid, 1 gold, 2 NO SALE
type PPhase = "none" | "rise" | "hold" | "drop" | "sold";

type Look = { skin: string; shirt: string; hat: number; hatColor: string };

type Seat = {
  look: Look;
  bob: number; // per-seat bob phase
  cheer: number; // seconds of cheering left
  kind: Kind;
  num: number;
  phase: PPhase;
  pt: number; // time in the current paddle phase
  hold: number; // this paddle's hold time
};

type Float = { x: number; y: number; t: number; max: number; text: string; color: string; px: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
};

type Layout = {
  pad: number;
  hudH: number;
  bannerY: number;
  bannerH: number;
  signY: number;
  signH: number;
  gx: number;
  gy: number;
  cell: number;
  ui: number;
};

type Phase = "idle" | "countdown" | "playing" | "over";

type G = {
  W: number;
  H: number;
  L: Layout;
  phase: Phase;
  ended: boolean;
  t: number; // wall clock for animation (s)
  countdown: number;
  elapsed: number; // play time (s)
  score: number;
  shown: number;
  combo: number;
  frenzy: number; // seconds of frenzy left
  spawnTimer: number;
  seats: Seat[];
  floats: Float[];
  parts: Particle[];
  flash: number;
  flashColor: string;
  shake: number;
  lastHud: number;
  lastSfx: number;
  titles: string[];
  signIdx: number;
  signTick: number;
  signPop: number;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function randomLook(): Look {
  const hat = Math.floor(Math.random() * 5);
  return {
    skin: pick(SKINS),
    shirt: pick(SHIRTS),
    hat,
    hatColor: hat === 0 ? pick(HAIR) : pick(HAT_COLORS),
  };
}

function makeSeat(): Seat {
  return {
    look: randomLook(),
    bob: Math.random() * 10,
    cheer: 0,
    kind: 0,
    num: 1,
    phase: "none",
    pt: 0,
    hold: 1,
  };
}

function layoutFor(W: number, H: number): Layout {
  const ui = clamp(Math.min(W, H) / 390, 0.85, 1.25);
  const pad = Math.round(10 * ui);
  const hudH = Math.round(46 * ui);
  const signH = Math.round(34 * ui);
  const bannerMin = Math.round(36 * ui);
  const bottomMin = Math.round(40 * ui);
  const cellW = (W - pad * 2) / 3;
  const cellH = (H - hudH - signH - bannerMin - bottomMin) / 3;
  const cell = Math.max(40, Math.min(cellW, cellH));
  const extra = Math.max(0, H - hudH - signH - bannerMin - bottomMin - cell * 3);
  const bannerH = bannerMin + extra * 0.38;
  const bannerY = hudH;
  const signY = bannerY + bannerH;
  const gy = signY + signH;
  const gx = (W - cell * 3) / 2;
  return { pad, hudH, bannerY, bannerH, signY, signH, gx, gy, cell, ui };
}

function makeState(): G {
  return {
    W: 390,
    H: 700,
    L: layoutFor(390, 700),
    phase: "idle",
    ended: false,
    t: 0,
    countdown: COUNTDOWN,
    elapsed: 0,
    score: 0,
    shown: 0,
    combo: 0,
    frenzy: 0,
    spawnTimer: 0,
    seats: Array.from({ length: 9 }, makeSeat),
    floats: [],
    parts: [],
    flash: 0,
    flashColor: "#fff",
    shake: 0,
    lastHud: 0,
    lastSfx: 0,
    titles: FALLBACK_LOTS,
    signIdx: 0,
    signTick: 0,
    signPop: 0,
  };
}

/* ───────────── geometry ───────────── */

type SeatGeom = {
  x0: number;
  y0: number;
  cx: number;
  headY: number;
  r: number;
  baleY: number;
  cardW: number;
  cardH: number;
  cardX: number;
  upY: number;
  downY: number;
  stickX: number;
};

function seatGeom(L: Layout, i: number): SeatGeom {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const c = L.cell;
  const x0 = L.gx + col * c;
  const y0 = L.gy + row * c;
  const r = c * 0.15;
  const cx = x0 + c / 2;
  return {
    x0,
    y0,
    cx,
    headY: y0 + c * 0.58,
    r,
    baleY: y0 + c * 0.86,
    cardW: c * 0.46,
    cardH: c * 0.3,
    cardX: cx + r * 0.7,
    upY: y0 + c * 0.2,
    downY: y0 + c * 0.82,
    stickX: cx + r * 1.6,
  };
}

/** 0 = tucked away behind the bidder, 1 = fully raised. */
function paddleProgress(s: Seat) {
  switch (s.phase) {
    case "rise":
      return easeOut(clamp(s.pt / RISE_T, 0, 1));
    case "hold":
    case "sold":
      return 1;
    case "drop":
      return 1 - easeIn(clamp(s.pt / DROP_T, 0, 1));
    default:
      return 0;
  }
}

const isActive = (s: Seat) => s.phase === "rise" || s.phase === "hold" || s.phase === "drop";

/* ───────────── run control ───────────── */

function resetRun(g: G, lots: Lot[]) {
  const titles = lots.map((l) => l.title.trim()).filter((t) => t.length > 0);
  g.titles = titles.length ? titles : FALLBACK_LOTS;
  g.phase = "countdown";
  g.ended = false;
  g.countdown = COUNTDOWN;
  g.elapsed = 0;
  g.score = 0;
  g.shown = 0;
  g.combo = 0;
  g.frenzy = 0;
  g.spawnTimer = 0.4;
  g.seats = Array.from({ length: 9 }, makeSeat);
  g.floats = [];
  g.parts = [];
  g.flash = 0;
  g.shake = 0;
  g.lastHud = 0;
  g.lastSfx = 0;
  g.signIdx = Math.floor(Math.random() * g.titles.length);
  g.signTick = 0;
  g.signPop = 0;
}

/** A still of the room for before START: three paddles up, no HUD. */
function demoState(g: G) {
  g.phase = "idle";
  g.seats = Array.from({ length: 9 }, makeSeat);
  for (const i of [1, 3, 8]) {
    const s = g.seats[i];
    s.phase = "hold";
    s.pt = 0;
    s.hold = 99;
    s.num = 10 + Math.floor(Math.random() * 89);
    s.kind = i === 8 ? 1 : 0;
  }
}

function endRun(g: G, env: Env) {
  if (g.ended) return;
  g.ended = true;
  g.phase = "over";
  const final = clamp(Math.round(g.score), 0, MAX_SCORE);
  g.score = final;
  g.shown = final;
  env.sfx.gameOver();
  env.onHud?.({ score: final, timeLeft: 0 });
  env.onEnd(final);
}

function addFloat(g: G, x: number, y: number, text: string, color: string, px: number, max = 0.9) {
  g.floats.push({ x, y, t: 0, max, text, color, px });
}

function burst(g: G, x: number, y: number, n: number, colors: string[], speed: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const v = speed * (0.4 + Math.random() * 0.8);
    g.parts.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.5,
      life: 0,
      max: 0.5 + Math.random() * 0.4,
      size: 3 + Math.random() * 4,
      color: colors[i % colors.length],
      rot: Math.random() * TAU,
    });
  }
}

function playSfx(g: G, fn: () => void) {
  if (g.t - g.lastSfx < 0.11) return;
  g.lastSfx = g.t;
  fn();
}

/* ───────────── spawning ───────────── */

function spawnPaddles(g: G) {
  const u = clamp(g.elapsed / RUN_TIME, 0, 1);
  const free: number[] = [];
  g.seats.forEach((s, i) => {
    if (s.phase === "none") free.push(i);
  });
  if (!free.length) return;

  let count = 1;
  const r = Math.random();
  if (g.frenzy > 0) {
    count = 2 + (Math.random() < 0.5 ? 1 : 0);
  } else {
    const multi = lerp(0.06, 0.36, u);
    if (r < multi * 0.3) count = 3;
    else if (r < multi) count = 2;
  }
  count = Math.min(count, free.length);

  for (let k = 0; k < count; k++) {
    const idx = Math.floor(Math.random() * free.length);
    const seat = g.seats[free[idx]];
    free.splice(idx, 1);
    const kr = Math.random();
    const pRed = g.elapsed < 4 ? 0 : g.frenzy > 0 ? 0.05 : lerp(0.07, 0.13, u);
    seat.kind = kr < pRed ? 2 : kr < pRed + P_GOLD ? 1 : 0;
    seat.num = 1 + Math.floor(Math.random() * 99);
    seat.phase = "rise";
    seat.pt = 0;
    const hold = lerp(HOLD_START, HOLD_END, u) * (0.88 + Math.random() * 0.24);
    seat.hold = g.frenzy > 0 ? Math.max(hold, 0.75) : hold;
  }
}

/* ───────────── input ───────────── */

/** Which active seat (if any) the point lands on. Generous: card + head, min 64px. */
function seatAt(g: G, px: number, py: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < 9; i++) {
    const s = g.seats[i];
    if (!isActive(s)) continue;
    const sg = seatGeom(g.L, i);
    const p = paddleProgress(s);
    const cy = lerp(sg.downY, sg.upY, p);
    const hw = Math.max(sg.cardW, MIN_HIT) / 2 + 6;
    const top = Math.min(cy - sg.cardH / 2, sg.headY - sg.r) - 8;
    let bottom = sg.headY + sg.r + 10;
    if (bottom - top < MIN_HIT) bottom = top + MIN_HIT;
    const cxm = (sg.cardX + sg.cx) / 2;
    if (px < cxm - hw || px > cxm + hw || py < top || py > bottom) continue;
    const d = Math.hypot(px - sg.cardX, py - cy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function hitSeat(g: G, i: number, env: Env) {
  const s = g.seats[i];
  if (!isActive(s)) return;
  const sg = seatGeom(g.L, i);
  const cy = lerp(sg.downY, sg.upY, paddleProgress(s));
  const fx = sg.cardX;
  const fy = cy - sg.cardH * 0.7;
  const px = Math.round(g.L.cell * 0.16);

  if (s.kind === 2) {
    // NO SALE — penalty, combo gone.
    g.score = Math.max(0, g.score - PENALTY);
    g.combo = 0;
    s.phase = "sold";
    s.pt = 0;
    s.cheer = 0;
    g.shake = Math.max(g.shake, 0.25);
    g.flash = 0.35;
    g.flashColor = "#d83a2f";
    addFloat(g, fx, fy, "NO SALE", "#ff6b5e", px, 1);
    addFloat(g, fx, fy + px * 1.1, "-" + PENALTY, "#ffb0a8", px * 0.9, 1);
    burst(g, fx, cy, 6, ["#d83a2f", "#ff8a7a"], 140);
    playSfx(g, () => env.sfx.buzz());
    return;
  }

  g.combo++;
  const mult = multFor(g.combo) * (g.frenzy > 0 ? 1.5 : 1);
  const base = s.kind === 1 ? PTS_GOLD : PTS_BID;
  const pts = Math.round(base * mult);
  g.score = Math.min(MAX_SCORE, g.score + pts);
  s.phase = "sold";
  s.pt = 0;
  s.cheer = CHEER_T;

  const gold = s.kind === 1;
  addFloat(g, fx, fy, "SOLD!", gold ? "#ffe27a" : "#fff6d6", px, 0.9);
  addFloat(g, fx, fy + px * 1.1, "+" + pts, gold ? "#ffd23f" : "#9ff58a", px * 0.95, 1);
  burst(
    g,
    fx,
    cy,
    gold ? 14 : 7,
    gold ? ["#ffd23f", "#fff2a8", "#ffb000"] : ["#fff", "#9ff58a", "#ffe27a"],
    gold ? 200 : 140,
  );
  if (gold) {
    g.flash = Math.max(g.flash, 0.3);
    g.flashColor = "#ffd23f";
    playSfx(g, () => env.sfx.bullseye(g.combo));
  } else {
    playSfx(g, () => env.sfx.ding(g.combo));
  }

  if (g.combo === 5 || g.combo === 10) {
    const m = multFor(g.combo);
    addFloat(g, g.W / 2, g.L.gy + g.L.cell * 0.9, "x" + m + " BIDS!", "#ffd23f", px * 1.5, 1.1);
  }
  if (g.combo === FRENZY_AT) {
    g.frenzy = FRENZY_T;
    g.flash = 0.5;
    g.flashColor = "#ffd23f";
    g.shake = Math.max(g.shake, 0.3);
    g.spawnTimer = 0;
  }
}

function tap(g: G, px: number, py: number, env: Env) {
  if (g.phase !== "playing") return;
  const i = seatAt(g, px, py);
  if (i < 0) return;
  hitSeat(g, i, env);
}

/* ───────────── update ───────────── */

function update(g: G, dt: number, env: Env, now: number) {
  g.t += dt;
  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.shake = Math.max(0, g.shake - dt);
  g.signPop = Math.max(0, g.signPop - dt * 3);

  if (g.phase === "countdown") {
    g.countdown -= dt;
    if (g.countdown <= 0) {
      g.phase = "playing";
      g.elapsed = 0;
      g.spawnTimer = 0.3;
    }
  } else if (g.phase === "playing") {
    g.elapsed += dt;
    const u = clamp(g.elapsed / RUN_TIME, 0, 1);

    const idx = Math.floor(g.elapsed / SIGN_EVERY);
    if (idx !== g.signTick) {
      g.signTick = idx;
      if (idx > 0) g.signPop = 1;
    }

    if (g.frenzy > 0) g.frenzy = Math.max(0, g.frenzy - dt);

    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnPaddles(g);
      const gap = g.frenzy > 0 ? FRENZY_GAP : lerp(GAP_START, GAP_END, u);
      g.spawnTimer = gap * (0.8 + Math.random() * 0.4);
    }

    if (g.elapsed >= RUN_TIME) {
      endRun(g, env);
    }
  }

  // Paddles and bidders animate in every phase (the still and the freeze too).
  for (const s of g.seats) {
    if (s.cheer > 0) s.cheer = Math.max(0, s.cheer - dt);
    if (s.phase === "none") continue;
    s.pt += dt;
    if (s.phase === "rise" && s.pt >= RISE_T) {
      s.phase = "hold";
      s.pt = 0;
    } else if (s.phase === "hold" && s.pt >= s.hold) {
      s.phase = "drop";
      s.pt = 0;
    } else if (s.phase === "drop" && s.pt >= DROP_T) {
      s.phase = "none";
      s.pt = 0;
      // A bid that dropped untouched breaks the combo. NO SALE dropping is fine.
      if (s.kind !== 2 && g.phase === "playing") {
        if (g.combo >= 5) {
          addFloat(g, g.W / 2, g.L.gy + g.L.cell * 1.5, "COMBO LOST", "#c9c9c9", g.L.cell * 0.17, 0.8);
        }
        g.combo = 0;
      }
    } else if (s.phase === "sold" && s.pt >= SOLD_T) {
      s.phase = "none";
      s.pt = 0;
    }
  }

  for (let i = g.floats.length - 1; i >= 0; i--) {
    const f = g.floats[i];
    f.t += dt;
    f.y -= dt * 38;
    if (f.t >= f.max) g.floats.splice(i, 1);
  }
  for (let i = g.parts.length - 1; i >= 0; i--) {
    const p = g.parts[i];
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    p.rot += dt * 6;
    if (p.life >= p.max) g.parts.splice(i, 1);
  }

  // Score counter rolls up to the real score.
  const diff = g.score - g.shown;
  if (Math.abs(diff) < 1) g.shown = g.score;
  else g.shown += diff * Math.min(1, dt * 12);

  if (env.onHud && now - g.lastHud > 100 && g.phase !== "over") {
    g.lastHud = now;
    env.onHud({
      score: Math.round(g.score),
      timeLeft: g.phase === "playing" ? Math.max(0, Math.ceil(RUN_TIME - g.elapsed)) : RUN_TIME,
    });
  }
}

/* ───────────── drawing: scenery ───────────── */

function drawWall(ctx: CanvasRenderingContext2D, W: number, horizon: number, seed: number) {
  ctx.fillStyle = "#4a3221";
  ctx.fillRect(0, 0, W, horizon);
  const ph = 22;
  for (let y = 0, k = 0; y < horizon; y += ph, k++) {
    const v = hash(seed + k * 1.7);
    ctx.fillStyle = `rgba(${20 + v * 30},${8 + v * 16},0,${0.18 + v * 0.18})`;
    ctx.fillRect(0, y, W, ph);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, y + ph - 1.5, W, 1.5);
    // a plank joint somewhere along the row
    const jx = hash(seed * 2 + k * 3.3) * W;
    ctx.fillRect(jx, y, 1.5, ph);
  }
  // vertical posts
  ctx.fillStyle = "#2e1d11";
  for (const fx of [0.08, 0.5, 0.92]) {
    ctx.fillRect(W * fx - 7, 0, 14, horizon);
    ctx.fillStyle = "rgba(255,210,150,0.08)";
    ctx.fillRect(W * fx - 7, 0, 3, horizon);
    ctx.fillStyle = "#2e1d11";
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, W: number, y0: number, H: number, seed: number) {
  const grad = ctx.createLinearGradient(0, y0, 0, H);
  grad.addColorStop(0, "#3a2717");
  grad.addColorStop(1, "#1f1409");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0, W, H - y0);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = (W / n) * i + (hash(seed + i) - 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(W / 2 + (x - W / 2) * 1.35, H);
    ctx.stroke();
  }
}

function drawBulb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glow: number, t: number) {
  const flick = 0.85 + 0.15 * Math.sin(t * 9 + x) * Math.sin(t * 2.3 + x * 0.3);
  const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, glow);
  grad.addColorStop(0, `rgba(255,214,140,${0.32 * flick})`);
  grad.addColorStop(1, "rgba(255,214,140,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x - glow, y - glow, glow * 2, glow * 2);
  ctx.strokeStyle = "#1a1109";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, y - r * 1.4);
  ctx.stroke();
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x - r * 0.5, y - r * 1.9, r, r * 0.8);
  ctx.fillStyle = `rgba(255,236,170,${0.75 + 0.25 * flick})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU);
  ctx.fill();
}

function drawBanner(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, text: boolean) {
  const notch = h * 0.45;
  ctx.strokeStyle = "#1a1109";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 6, 0);
  ctx.lineTo(cx - w / 2 + 6, cy - h / 2);
  ctx.moveTo(cx + w / 2 - 6, 0);
  ctx.lineTo(cx + w / 2 - 6, cy - h / 2);
  ctx.stroke();
  ctx.fillStyle = "#a8322c";
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx + w / 2 - notch, cy);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2 + notch, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#f3e3b8";
  ctx.lineWidth = Math.max(1.5, h * 0.06);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(cx - w / 2 + notch, cy + h * 0.3, w - notch * 2, h * 0.2);
  if (text) {
    const px = Math.min(h * 0.5, (w - notch * 2.4) / 8.2);
    label(ctx, "NORTHWOOD BIDS", cx, cy, px, "#f8ecc8", "center", false);
  }
}

function drawBales(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const bw = h * 2.6;
  const n = Math.ceil(w / bw) + 1;
  for (let i = 0; i < n; i++) {
    const bx = x + i * bw - (hash(seed) * bw) / 2;
    const v = hash(seed + i * 2.1);
    ctx.fillStyle = `rgb(${196 + v * 30},${150 + v * 26},${60 + v * 20})`;
    roundRect(ctx, bx, y, bw - 3, h, h * 0.18);
    ctx.fill();
    ctx.fillStyle = "rgba(90,60,10,0.35)";
    ctx.fillRect(bx + 2, y + h * 0.72, bw - 7, h * 0.28);
    // twine
    ctx.strokeStyle = "rgba(90,60,10,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.3, y);
    ctx.lineTo(bx + bw * 0.3, y + h);
    ctx.moveTo(bx + bw * 0.66, y);
    ctx.lineTo(bx + bw * 0.66, y + h);
    ctx.stroke();
    // a few straws
    ctx.strokeStyle = "rgba(255,230,140,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const sx = bx + hash(seed + i * 7 + k) * (bw - 10) + 4;
      const sy = y + hash(seed + i * 5 + k * 3) * (h * 0.6) + 2;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 5, sy + 2);
    }
    ctx.stroke();
  }
}

function drawPodium(ctx: CanvasRenderingContext2D, W: number, H: number, h: number) {
  const w = Math.min(W * 0.5, h * 4.2);
  const cx = W / 2;
  ctx.fillStyle = "#120b05";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, H);
  ctx.lineTo(cx - w * 0.5, H - h * 0.8);
  ctx.lineTo(cx - w * 0.52, H - h);
  ctx.lineTo(cx + w * 0.52, H - h);
  ctx.lineTo(cx + w * 0.5, H - h * 0.8);
  ctx.lineTo(cx + w * 0.42, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,220,160,0.12)";
  ctx.fillRect(cx - w * 0.52, H - h, w * 1.04, 3);
  // gavel resting on the podium edge
  const gx = cx + w * 0.28;
  const gy = H - h - 4;
  ctx.fillStyle = "#1b1109";
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(-0.25);
  ctx.fillRect(-h * 0.4, -3, h * 0.8, 6);
  ctx.fillRect(h * 0.25, -h * 0.22, h * 0.26, h * 0.44);
  ctx.restore();
}

/* ───────────── drawing: sprites ───────────── */

function drawHat(ctx: CanvasRenderingContext2D, look: Look, cx: number, hy: number, r: number) {
  const top = hy - r;
  ctx.fillStyle = look.hatColor;
  switch (look.hat) {
    case 0: {
      // hair
      ctx.beginPath();
      ctx.arc(cx, hy - r * 0.1, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 1: {
      // ball cap
      ctx.beginPath();
      ctx.arc(cx, hy - r * 0.15, r * 1.02, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      roundRect(ctx, cx - r * 0.2, hy - r * 0.3, r * 1.5, r * 0.3, r * 0.1);
      ctx.fill();
      break;
    }
    case 2: {
      // cowboy hat
      ctx.beginPath();
      ctx.ellipse(cx, hy - r * 0.5, r * 1.7, r * 0.42, 0, 0, TAU);
      ctx.fill();
      roundRect(ctx, cx - r * 0.75, top - r * 0.9, r * 1.5, r * 1.2, r * 0.3);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(cx - r * 0.75, hy - r * 0.75, r * 1.5, r * 0.18);
      break;
    }
    case 3: {
      // bandana with a knot
      ctx.beginPath();
      ctx.arc(cx, hy - r * 0.05, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.9, hy - r * 0.45);
      ctx.lineTo(cx + r * 1.5, hy - r * 0.3);
      ctx.lineTo(cx + r * 1.1, hy + r * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(cx - r * 0.5 + k * r * 0.5, hy - r * 0.6, r * 0.08, 0, TAU);
        ctx.fill();
      }
      break;
    }
    default: {
      // beanie with pompom
      ctx.beginPath();
      ctx.arc(cx, hy - r * 0.2, r * 1.04, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(cx - r * 1.04, hy - r * 0.45, r * 2.08, r * 0.25);
      ctx.fillStyle = "#f3e3b8";
      ctx.beginPath();
      ctx.arc(cx, top - r * 0.25, r * 0.28, 0, TAU);
      ctx.fill();
      break;
    }
  }
}

/**
 * One cartoon bidder. `t` drives the 2-frame bob, `cheer` > 0 puts the arms up
 * (2 frames), `holding` raises the paddle arm to the stick.
 */
function drawBidder(
  ctx: CanvasRenderingContext2D,
  look: Look,
  cx: number,
  headY: number,
  r: number,
  bottomY: number,
  t: number,
  bob: number,
  cheer: number,
  holding: boolean,
) {
  const frame = Math.floor((t * 2.4 + bob) % 2);
  const cheering = cheer > 0;
  const hy = headY + (cheering ? -r * 0.35 : frame === 0 ? 0 : -r * 0.12);
  const shoulderY = hy + r * 1.1;
  const bw = r * 1.9;

  // body
  ctx.fillStyle = look.shirt;
  roundRect(ctx, cx - bw, hy + r * 0.72, bw * 2, bottomY - (hy + r * 0.72) + 10, r * 0.9);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(ctx, cx - bw, hy + r * 1.9, bw * 2, Math.max(0, bottomY - (hy + r * 1.9) + 10), r * 0.5);
  ctx.fill();
  // collar
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, hy + r * 0.72);
  ctx.lineTo(cx, hy + r * 1.25);
  ctx.lineTo(cx + r * 0.55, hy + r * 0.72);
  ctx.closePath();
  ctx.fill();

  // arms
  ctx.strokeStyle = look.shirt;
  ctx.lineWidth = r * 0.5;
  ctx.lineCap = "round";
  const hands: [number, number][] = [];
  const arm = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    hands.push([x2, y2]);
  };
  if (cheering) {
    const f = Math.floor(t * 9) % 2;
    const dx = f === 0 ? 2.0 : 1.6;
    const dy = f === 0 ? 1.1 : 1.7;
    arm(cx - r * 1.5, shoulderY, cx - r * dx, hy - r * dy);
    arm(cx + r * 1.5, shoulderY, cx + r * dx, hy - r * dy);
  } else {
    arm(cx - r * 1.6, shoulderY, cx - r * 2.0, shoulderY + r * 1.4);
    if (holding) arm(cx + r * 1.5, shoulderY, cx + r * 1.6, hy + r * 0.3);
    else arm(cx + r * 1.6, shoulderY, cx + r * 2.0, shoulderY + r * 1.4);
  }
  ctx.fillStyle = look.skin;
  for (const [hx, hyy] of hands) {
    ctx.beginPath();
    ctx.arc(hx, hyy, r * 0.3, 0, TAU);
    ctx.fill();
  }

  // head
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(cx, hy + r * 0.12, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx, hy, r, 0, TAU);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#1a1109";
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, hy - r * 0.05, r * 0.11, 0, TAU);
  ctx.arc(cx + r * 0.35, hy - r * 0.05, r * 0.11, 0, TAU);
  ctx.fill();
  // mouth
  if (cheering) {
    ctx.fillStyle = "#5a1f1a";
    ctx.beginPath();
    ctx.ellipse(cx, hy + r * 0.42, r * 0.3, r * 0.24, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = "#5a1f1a";
    ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.beginPath();
    ctx.arc(cx, hy + r * 0.25, r * 0.38, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  drawHat(ctx, look, cx, hy, r);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  kind: Kind,
  num: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  roundRect(ctx, -w / 2 + 2, -h / 2 + 3, w, h, h * 0.18);
  ctx.fill();
  if (kind === 1) {
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, "#ffe680");
    grad.addColorStop(1, "#e0a92a");
    ctx.fillStyle = grad;
  } else if (kind === 2) {
    ctx.fillStyle = "#d83a2f";
  } else {
    ctx.fillStyle = "#fbf7ee";
  }
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.18);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, h * 0.07);
  ctx.strokeStyle = kind === 1 ? "#9a6a0c" : kind === 2 ? "#7a1b14" : "#3a3a3a";
  ctx.stroke();
  if (kind === 1) {
    starPath(ctx, 0, 0, h * 0.36, h * 0.16);
    ctx.fillStyle = "#fff8d0";
    ctx.fill();
    ctx.strokeStyle = "#9a6a0c";
    ctx.lineWidth = Math.max(1, h * 0.05);
    ctx.stroke();
  } else if (kind === 2) {
    // "no" ring with a diagonal bar
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, h * 0.11);
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.21, -h * 0.21);
    ctx.lineTo(h * 0.21, h * 0.21);
    ctx.stroke();
  } else {
    ctx.font = FONT(h * 0.62);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(String(num), 0, h * 0.04);
  }
  ctx.restore();
}

function drawStick(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, w: number) {
  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
}

/* ───────────── drawing: seats ───────────── */

function drawSeatRow(ctx: CanvasRenderingContext2D, g: G, row: number) {
  const L = g.L;
  for (let col = 0; col < 3; col++) {
    const i = row * 3 + col;
    const s = g.seats[i];
    const sg = seatGeom(L, i);
    const p = paddleProgress(s);

    // paddle behind the bidder (rising from behind the head)
    if (isActive(s)) {
      const cy = lerp(sg.downY, sg.upY, p);
      drawStick(ctx, sg.stickX, cy + sg.cardH / 2 - 2, sg.headY + sg.r * 0.3, Math.max(3, sg.r * 0.22));
      drawCard(ctx, s.kind, s.num, sg.cardX, cy, sg.cardW, sg.cardH, 0);
    }

    drawBidder(ctx, s.look, sg.cx, sg.headY, sg.r, sg.baleY, g.t, s.bob, s.cheer, isActive(s));

    // the sold card flies up and fades (or drops away for NO SALE)
    if (s.phase === "sold") {
      const k = clamp(s.pt / SOLD_T, 0, 1);
      const dir = s.kind === 2 ? 1 : -1;
      const cy = sg.upY + dir * easeOut(k) * L.cell * 0.7;
      ctx.globalAlpha = 1 - k * k;
      drawCard(ctx, s.kind, s.num, sg.cardX, cy, sg.cardW, sg.cardH, Math.sin(k * 6) * 0.25 * dir);
      ctx.globalAlpha = 1;
    }
  }
  // hay bale bench in front of this row
  const bh = L.cell * 0.17;
  drawBales(ctx, L.gx - L.cell * 0.25, L.gy + row * L.cell + L.cell * 0.86, L.cell * 3.5, bh, 11 + row * 17);
}

/* ───────────── drawing: HUD ───────────── */

function drawSign(ctx: CanvasRenderingContext2D, g: G) {
  const L = g.L;
  const title = g.titles[(g.signIdx + Math.floor(g.elapsed / SIGN_EVERY)) % g.titles.length];
  const w = Math.min(g.W - L.pad * 2, Math.max(L.cell * 3, 260));
  const h = L.signH * 0.86;
  const cx = g.W / 2;
  const cy = L.signY + L.signH / 2;
  const pop = 1 + g.signPop * 0.08;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, -w / 2 + 2, -h / 2 + 3, w, h, 5);
  ctx.fill();
  ctx.fillStyle = "#6b4423";
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = "#3a2312";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,230,170,0.12)";
  ctx.fillRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.3);
  const px = Math.max(13, Math.round(h * 0.42));
  ctx.font = FONT(px);
  const tag = "NOW SELLING: ";
  const tagW = ctx.measureText(tag).width;
  const fitted = fitTextCached(ctx, title.toUpperCase(), w - tagW - 20, px);
  const total = tagW + fitted.width;
  label(ctx, tag, -total / 2, 0, px, "#ffd23f", "left", false);
  label(ctx, fitted.text, -total / 2 + tagW, 0, px, "#fbf7ee", "left", false);
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, g: G) {
  const L = g.L;
  const ui = L.ui;
  const pad = L.pad;
  // score
  const small = Math.max(13, Math.round(13 * ui));
  label(ctx, String(Math.round(g.shown)), pad, L.hudH * 0.42, Math.round(24 * ui), "#fff6d6", "left");
  label(ctx, "SCORE", pad, L.hudH * 0.42 + 18 * ui, small, "#c9b88a", "left", false);

  // combo pill
  if (g.combo >= 2) {
    const m = multFor(g.combo);
    const color = m >= 2 ? "#ffd23f" : m > 1 ? "#9ff58a" : "#fff";
    const txt = g.combo + " COMBO" + (m > 1 ? "  x" + m : "");
    ctx.font = FONT(Math.round(14 * ui));
    const tw = ctx.measureText(txt).width + 20 * ui;
    const ph = 24 * ui;
    const px = g.W - pad - tw;
    const py = L.hudH * 0.42 - ph / 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, px, py, tw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, txt, px + tw / 2, py + ph / 2, Math.round(14 * ui), color, "center", false);
    label(ctx, "COMBO", g.W - pad, L.hudH * 0.42 + 18 * ui, small, "#c9b88a", "right", false);
  }

  // time bar
  const frac = g.phase === "playing" ? clamp(1 - g.elapsed / RUN_TIME, 0, 1) : g.phase === "over" ? 0 : 1;
  const bx = g.W * 0.33;
  const bw = g.W * 0.34;
  const by = L.hudH * 0.42 - 4 * ui;
  const bh = 8 * ui;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fill();
  const barColor = frac < 0.2 ? "#ff5a4a" : frac < 0.5 ? "#ffd23f" : "#9ff58a";
  if (frac > 0) {
    ctx.fillStyle = barColor;
    roundRect(ctx, bx, by, bw * frac, bh, bh / 2);
    ctx.fill();
  }
  const secs = g.phase === "playing" ? Math.ceil(RUN_TIME - g.elapsed) : g.phase === "over" ? 0 : RUN_TIME;
  label(ctx, secs + "s", g.W / 2, by + bh + 11 * ui, small, "#fff6d6", "center", false);
}

function drawFrenzy(ctx: CanvasRenderingContext2D, g: G) {
  if (g.frenzy <= 0) return;
  const L = g.L;
  const k = g.frenzy / FRENZY_T;
  const pulse = 1 + Math.sin(g.t * 14) * 0.04;
  const y = L.gy + L.cell * 0.5;
  const h = L.cell * 0.42;
  const a = k < 0.15 ? k / 0.15 : 1;
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(20,10,0,0.75)";
  ctx.fillRect(0, y - h / 2, g.W, h);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(0, y - h / 2, g.W, 3);
  ctx.fillRect(0, y + h / 2 - 3, g.W, 3);
  ctx.save();
  ctx.translate(g.W / 2, y);
  ctx.scale(pulse, pulse);
  label(ctx, "GAVEL FRENZY", 0, -h * 0.12, Math.round(h * 0.42), "#ffd23f", "center");
  label(ctx, "ALL BIDS x1.5", 0, h * 0.26, Math.round(h * 0.2), "#fff6d6", "center", false);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCountdown(ctx: CanvasRenderingContext2D, g: G) {
  if (g.phase !== "countdown") return;
  const n = Math.ceil(g.countdown - 0.6);
  const text = n <= 0 ? "GO!" : String(n);
  const frac = n <= 0 ? (0.6 - g.countdown) / 0.6 : 1 - ((g.countdown - 0.6) % 1);
  const scale = 1 + (1 - Math.min(1, frac * 4)) * 0.6;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, g.W, g.H);
  ctx.save();
  ctx.translate(g.W / 2, g.L.gy + g.L.cell * 1.5);
  ctx.scale(scale, scale);
  label(ctx, text, 0, 0, Math.round(g.L.cell * 0.9), n <= 0 ? "#9ff58a" : "#ffd23f", "center");
  ctx.restore();
  label(ctx, "TAP THE PADDLES", g.W / 2, g.L.gy + g.L.cell * 2.3, Math.round(g.L.cell * 0.16), "#fff6d6", "center");
}

/* ───────────── render ───────────── */

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H, L } = g;
  ctx.save();
  if (g.shake > 0) {
    const s = g.shake * 6;
    ctx.translate(Math.sin(g.t * 53) * s * 0.5, Math.cos(g.t * 47) * s * 0.5);
  }

  const horizon = L.gy + L.cell * 0.3;
  drawWall(ctx, W, horizon, 3);
  drawFloor(ctx, W, horizon, H + 20, 5);

  // banner on the back wall
  const bw = Math.min(W * 0.84, Math.max(L.cell * 3, 240));
  drawBanner(ctx, W / 2, L.bannerY + L.bannerH * 0.52, bw, Math.min(L.bannerH * 0.74, bw * 0.16), true);

  // hanging bulbs
  const bulbY = L.bannerY + L.bannerH * 0.15;
  const br = Math.max(4, L.cell * 0.05);
  for (const fx of [0.18, 0.5, 0.82]) drawBulb(ctx, W * fx, bulbY, br, L.cell * 1.2, g.t);

  // seats, back row first
  for (let row = 0; row < 3; row++) drawSeatRow(ctx, g, row);

  // podium silhouette at the bottom edge
  drawPodium(ctx, W, H + 2, Math.max(28, H - (L.gy + L.cell * 3) - 6));

  // particles
  for (const p of g.parts) {
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // floats
  for (const f of g.floats) {
    const k = f.t / f.max;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    label(ctx, f.text, f.x, f.y, f.px, f.color, "center");
  }
  ctx.globalAlpha = 1;

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawSign(ctx, g);
  if (g.phase !== "idle") {
    drawHud(ctx, g);
    drawFrenzy(ctx, g);
    drawCountdown(ctx, g);
  }

  if (g.flash > 0) {
    ctx.globalAlpha = Math.min(0.6, g.flash);
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ───────────── attract mode ───────────── */

const ATTRACT_LOOKS: Look[] = [
  { skin: "#f1c9a5", shirt: "#c94b3f", hat: 2, hatColor: "#5b3a1e" },
  { skin: "#9c6a44", shirt: "#3b6fb6", hat: 1, hatColor: "#2f4f8f" },
  { skin: "#e0a883", shirt: "#3f8f4e", hat: 3, hatColor: "#8a2e2e" },
];

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const loop = t % 5;
  const horizon = h * 0.52;
  drawWall(ctx, w, horizon, 3);
  drawFloor(ctx, w, horizon, h, 5);
  drawBanner(ctx, w / 2, h * 0.17, w * 0.7, h * 0.16, false);
  const r = h * 0.075;
  const cell = w / 3;
  const headY = h * 0.6;
  const baleY = h * 0.85;
  for (let i = 0; i < 3; i++) {
    const cx = cell * i + cell / 2;
    const s0 = 0.3 + i * 1.5; // when this paddle starts rising
    const k = loop - s0;
    let p = 0;
    let cheer = 0;
    if (k >= 0 && k < RISE_T) p = easeOut(k / RISE_T);
    else if (k >= RISE_T && k < 0.9) p = 1;
    else if (k >= 0.9 && k < 1.08) p = 1 - easeIn((k - 0.9) / DROP_T);
    if (k >= 0.9 && k < 1.5) cheer = 1;
    const active = p > 0;
    const cardW = r * 3;
    const cardH = r * 2;
    const upY = headY - r * 2.5;
    const downY = headY + r * 1.6;
    if (active) {
      const cy = lerp(downY, upY, p);
      drawStick(ctx, cx + r * 1.6, cy + cardH / 2, headY + r * 0.3, 2.5);
      drawCard(ctx, i === 1 ? 1 : 0, 10 + i * 31, cx + r * 0.7, cy, cardW, cardH, 0);
    }
    drawBidder(ctx, ATTRACT_LOOKS[i], cx, headY, r, baleY, t, i * 0.7, cheer, active);
  }
  drawBales(ctx, -10, baleY, w + 20, h * 0.1, 11);
  ctx.fillStyle = "#120b05";
  ctx.fillRect(w * 0.3, h * 0.94, w * 0.4, h * 0.06);
};

/* ───────────── component ───────────── */

const Game = forwardRef<GameHandle, GameProps>(function Game({ onEnd, onHud, sfx, lots }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<G>(makeState());
  const envRef = useRef<Env>({ onEnd, onHud, sfx });
  const lotsRef = useRef<Lot[]>(lots);
  const engineRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    envRef.current = { onEnd, onHud, sfx };
    lotsRef.current = lots;
  }, [onEnd, onHud, sfx, lots]);

  useImperativeHandle(ref, () => ({
    start: () => engineRef.current?.start(),
    stop: () => engineRef.current?.stop(),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stateRef.current;
    let raf = 0;
    let last = 0;
    let running = false;

    demoState(st);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(rect.width));
      const H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.W = W;
      st.H = H;
      st.L = layoutFor(W, H);
      if (!running) render(ctx, st);
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      update(st, dt, envRef.current, now);
      render(ctx, st);
      if (st.phase === "over") {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      resetRun(st, lotsRef.current);
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    engineRef.current = { start, stop };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      if (!e.isPrimary || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      tap(st, e.clientX - rect.left, e.clientY - rect.top, envRef.current);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (st.phase !== "playing" || e.repeat) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      e.preventDefault();
      hitSeat(st, n - 1, envRef.current);
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKeyDown);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);
    resize();

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKeyDown);
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black">
      <canvas ref={canvasRef} className="block w-full h-full touch-none select-none" />
    </div>
  );
});

export default Game;
