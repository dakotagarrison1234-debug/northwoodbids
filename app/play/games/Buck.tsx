"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Buck Scope — tag the bucks through a rifle scope at dusk.
   Nothing is hurt: a hit is a camera flash and a TAGGED! sticker,
   and the deer bounds off into the trees.

   World units: 1u = S px where S = the shorter screen side, so the
   same world plays identically in portrait and landscape and
   survives a resize mid-run. The horizon is world y = 0; the meadow
   runs downward (positive y). The scope is fixed at screen center
   and the world slides under it.
   ───────────────────────────────────────────────────────────── */

const RUN_SECONDS = 60;
const COUNTDOWN = 3;
const SHOT_COOLDOWN = 0.6;
const BIG_ONE_AT = 40;
const BIG_ONE_PTS = 2500;
const CLEAN_BONUS = 300;
const DOE_PENALTY = 500;
const BUCK_CHANCE = 0.55;
const MAX_DEER = 4;

const WORLD_X = 1.15; // half-width of the meadow deer walk across (u)
const SPAWN_X = WORLD_X + 0.35;
const PAN_X = 0.85;
const PAN_Y0 = 0.02;
const PAN_Y1 = 0.4;
const SWAY_FULL = 0.042;
const SWAY_STEADY = 0.008;
const STEADY_TIME = 1;
const KEY_PAN = 0.9; // u per second with arrow keys
const FENCE_Y = 0.31;

const TAU = Math.PI * 2;

type LaneDef = { y: number; L: number; speed: number; pts: number };
/** 0 = far (small, slow, worth more) … 2 = near (big, fast). */
const LANES: LaneDef[] = [
  { y: 0.06, L: 0.085, speed: 0.075, pts: 1000 },
  { y: 0.21, L: 0.13, speed: 0.125, pts: 700 },
  { y: 0.43, L: 0.2, speed: 0.2, pts: 400 },
];

/** Foot offsets (×L along facing) for [frontNear, frontFar, hindNear, hindFar]. */
const POSES: number[][] = [
  [0.11, -0.07, -0.11, 0.07],
  [0.02, -0.02, -0.02, 0.02],
  [-0.09, 0.11, 0.09, -0.09],
];
const WALK_CYCLE = [0, 1, 2, 1];
const POSE_STAND = POSES[1];
const POSE_BOUND = [0.22, 0.14, -0.24, -0.16];

const FONT = (px: number) => `900 ${px}px system-ui, -apple-system, sans-serif`;

/* ───────────── small helpers ───────────── */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Deterministic 0..1 noise for scenery placement. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const quad = (p0: number, p1: number, p2: number, t: number) =>
  (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

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

/* ───────────── deer sprite ───────────── */

type SceneDeer = {
  x: number; // world u, body centre
  y: number; // world u, feet
  L: number; // body length (u)
  dir: 1 | -1;
  buck: boolean;
  antler: number; // 1 normal, ~1.9 for the big one
  pose: number[];
  graze: boolean;
  hop: number; // u, lifts the whole deer (bounding)
  lane: number;
};

function drawAntlers(ctx: CanvasRenderingContext2D, L: number, a: number) {
  ctx.lineWidth = 0.035 * L * Math.sqrt(a);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const beams: [number, number, string][] = [
    [0.05, 0.02, "#b8966a"],
    [0, 0, "#e9d2a8"],
  ];
  for (const [ox, oy, col] of beams) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    const x0 = (-0.05 + ox) * L;
    const y0 = (-0.08 + oy) * L;
    const cx = x0 - 0.22 * a * L;
    const cy = y0 - 0.26 * a * L;
    const ex = x0 + 0.14 * a * L;
    const ey = y0 - 0.44 * a * L;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    const tines = a > 1.4 ? [0.28, 0.48, 0.68] : [0.35, 0.62];
    for (const t of tines) {
      const px = quad(x0, cx, ex, t);
      const py = quad(y0, cy, ey, t);
      ctx.moveTo(px, py);
      ctx.lineTo(px + 0.03 * a * L, py - 0.15 * a * L);
    }
    ctx.moveTo(x0 + 0.01 * L, y0 - 0.05 * L);
    ctx.lineTo(x0 + 0.1 * a * L, y0 - 0.17 * a * L);
    ctx.stroke();
  }
}

