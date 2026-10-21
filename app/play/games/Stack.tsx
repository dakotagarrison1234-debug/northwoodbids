"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps, Lot } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Lot Drop — stack won lots on the bed of a pickup at the loading
   dock. A gantry crane swings each box over the truck; tap to drop
   it on the box below. Whatever hangs over is sliced off and
   tumbles away, and the next box is only as wide as what's left.
   A perfect drop keeps the full width; three perfects in a row
   grow the box back a little.

   World units: 1u = `unit` px where unit = min(W, 420). x is the
   offset from the screen centre, y is height above the truck bed
   (positive = up). The camera rises with the tower (cam, in u) so a
   resize mid-run just rescales everything.
   ───────────────────────────────────────────────────────────── */

const COUNTDOWN = 3.6; // 3-2-1 then "GO!" for the last 0.6 s
const START_W = 0.55; // first box width (u)
const BOX_H = 0.095; // box height (u)
const MIN_W = 0.08; // narrower than this ends the run (u)
const PERFECT_TOL = 0.03; // centre offset for a perfect (u)
const GROW = 0.035; // width regained per perfect once the streak is 3+ (u)
const GROW_AFTER = 3;
const HOVER_GAP = 3.4; // crane height above the tower (× box height)
const GRAVITY = 7.5; // u/s²
const SWING_BASE = 1.9; // rad/s
const SWING_RAMP = 0.22; // rad/s per 5 boxes
const RAMP_EVERY = 5;
const RAMP_CAP_BOX = 40; // speed stops ramping here
const MAX_AMP = 0.42; // swing amplitude cap (u)
const END_DELAY = 1.05; // seconds between the fatal drop and onEnd

const PTS_BOX = 150;
const PTS_PERFECT = 250;
const PTS_STREAK = 50;
const STREAK_CAP = 10;

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

const TAU = Math.PI * 2;
const FONT = (px: number) => `900 ${px}px system-ui, -apple-system, sans-serif`;

/* ───────────── helpers ───────────── */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Deterministic 0..1 noise for scenery and box looks. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

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

/* ───────────── types ───────────── */

type Box = {
  x: number; // left edge (u, from screen centre)
  w: number; // width (u)
  tone: number; // 0..1 → tan shade
  title: string;
  titleUpper: string; // cached at creation; drawn every frame
  stamp: 0 | 1 | 2; // none / FRAGILE / THIS SIDE UP
  /** Stamp text width per 1px of font size (so it scales with the box).
   *  0 until the first draw measures it (there is no ctx at creation). */
  stampEm: number;
  seed: number;
};

type Piece = {
  box: Box; // original box (for the texture)
  ox: number; // original box left edge when it was cut (u)
  px: number; // piece left edge (u)
  pw: number; // piece width (u)
  y: number; // piece bottom (u)
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
};

type Particle = {
  x: number;
  y: number; // u
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  spark: boolean;
  rot: number;
};

type Sticker = { x: number; y: number; t: number; text: string; color: string; px: number };

type Phase = "idle" | "countdown" | "playing" | "ending" | "over";