function drawDeer(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  L: number,
  dir: 1 | -1,
  pose: number[],
  buck: boolean,
  antler: number,
  graze: boolean,
) {
  const bodyY = sy - 0.68 * L;
  const body = "#8c5a2e";
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ell(ctx, sx, sy + 0.02 * L, 0.5 * L, 0.07 * L);
  // legs (far pair darker, near pair lighter; body covers the joins)
  ctx.lineCap = "round";
  ctx.lineWidth = 0.075 * L;
  const hipF = sx + dir * 0.32 * L;
  const hipH = sx - dir * 0.32 * L;
  const hipY = bodyY + 0.08 * L;
  const leg = (hx: number, off: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(hx, hipY);
    ctx.lineTo(hx + dir * off * L, sy);
    ctx.stroke();
  };
  leg(hipF, pose[1], "#4f3118");
  leg(hipH, pose[3], "#4f3118");
  leg(hipF, pose[0], "#7a4b22");
  leg(hipH, pose[2], "#7a4b22");
  // body
  ctx.fillStyle = body;
  ell(ctx, sx, bodyY, 0.5 * L, 0.22 * L);
  ctx.fillStyle = "#a36a37";
  ell(ctx, sx + dir * 0.05 * L, bodyY - 0.06 * L, 0.4 * L, 0.12 * L);
  ctx.fillStyle = "#e6d2ad";
  ell(ctx, sx - dir * 0.02 * L, bodyY + 0.12 * L, 0.3 * L, 0.07 * L);
  // tail
  ctx.fillStyle = "#f3ead8";
  ctx.beginPath();
  ctx.moveTo(sx - dir * 0.47 * L, bodyY - 0.13 * L);
  ctx.lineTo(sx - dir * 0.6 * L, bodyY + 0.01 * L);
  ctx.lineTo(sx - dir * 0.44 * L, bodyY - 0.01 * L);
  ctx.closePath();
  ctx.fill();
  // neck
  const hx = sx + dir * (graze ? 0.74 : 0.6) * L;
  const hy = graze ? sy - 0.22 * L : sy - 1.06 * L;
  ctx.strokeStyle = body;
  ctx.lineWidth = 0.17 * L;
  ctx.beginPath();
  ctx.moveTo(sx + dir * 0.36 * L, bodyY - 0.04 * L);
  ctx.lineTo(hx - dir * 0.02 * L, hy + 0.04 * L);
  ctx.stroke();
  // head (local space: +x = forward, -y = up)
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(dir, 1);
  ctx.rotate(graze ? 1.05 : 0.28);
  if (buck) drawAntlers(ctx, L, antler);
  ctx.fillStyle = body;
  ell(ctx, -0.09 * L, -0.1 * L, 0.035 * L, 0.07 * L, -0.5);
  ell(ctx, -0.14 * L, -0.07 * L, 0.03 * L, 0.065 * L, -0.9);
  ell(ctx, 0, 0, 0.17 * L, 0.1 * L);
  ctx.fillStyle = "#b07d49";
  ell(ctx, 0.1 * L, 0.01 * L, 0.07 * L, 0.055 * L);
  ctx.fillStyle = "#1c1410";
  ell(ctx, 0.165 * L, 0.01 * L, 0.025 * L, 0.022 * L);
  ell(ctx, 0.02 * L, -0.035 * L, 0.02 * L, 0.02 * L);
  ctx.fillStyle = "#ffffff";
  ell(ctx, 0.026 * L, -0.041 * L, 0.007 * L, 0.007 * L);
  ctx.restore();
}

/* ───────────── scenery ───────────── */

type Band = { p: number; base: number; h: number; sp: number; color: string; pine: number };
const BANDS: Band[] = [
  { p: 0.3, base: 0.005, h: 0.14, sp: 0.045, color: "#3d3f6b", pine: 0.4 },
  { p: 0.55, base: 0.02, h: 0.2, sp: 0.06, color: "#272b47", pine: 0.45 },
  { p: 0.8, base: 0.04, h: 0.27, sp: 0.085, color: "#161a2a", pine: 0.5 },
];
const GRASS_ROWS: [number, number][] = [
  [0.09, 0.1],
  [0.23, 0.07],
  [0.33, 0.08],
  [0.47, 0.1],
];

function drawBand(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, aimX: number, aimY: number, b: number, lite: boolean) {
  const band = BANDS[b];
  const baseY = H / 2 + (band.base - aimY) * S;
  const offX = aimX * band.p;
  const sp = band.sp * (lite ? 1.7 : 1);
  const left = -W / 2 / S + offX;
  const right = W / 2 / S + offX;
  const i0 = Math.floor(left / sp) - 1;
  const i1 = Math.ceil(right / sp) + 1;
  ctx.fillStyle = band.color;
  ctx.beginPath();
  ctx.rect(0, baseY - 1, W, 0.02 * S + 1);
  for (let i = i0; i <= i1; i++) {
    const r1 = hash(i * 3.1 + b * 97.3);
    const r2 = hash(i * 5.7 + b * 41.1);
    const r3 = hash(i * 1.3 + b * 7.9);
    const x = W / 2 + (i * sp + (r3 - 0.5) * sp * 0.6 - offX) * S;
    const hgt = band.h * (0.65 + 0.7 * r2) * S;
    if (r1 < band.pine) {
      ctx.moveTo(x, baseY - hgt);
      ctx.lineTo(x + 0.14 * hgt, baseY - 0.62 * hgt);
      ctx.lineTo(x + 0.08 * hgt, baseY - 0.62 * hgt);
      ctx.lineTo(x + 0.24 * hgt, baseY - 0.3 * hgt);
      ctx.lineTo(x + 0.15 * hgt, baseY - 0.3 * hgt);
      ctx.lineTo(x + 0.34 * hgt, baseY);
      ctx.lineTo(x - 0.34 * hgt, baseY);
      ctx.lineTo(x - 0.15 * hgt, baseY - 0.3 * hgt);
      ctx.lineTo(x - 0.24 * hgt, baseY - 0.3 * hgt);
      ctx.lineTo(x - 0.08 * hgt, baseY - 0.62 * hgt);
      ctx.lineTo(x - 0.14 * hgt, baseY - 0.62 * hgt);
      ctx.closePath();
    } else {
      ctx.rect(x - 0.035 * hgt, baseY - 0.45 * hgt, 0.07 * hgt, 0.45 * hgt);
      ctx.moveTo(x + 0.3 * hgt, baseY - 0.62 * hgt);
      ctx.arc(x, baseY - 0.62 * hgt, 0.3 * hgt, 0, TAU);
      ctx.moveTo(x - 0.2 * hgt + 0.22 * hgt, baseY - 0.45 * hgt);
      ctx.arc(x - 0.2 * hgt, baseY - 0.45 * hgt, 0.22 * hgt, 0, TAU);
      ctx.moveTo(x + 0.2 * hgt + 0.24 * hgt, baseY - 0.48 * hgt);
      ctx.arc(x + 0.2 * hgt, baseY - 0.48 * hgt, 0.24 * hgt, 0, TAU);
    }
  }
  ctx.fill();
}