type G = {
  W: number;
  H: number;
  unit: number;
  phase: Phase;
  ended: boolean;
  t: number;
  countdown: number;
  score: number;
  shown: number;
  streak: number;
  tower: Box[];
  cur: Box | null;
  curFalling: boolean;
  swingPhase: number;
  swingDir: 1 | -1;
  curX: number; // left edge (u) while swinging/falling
  curVx: number; // u/s, for the hanging tilt
  curY: number; // bottom (u)
  curVy: number;
  craneX: number; // trolley position (u, centre) — remembered after the last drop
  cam: number;
  pieces: Piece[];
  particles: Particle[];
  stickers: Sticker[];
  flash: number;
  squash: number;
  sway: number;
  swayT: number;
  shake: number;
  endTimer: number;
  lastHud: number;
  lotIdx: number;
  titles: string[];
  seed: number;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function makeState(): G {
  return {
    W: 390,
    H: 700,
    unit: 390,
    phase: "idle",
    ended: false,
    t: 0,
    countdown: COUNTDOWN,
    score: 0,
    shown: 0,
    streak: 0,
    tower: [],
    cur: null,
    curFalling: false,
    swingPhase: -Math.PI / 2,
    swingDir: 1,
    curX: 0,
    curVx: 0,
    curY: 0,
    curVy: 0,
    craneX: 0,
    cam: 0,
    pieces: [],
    particles: [],
    stickers: [],
    flash: 0,
    squash: 0,
    sway: 0,
    swayT: 0,
    shake: 0,
    endTimer: 0,
    lastHud: 0,
    lotIdx: 0,
    titles: FALLBACK_LOTS,
    seed: 1,
  };
}

/* ───────────── geometry ───────────── */

const towerTop = (g: G) => g.tower.length * BOX_H;
const swingAmp = (g: G, w: number) => clamp(g.W / 2 / g.unit - 0.02 - w / 2, 0.08, MAX_AMP);
const swingSpeed = (n: number) =>
  SWING_BASE + SWING_RAMP * Math.floor(Math.min(n, RAMP_CAP_BOX) / RAMP_EVERY);
const camTarget = (g: G) => Math.max(0, towerTop(g) - (0.3 * g.H) / g.unit);

/** world → screen */
const sx = (g: G, x: number) => g.W / 2 + x * g.unit;
const sy = (g: G, y: number) => g.H * 0.8 - (y - g.cam) * g.unit;

function makeBox(g: G, x: number, w: number): Box {
  const seed = g.seed++;
  const r = hash(seed * 3.1);
  const stamp: 0 | 1 | 2 = r < 0.4 ? 0 : r < 0.72 ? 1 : 2;
  const title = g.titles[g.lotIdx % g.titles.length];
  g.lotIdx++;
  return { x, w, tone: hash(seed * 7.7), title, titleUpper: title.toUpperCase(), stamp, stampEm: 0, seed };
}

function spawnBox(g: G) {
  const n = g.tower.length;
  const prev = g.tower[n - 1];
  let w = prev ? prev.w : START_W;
  if (prev && g.streak >= GROW_AFTER) w = Math.min(START_W, w + GROW);
  g.swingDir = g.swingDir === 1 ? -1 : 1;
  g.swingPhase = -Math.PI / 2;
  const amp = swingAmp(g, w);
  g.curX = -g.swingDir * amp - w / 2;
  g.curVx = 0;
  g.curY = towerTop(g) + HOVER_GAP * BOX_H;
  g.curVy = 0;
  g.curFalling = false;
  g.cur = makeBox(g, g.curX, w);
}

function resetRun(g: G, lots: Lot[]) {
  const titles = lots.map((l) => l.title.trim()).filter((t) => t.length > 0);
  g.titles = titles.length ? titles : FALLBACK_LOTS;
  g.lotIdx = 0;
  g.seed = 1 + Math.floor(Math.random() * 1000);
  g.phase = "countdown";
  g.ended = false;
  g.t = 0;
  g.countdown = COUNTDOWN;
  g.score = 0;
  g.shown = 0;
  g.streak = 0;
  g.tower = [];
  g.cur = null;
  g.swingDir = Math.random() < 0.5 ? 1 : -1;
  g.cam = 0;
  g.pieces = [];
  g.particles = [];
  g.stickers = [];
  g.flash = 0;
  g.squash = 0;
  g.sway = 0;
  g.swayT = 0;
  g.shake = 0;
  g.endTimer = 0;
  g.lastHud = 0;
  spawnBox(g);
}

/** The still shown before START: a short tower and a hanging box. */
function demoState(g: G) {
  g.phase = "idle";
  g.tower = [];
  g.seed = 11;
  g.lotIdx = 0;
  g.titles = FALLBACK_LOTS;
  const xs = [-START_W / 2, -START_W / 2 + 0.02, -START_W / 2 + 0.05];
  const ws = [START_W, START_W - 0.02, START_W - 0.06];
  for (let i = 0; i < 3; i++) g.tower.push(makeBox(g, xs[i], ws[i]));
  g.cam = 0;
  g.cur = makeBox(g, 0.1, ws[2]);
  g.curX = 0.1;
  g.curY = towerTop(g) + HOVER_GAP * BOX_H;
  g.curFalling = false;
  g.curVx = -0.3;
}

/* ───────────── effects ───────────── */

function addDust(g: G, x0: number, x1: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, Math.random());
    const side = x < (x0 + x1) / 2 ? -1 : 1;
    g.particles.push({
      x,
      y: y + Math.random() * 0.01,
      vx: side * (0.08 + Math.random() * 0.25),
      vy: 0.05 + Math.random() * 0.2,
      life: 0,
      max: 0.4 + Math.random() * 0.35,
      size: 0.008 + Math.random() * 0.012,
      spark: false,
      rot: 0,
    });
  }
}

function addSparks(g: G, x0: number, x1: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    g.particles.push({
      x: lerp(x0, x1, Math.random()),
      y: y + Math.random() * BOX_H,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.3 + Math.random() * 0.6,
      life: 0,
      max: 0.5 + Math.random() * 0.4,
      size: 0.01 + Math.random() * 0.012,
      spark: true,
      rot: Math.random() * TAU,
    });
  }
  if (g.particles.length > 140) g.particles.splice(0, g.particles.length - 140);
}

function addSticker(g: G, x: number, y: number, text: string, color: string, px: number) {
  g.stickers.push({ x, y, t: 0, text, color, px });
  if (g.stickers.length > 6) g.stickers.shift();
}

function addPiece(g: G, box: Box, ox: number, px: number, pw: number, y: number, dir: number) {
  g.pieces.push({
    box,
    ox,
    px,
    pw,
    y,
    vx: dir * (0.15 + Math.random() * 0.2),
    vy: 0.25 + Math.random() * 0.2,
    rot: 0,
    vrot: dir * (2.5 + Math.random() * 3),
  });
}

/* ───────────── game logic ───────────── */

function endRun(g: G, env: Env) {
  if (g.ended) return;
  g.ended = true;
  g.phase = "over";
  env.sfx.gameOver();
  const final = clamp(Math.round(g.score), 0, MAX_SCORE);
  env.onHud?.({ score: final });
  env.onEnd(final);
}

function drop(g: G) {
  if (g.phase !== "playing" || !g.cur || g.curFalling) return;
  g.curFalling = true;
  g.curVy = 0;
}

function land(g: G, env: Env) {
  const box = g.cur;
  if (!box) return;
  const n = g.tower.length;
  const top = n * BOX_H;
  const base = g.tower[n - 1];
  const fx = g.curX;
  const fw = box.w;
  const bx = base ? base.x : -START_W / 2;
  const bw = base ? base.w : START_W;
  const bL = bx;
  const bR = bx + bw;
  const oL = Math.max(bL, fx);
  const oR = Math.min(bR, fx + fw);
  const overlap = oR - oL;
  const offset = fx + fw / 2 - (bx + bw / 2);

  if (overlap <= 0.004) {
    // Complete miss: the box tumbles past the tower.
    g.cur = null;
    addPiece(g, box, fx, fx, fw, top, offset < 0 ? -1 : 1);
    g.pieces[g.pieces.length - 1].vy = -0.2;
    g.streak = 0;
    g.phase = "ending";
    g.endTimer = END_DELAY;
    g.shake = 0.6;
    addSticker(g, fx + fw / 2, top + BOX_H * 1.5, "MISSED!", "#ff6b5e", 0.085);
    env.sfx.buzz();
    return;
  }

  const perfect = Math.abs(offset) <= PERFECT_TOL;
  let placed: Box;
  if (perfect) {
    // Keep the full width, centred on the base.
    placed = { ...box, x: bx + bw / 2 - fw / 2 };
    g.streak = Math.min(STREAK_CAP, g.streak + 1);
    g.score += PTS_BOX + PTS_PERFECT + PTS_STREAK * g.streak;
    g.flash = g.streak >= GROW_AFTER ? 0.35 : 0.22;
    addSparks(g, placed.x, placed.x + fw, top, 14 + g.streak * 2);
    addSticker(
      g,
      placed.x + fw / 2,
      top + BOX_H * 1.6,
      g.streak >= 2 ? `PERFECT x${g.streak}` : "PERFECT!",
      "#ffd54a",
      0.08,
    );
    env.sfx.bullseye(g.streak);
  } else {
    placed = { ...box, x: oL, w: overlap };
    // Slice off whatever hangs over (one side, or both if the box
    // had grown wider than its base).
    if (fx < oL) addPiece(g, box, fx, fx, oL - fx, top, -1);
    if (fx + fw > oR) addPiece(g, box, fx, oR, fx + fw - oR, top, 1);
    g.streak = 0;
    g.score += PTS_BOX;
    g.sway = clamp(Math.abs(offset) * 0.25, 0.004, 0.02);
    g.swayT = 0;
    env.sfx.thud();
    env.sfx.ding(Math.min(12, n));
  }
  g.score = Math.min(MAX_SCORE, g.score);
  g.tower.push(placed);
  g.squash = 1;
  addDust(g, placed.x, placed.x + placed.w, top, 10);
  g.cur = null;

  if (placed.w < MIN_W) {
    g.phase = "ending";
    g.endTimer = END_DELAY;
    addSticker(g, placed.x + placed.w / 2, top + BOX_H * 2.2, "TOO THIN!", "#ff6b5e", 0.085);
    env.sfx.buzz();
    return;
  }
  spawnBox(g);
}

function update(g: G, dt: number, env: Env, now: number) {
  g.t += dt;

  // The countdown keeps running in every phase; taps count as soon as
  // "GO!" shows (the last 0.6 s), and the stamp is drawn while countdown > 0.
  if (g.countdown > 0) {
    g.countdown -= dt;
    if (g.phase === "countdown" && g.countdown <= 0.6) g.phase = "playing";
  }

  // Crane swing / fall.
  if (g.cur) {
    const w = g.cur.w;
    if (!g.curFalling) {
      const amp = swingAmp(g, w);
      const omega = swingSpeed(g.tower.length);
      g.swingPhase += omega * dt;
      const centre = g.swingDir * amp * Math.sin(g.swingPhase);
      const nx = centre - w / 2;
      g.curVx = (nx - g.curX) / Math.max(dt, 1e-3);
      g.curX = nx;
      g.craneX = centre;
      g.curY = towerTop(g) + HOVER_GAP * BOX_H;
    } else {
      g.curVy -= GRAVITY * dt;
      g.curY += g.curVy * dt;
      g.curVx *= 0.9;
      const top = towerTop(g);
      if (g.curY <= top) {
        g.curY = top;
        land(g, env);
      }
    }
  }

  // Camera eases up to keep the tower top around mid-screen.
  g.cam = lerp(g.cam, camTarget(g), 1 - Math.pow(0.001, dt));

  // Pieces tumble away.
  const killY = g.cam - (g.H * 0.3) / g.unit - BOX_H * 2;
  for (let i = g.pieces.length - 1; i >= 0; i--) {
    const p = g.pieces[i];
    p.vy -= GRAVITY * dt;
    p.px += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
    if (p.y < killY) g.pieces.splice(i, 1);
  }

  // Particles.
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      g.particles.splice(i, 1);
      continue;
    }
    p.vy -= (p.spark ? 1.2 : 0.3) * dt;
    p.vx *= 1 - 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += 3 * dt;
  }

  // Stickers.
  for (let i = g.stickers.length - 1; i >= 0; i--) {
    g.stickers[i].t += dt;
    if (g.stickers[i].t > 1.1) g.stickers.splice(i, 1);
  }

  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.squash = Math.max(0, g.squash - dt * 4);
  g.swayT += dt;
  g.shake = Math.max(0, g.shake - dt * 2);
  g.shown = Math.abs(g.score - g.shown) < 1 ? g.score : lerp(g.shown, g.score, 1 - Math.pow(0.002, dt));

  if (g.phase === "ending") {
    g.endTimer -= dt;
    if (g.endTimer <= 0) endRun(g, env);
  }

  if (env.onHud && now - g.lastHud > 100 && g.phase !== "over") {
    g.lastHud = now;
    env.onHud({ score: Math.round(g.score) });
  }
}