function drawGrassRow(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, aimX: number, aimY: number, j: number, lite: boolean) {
  const [base, span] = GRASS_ROWS[j];
  const sp = lite ? 0.11 : 0.055;
  const left = aimX - W / 2 / S - 0.06;
  const right = aimX + W / 2 / S + 0.06;
  const i0 = Math.floor(left / sp);
  const i1 = Math.ceil(right / sp);
  ctx.strokeStyle = j < 2 ? "#4c6a2c" : "#5d7e33";
  ctx.lineWidth = j < 2 ? 1.4 : 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    const x = (i + hash(i * 3.3 + j * 17.1)) * sp;
    const y = base + hash(i * 1.7 + j * 5.3) * span;
    const sx = W / 2 + (x - aimX) * S;
    const sy = H / 2 + (y - aimY) * S;
    if (sy < -10 || sy > H + 10) continue;
    const sz = (0.012 + y * 0.045) * S;
    ctx.moveTo(sx - sz * 0.35, sy);
    ctx.lineTo(sx - sz * 0.6, sy - sz * 0.85);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + sz * 0.05, sy - sz * 1.2);
    ctx.moveTo(sx + sz * 0.35, sy);
    ctx.lineTo(sx + sz * 0.6, sy - sz * 0.9);
  }
  ctx.stroke();
}

function drawFence(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, aimX: number, aimY: number, lite: boolean) {
  const fy = H / 2 + (FENCE_Y - aimY) * S;
  if (fy < -0.1 * S || fy > H + 0.1 * S) return;
  const sp = lite ? 0.16 : 0.1;
  const left = aimX - W / 2 / S - sp;
  const right = aimX + W / 2 / S + sp;
  ctx.fillStyle = "#3b2816";
  ctx.fillRect(0, fy - 0.058 * S, W, 0.009 * S);
  ctx.fillRect(0, fy - 0.03 * S, W, 0.009 * S);
  for (let i = Math.floor(left / sp); i <= Math.ceil(right / sp); i++) {
    const sx = W / 2 + (i * sp - aimX) * S;
    ctx.fillStyle = "#3b2816";
    ctx.fillRect(sx - 0.007 * S, fy - 0.078 * S, 0.014 * S, 0.078 * S);
    ctx.fillStyle = "#6b4a2a";
    ctx.fillRect(sx - 0.007 * S, fy - 0.078 * S, 0.014 * S, 2);
  }
}

function drawSceneDeer(ctx: CanvasRenderingContext2D, W: number, H: number, S: number, aimX: number, aimY: number, d: SceneDeer) {
  const sx = W / 2 + (d.x - aimX) * S;
  const sy = H / 2 + (d.y - d.hop - aimY) * S;
  const L = d.L * S;
  if (sx < -L || sx > W + L || sy < -L * 1.6 || sy > H + L) return;
  drawDeer(ctx, sx, sy, L, d.dir, d.pose, d.buck, d.antler, d.graze);
}

/**
 * The static scene gradients, built once per canvas size instead of every
 * frame. They are defined relative to the horizon (y = 0) / sun centre, and
 * drawScene translates before filling, since the horizon slides with the aim.
 */
type SceneGrads = { sky: CanvasGradient; meadow: CanvasGradient; mist: CanvasGradient; sun: CanvasGradient };
const gradCache = new Map<string, SceneGrads>();
function sceneGrads(ctx: CanvasRenderingContext2D, W: number, H: number, S: number): SceneGrads {
  const key = `${W}x${H}x${Math.round(S)}`;
  const hit = gradCache.get(key);
  if (hit) return hit;
  const sky = ctx.createLinearGradient(0, -1.2 * S, 0, 0);
  sky.addColorStop(0, "#121736");
  sky.addColorStop(0.45, "#3b2a5e");
  sky.addColorStop(0.78, "#b2513f");
  sky.addColorStop(1, "#f29a3e");
  const meadow = ctx.createLinearGradient(0, 0, 0, S);
  meadow.addColorStop(0, "#7a6a3a");
  meadow.addColorStop(0.12, "#55602c");
  meadow.addColorStop(0.45, "#33421e");
  meadow.addColorStop(1, "#1a2412");
  const mist = ctx.createLinearGradient(0, 0.04 * S, 0, 0.16 * S);
  mist.addColorStop(0, "rgba(245,170,110,0.22)");
  mist.addColorStop(1, "rgba(245,170,110,0)");
  const sun = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.3 * S);
  sun.addColorStop(0, "rgba(255,210,130,0.6)");
  sun.addColorStop(1, "rgba(255,160,90,0)");
  const g = { sky, meadow, mist, sun };
  if (gradCache.size > 8) gradCache.clear(); // a resize makes a new key; keep the map tiny
  gradCache.set(key, g);
  return g;
}