/* ───────────── drawing: boxes ───────────── */

const toneFill = (tone: number) => `hsl(31, 44%, ${48 + tone * 14}%)`;

function drawStampShape(ctx: CanvasRenderingContext2D, b: Box, x: number, y: number, h: number) {
  // Red rubber stamp, slightly rotated. Text + a border; THIS SIDE UP
  // gets two little triangles drawn as paths.
  const kind = b.stamp;
  if (!kind) return;
  const px = h * 0.34;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.14);
  ctx.globalAlpha *= 0.72;
  ctx.fillStyle = "#c8322b";
  ctx.strokeStyle = "#c8322b";
  ctx.font = FONT(px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = kind === 1 ? "FRAGILE" : "THIS SIDE UP";
  // measured once per box (text width is linear in font size)
  if (!b.stampEm) b.stampEm = ctx.measureText(text).width / px;
  const tw = b.stampEm * px;
  const pad = px * 0.35;
  const bw = tw + pad * 2 + (kind === 2 ? px * 1.4 : 0);
  const bh = px * 1.5;
  ctx.lineWidth = Math.max(1, px * 0.12);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, px * 0.2);
  ctx.stroke();
  if (kind === 2) {
    ctx.fillText(text, px * 0.7, 0);
    const ax = -bw / 2 + pad + px * 0.35;
    for (let i = 0; i < 2; i++) {
      const ox = ax + i * px * 0.45;
      ctx.beginPath();
      ctx.moveTo(ox, -px * 0.45);
      ctx.lineTo(ox + px * 0.28, 0);
      ctx.lineTo(ox + px * 0.09, 0);
      ctx.lineTo(ox + px * 0.09, px * 0.45);
      ctx.lineTo(ox - px * 0.09, px * 0.45);
      ctx.lineTo(ox - px * 0.09, 0);
      ctx.lineTo(ox - px * 0.28, 0);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

/** A cardboard box: x,y top-left in screen px. */
function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, b: Box, unit: number) {
  ctx.fillStyle = toneFill(b.tone);
  ctx.fillRect(x, y, w, h);
  // top highlight / bottom shade / side edges
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x, y, w, h * 0.09);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
  const e = Math.min(3, w * 0.06);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(x, y, e, h);
  ctx.fillRect(x + w - e, y, e, h);
  // corrugation flap seam
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(x, y + h * 0.5, w, 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // vertical packing tape down the centre
  const tw = clamp(w * 0.1, 5, h * 0.3);
  const tx = x + w / 2 - tw / 2;
  ctx.fillStyle = "rgba(255,236,190,0.55)";
  ctx.fillRect(tx, y, tw, h);
  ctx.fillStyle = "rgba(120,80,30,0.25)";
  ctx.fillRect(tx, y, 1, h);
  ctx.fillRect(tx + tw - 1, y, 1, h);

  const wu = w / unit;
  const px = h * 0.3;
  if (wu >= 0.3) {
    // shipping label on the left
    const lw = clamp(w * 0.17, 16, h * 1.1);
    const lh = h * 0.56;
    const lx = x + w * 0.05;
    const ly = y + h * 0.22;
    ctx.fillStyle = "#f4efe3";
    ctx.fillRect(lx, ly, lw, lh);
    ctx.fillStyle = "#3a3a3a";
    for (let i = 0; i < 6; i++) {
      const bx = lx + lw * 0.1 + i * lw * 0.135;
      ctx.fillRect(bx, ly + lh * 0.55, Math.max(1, lw * (hash(b.seed + i) > 0.5 ? 0.06 : 0.03)), lh * 0.35);
    }
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(lx + lw * 0.1, ly + lh * 0.16, lw * 0.8, Math.max(1, lh * 0.08));
    ctx.fillRect(lx + lw * 0.1, ly + lh * 0.34, lw * 0.55, Math.max(1, lh * 0.08));
    // title
    const stampW = wu >= 0.42 && b.stamp ? w * 0.3 : 0;
    const tx0 = lx + lw + w * 0.04;
    const maxW = Math.max(10, x + w - w * 0.04 - stampW - tx0);
    ctx.font = FONT(px);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4a2f14";
    ctx.fillText(b.titleUpper, tx0, y + h * 0.5, maxW);
    if (stampW) drawStampShape(ctx, b, x + w - stampW / 2 - w * 0.02, y + h * 0.5, h);
  } else if (wu >= 0.14) {
    ctx.font = FONT(px);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4a2f14";
    ctx.fillText(b.titleUpper, x + w / 2, y + h * 0.5, w * 0.88);
  }
  ctx.restore();
}

/* ───────────── drawing: scene ───────────── */

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, camPx: number) {
  const sk = ctx.createLinearGradient(0, 0, 0, H);
  sk.addColorStop(0, "#070b1c");
  sk.addColorStop(0.55, "#101a3d");
  sk.addColorStop(1, "#1b2a55");
  ctx.fillStyle = sk;
  ctx.fillRect(0, 0, W, H);
  // stars (slow parallax)
  const off = camPx * 0.08;
  ctx.fillStyle = "#e8eeff";
  for (let i = 0; i < 40; i++) {
    const x = hash(i * 1.3) * W;
    const y = ((hash(i * 2.7) * H * 1.4 + off) % (H * 1.4)) - H * 0.2;
    const s = 0.8 + hash(i * 4.1) * 1.4;
    ctx.globalAlpha = 0.4 + hash(i * 5.3) * 0.6;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
  // moon
  const my = H * 0.16 + off;
  ctx.fillStyle = "#f3efd6";
  ctx.beginPath();
  ctx.arc(W * 0.7, my, H * 0.035, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#101a3d";
  ctx.beginPath();
  ctx.arc(W * 0.7 - H * 0.016, my - H * 0.008, H * 0.03, 0, TAU);
  ctx.fill();
}

function drawWall(ctx: CanvasRenderingContext2D, W: number, H: number, camPx: number, doorL: number, doorR: number) {
  // Back wall of the warehouse (p = 0.3) with the big roll-up door cut
  // out; the header drifts down as the camera rises.
  const off = camPx * 0.3;
  const header = -0.38 * H + off;
  ctx.fillStyle = "#262a33";
  ctx.fillRect(0, 0, doorL, H);
  ctx.fillRect(doorR, 0, W - doorR, H);
  ctx.fillRect(0, 0, W, Math.max(0, header));
  // corrugation
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let x = 4; x < W; x += 14) {
    if (x > doorL && x < doorR) {
      if (header > 0) ctx.fillRect(x, 0, 3, header);
    } else {
      ctx.fillRect(x, 0, 3, H);
    }
  }
  // door frame + header beam
  ctx.fillStyle = "#f2b632";
  ctx.fillRect(doorL - 6, Math.max(0, header - 6), 6, H);
  ctx.fillRect(doorR, Math.max(0, header - 6), 6, H);
  if (header > -20) {
    ctx.fillStyle = "#3b404c";
    ctx.fillRect(doorL - 6, header - 18, doorR - doorL + 12, 18);
    ctx.fillStyle = "#f2b632";
    ctx.fillRect(doorL - 6, header - 6, doorR - doorL + 12, 6);
    // dock number sign
    ctx.fillStyle = "#1b1e26";
    ctx.fillRect(W / 2 - 54, header - 62, 108, 34);
    label(ctx, "DOCK 3", W / 2, header - 45, 18, "#f2b632", "center", false);
  }
}

function drawStringLights(ctx: CanvasRenderingContext2D, y0: number, sag: number, n: number, t: number, x0: number, x1: number) {
  ctx.strokeStyle = "rgba(20,20,28,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0);
  ctx.stroke();
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = lerp(x0, x1, u);
    const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * (y0 + sag * 2) + u * u * y0;
    const tw = 0.8 + 0.2 * Math.sin(t * 3 + i * 1.7);
    ctx.fillStyle = `rgba(255,205,110,${0.12 * tw})`;
    ctx.beginPath();
    ctx.arc(x, y + 6, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(x - 1.5, y, 3, 4);
    ctx.fillStyle = `rgba(255,225,150,${0.75 + 0.25 * tw})`;
    ctx.beginPath();
    ctx.arc(x, y + 6, 3, 0, TAU);
    ctx.fill();
  }
}

function drawShelves(ctx: CanvasRenderingContext2D, W: number, H: number, camPx: number, left: boolean) {
  // Steel racking with boxes against the side walls (p = 0.55), tiled
  // vertically so there is always something sliding past.
  const off = camPx * 0.55;
  const sw = Math.max(44, W * 0.17);
  const x0 = left ? W * 0.015 : W - W * 0.015 - sw;
  const period = H * 0.42;
  const first = Math.floor(-off / period) - 1;
  const last = first + Math.ceil(H / period) + 2;
  ctx.fillStyle = "#3a3f4b";
  ctx.fillRect(x0 + 2, 0, 4, H);
  ctx.fillRect(x0 + sw - 6, 0, 4, H);
  for (let k = first; k <= last; k++) {
    const y = k * period + off;
    const plankY = y + period * 0.78;
    if (plankY < -40 || y > H + 40) continue;
    // boxes on the plank
    let bx = x0 + 6;
    let i = 0;
    while (bx < x0 + sw - 8 && i < 4) {
      const r = hash(k * 13.7 + i * 3.3 + (left ? 0 : 50));
      const bw = clamp(sw * (0.22 + r * 0.3), 10, sw * 0.5);
      const bh = period * (0.18 + hash(k * 5.1 + i) * 0.22);
      if (bx + bw > x0 + sw - 6) break;
      ctx.fillStyle = `hsl(31, 35%, ${30 + r * 16}%)`;
      ctx.fillRect(bx, plankY - bh, bw, bh);
      ctx.fillStyle = "rgba(255,230,180,0.25)";
      ctx.fillRect(bx + bw / 2 - 1.5, plankY - bh, 3, bh);
      bx += bw + 3;
      i++;
    }
    ctx.fillStyle = "#596070";
    ctx.fillRect(x0, plankY, sw, 5);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x0, plankY + 5, sw, 3);
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, W: number, H: number, floorY: number) {
  if (floorY > H) return;
  const g = ctx.createLinearGradient(0, floorY, 0, H);
  g.addColorStop(0, "#4b4d52");
  g.addColorStop(1, "#2b2c30");
  ctx.fillStyle = g;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, floorY, W, 3);
  // dock safety stripe
  ctx.fillStyle = "#e0b23a";
  ctx.fillRect(0, floorY + 14, W, 5);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  for (let x = -10; x < W; x += 36) ctx.fillRect(x, floorY + 14, 18, 5);
  // expansion joints
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let x = W * 0.12; x < W; x += W * 0.3) ctx.fillRect(x, floorY + 24, 2, H - floorY);
}

/** Pickup truck, side view. bedTop = screen y of the bed rail, u = px per unit. */
function drawTruck(ctx: CanvasRenderingContext2D, W: number, bedTop: number, u: number) {
  const bh = BOX_H * u; // box height in px
  const bedW = START_W * u * 1.2;
  const bedL = W / 2 - bedW / 2;
  const railH = bh * 0.95;
  const chassisH = bh * 0.35;
  const wheelR = bh * 0.62;
  const cabW = START_W * u * 0.6;
  const cabL = bedL + bedW;
  const floorY = bedTop + railH + chassisH + wheelR;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(bedL - bh * 0.3, floorY - 2, bedW + cabW + bh * 0.5, 6);
  // bed side
  ctx.fillStyle = "#8c2f2a";
  ctx.fillRect(bedL, bedTop, bedW, railH);
  ctx.fillStyle = "#a63b34";
  ctx.fillRect(bedL, bedTop, bedW, railH * 0.18);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(bedL, bedTop + railH * 0.6, bedW, railH * 0.4);
  // tailgate hinge line + bed stripe
  ctx.fillStyle = "#f0e6cf";
  ctx.fillRect(bedL + bedW * 0.06, bedTop + railH * 0.42, bedW * 0.88, 3);
  // cab
  ctx.fillStyle = "#8c2f2a";
  ctx.fillRect(cabL, bedTop + railH * 0.35, cabW, railH * 0.65);
  roundRect(ctx, cabL, bedTop - bh * 1.05, cabW * 0.92, bh * 1.05 + railH * 0.4, bh * 0.25);
  ctx.fill();
  ctx.fillStyle = "#a63b34";
  ctx.fillRect(cabL + cabW * 0.92, bedTop + railH * 0.35, cabW * 0.08, railH * 0.65);
  // window
  ctx.fillStyle = "#b9d7f0";
  roundRect(ctx, cabL + cabW * 0.12, bedTop - bh * 0.9, cabW * 0.66, bh * 0.85, bh * 0.15);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(cabL + cabW * 0.18, bedTop - bh * 0.8, cabW * 0.14, bh * 0.6);
  // chassis
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(bedL - bh * 0.1, bedTop + railH, bedW + cabW + bh * 0.1, chassisH);
  // bumper + lights
  ctx.fillStyle = "#c9c9cc";
  ctx.fillRect(bedL - bh * 0.28, bedTop + railH - 2, bh * 0.3, chassisH + 4);
  ctx.fillStyle = "#ff5a4a";
  ctx.fillRect(bedL - 2, bedTop + railH * 0.2, 5, railH * 0.3);
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(cabL + cabW - 4, bedTop + railH * 0.45, 5, railH * 0.25);
  // wheels
  const wy = floorY - wheelR;
  for (const wx of [bedL + bedW * 0.22, cabL + cabW * 0.55]) {
    ctx.fillStyle = "#17171a";
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#8f9097";
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2a2a30";
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR * 0.18, 0, TAU);
    ctx.fill();
  }
}