/** Sky, tree lines, meadow, fence, grass and deer. `lite` is for the attract thumbnail. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  S: number,
  aimX: number,
  aimY: number,
  deer: SceneDeer[],
  clock: number,
  lite: boolean,
) {
  const hy = H / 2 - aimY * S; // horizon on screen
  const gr = sceneGrads(ctx, W, H, S);
  // sky (gradient is horizon-relative, so translate to the horizon first)
  ctx.save();
  ctx.translate(0, hy);
  ctx.fillStyle = gr.sky;
  ctx.fillRect(0, -hy, W, Math.max(0, hy) + 1);
  ctx.restore();
  // stars
  const nStars = lite ? 8 : 22;
  ctx.fillStyle = "#fff6e0";
  for (let i = 0; i < nStars; i++) {
    const sx = W / 2 + ((hash(i * 13.7) - 0.5) * (W / S + 0.5) - aimX * 0.1) * S;
    const sy = hy - (0.4 + hash(i * 7.1) * 0.8) * S;
    if (sy < 0 || sy > hy) continue;
    ctx.globalAlpha = 0.35 + 0.6 * Math.abs(Math.sin(clock * 1.3 + i * 1.7));
    const sz = 1 + hash(i * 2.3) * 1.5;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.globalAlpha = 1;
  // setting sun
  const sunX = W / 2 + (0.35 - aimX * 0.12) * S;
  const sunY = hy - 0.05 * S;
  ctx.save();
  ctx.translate(sunX, sunY);
  ctx.fillStyle = gr.sun;
  ctx.fillRect(-0.3 * S, Math.max(0, sunY - 0.3 * S) - sunY, 0.6 * S, Math.min(0.3 * S, hy - sunY) + 0.3 * S);
  ctx.restore();
  ctx.fillStyle = "#ffd98a";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 0.055 * S, 0, TAU);
  ctx.fill();
  // meadow (+ the mist band after the trees), both horizon-relative
  ctx.save();
  ctx.translate(0, hy);
  ctx.fillStyle = gr.meadow;
  ctx.fillRect(0, 0, W, H - hy + 1);
  ctx.restore();
  // tree lines
  drawBand(ctx, W, H, S, aimX, aimY, 0, lite);
  drawBand(ctx, W, H, S, aimX, aimY, 1, lite);
  drawBand(ctx, W, H, S, aimX, aimY, 2, lite);
  if (!lite) {
    ctx.save();
    ctx.translate(0, hy);
    ctx.fillStyle = gr.mist;
    ctx.fillRect(0, 0.04 * S, W, 0.12 * S);
    ctx.restore();
  }
  // depth-sorted meadow: far deer, grass, mid deer, grass, fence, grass, near deer, grass
  for (const d of deer) if (d.lane === 0) drawSceneDeer(ctx, W, H, S, aimX, aimY, d);
  if (!lite) drawGrassRow(ctx, W, H, S, aimX, aimY, 0, lite);
  for (const d of deer) if (d.lane === 1) drawSceneDeer(ctx, W, H, S, aimX, aimY, d);
  drawGrassRow(ctx, W, H, S, aimX, aimY, 1, lite);
  drawFence(ctx, W, H, S, aimX, aimY, lite);
  if (!lite) drawGrassRow(ctx, W, H, S, aimX, aimY, 2, lite);
  for (const d of deer) if (d.lane === 2) drawSceneDeer(ctx, W, H, S, aimX, aimY, d);
  drawGrassRow(ctx, W, H, S, aimX, aimY, 3, lite);
}

/* ───────────── scope overlay ───────────── */

function drawScope(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, R: number, flash: number) {
  // lens tint + inner vignette
  const lens = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
  lens.addColorStop(0, "rgba(60,90,130,0.07)");
  lens.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(flash * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
  }
  // everything outside the lens
  ctx.fillStyle = "rgba(4,5,9,0.93)";
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fill("evenodd");
  // rim
  const rim = Math.max(4, R * 0.05);
  ctx.lineWidth = rim;
  ctx.strokeStyle = "#07080b";
  ctx.beginPath();
  ctx.arc(cx, cy, R - rim / 2, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.arc(cx, cy, R - rim, 0, TAU);
  ctx.stroke();
  // duplex reticle: thin inner lines with a centre gap, heavy outer posts, mil-dots
  const gap = R * 0.07;
  const inner = R * 0.6;
  ctx.strokeStyle = "rgba(8,8,10,0.95)";
  ctx.lineCap = "butt";
  ctx.lineWidth = Math.max(1.2, R * 0.009);
  ctx.beginPath();
  ctx.moveTo(cx - inner, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + inner, cy);
  ctx.moveTo(cx, cy - inner); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + inner);
  ctx.stroke();
  ctx.lineWidth = Math.max(3, R * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx - inner, cy);
  ctx.moveTo(cx + inner, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - inner);
  ctx.moveTo(cx, cy + inner); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.fillStyle = "rgba(8,8,10,0.95)";
  const dotR = Math.max(1.5, R * 0.013);
  for (let k = 1; k <= 3; k++) {
    const o = R * 0.15 * k;
    ctx.beginPath(); ctx.arc(cx - o, cy, dotR, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + o, cy, dotR, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - o, dotR, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + o, dotR, 0, TAU); ctx.fill();
  }
}

/* ───────────── attract loop (arcade floor) ───────────── */

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const S = Math.min(w, h) * 1.5;
  const buckX = ((t * 0.2) % 2.2) - 1.1;
  const doeX = 0.9 - ((t * 0.09 + 0.4) % 1.8);
  const frame = WALK_CYCLE[Math.floor(t * 5) % 4];
  const deer: SceneDeer[] = [
    { x: doeX, y: LANES[0].y, L: LANES[0].L, dir: -1, buck: false, antler: 1, pose: POSES[(frame + 1) % 3], graze: false, hop: 0, lane: 0 },
    { x: buckX, y: LANES[1].y, L: 0.15, dir: 1, buck: true, antler: 1.2, pose: POSES[frame], graze: false, hop: 0, lane: 1 },
  ];
  drawScene(ctx, w, h, S, 0, 0.17, deer, t, true);
  const cx = w / 2 + Math.sin(t * 0.45) * w * 0.14;
  const cy = h / 2 + Math.sin(t * 0.33 + 1.2) * h * 0.08;
  drawScope(ctx, w, h, cx, cy, Math.min(w, h) * 0.42, 0);
};

/* ───────────── game state ───────────── */

type Phase = "idle" | "countdown" | "playing" | "over";
type DeerState = "walk" | "graze" | "bound" | "gone";

type Deer = {
  lane: number;
  x: number;
  dir: 1 | -1;
  L: number;
  speed: number;
  buck: boolean;
  big: boolean;
  phase: number;
  state: DeerState;
  stateT: number;
  grazeIn: number;
  grazeFor: number;
  boundT: number;
};

type Sticker = { x: number; y: number; title: string; sub: string; t: number; tone: "good" | "bad" | "dim" };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Msg = { text: string; t: number; color: string };