function drawCrane(ctx: CanvasRenderingContext2D, W: number, x: number, boxTopY: number, tilt: number) {
  // rail across the top, trolley, cable, hook
  ctx.fillStyle = "#3b404c";
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = "#f2b632";
  ctx.fillRect(0, 9, W, 2);
  ctx.fillStyle = "#1b1e26";
  roundRect(ctx, x - 16, 3, 32, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#6b7280";
  ctx.beginPath();
  ctx.arc(x - 9, 6, 4, 0, TAU);
  ctx.arc(x + 9, 6, 4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#cfd3dc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 17);
  ctx.lineTo(x + Math.sin(tilt) * 6, boxTopY - 12);
  ctx.stroke();
  // hook
  ctx.strokeStyle = "#e4b84c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + Math.sin(tilt) * 6, boxTopY - 7, 5, -Math.PI / 2, Math.PI * 0.9);
  ctx.stroke();
}

function drawTower(ctx: CanvasRenderingContext2D, g: G) {
  const u = g.unit;
  const bh = BOX_H * u;
  const n = g.tower.length;
  const swayNow = g.sway * Math.sin(g.swayT * 14) * Math.exp(-g.swayT * 3.2);
  for (let i = 0; i < n; i++) {
    const b = g.tower[i];
    const top = sy(g, (i + 1) * BOX_H);
    if (top > g.H + bh || top < -bh * 2) continue;
    const dx = swayNow * (i / Math.max(1, n)) * u;
    const x = sx(g, b.x) + dx;
    const w = b.w * u;
    if (i === n - 1 && g.squash > 0) {
      const s = Math.sin(g.squash * Math.PI) * 0.22;
      ctx.save();
      ctx.translate(x + w / 2, top + bh);
      ctx.scale(1 + s * 0.6, 1 - s);
      drawBox(ctx, -w / 2, -bh, w, bh, b, u);
      ctx.restore();
    } else {
      drawBox(ctx, x, top, w, bh, b, u);
    }
  }
}

function drawPieces(ctx: CanvasRenderingContext2D, g: G) {
  const u = g.unit;
  const bh = BOX_H * u;
  for (const p of g.pieces) {
    const cx = sx(g, p.px + p.pw / 2);
    const cy = sy(g, p.y) - bh / 2;
    if (cy > g.H + bh * 2) continue;
    const pw = p.pw * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.rect(-pw / 2, -bh / 2, pw, bh);
    ctx.clip();
    drawBox(ctx, (p.ox - p.px) * u - pw / 2, -bh / 2, p.box.w * u, bh, p.box, u);
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, g: G) {
  const u = g.unit;
  for (const p of g.particles) {
    const a = 1 - p.life / p.max;
    const x = sx(g, p.x);
    const y = sy(g, p.y);
    const s = p.size * u;
    if (p.spark) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.size > 0.016 ? "#fff6c8" : "#ffd54a";
      ctx.fillRect(-s, -s * 0.28, s * 2, s * 0.56);
      ctx.fillRect(-s * 0.28, -s, s * 0.56, s * 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = "#b9a98c";
      ctx.beginPath();
      ctx.arc(x, y, s * (1 + p.life * 2), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawStickers(ctx: CanvasRenderingContext2D, g: G) {
  for (const s of g.stickers) {
    const pop = s.t < 0.15 ? 1 + (1 - s.t / 0.15) * 0.5 : 1;
    const a = s.t > 0.7 ? 1 - (s.t - 0.7) / 0.4 : 1;
    const x = sx(g, s.x);
    const y = sy(g, s.y) - s.t * 28;
    ctx.save();
    ctx.translate(clamp(x, 60, g.W - 60), y);
    ctx.rotate(-0.08);
    ctx.scale(pop, pop);
    ctx.globalAlpha = clamp(a, 0, 1);
    label(ctx, s.text, 0, 0, Math.round(s.px * g.unit), s.color, "center");
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, g: G) {
  const W = g.W;
  // score
  label(ctx, "SCORE", 14, 30, 13, "#c9ced9");
  label(ctx, String(Math.round(g.shown)), 14, 54, 30, "#ffffff");
  label(ctx, `BOXES ${g.tower.length}`, 14, 82, 14, "#f2b632");
  // streak pill
  if (g.streak >= 2) {
    const text = `PERFECT STREAK x${g.streak}`;
    ctx.font = FONT(13);
    const tw = ctx.measureText(text).width;
    const pw = tw + 26;
    const pulse = 1 + 0.04 * Math.sin(g.t * 9);
    ctx.save();
    ctx.translate(W - 14 - pw / 2, 32);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#c47b3e";
    roundRect(ctx, -pw / 2, -13, pw, 26, 13);
    ctx.fill();
    ctx.strokeStyle = "#ffd54a";
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, text, 0, 0, 13, "#fff3d6", "center", false);
    ctx.restore();
  }
  // speed meter (small, under the streak area)
  const lvl = Math.floor(Math.min(g.tower.length, RAMP_CAP_BOX) / RAMP_EVERY);
  const maxLvl = RAMP_CAP_BOX / RAMP_EVERY;
  label(ctx, "SPEED", W - 14, 62, 13, "#c9ced9", "right");
  for (let i = 0; i < maxLvl; i++) {
    ctx.fillStyle = i < lvl + 1 ? (i >= 5 ? "#ff6b5e" : "#f2b632") : "rgba(255,255,255,0.18)";
    ctx.fillRect(W - 14 - (maxLvl - i) * 9, 72, 6, 8);
  }
}

function drawCountdown(ctx: CanvasRenderingContext2D, g: G) {
  const c = g.countdown;
  const go = c <= 0.6;
  const text = go ? "GO!" : String(Math.ceil(c - 0.6));
  const frac = go ? (0.6 - c) / 0.6 : 1 - ((c - 0.6) % 1);
  const scale = 1 + 0.35 * (1 - Math.min(1, frac * 4));
  ctx.save();
  ctx.translate(g.W / 2, g.H * 0.42);
  ctx.scale(scale, scale);
  ctx.globalAlpha = go ? 1 - frac * 0.6 : 1;
  label(ctx, text, 0, 0, go ? 64 : 72, go ? "#ffd54a" : "#ffffff", "center");
  ctx.restore();
  ctx.globalAlpha = 1;
  if (!go) label(ctx, "TAP TO DROP", g.W / 2, g.H * 0.42 + 56, 16, "#c9ced9", "center");
}

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H, unit } = g;
  const camPx = g.cam * unit;
  const shakeX = g.shake > 0 ? Math.sin(g.t * 60) * g.shake * 6 : 0;

  ctx.save();
  ctx.translate(shakeX, 0);
  drawSky(ctx, W, H, camPx);
  const doorL = W * (W > H ? 0.22 : 0.13);
  const doorR = W - doorL;
  drawWall(ctx, W, H, camPx, doorL, doorR);
  const off3 = camPx * 0.3;
  drawStringLights(ctx, -0.38 * H + off3 + H * 0.09, H * 0.045, 11, g.t, doorL + 4, doorR - 4);
  drawStringLights(ctx, H * 0.07 + off3, H * 0.05, 12, g.t + 1.3, doorL + 4, doorR - 4);
  drawShelves(ctx, W, H, camPx, true);
  drawShelves(ctx, W, H, camPx, false);

  const bedTop = sy(g, 0);
  const bh = BOX_H * unit;
  const floorY = bedTop + bh * 0.95 + bh * 0.35 + bh * 0.62;
  drawFloor(ctx, W, H, floorY);
  if (bedTop < H + bh * 3) drawTruck(ctx, W, bedTop, unit);

  drawTower(ctx, g);
  drawPieces(ctx, g);

  // the box on the crane
  if (g.cur) {
    const w = g.cur.w * unit;
    const x = sx(g, g.curX);
    const bottom = sy(g, g.curY);
    const tilt = g.curFalling ? 0 : clamp(-g.curVx * 0.12, -0.12, 0.12);
    if (!g.curFalling) drawCrane(ctx, W, x + w / 2, bottom - bh, tilt);
    else drawCrane(ctx, W, sx(g, g.craneX), -40, 0);
    ctx.save();
    ctx.translate(x + w / 2, bottom - bh);
    ctx.rotate(tilt);
    // soft shadow under the hanging box
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-w / 2 + 3, bh + 2, w, 4);
    drawBox(ctx, -w / 2, 0, w, bh, g.cur, unit);
    ctx.restore();
  } else {
    drawCrane(ctx, W, sx(g, g.craneX), -40, 0);
  }

  drawParticles(ctx, g);
  ctx.restore();

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,245,210,${g.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawStickers(ctx, g);

  if (g.phase !== "idle") drawHud(ctx, g);
  if (g.phase !== "idle" && g.countdown > 0) drawCountdown(ctx, g);
}

/* ───────────── attract mode ───────────── */

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const u = Math.min(w, h * 0.9);
  const bh = u * 0.11;
  const sk = ctx.createLinearGradient(0, 0, 0, h);
  sk.addColorStop(0, "#070b1c");
  sk.addColorStop(1, "#1b2a55");
  ctx.fillStyle = sk;
  ctx.fillRect(0, 0, w, h);
  // stars
  ctx.fillStyle = "#e8eeff";
  for (let i = 0; i < 14; i++) ctx.fillRect(hash(i * 1.3) * w, hash(i * 2.7) * h * 0.6, 1.5, 1.5);
  // walls + door
  const dl = w * 0.16;
  ctx.fillStyle = "#262a33";
  ctx.fillRect(0, 0, dl, h);
  ctx.fillRect(w - dl, 0, dl, h);
  ctx.fillStyle = "#f2b632";
  ctx.fillRect(dl - 3, 0, 3, h);
  ctx.fillRect(w - dl, 0, 3, h);
  // string lights
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dl, h * 0.1);
  ctx.quadraticCurveTo(w / 2, h * 0.22, w - dl, h * 0.1);
  ctx.stroke();
  for (let i = 1; i < 7; i++) {
    const s = i / 7;
    const x = lerp(dl, w - dl, s);
    const y = (1 - s) * (1 - s) * h * 0.1 + 2 * (1 - s) * s * h * 0.22 + s * s * h * 0.1;
    ctx.fillStyle = `rgba(255,220,140,${0.8 + 0.2 * Math.sin(t * 3 + i)})`;
    ctx.beginPath();
    ctx.arc(x, y + 3, 2, 0, TAU);
    ctx.fill();
  }
  // floor + truck
  const floorY = h * 0.86;
  ctx.fillStyle = "#3b3c41";
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "#e0b23a";
  ctx.fillRect(0, floorY + 3, w, 2);
  const bedW = u * 0.62;
  const bedL = w / 2 - bedW / 2;
  const bedTop = floorY - bh * 1.3;
  ctx.fillStyle = "#8c2f2a";
  ctx.fillRect(bedL, bedTop, bedW, bh * 0.8);
  roundRect(ctx, bedL + bedW, bedTop - bh * 0.9, u * 0.3, bh * 1.7, 4);
  ctx.fill();
  ctx.fillStyle = "#b9d7f0";
  ctx.fillRect(bedL + bedW + u * 0.04, bedTop - bh * 0.78, u * 0.18, bh * 0.65);
  ctx.fillStyle = "#17171a";
  for (const wx of [bedL + bedW * 0.25, bedL + bedW + u * 0.16]) {
    ctx.beginPath();
    ctx.arc(wx, floorY - bh * 0.3, bh * 0.42, 0, TAU);
    ctx.fill();
  }
  // tower of 7 boxes, each a little narrower / offset
  let x = bedL + bedW * 0.1;
  let bw = bedW * 0.8;
  for (let i = 0; i < 7; i++) {
    const y = bedTop - (i + 1) * bh;
    ctx.fillStyle = `hsl(31, 44%, ${50 + hash(i * 7.7) * 12}%)`;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "rgba(255,236,190,0.5)";
    ctx.fillRect(x + bw / 2 - 2, y, 4, bh);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + bh * 0.88, bw, bh * 0.12);
    const shift = (hash(i * 3.1) - 0.5) * bw * 0.12;
    x += shift > 0 ? shift : 0;
    bw -= Math.abs(shift);
  }
  // swinging box on the crane (loops every 2.5 s, so cleanly every 5 s)
  const top = bedTop - 7 * bh;
  const hx = w / 2 + Math.sin((t * TAU) / 2.5) * (w * 0.5 - dl - bw / 2);
  const hy = top - bh * 2.2;
  ctx.fillStyle = "#3b404c";
  ctx.fillRect(0, 0, w, 4);
  ctx.strokeStyle = "#cfd3dc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, 4);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = "hsl(31, 44%, 58%)";
  ctx.fillRect(hx - bw / 2, hy, bw, bh);
  ctx.fillStyle = "rgba(255,236,190,0.5)";
  ctx.fillRect(hx - 2, hy, 4, bh);
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
      st.unit = Math.min(W, 420);
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
      if (e.button !== 0) return;
      drop(st);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (st.phase === "idle" || st.phase === "over") return;
      e.preventDefault();
      if (!e.repeat) drop(st);
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