type G = {
  phase: Phase;
  W: number;
  H: number;
  S: number;
  clock: number;
  t: number;
  countdownT: number;
  goT: number;
  timeLeft: number;
  score: number;
  display: number;
  streak: number;
  viewX: number;
  viewY: number;
  swayX: number;
  swayY: number;
  kickX: number;
  kickY: number;
  stillT: number;
  steady: number;
  dragOn: boolean;
  dragId: number;
  dragX: number;
  dragY: number;
  dragMoved: boolean;
  keys: { l: boolean; r: boolean; u: boolean; d: boolean };
  cooldown: number;
  flashT: number;
  btnT: number;
  msg: Msg | null;
  deer: Deer[];
  spawnT: number;
  bigSpawned: boolean;
  big: Deer | null;
  stickers: Sticker[];
  particles: Particle[];
  lastHud: number;
  ended: boolean;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function makeState(): G {
  return {
    phase: "idle", W: 390, H: 700, S: 390, clock: 0, t: 0, countdownT: 0, goT: 0, timeLeft: RUN_SECONDS,
    score: 0, display: 0, streak: 0,
    viewX: 0, viewY: 0.2, swayX: 0, swayY: 0, kickX: 0, kickY: 0, stillT: 0, steady: 0,
    dragOn: false, dragId: -1, dragX: 0, dragY: 0, dragMoved: false,
    keys: { l: false, r: false, u: false, d: false },
    cooldown: 0, flashT: 0, btnT: 0, msg: null,
    deer: [], spawnT: 0, bigSpawned: false, big: null, stickers: [], particles: [],
    lastHud: 0, ended: false,
  };
}

/** Deterministic still for the cabinet before START is pressed. */
const IDLE_DEER: SceneDeer[] = [
  { x: 0.1, y: LANES[1].y, L: LANES[1].L, dir: 1, buck: true, antler: 1, pose: POSE_STAND, graze: true, hop: 0, lane: 1 },
  { x: -0.32, y: LANES[0].y, L: LANES[0].L, dir: -1, buck: false, antler: 1, pose: POSES[0], graze: false, hop: 0, lane: 0 },
];

function clampView(g: G) {
  g.viewX = clamp(g.viewX, -PAN_X, PAN_X);
  g.viewY = clamp(g.viewY, PAN_Y0, PAN_Y1);
}

function btnGeom(W: number, H: number, S: number) {
  const r = clamp(S * 0.1, 36, 46);
  return { x: W - 14 - r, y: H - 14 - r, r };
}

function spawnDeer(big: boolean): Deer {
  let lane = 0;
  if (!big) {
    const r = Math.random();
    lane = r < 0.25 ? 0 : r < 0.65 ? 1 : 2;
  }
  const def = LANES[lane];
  const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  return {
    lane,
    x: -dir * SPAWN_X,
    dir,
    L: def.L * (big ? 1.3 : 0.95 + Math.random() * 0.1),
    speed: def.speed * (big ? 0.55 : 0.85 + Math.random() * 0.3),
    buck: big || Math.random() < BUCK_CHANCE,
    big,
    phase: Math.random() * 3,
    state: "walk",
    stateT: 0,
    grazeIn: (big ? 3 : 1.5) + Math.random() * 3.5,
    grazeFor: 0,
    boundT: 0,
  };
}

function resetRun(g: G) {
  const keep = { W: g.W, H: g.H, S: g.S, clock: g.clock };
  Object.assign(g, makeState(), keep);
  g.phase = "countdown";
  g.countdownT = COUNTDOWN;
  g.spawnT = 1.2;
  // a couple of deer already out so the first seconds aren't empty
  for (let i = 0; i < 2; i++) {
    const d = spawnDeer(false);
    d.x = (i === 0 ? -0.45 : 0.4) * d.dir;
    g.deer.push(d);
  }
}

function stepDeer(d: Deer, dt: number) {
  d.stateT += dt;
  if (d.state === "walk") {
    d.x += d.dir * d.speed * dt;
    d.phase += (dt * d.speed) / d.L * 2.2;
    d.grazeIn -= dt;
    if (d.grazeIn <= 0 && Math.abs(d.x) < WORLD_X - 0.15) {
      d.state = "graze";
      d.stateT = 0;
      d.grazeFor = 1 + Math.random() * 0.9;
    }
    if (Math.abs(d.x) > SPAWN_X + 0.1) d.state = "gone";
  } else if (d.state === "graze") {
    if (d.stateT >= d.grazeFor) {
      d.state = "walk";
      d.stateT = 0;
      d.grazeIn = 2.5 + Math.random() * 4;
    }
  } else if (d.state === "bound") {
    d.boundT += dt;
    d.x += d.dir * d.speed * 3.4 * dt;
    if (Math.abs(d.x) > SPAWN_X + 0.1) d.state = "gone";
  }
}

function burst(g: G, x: number, y: number, n: number, colors: string[], speed: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.4 + Math.random() * 0.8);
    const life = 0.4 + Math.random() * 0.4;
    g.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life, max: life,
      color: colors[(Math.random() * colors.length) | 0], size: 0.006 + Math.random() * 0.008,
    });
  }
  if (g.particles.length > 90) g.particles.splice(0, g.particles.length - 90);
}

function endRun(g: G, env: Env) {
  if (g.ended) return;
  g.ended = true;
  g.phase = "over";
  g.timeLeft = 0;
  g.dragOn = false;
  g.keys = { l: false, r: false, u: false, d: false };
  env.sfx.gameOver();
  const final = clamp(Math.round(g.score), 0, MAX_SCORE);
  env.onHud?.({ score: final, timeLeft: 0 });
  env.onEnd(final);
}

function shoot(g: G, env: Env) {
  if (g.phase !== "playing" || g.cooldown > 0) return;
  g.cooldown = SHOT_COOLDOWN;
  g.btnT = 0.15;
  const ax = g.viewX + g.swayX + g.kickX;
  const ay = g.viewY + g.swayY + g.kickY;
  g.kickY -= 8 / g.S;
  g.kickX += ((Math.random() - 0.5) * 4) / g.S;
  env.sfx.thud();

  let hit: Deer | null = null;
  for (let lane = 2; lane >= 0 && !hit; lane--) {
    for (const d of g.deer) {
      if (d.lane !== lane || (d.state !== "walk" && d.state !== "graze")) continue;
      const fy = LANES[d.lane].y;
      const slack = 0.012;
      const front = d.x + d.dir * 0.85 * d.L;
      const back = d.x - d.dir * 0.55 * d.L;
      const x0 = Math.min(front, back) - slack;
      const x1 = Math.max(front, back) + slack;
      const top = fy - (d.buck ? (d.big ? 1.7 : 1.3) : 1.12) * d.L - slack;
      if (ax >= x0 && ax <= x1 && ay >= top && ay <= fy + 0.04) { hit = d; break; }
    }
  }

  if (!hit) {
    g.streak = 0;
    burst(g, ax, ay, 6, ["#c9b48a", "#a08a5c", "#7a6a45"], 0.25);
    g.stickers.push({ x: ax, y: ay, title: "MISS", sub: "", t: 0, tone: "dim" });
    return;
  }

  const wasGrazing = hit.state === "graze";
  hit.state = "bound";
  hit.stateT = 0;
  hit.boundT = 0;
  if (hit === g.big) g.big = null;
  const hitX = hit.x;
  const hitY = LANES[hit.lane].y - 0.7 * hit.L;

  if (hit.buck) {
    g.streak += 1;
    const mult = g.streak >= 3 ? 2 : g.streak === 2 ? 1.5 : 1;
    const base = hit.big ? BIG_ONE_PTS : LANES[hit.lane].pts;
    const pts = Math.round((base + (wasGrazing ? CLEAN_BONUS : 0)) * mult);
    g.score = Math.min(MAX_SCORE, g.score + pts);
    g.flashT = 1;
    g.stickers.push({ x: hitX, y: hitY, title: hit.big ? "BIG ONE!" : "TAGGED!", sub: `+${pts.toLocaleString()}`, t: 0, tone: "good" });
    burst(g, hitX, hitY, hit.big ? 22 : 12, ["#fff4c2", "#ffd84a", "#ffffff", "#9ee37d"], 0.5);
    if (hit.big || wasGrazing) env.sfx.bullseye(g.streak); else env.sfx.ding(g.streak);
    if (hit.big) g.msg = { text: "THE BIG ONE! +2,500", t: 2.2, color: "#ffd84a" };
    else if (wasGrazing) g.msg = { text: "CLEAN SHOT! +300", t: 1.6, color: "#c8ff9a" };
    else if (mult > 1) g.msg = { text: `STREAK x${mult}`, t: 1.2, color: "#ffe9a8" };
  } else {
    g.streak = 0;
    g.score = Math.max(0, g.score - DOE_PENALTY);
    g.flashT = 0.6;
    g.stickers.push({ x: hitX, y: hitY, title: "DOE!", sub: `-${DOE_PENALTY}`, t: 0, tone: "bad" });
    g.msg = { text: "Let her walk!", t: 1.8, color: "#ff8d7a" };
    env.sfx.buzz();
  }
}

function update(g: G, dt: number, env: Env, now: number) {
  g.clock += dt;
  if (g.phase === "countdown") {
    g.countdownT -= dt;
    if (g.countdownT <= 0) {
      g.phase = "playing";
      g.goT = 0.7;
      g.t = 0;
    }
  }
  const playing = g.phase === "playing";
  if (playing) {
    g.t += dt;
    g.timeLeft = Math.max(0, RUN_SECONDS - g.t);
    if (g.goT > 0) g.goT -= dt;
  }

  // panning: arrow keys + drag (drag applied in the pointer handler)
  let moved = g.dragMoved;
  g.dragMoved = false;
  const pan = KEY_PAN * dt;
  if (g.keys.l) { g.viewX -= pan; moved = true; }
  if (g.keys.r) { g.viewX += pan; moved = true; }
  if (g.keys.u) { g.viewY -= pan; moved = true; }
  if (g.keys.d) { g.viewY += pan; moved = true; }
  clampView(g);

  // steadiness: hold still for a second and the sway shrinks
  g.stillT = moved ? 0 : g.stillT + dt;
  const target = clamp(g.stillT / STEADY_TIME, 0, 1);
  g.steady += (target - g.steady) * Math.min(1, dt * 6);
  const amp = lerp(SWAY_FULL, SWAY_STEADY, g.steady);
  const c = g.clock;
  g.swayX = amp * (Math.sin(c * 1.9) * 0.7 + Math.sin(c * 3.1 + 1.3) * 0.3);
  g.swayY = amp * 0.75 * (Math.sin(c * 1.5 + 0.6) * 0.7 + Math.sin(c * 2.7 + 2.1) * 0.3);
  const decay = Math.exp(-dt * 9);
  g.kickX *= decay;
  g.kickY *= decay;

  g.cooldown = Math.max(0, g.cooldown - dt);
  g.flashT = Math.max(0, g.flashT - dt * 4);
  g.btnT = Math.max(0, g.btnT - dt);
  if (g.msg) {
    g.msg.t -= dt;
    if (g.msg.t <= 0) g.msg = null;
  }

  if (playing) {
    g.spawnT -= dt;
    const progress = g.t / RUN_SECONDS;
    if (g.spawnT <= 0 && g.deer.length < MAX_DEER) {
      g.deer.push(spawnDeer(false));
      g.spawnT = (2.8 + Math.random() * 1.6) * (1 - 0.3 * progress);
    }
    if (!g.bigSpawned && g.t >= BIG_ONE_AT) {
      g.bigSpawned = true;
      const b = spawnDeer(true);
      // comes in from the side the player is NOT looking at
      b.dir = g.viewX > 0 ? 1 : -1;
      b.x = -b.dir * SPAWN_X;
      g.deer.push(b);
      g.big = b;
      g.msg = { text: "THE BIG ONE IS OUT!", t: 2.4, color: "#ffd84a" };
    }
  }

  for (const d of g.deer) stepDeer(d, dt);
  for (let i = g.deer.length - 1; i >= 0; i--) if (g.deer[i].state === "gone") g.deer.splice(i, 1);
  if (g.big && g.big.state !== "walk" && g.big.state !== "graze") g.big = null;

  for (let i = g.stickers.length - 1; i >= 0; i--) {
    g.stickers[i].t += dt;
    if (g.stickers[i].t > 1.3) g.stickers.splice(i, 1);
  }
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life -= dt;
    if (p.life <= 0) { g.particles.splice(i, 1); continue; }
    p.vy += 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  const diff = g.score - g.display;
  g.display = Math.abs(diff) < 1 ? g.score : g.display + diff * Math.min(1, dt * 8);

  if (env.onHud && now - g.lastHud > 100 && g.phase !== "over") {
    g.lastHud = now;
    env.onHud({ score: Math.round(g.score), timeLeft: Math.ceil(g.timeLeft) });
  }

  if (playing && g.timeLeft <= 0) endRun(g, env);
}

/* ───────────── HUD + frame ───────────── */

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, press: number, cool: number) {
  const rr = r * (1 - 0.08 * press);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.arc(x, y + 4, rr, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2a1c10";
  ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
  g.addColorStop(0, "#ffb15c");
  g.addColorStop(0.6, "#e8692e");
  g.addColorStop(1, "#b8431c");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rr * 0.88, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, rr * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  if (cool > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, rr * 0.95, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cool)); ctx.stroke();
  }
  label(ctx, "TAG", x, y + 1, rr * 0.4, "#fff6e4", "center");
}

function drawHud(ctx: CanvasRenderingContext2D, g: G, aimX: number, aimY: number) {
  const { W, H, S } = g;
  const pad = 12;
  const big = clamp(S * 0.07, 22, 30);
  const small = clamp(S * 0.035, 13, 15);
  const cx = W / 2, cy = H / 2, R = S * 0.35;

  // score (counts up)
  label(ctx, "SCORE", pad, pad + small / 2, small, "#cbbfa5");
  label(ctx, Math.round(g.display).toLocaleString(), pad, pad + small + big / 2 + 4, big, "#ffe9a8");

  // streak pill
  const nextMult = g.streak >= 2 ? 2 : g.streak === 1 ? 1.5 : 1;
  const pillText = g.streak > 0 ? `STREAK ${g.streak}  x${nextMult}` : "STREAK 0";
  ctx.font = FONT(small);
  const pw = ctx.measureText(pillText).width + 18;
  const py = pad + small + big + 12;
  ctx.fillStyle = g.streak >= 2 ? "#4a7c59" : g.streak === 1 ? "#3b5a44" : "rgba(255,255,255,0.1)";
  roundRect(ctx, pad, py, pw, small + 10, 8);
  ctx.fill();
  label(ctx, pillText, pad + 9, py + (small + 10) / 2 + 0.5, small, g.streak > 0 ? "#ffffff" : "#9a9280", "left", false);

  // time bar
  const barW = clamp(W * 0.3, 110, 160);
  const barH = 10;
  const bx = W - pad - barW;
  const by = pad + small + 8;
  const low = g.timeLeft < 10 && g.phase === "playing";
  label(ctx, "TIME", bx, pad + small / 2, small, "#cbbfa5");
  label(ctx, `${Math.ceil(g.timeLeft)}`, W - pad, pad + small / 2, small + 2, low ? "#ff6b57" : "#ffe9a8", "right");
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, bx, by, barW, barH, 5);
  ctx.fill();
  const frac = clamp(g.timeLeft / RUN_SECONDS, 0, 1);
  if (frac > 0) {
    ctx.fillStyle = low ? (Math.sin(g.clock * 10) > 0 ? "#ff6b57" : "#d6402c") : "#8fd36f";
    roundRect(ctx, bx + 1, by + 1, Math.max(4, (barW - 2) * frac), barH - 2, 4);
    ctx.fill();
  }

  // steady meter (bottom-left)
  const sw = 72;
  const sy = H - pad - 8;
  label(ctx, "STEADY", pad, sy - 14, small, "#cbbfa5");
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, pad, sy - 4, sw, 8, 4);
  ctx.fill();
  ctx.fillStyle = g.steady > 0.95 ? "#9ee37d" : "#c9b48a";
  roundRect(ctx, pad + 1, sy - 3, Math.max(2, (sw - 2) * g.steady), 6, 3);
  ctx.fill();

  // shoot button
  const b = btnGeom(W, H, S);
  drawButton(ctx, b.x, b.y, b.r, g.btnT / 0.15, g.cooldown / SHOT_COOLDOWN);

  // big-one edge pointer when it is outside the lens
  if (g.big) {
    const d = g.big;
    const dx = (d.x - aimX) * S;
    const dy = (LANES[d.lane].y - 0.6 * d.L - aimY) * S;
    const dist = Math.hypot(dx, dy);
    if (dist > R - 14) {
      const a = Math.atan2(dy, dx);
      const px = cx + Math.cos(a) * (R - 18);
      const py2 = cy + Math.sin(a) * (R - 18);
      ctx.save();
      ctx.translate(px, py2);
      ctx.rotate(a);
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(g.clock * 6));
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // stickers (world-anchored, drawn above the vignette so they always read)
  const spx = clamp(S * 0.045, 14, 20);
  for (const s of g.stickers) {
    const t = s.t;
    const scale = t < 0.15 ? (t / 0.15) * 1.3 : t < 0.3 ? 1.3 - ((t - 0.15) / 0.15) * 0.3 : 1;
    const alpha = t > 0.9 ? 1 - (t - 0.9) / 0.4 : 1;
    const sx = W / 2 + (s.x - aimX) * S;
    const syy = H / 2 + (s.y - aimY) * S - t * 22;
    ctx.save();
    ctx.translate(sx, syy);
    ctx.rotate(-0.12);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (s.tone === "dim") {
      label(ctx, s.title, 0, 0, spx * 0.8, "rgba(230,220,200,0.85)", "center");
    } else {
      ctx.font = FONT(spx);
      const tw = ctx.measureText(s.title).width + 16;
      ctx.fillStyle = s.tone === "good" ? "#ffd84a" : "#ff6b57";
      roundRect(ctx, -tw / 2, -spx * 0.75, tw, spx * 1.5, 6);
      ctx.fill();
      label(ctx, s.title, 0, 1, spx, s.tone === "good" ? "#3a2409" : "#3a0c06", "center", false);
      if (s.sub) label(ctx, s.sub, 0, spx * 1.55, spx * 1.1, "#ffffff", "center");
    }
    ctx.restore();
  }

  // message under the lens
  if (g.msg) {
    const mpx = clamp(S * 0.05, 16, 22);
    ctx.globalAlpha = clamp(g.msg.t * 3, 0, 1);
    label(ctx, g.msg.text, cx, Math.min(H - pad - 30, cy + R + 22), mpx, g.msg.color, "center");
    ctx.globalAlpha = 1;
  }

  // countdown / GO!
  if (g.phase === "countdown") {
    const n = Math.ceil(g.countdownT);
    const f = n - g.countdownT; // 0..1 since this digit appeared
    const scale = 1.5 - 0.5 * Math.min(1, f * 3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(1 - Math.max(0, f - 0.75) * 4, 0, 1);
    label(ctx, `${n}`, 0, 0, S * 0.28, "#ffe9a8", "center");
    ctx.restore();
  } else if (g.goT > 0) {
    const f = 1 - g.goT / 0.7;
    ctx.save();
    ctx.translate(cx, cy);
    const scale = 1.4 - 0.4 * Math.min(1, f * 3);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(1 - Math.max(0, f - 0.6) * 2.5, 0, 1);
    label(ctx, "GO!", 0, 0, S * 0.24, "#9ee37d", "center");
    ctx.restore();
  }
}

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H, S } = g;
  const aimX = g.viewX + g.swayX + g.kickX;
  const aimY = g.viewY + g.swayY + g.kickY;
  const idle = g.phase === "idle";

  let scene: SceneDeer[];
  if (idle) {
    scene = IDLE_DEER;
  } else {
    scene = [];
    for (const d of g.deer) {
      if (d.state === "gone") continue;
      const bound = d.state === "bound";
      const pose = bound ? POSE_BOUND : d.state === "graze" ? POSE_STAND : POSES[WALK_CYCLE[Math.floor(d.phase * 4) % 4]];
      scene.push({
        x: d.x,
        y: LANES[d.lane].y,
        L: d.L,
        dir: d.dir,
        buck: d.buck,
        antler: d.big ? 1.9 : 1,
        pose,
        graze: d.state === "graze",
        hop: bound ? Math.abs(Math.sin(d.boundT * 9)) * 0.35 * d.L : 0,
        lane: d.lane,
      });
    }
  }
  drawScene(ctx, W, H, S, aimX, aimY, scene, g.clock, false);

  // particles live in the world (so the lens vignettes them)
  for (const p of g.particles) {
    const sx = W / 2 + (p.x - aimX) * S;
    const sy = H / 2 + (p.y - aimY) * S;
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    const sz = Math.max(2, p.size * S);
    ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  const cx = W / 2, cy = H / 2, R = S * 0.35;
  drawScope(ctx, W, H, cx, cy, R, g.flashT);
  if (!idle) drawHud(ctx, g, aimX, aimY);
}

/* ───────────── component ───────────── */

const Game = forwardRef<GameHandle, GameProps>(function Game({ onEnd, onHud, sfx }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<G>(makeState());
  const envRef = useRef<Env>({ onEnd, onHud, sfx });
  const engineRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    envRef.current = { onEnd, onHud, sfx };
  }, [onEnd, onHud, sfx]);

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
      st.S = Math.min(W, H);
      if (!running) render(ctx, st);
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      update(st, dt, envRef.current, now);
      render(ctx, st);
      if (st.phase === "over") { running = false; return; }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      resetRun(st);
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      st.dragOn = false;
      st.keys = { l: false, r: false, u: false, d: false };
    };
    engineRef.current = { start, stop };

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      if (e.button !== 0) return;
      if (st.phase === "idle" || st.phase === "over") return;
      const { x, y } = toLocal(e);
      const b = btnGeom(st.W, st.H, st.S);
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) {
        shoot(st, envRef.current);
        return;
      }
      st.dragOn = true;
      st.dragId = e.pointerId;
      st.dragX = x;
      st.dragY = y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    };
    const onMove = (e: PointerEvent) => {
      if (!st.dragOn || e.pointerId !== st.dragId) return;
      const { x, y } = toLocal(e);
      const dx = x - st.dragX;
      const dy = y - st.dragY;
      st.dragX = x;
      st.dragY = y;
      if (Math.abs(dx) + Math.abs(dy) > 0.4) st.dragMoved = true;
      st.viewX -= dx / st.S;
      st.viewY -= dy / st.S;
      clampView(st);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === st.dragId) st.dragOn = false;
    };
    const active = () => st.phase === "playing" || st.phase === "countdown";
    const onKeyDown = (e: KeyboardEvent) => {
      if (!active()) return;
      switch (e.code) {
        case "ArrowLeft": st.keys.l = true; break;
        case "ArrowRight": st.keys.r = true; break;
        case "ArrowUp": st.keys.u = true; break;
        case "ArrowDown": st.keys.d = true; break;
        case "Space":
        case "Enter":
          if (!e.repeat) shoot(st, envRef.current);
          break;
        default: return;
      }
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowLeft": st.keys.l = false; break;
        case "ArrowRight": st.keys.r = false; break;
        case "ArrowUp": st.keys.u = false; break;
        case "ArrowDown": st.keys.d = false; break;
      }
    };
    const onBlur = () => {
      st.keys = { l: false, r: false, u: false, d: false };
      st.dragOn = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);
    resize();

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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
