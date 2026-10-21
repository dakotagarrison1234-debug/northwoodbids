"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Pie Catch — Grandma is at the upstairs window of the farmhouse
   tossing pies out into the evening. Slide the wicker basket along
   the lawn to catch them. Burnt pies (black, smoking) must be
   dodged; a golden pie turns up every ten seconds or so; a cup of
   milk slows everything down for a moment.

   Units: item x is a fraction of the canvas width, item y a
   fraction of the canvas height, so a resize mid-run just rescales
   the world. Sprite sizes come from `u = min(W, 420)`.
   ───────────────────────────────────────────────────────────── */

const RUN_SECONDS = 60;
const COUNTDOWN = 3.6; // 3-2-1 then "GO!" for the last 0.6 s
const COMBO_CAP = 15;
const PTS_CATCH = 100;
const PTS_COMBO = 20;
const PTS_GOLD = 800;
const PTS_BURNT = -300;
const PTS_MILK = 50;
const SLOW_SECONDS = 3;
const SLOW_FACTOR = 0.45;
const FALL_START = 0.3; // H per second at the start of the run
const FALL_END = 0.56; // ... and at the end
const GAP_START = 1.7; // seconds between tosses at the start
const GAP_END = 0.8;
const GOLD_EVERY = 10;
const MILK_EVERY = 17;
const BURNT_START = 0.14; // share of tosses that are burnt
const BURNT_END = 0.32;
const TOSS_T = 0.75; // seconds for a pie to reach its lane
const DRIFT = 0.028; // sine drift amplitude (fraction of W)
const PILE_MAX = 5;
const MAX_PARTICLES = 220;

const FLAVOURS = [
  { fill: "#c4232b", lite: "#e8575a" }, // cherry
  { fill: "#d9a234", lite: "#f3c95c" }, // apple
  { fill: "#3b3f8f", lite: "#6a70c4" }, // blueberry
  { fill: "#e2742a", lite: "#f7a35a" }, // pumpkin
];
const GOLD_IDX = 4;

const TAU = Math.PI * 2;
const FONT = (px: number) => `900 ${px}px system-ui, -apple-system, sans-serif`;

/* ───────────── helpers ───────────── */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Deterministic 0..1 noise for scenery. */
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

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
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

type Kind = "pie" | "burnt" | "gold" | "milk";

type Item = {
  kind: Kind;
  flavour: number;
  x: number; // fraction of W
  y: number; // fraction of H
  fromX: number;
  toX: number;
  age: number; // seconds of (slow-scaled) flight
  rot: number;
  vrot: number;
  ph: number; // sine drift phase
  emit: number; // trail emitter timer
};

type PKind = "crumb" | "smoke" | "spark" | "drop";

type Particle = {
  kind: PKind;
  x: number; // px
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
};

type Splat = { x: number; y: number; t: number; color: string; r: number };
type Float = { x: number; y: number; t: number; text: string; color: string; px: number };

type Phase = "idle" | "countdown" | "playing" | "over";

type G = {
  W: number;
  H: number;
  phase: Phase;
  ended: boolean;
  t: number;
  countdown: number;
  timeLeft: number;
  score: number;
  shown: number;
  combo: number;
  catches: number;
  bx: number; // basket centre (fraction of W)
  target: number; // where the basket is heading (fraction of W)
  keyL: boolean;
  keyR: boolean;
  dragging: boolean;
  items: Item[];
  particles: Particle[];
  splats: Splat[];
  floats: Float[];
  pile: number[]; // flavour indices in the basket (max PILE_MAX)
  spawnT: number;
  goldT: number;
  milkT: number;
  goldDue: boolean;
  milkDue: boolean;
  burntRun: number;
  slow: number;
  armT: number; // > 0 while grandma's arm is still out from a toss
  squash: number;
  basketFlash: number;
  flash: number;
  shake: number;
  starA: number;
  lastHud: number;
  lastThud: number;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function makeState(): G {
  return {
    W: 390,
    H: 700,
    phase: "idle",
    ended: false,
    t: 0,
    countdown: COUNTDOWN,
    timeLeft: RUN_SECONDS,
    score: 0,
    shown: 0,
    combo: 0,
    catches: 0,
    bx: 0.5,
    target: 0.5,
    keyL: false,
    keyR: false,
    dragging: false,
    items: [],
    particles: [],
    splats: [],
    floats: [],
    pile: [],
    spawnT: 0,
    goldT: GOLD_EVERY,
    milkT: MILK_EVERY,
    goldDue: false,
    milkDue: false,
    burntRun: 0,
    slow: 0,
    armT: 0,
    squash: 0,
    basketFlash: 0,
    flash: 0,
    shake: 0,
    starA: 0.5,
    lastHud: 0,
    lastThud: 0,
  };
}

/* ───────────── layout ───────────── */

type L = {
  u: number;
  horizon: number;
  houseX: number; // centre
  houseW: number;
  houseTop: number;
  roofPeak: number;
  winX: number;
  winY: number;
  winW: number;
  winH: number;
  basketY: number; // rim centre
  basketW: number;
  basketH: number;
  groundY: number; // where a missed pie splats
  pieR: number;
  oakX: number;
  oakR: number;
};

function layout(W: number, H: number): L {
  const u = Math.min(W, 420);
  const land = W > H;
  const horizon = H * 0.64;
  const houseW = clamp(W * 0.62, 180, H * 0.78);
  const houseX = land ? W * 0.56 : W * 0.52;
  const houseTop = H * 0.3;
  const roofPeak = H * 0.13;
  const winW = houseW * 0.16;
  const winH = winW * 1.3;
  const basketW = u * 0.3;
  const basketH = basketW * 0.62;
  // Landscape sits the basket a touch higher so its bottom (and shadow)
  // clears the picket fence along the bottom edge by a comfortable margin.
  const basketY = H * (land ? 0.79 : 0.82);
  return {
    u,
    horizon,
    houseX,
    houseW,
    houseTop,
    roofPeak,
    winX: houseX,
    winY: houseTop + winH * 0.8,
    winW,
    winH,
    basketY,
    basketW,
    basketH,
    groundY: basketY + basketH * 0.5,
    pieR: u * 0.068,
    oakX: land ? W * 0.14 : W * 0.06,
    oakR: Math.min(W * 0.13, H * 0.22),
  };
}

/* ───────────── run setup ───────────── */

function resetRun(g: G) {
  g.phase = "countdown";
  g.ended = false;
  g.t = 0;
  g.countdown = COUNTDOWN;
  g.timeLeft = RUN_SECONDS;
  g.score = 0;
  g.shown = 0;
  g.combo = 0;
  g.catches = 0;
  g.bx = 0.5;
  g.target = 0.5;
  g.keyL = false;
  g.keyR = false;
  g.dragging = false;
  g.items = [];
  g.particles = [];
  g.splats = [];
  g.floats = [];
  g.pile = [];
  g.spawnT = 0.4;
  g.goldT = GOLD_EVERY * 0.8;
  g.milkT = MILK_EVERY * 0.7;
  g.goldDue = false;
  g.milkDue = false;
  g.burntRun = 0;
  g.slow = 0;
  g.armT = 0;
  g.squash = 0;
  g.basketFlash = 0;
  g.flash = 0;
  g.shake = 0;
  g.starA = 0;
  g.lastHud = 0;
  g.lastThud = 0;
}

/** The still shown before START: a couple of pies in the air. */
function demoState(g: G) {
  g.phase = "idle";
  g.items = [];
  g.pile = [0, 1, 2];
  g.bx = 0.5;
  g.target = 0.5;
  g.starA = 0.5;
  g.t = 0;
  const mk = (kind: Kind, flavour: number, x: number, y: number, toX: number): Item => ({
    kind,
    flavour,
    x,
    y,
    fromX: x,
    toX,
    age: 2,
    rot: hash(x * 9) * TAU,
    vrot: 1,
    ph: 0,
    emit: 0,
  });
  g.items.push(mk("pie", 0, 0.5, 0.52, 0.5));
  g.items.push(mk("pie", 3, 0.3, 0.66, 0.3));
  g.items.push(mk("burnt", 0, 0.76, 0.6, 0.76));
}

/* ───────────── effects ───────────── */

function addParticle(g: G, p: Particle) {
  g.particles.push(p);
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES);
}

function addCrumbs(g: G, x: number, y: number, u: number, flavour: number, n: number) {
  const f = flavour === GOLD_IDX ? { fill: "#f2c94c", lite: "#fff2b0" } : FLAVOURS[flavour];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = u * (0.25 + Math.random() * 0.55);
    addParticle(g, {
      kind: "crumb",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 0.45 + Math.random() * 0.4,
      size: u * (0.008 + Math.random() * 0.012),
      color: i % 3 === 0 ? f.lite : i % 3 === 1 ? f.fill : "#e0b068",
      rot: Math.random() * TAU,
    });
  }
}

function addSmoke(g: G, x: number, y: number, u: number, n: number, burst: boolean) {
  for (let i = 0; i < n; i++) {
    addParticle(g, {
      kind: "smoke",
      x: x + (Math.random() - 0.5) * u * 0.03,
      y,
      vx: (Math.random() - 0.5) * u * (burst ? 0.35 : 0.08),
      vy: -u * (burst ? 0.1 + Math.random() * 0.25 : 0.12 + Math.random() * 0.1),
      life: 0,
      max: 0.6 + Math.random() * 0.5,
      size: u * (0.012 + Math.random() * 0.012),
      color: "",
      rot: 0,
    });
  }
}

function addSparks(g: G, x: number, y: number, u: number, n: number, burst: boolean) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = u * (burst ? 0.3 + Math.random() * 0.7 : 0.05 + Math.random() * 0.12);
    addParticle(g, {
      kind: "spark",
      x: x + (Math.random() - 0.5) * u * 0.06,
      y: y + (Math.random() - 0.5) * u * 0.06,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 0.35 + Math.random() * 0.4,
      size: u * (0.008 + Math.random() * 0.01),
      color: Math.random() < 0.5 ? "#fff6c8" : "#ffd54a",
      rot: Math.random() * TAU,
    });
  }
}

function addDrops(g: G, x: number, y: number, u: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const sp = u * (0.2 + Math.random() * 0.5);
    addParticle(g, {
      kind: "drop",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 0.4 + Math.random() * 0.3,
      size: u * (0.006 + Math.random() * 0.008),
      color: "#ffffff",
      rot: 0,
    });
  }
}

function addFloat(g: G, x: number, y: number, text: string, color: string, px: number) {
  g.floats.push({ x, y, t: 0, text, color, px });
  if (g.floats.length > 8) g.floats.shift();
}

function addSplat(g: G, x: number, y: number, color: string, r: number) {
  g.splats.push({ x, y, t: 0, color, r });
  if (g.splats.length > 10) g.splats.shift();
}

/* ───────────── game logic ───────────── */

const progress = (g: G) => clamp(1 - g.timeLeft / RUN_SECONDS, 0, 1);
const fallSpeed = (g: G) => lerp(FALL_START, FALL_END, progress(g));

function spawn(g: G, l: L) {
  const p = progress(g);
  let kind: Kind = "pie";
  if (g.goldDue) {
    kind = "gold";
    g.goldDue = false;
  } else if (g.milkDue && g.slow <= 0) {
    kind = "milk";
    g.milkDue = false;
  } else if (g.burntRun < 2 && Math.random() < lerp(BURNT_START, BURNT_END, p)) {
    kind = "burnt";
  }
  g.burntRun = kind === "burnt" ? g.burntRun + 1 : 0;
  const fromX = l.winX / g.W;
  // Lanes: anywhere across the lawn, but never straight down the wall.
  let toX = 0.08 + Math.random() * 0.84;
  if (Math.abs(toX - fromX) < 0.06) toX += toX < fromX ? -0.08 : 0.08;
  g.items.push({
    kind,
    flavour: kind === "gold" ? GOLD_IDX : Math.floor(Math.random() * FLAVOURS.length),
    x: fromX,
    y: l.winY / g.H,
    fromX,
    toX: clamp(toX, 0.06, 0.94),
    age: 0,
    rot: Math.random() * TAU,
    vrot: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.4),
    ph: Math.random() * TAU,
    emit: 0,
  });
  g.armT = 0.42;
}

function endRun(g: G, env: Env) {
  if (g.ended) return;
  g.ended = true;
  g.phase = "over";
  g.timeLeft = 0;
  env.sfx.gameOver();
  const final = clamp(Math.round(g.score), 0, MAX_SCORE);
  env.onHud?.({ score: final, timeLeft: 0 });
  env.onEnd(final);
}

function caught(g: G, it: Item, l: L, env: Env) {
  const u = l.u;
  const x = it.x * g.W;
  const y = l.basketY - l.basketH * 0.2;
  if (it.kind === "burnt") {
    g.score = Math.max(0, g.score + PTS_BURNT);
    g.combo = 0;
    g.basketFlash = 0.6;
    g.shake = 0.5;
    addSmoke(g, x, y, u, 14, true);
    addFloat(g, x, y - u * 0.08, String(PTS_BURNT), "#ff6b5e", 0.07);
    env.sfx.buzz();
    return;
  }
  if (it.kind === "milk") {
    g.slow = SLOW_SECONDS;
    g.score += PTS_MILK;
    addDrops(g, x, y, u, 12);
    addFloat(g, x, y - u * 0.08, "SLOW!", "#cfe9ff", 0.075);
    env.sfx.ding(1);
    g.squash = 1;
    return;
  }
  g.combo = Math.min(COMBO_CAP, g.combo + 1);
  g.catches++;
  g.pile.push(it.flavour);
  if (g.pile.length > PILE_MAX) g.pile.shift();
  g.squash = 1;
  if (it.kind === "gold") {
    g.score += PTS_GOLD;
    g.flash = 0.35;
    addSparks(g, x, y, u, 26, true);
    addCrumbs(g, x, y, u, GOLD_IDX, 8);
    addFloat(g, x, y - u * 0.1, `+${PTS_GOLD}`, "#ffd54a", 0.095);
    env.sfx.bullseye(g.combo);
  } else {
    const pts = PTS_CATCH + PTS_COMBO * g.combo;
    g.score += pts;
    addCrumbs(g, x, y, u, it.flavour, 10 + Math.min(10, g.combo));
    addFloat(g, x, y - u * 0.08, `+${pts}`, g.combo >= 10 ? "#ffd54a" : "#ffffff", 0.07);
    env.sfx.ding(g.combo);
  }
  g.score = Math.min(MAX_SCORE, g.score);
}

function missed(g: G, it: Item, l: L, env: Env, now: number) {
  const x = it.x * g.W;
  const y = l.groundY;
  const u = l.u;
  if (it.kind === "milk") {
    addDrops(g, x, y, u, 8);
    addSplat(g, x, y, "rgba(255,255,255,0.85)", l.pieR * 0.8);
    return;
  }
  if (it.kind === "burnt") {
    addSmoke(g, x, y - u * 0.02, u, 5, true);
    addSplat(g, x, y, "#2a1d16", l.pieR);
    return;
  }
  // A good pie on the lawn: combo gone, a sad little puddle.
  g.combo = 0;
  const color = it.kind === "gold" ? "#e8b92f" : FLAVOURS[it.flavour].fill;
  addSplat(g, x, y, color, l.pieR * 1.1);
  addCrumbs(g, x, y - u * 0.01, u, it.flavour, 6);
  if (now - g.lastThud > 140) {
    g.lastThud = now;
    env.sfx.thud();
  }
}

function update(g: G, dt: number, env: Env, now: number) {
  const l = layout(g.W, g.H);
  const { W, H } = g;
  g.t += dt;

  if (g.phase === "countdown") {
    g.countdown -= dt;
    if (g.countdown <= 0) g.phase = "playing";
  }

  const playing = g.phase === "playing";
  const sp = g.slow > 0 ? SLOW_FACTOR : 1;
  const dts = dt * sp; // world time (slowed by milk)

  if (playing) {
    g.timeLeft -= dt;
    g.starA = progress(g);
    g.slow = Math.max(0, g.slow - dt);
    // Tosses.
    g.spawnT -= dts;
    g.goldT -= dts;
    g.milkT -= dts;
    if (g.goldT <= 0) {
      g.goldDue = true;
      g.goldT = GOLD_EVERY * (0.85 + Math.random() * 0.3);
    }
    if (g.milkT <= 0) {
      g.milkDue = true;
      g.milkT = MILK_EVERY * (0.85 + Math.random() * 0.3);
    }
    if (g.spawnT <= 0 && g.timeLeft > 1.2) {
      spawn(g, l);
      g.spawnT = lerp(GAP_START, GAP_END, progress(g)) * (0.8 + Math.random() * 0.4);
    }
  }

  // Basket: keys nudge the target, then the basket eases toward it.
  if (g.phase !== "idle") {
    if (g.keyL !== g.keyR) g.target += (g.keyR ? 1 : -1) * 1.25 * dt;
    const half = l.basketW / 2 / W + 0.01;
    g.target = clamp(g.target, half, 1 - half);
    g.bx = lerp(g.bx, g.target, 1 - Math.pow(0.0003, dt));
  }
  g.armT = Math.max(0, g.armT - dt);

  // Items fall.
  const fs = fallSpeed(g);
  const rimY = l.basketY / H;
  const groundY = l.groundY / H;
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i];
    if (g.phase === "idle") {
      it.rot += it.vrot * dt;
      continue;
    }
    it.age += dts;
    const k = clamp(it.age / TOSS_T, 0, 1);
    const ease = 1 - (1 - k) * (1 - k);
    it.x = lerp(it.fromX, it.toX, ease) + DRIFT * k * Math.sin(it.ph + it.age * 2.4);
    // A little pop upward out of the window, then a steady fall.
    const k2 = clamp(it.age / 0.5, 0, 1);
    const vy = fs * (k2 * 1.4 - 0.4);
    const prevY = it.y;
    it.y += vy * dts;
    it.rot += it.vrot * dts;
    // trails
    if (it.kind === "burnt" || it.kind === "gold") {
      it.emit -= dts;
      if (it.emit <= 0) {
        it.emit = it.kind === "burnt" ? 0.09 : 0.07;
        if (it.kind === "burnt") addSmoke(g, it.x * W, it.y * H - l.pieR * 0.4, l.u, 1, false);
        else addSparks(g, it.x * W, it.y * H, l.u, 1, false);
      }
    }
    if (playing && vy > 0 && prevY < rimY && it.y >= rimY) {
      const dx = Math.abs(it.x * W - g.bx * W);
      if (dx < l.basketW / 2 + l.pieR * 0.45) {
        caught(g, it, l, env);
        g.items.splice(i, 1);
        continue;
      }
    }
    if (it.y >= groundY) {
      if (playing) missed(g, it, l, env, now);
      g.items.splice(i, 1);
    }
  }

  // Particles (px).
  const u = l.u;
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      g.particles.splice(i, 1);
      continue;
    }
    if (p.kind === "smoke") {
      p.vx *= 1 - 1.2 * dt;
      p.vy -= u * 0.05 * dt;
    } else if (p.kind === "spark") {
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
    } else {
      p.vy += u * 1.6 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += 4 * dt;
  }
  for (let i = g.splats.length - 1; i >= 0; i--) {
    g.splats[i].t += dt;
    if (g.splats[i].t > 1.4) g.splats.splice(i, 1);
  }
  for (let i = g.floats.length - 1; i >= 0; i--) {
    g.floats[i].t += dt;
    if (g.floats[i].t > 1.0) g.floats.splice(i, 1);
  }

  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.squash = Math.max(0, g.squash - dt * 4.5);
  g.basketFlash = Math.max(0, g.basketFlash - dt * 1.6);
  g.shake = Math.max(0, g.shake - dt * 2);
  g.shown = Math.abs(g.score - g.shown) < 1 ? g.score : lerp(g.shown, g.score, 1 - Math.pow(0.002, dt));

  if (playing && g.timeLeft <= 0) {
    endRun(g, env);
    return;
  }

  if (env.onHud && now - g.lastHud > 100 && g.phase !== "over") {
    g.lastHud = now;
    env.onHud({ score: Math.round(g.score), timeLeft: Math.max(0, Math.ceil(g.timeLeft)) });
  }
}

/* ───────────── drawing: sprites ───────────── */

function drawPie(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, kind: Kind, flavour: number) {
  ctx.save();
  ctx.translate(x, y);
  // soft drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(r * 0.12, r * 0.22, r, r * 0.92, 0, 0, TAU);
  ctx.fill();
  if (kind === "gold") {
    const halo = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.8);
    halo.addColorStop(0, "rgba(255,220,110,0.5)");
    halo.addColorStop(1, "rgba(255,220,110,0)");
    ctx.fillStyle = halo;
    circle(ctx, 0, 0, r * 1.8);
  }
  ctx.rotate(rot);
  const burnt = kind === "burnt";
  const gold = kind === "gold";
  // tin
  ctx.fillStyle = gold ? "#d6ae3c" : burnt ? "#55585e" : "#9aa0ab";
  circle(ctx, 0, 0, r);
  ctx.fillStyle = gold ? "#fff1a8" : burnt ? "#7b7f86" : "#d5d9e2";
  circle(ctx, 0, 0, r * 0.93);
  // crust
  const crust = burnt ? "#2b1d14" : gold ? "#f5d16a" : "#d9a05b";
  ctx.fillStyle = crust;
  circle(ctx, 0, 0, r * 0.85);
  // crimped edge
  ctx.fillStyle = burnt ? "#1a110c" : gold ? "#e0b63f" : "#b7793b";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    circle(ctx, Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76, r * 0.06);
  }
  // filling
  const f = gold ? { fill: "#ffe79a", lite: "#fff6cc" } : FLAVOURS[clamp(flavour, 0, FLAVOURS.length - 1)];
  ctx.fillStyle = burnt ? "#15100d" : f.fill;
  circle(ctx, 0, 0, r * 0.68);
  // lattice
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, TAU);
  ctx.clip();
  ctx.fillStyle = burnt ? "#3a2a1e" : gold ? "#f8df8c" : "#eabf74";
  const sw = r * 0.16;
  for (const o of [-0.4, 0, 0.4]) {
    ctx.fillRect(o * r - sw / 2, -r, sw, 2 * r);
    ctx.fillRect(-r, o * r - sw / 2, 2 * r, sw);
  }
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  for (const o of [-0.4, 0, 0.4]) {
    ctx.fillRect(o * r + sw / 2 - 1.5, -r, 1.5, 2 * r);
    ctx.fillRect(-r, o * r + sw / 2 - 1.5, 2 * r, 1.5);
  }
  if (!burnt) {
    ctx.fillStyle = f.lite;
    ctx.globalAlpha = 0.5;
    circle(ctx, -r * 0.2, -r * 0.2, r * 0.07);
    circle(ctx, r * 0.2, r * 0.2, r * 0.06);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // shine
  ctx.strokeStyle = gold ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, Math.PI * 1.1, Math.PI * 1.55);
  ctx.stroke();
  if (burnt) {
    // a few glowing embers in the crust
    ctx.fillStyle = "#e0552a";
    circle(ctx, r * 0.3, -r * 0.5, r * 0.05);
    circle(ctx, -r * 0.55, r * 0.15, r * 0.04);
  }
  ctx.restore();
}

function drawMilk(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(rot) * 0.25);
  const w = r * 1.25;
  const h = r * 1.5;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(r * 0.1, h * 0.55, w * 0.55, r * 0.25, 0, 0, TAU);
  ctx.fill();
  // handle
  ctx.strokeStyle = "#e8edf3";
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(w / 2, 0, r * 0.38, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // cup
  ctx.fillStyle = "#f6f8fb";
  roundRect(ctx, -w / 2, -h / 2, w, h, r * 0.18);
  ctx.fill();
  ctx.fillStyle = "#7fb3e6";
  ctx.fillRect(-w / 2, -h * 0.05, w, h * 0.16);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(w * 0.22, -h / 2, w * 0.28, h);
  // milk at the top
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(0, -h / 2, w / 2, r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#cfd8e3";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawBasket(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const bw = l.basketW;
  const bh = l.basketH;
  const bx = g.bx * g.W;
  const by = l.basketY;
  const s = Math.sin(g.squash * Math.PI) * 0.2;
  const lean = clamp((g.target - g.bx) * 3, -0.12, 0.12);
  ctx.save();
  ctx.translate(bx, by + bh * 0.5);
  ctx.rotate(lean);
  ctx.scale(1 + s * 0.7, 1 - s);
  ctx.translate(0, -bh * 0.5);
  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, bh * 0.55, bw * 0.55, bh * 0.14, 0, 0, TAU);
  ctx.fill();
  // handle (back half)
  ctx.strokeStyle = "#7a4f22";
  ctx.lineWidth = bw * 0.05;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 0.42, bh * 1.15, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.strokeStyle = "#b07a3a";
  ctx.lineWidth = bw * 0.022;
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 0.42, bh * 1.15, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  // body
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(-bw / 2, 0);
    ctx.lineTo(bw / 2, 0);
    ctx.lineTo(bw * 0.4, bh * 0.42);
    ctx.quadraticCurveTo(0, bh * 0.62, -bw * 0.4, bh * 0.42);
    ctx.closePath();
  };
  const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  grad.addColorStop(0, "#8f5f2b");
  grad.addColorStop(0.45, "#c48a44");
  grad.addColorStop(1, "#8a5a28");
  ctx.fillStyle = grad;
  bodyPath();
  ctx.fill();
  ctx.save();
  bodyPath();
  ctx.clip();
  // weave
  ctx.fillStyle = "rgba(60,30,10,0.35)";
  const rows = 5;
  for (let r = 1; r <= rows; r++) ctx.fillRect(-bw, (bh * 0.55 * r) / (rows + 0.3), bw * 2, 1.5);
  ctx.fillStyle = "rgba(255,220,160,0.22)";
  for (let r = 0; r < rows; r++) {
    const y0 = (bh * 0.55 * r) / (rows + 0.3) + 2;
    const y1 = (bh * 0.55 * (r + 1)) / (rows + 0.3) - 1;
    const step = bw * 0.1;
    for (let x = -bw / 2 + (r % 2) * step * 0.5; x < bw / 2; x += step) ctx.fillRect(x, y0, step * 0.42, Math.max(1, y1 - y0));
  }
  ctx.restore();
  // rim interior
  ctx.fillStyle = "#4a2a12";
  ctx.beginPath();
  ctx.ellipse(0, 0, bw / 2, bh * 0.22, 0, 0, TAU);
  ctx.fill();
  // pies in the basket
  const spots = [
    [-0.22, 0.03],
    [0.2, 0.02],
    [0, -0.02],
    [-0.11, -0.08],
    [0.12, -0.09],
  ];
  const pr = l.pieR * 0.62;
  for (let i = 0; i < g.pile.length && i < spots.length; i++) {
    const fl = g.pile[i];
    const px = spots[i][0] * bw;
    const py = spots[i][1] * bh;
    const gold = fl === GOLD_IDX;
    ctx.fillStyle = gold ? "#f5d16a" : "#d9a05b";
    ctx.beginPath();
    ctx.ellipse(px, py, pr, pr * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = gold ? "#ffe79a" : FLAVOURS[clamp(fl, 0, FLAVOURS.length - 1)].fill;
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 0.72, pr * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = gold ? "#f8df8c" : "#eabf74";
    ctx.fillRect(px - pr * 0.7, py - 1, pr * 1.4, 2);
    ctx.fillRect(px - 1, py - pr * 0.36, 2, pr * 0.72);
  }
  // checkered cloth draped over the right side
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bw * 0.12, -bh * 0.12);
  ctx.lineTo(bw * 0.5, -bh * 0.02);
  ctx.lineTo(bw * 0.52, bh * 0.3);
  ctx.quadraticCurveTo(bw * 0.4, bh * 0.4, bw * 0.3, bh * 0.2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#f1e9dc";
  ctx.fillRect(0, -bh * 0.3, bw, bh);
  ctx.fillStyle = "#c73a3a";
  const cs = bw * 0.055;
  for (let yy = -bh * 0.3, r = 0; yy < bh * 0.7; yy += cs, r++) {
    for (let xx = (r % 2) * cs; xx < bw; xx += cs * 2) ctx.fillRect(xx, yy, cs, cs);
  }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(bw * 0.3, bh * 0.1, bw * 0.3, bh * 0.4);
  ctx.restore();
  // rim ring
  ctx.strokeStyle = "#8c5a2a";
  ctx.lineWidth = bh * 0.11;
  ctx.beginPath();
  ctx.ellipse(0, 0, bw / 2, bh * 0.22, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,220,160,0.35)";
  ctx.lineWidth = bh * 0.035;
  ctx.beginPath();
  ctx.ellipse(0, -bh * 0.02, bw / 2 - 1, bh * 0.2, 0, Math.PI, TAU);
  ctx.stroke();
  // handle (front half)
  ctx.strokeStyle = "#7a4f22";
  ctx.lineWidth = bw * 0.05;
  ctx.beginPath();
  ctx.moveTo(-bw * 0.42, 0);
  ctx.lineTo(-bw * 0.42, bh * 0.08);
  ctx.moveTo(bw * 0.42, 0);
  ctx.lineTo(bw * 0.42, bh * 0.08);
  ctx.stroke();
  // burnt flash
  if (g.basketFlash > 0) {
    ctx.fillStyle = `rgba(255,70,50,${0.55 * Math.min(1, g.basketFlash) * (0.6 + 0.4 * Math.sin(g.t * 40))})`;
    bodyPath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, bw / 2, bh * 0.22, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ───────────── drawing: scene ───────────── */

/** The static full-screen gradients, built once per canvas size (a resize
 *  makes a new entry; the map is kept tiny). */
type SceneGradients = { sky: CanvasGradient; lawn: CanvasGradient };
const gradCache = new Map<string, SceneGradients>();
function sceneGradients(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number): SceneGradients {
  const key = `${W}x${H}`;
  let sg = gradCache.get(key);
  if (sg) return sg;
  if (gradCache.size >= 8) gradCache.clear();
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#150f33");
  sky.addColorStop(0.5, "#4a2458");
  sky.addColorStop(0.85, "#b2524a");
  sky.addColorStop(1, "#e2864a");
  const lawn = ctx.createLinearGradient(0, horizon, 0, H);
  lawn.addColorStop(0, "#3c6b35");
  lawn.addColorStop(1, "#1c3a22");
  sg = { sky, lawn };
  gradCache.set(key, sg);
  return sg;
}

function drawSky(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { W, H } = g;
  ctx.fillStyle = sceneGradients(ctx, W, H, l.horizon).sky;
  ctx.fillRect(0, 0, W, l.horizon + 2);
  // night creeps in over the run
  if (g.starA > 0) {
    ctx.fillStyle = `rgba(10,6,30,${0.35 * g.starA})`;
    ctx.fillRect(0, 0, W, l.horizon + 2);
  }
  // stars
  if (g.starA > 0.02) {
    ctx.fillStyle = "#fff4dc";
    for (let i = 0; i < 54; i++) {
      const x = hash(i * 1.3) * W;
      const y = hash(i * 2.7) * l.horizon * 0.75;
      const tw = 0.7 + 0.3 * Math.sin(g.t * 2.3 + i * 1.9);
      const a = g.starA * (0.35 + 0.65 * hash(i * 5.3)) * tw;
      if (hash(i * 7.1) > g.starA + 0.15) continue; // stars appear one by one
      ctx.globalAlpha = clamp(a, 0, 1);
      const s = 0.9 + hash(i * 4.1) * 1.3;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // moon (thin crescent, top right)
  const mx = W * 0.84;
  const my = H * 0.09;
  const mr = l.u * 0.04;
  ctx.fillStyle = "#f6efd2";
  circle(ctx, mx, my, mr);
  ctx.fillStyle = "#2a1848";
  ctx.globalAlpha = 0.92;
  circle(ctx, mx - mr * 0.45, my - mr * 0.15, mr * 0.88);
  ctx.globalAlpha = 1;
  // far hills
  ctx.fillStyle = "#2a1a3c";
  ctx.beginPath();
  ctx.moveTo(0, l.horizon + 2);
  ctx.quadraticCurveTo(W * 0.18, l.horizon - H * 0.08, W * 0.42, l.horizon - H * 0.02);
  ctx.quadraticCurveTo(W * 0.62, l.horizon - H * 0.11, W * 0.85, l.horizon - H * 0.03);
  ctx.quadraticCurveTo(W * 0.95, l.horizon - H * 0.05, W, l.horizon - H * 0.02);
  ctx.lineTo(W, l.horizon + 2);
  ctx.closePath();
  ctx.fill();
  // a few treeline spikes on the hills
  ctx.fillStyle = "#1f1230";
  for (let i = 0; i < 26; i++) {
    const x = hash(i * 3.7) * W;
    const h = H * (0.015 + hash(i * 1.9) * 0.03);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.4, l.horizon + 2);
    ctx.lineTo(x, l.horizon - h);
    ctx.lineTo(x + h * 0.4, l.horizon + 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawOak(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const x = l.oakX;
  const r = l.oakR;
  const base = l.horizon + l.u * 0.02;
  const sway = Math.sin(g.t * 0.7) * r * 0.02;
  // trunk
  ctx.fillStyle = "#2e1e1a";
  ctx.beginPath();
  ctx.moveTo(x - r * 0.16, base);
  ctx.lineTo(x + r * 0.16, base);
  ctx.lineTo(x + r * 0.09 + sway, base - r * 1.1);
  ctx.lineTo(x - r * 0.09 + sway, base - r * 1.1);
  ctx.closePath();
  ctx.fill();
  // branches
  ctx.strokeStyle = "#2e1e1a";
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + sway, base - r * 0.9);
  ctx.lineTo(x - r * 0.5 + sway, base - r * 1.4);
  ctx.moveTo(x + sway, base - r * 1.0);
  ctx.lineTo(x + r * 0.5 + sway, base - r * 1.45);
  ctx.stroke();
  // canopy blobs
  const blobs: [number, number, number][] = [
    [0, -1.55, 0.72],
    [-0.62, -1.3, 0.55],
    [0.62, -1.35, 0.56],
    [-0.3, -1.9, 0.5],
    [0.32, -1.95, 0.52],
    [0, -2.1, 0.42],
  ];
  for (const [ox, oy, br] of blobs) {
    ctx.fillStyle = "#1b3a24";
    circle(ctx, x + ox * r + sway * 2, base + oy * r, br * r);
  }
  for (const [ox, oy, br] of blobs) {
    ctx.fillStyle = "#24502f";
    circle(ctx, x + ox * r + sway * 2 - br * r * 0.12, base + oy * r - br * r * 0.14, br * r * 0.78);
  }
}

function drawGrandma(ctx: CanvasRenderingContext2D, cx: number, cy: number, ww: number, wh: number, armOut: boolean, t: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - ww / 2, cy - wh / 2, ww, wh);
  ctx.clip();
  ctx.translate(cx - ww * 0.14, cy);
  const bob = Math.sin(t * 2.1) * wh * 0.012;
  ctx.fillStyle = "#2b1830";
  // shoulders / body
  roundRect(ctx, -ww * 0.24, wh * 0.1 + bob, ww * 0.48, wh * 0.7, ww * 0.12);
  ctx.fill();
  // head
  circle(ctx, 0, -wh * 0.06 + bob, ww * 0.14);
  // bun
  circle(ctx, -ww * 0.1, -wh * 0.19 + bob, ww * 0.065);
  // glasses glint
  ctx.fillStyle = "rgba(255,230,160,0.7)";
  circle(ctx, ww * 0.05, -wh * 0.07 + bob, ww * 0.025);
  circle(ctx, ww * 0.11, -wh * 0.07 + bob, ww * 0.025);
  // arm
  ctx.strokeStyle = "#2b1830";
  ctx.lineWidth = ww * 0.09;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (armOut) {
    ctx.moveTo(ww * 0.18, wh * 0.16 + bob);
    ctx.lineTo(ww * 0.42, wh * 0.04 + bob);
    ctx.lineTo(ww * 0.62, wh * 0.12 + bob);
    ctx.stroke();
  } else {
    ctx.moveTo(ww * 0.18, wh * 0.16 + bob);
    ctx.lineTo(ww * 0.32, -wh * 0.08 + bob);
    ctx.lineTo(ww * 0.3, -wh * 0.3 + bob);
    ctx.stroke();
    // the next pie, held up
    ctx.fillStyle = "#3a2436";
    circle(ctx, ww * 0.3, -wh * 0.38 + bob, ww * 0.1);
  }
  ctx.restore();
}

function drawHouse(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { houseX: hx, houseW: hw, houseTop: top, roofPeak: peak, winX, winY, winW, winH } = l;
  const x0 = hx - hw / 2;
  const x1 = hx + hw / 2;
  const bottom = l.horizon + l.u * 0.012;
  const bodyH = bottom - top;
  const t = g.t;

  // body + gable, clapboard
  ctx.fillStyle = "#d3ccc3";
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  ctx.lineTo(x0, top);
  ctx.lineTo(hx, peak);
  ctx.lineTo(x1, top);
  ctx.lineTo(x1, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(60,30,60,0.12)";
  for (let y = peak + 6; y < bottom; y += 7) ctx.fillRect(x0, y, hw, 1.5);
  // evening shade on one side
  ctx.fillStyle = "rgba(60,20,70,0.2)";
  ctx.fillRect(x0, peak, hw * 0.5, bottom - peak);
  ctx.restore();

  // chimney (behind roof line)
  const chX = hx + hw * 0.26;
  const roofAt = peak + ((chX - hx) / (hw / 2)) * (top - peak);
  ctx.fillStyle = "#6b4a3e";
  ctx.fillRect(chX - hw * 0.035, roofAt - hw * 0.14, hw * 0.07, hw * 0.16);
  ctx.fillStyle = "#4e352c";
  ctx.fillRect(chX - hw * 0.045, roofAt - hw * 0.15, hw * 0.09, hw * 0.025);
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.22 + i / 3) % 1;
    ctx.fillStyle = `rgba(200,190,210,${0.28 * (1 - k)})`;
    circle(ctx, chX + Math.sin(k * 5 + i) * hw * 0.03 + k * hw * 0.09, roofAt - hw * 0.15 - k * hw * 0.26, hw * 0.02 * (1 + k * 2.2));
  }

  // roof
  ctx.strokeStyle = "#3f2f3f";
  ctx.lineWidth = hw * 0.045;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0 - hw * 0.06, top + hw * 0.03);
  ctx.lineTo(hx, peak - hw * 0.015);
  ctx.lineTo(x1 + hw * 0.06, top + hw * 0.03);
  ctx.stroke();
  ctx.strokeStyle = "#5a4458";
  ctx.lineWidth = hw * 0.012;
  ctx.beginPath();
  ctx.moveTo(x0 - hw * 0.05, top + hw * 0.012);
  ctx.lineTo(hx, peak - hw * 0.03);
  ctx.lineTo(x1 + hw * 0.05, top + hw * 0.012);
  ctx.stroke();

  // upstairs window: glow, frame, glass, grandma, sash, sill
  const glow = ctx.createRadialGradient(winX, winY, winW * 0.3, winX, winY, winW * 2.1);
  glow.addColorStop(0, "rgba(255,200,110,0.4)");
  glow.addColorStop(1, "rgba(255,200,110,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(winX - winW * 2.2, winY - winW * 2.2, winW * 4.4, winW * 4.4);
  ctx.fillStyle = "#6b4a3e";
  ctx.fillRect(winX - winW / 2 - 4, winY - winH / 2 - 4, winW + 8, winH + 8);
  const glass = ctx.createLinearGradient(0, winY - winH / 2, 0, winY + winH / 2);
  glass.addColorStop(0, "#ffe09a");
  glass.addColorStop(1, "#f0a844");
  ctx.fillStyle = glass;
  ctx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);
  // curtain on the far side
  ctx.fillStyle = "rgba(190,80,90,0.55)";
  ctx.fillRect(winX - winW / 2, winY - winH / 2, winW * 0.18, winH);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 3; i++) ctx.fillRect(winX - winW / 2 + i * winW * 0.06, winY - winH / 2, 1.5, winH);
  drawGrandma(ctx, winX + winW * 0.06, winY, winW, winH, g.armT > 0, t);
  ctx.fillStyle = "#6b4a3e";
  ctx.fillRect(winX - winW / 2, winY + winH * 0.08, winW, 2.5);
  ctx.fillStyle = "#efe9dd";
  ctx.fillRect(winX - winW / 2 - 8, winY + winH / 2 + 3, winW + 16, 5);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(winX - winW / 2 - 8, winY + winH / 2 + 8, winW + 16, 2);

  // downstairs windows (dim, cosy)
  for (const dx of [-0.31, 0.31]) {
    const wx = hx + hw * dx;
    const wy = top + bodyH * 0.7;
    const ww = hw * 0.13;
    const wh = ww * 1.15;
    ctx.fillStyle = "#6b4a3e";
    ctx.fillRect(wx - ww / 2 - 3, wy - wh / 2 - 3, ww + 6, wh + 6);
    ctx.fillStyle = "#a8692f";
    ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
    ctx.fillStyle = "rgba(255,210,120,0.35)";
    ctx.fillRect(wx - ww / 2, wy - wh / 2, ww * 0.5, wh * 0.5);
    ctx.fillStyle = "#6b4a3e";
    ctx.fillRect(wx - 1, wy - wh / 2, 2, wh);
    ctx.fillRect(wx - ww / 2, wy - 1, ww, 2);
  }

  // porch roof
  const porchY = top + bodyH * 0.52;
  ctx.fillStyle = "#3f2f3f";
  ctx.beginPath();
  ctx.moveTo(x0 - hw * 0.05, porchY + hw * 0.04);
  ctx.lineTo(x0, porchY);
  ctx.lineTo(x1, porchY);
  ctx.lineTo(x1 + hw * 0.05, porchY + hw * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1f2a";
  ctx.fillRect(x0 - hw * 0.05, porchY + hw * 0.04, hw * 1.1, hw * 0.012);
  // door
  const dw = hw * 0.12;
  const dy = top + bodyH * 0.62;
  ctx.fillStyle = "#5a3a2a";
  ctx.fillRect(hx - dw / 2, dy, dw, bottom - dy);
  ctx.fillStyle = "#f5cf7a";
  ctx.fillRect(hx - dw * 0.3, dy + dw * 0.15, dw * 0.6, dw * 0.45);
  ctx.fillStyle = "#2a1a14";
  ctx.fillRect(hx - 1, dy + dw * 0.15, 2, dw * 0.45);
  ctx.fillStyle = "#e9c46a";
  circle(ctx, hx + dw * 0.3, dy + dw * 0.95, 2.2);
  // porch light with a pulsing glow
  const plx = hx + dw * 0.75;
  const ply = dy + dw * 0.2;
  const pulse = 0.85 + 0.15 * Math.sin(t * 6.2) * Math.sin(t * 2.7);
  const pg = ctx.createRadialGradient(plx, ply, 1, plx, ply, hw * 0.16);
  pg.addColorStop(0, `rgba(255,225,150,${0.45 * pulse})`);
  pg.addColorStop(1, "rgba(255,225,150,0)");
  ctx.fillStyle = pg;
  ctx.fillRect(plx - hw * 0.16, ply - hw * 0.16, hw * 0.32, hw * 0.32);
  ctx.fillStyle = "#2a1f2a";
  ctx.fillRect(plx - 2, ply - hw * 0.025, 4, hw * 0.015);
  ctx.fillStyle = "#fff1b8";
  circle(ctx, plx, ply, 3.2);
  // porch posts + rail
  ctx.fillStyle = "#e5dfd4";
  for (const px of [x0 + hw * 0.07, hx - hw * 0.14, hx + hw * 0.14, x1 - hw * 0.07]) {
    ctx.fillRect(px - hw * 0.012, porchY + hw * 0.04, hw * 0.024, bottom - porchY - hw * 0.04);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(px + hw * 0.004, porchY + hw * 0.04, hw * 0.008, bottom - porchY - hw * 0.04);
    ctx.fillStyle = "#e5dfd4";
  }
  const railY = bottom - bodyH * 0.14;
  ctx.fillRect(x0 + hw * 0.07, railY, hx - hw * 0.14 - x0 - hw * 0.07, hw * 0.014);
  ctx.fillRect(hx + hw * 0.14, railY, x1 - hw * 0.07 - hx - hw * 0.14, hw * 0.014);
  ctx.fillStyle = "rgba(229,223,212,0.7)";
  for (let px = x0 + hw * 0.1; px < hx - hw * 0.15; px += hw * 0.035) ctx.fillRect(px, railY, 2, bottom - railY);
  for (let px = hx + hw * 0.17; px < x1 - hw * 0.08; px += hw * 0.035) ctx.fillRect(px, railY, 2, bottom - railY);
  // porch floor + steps
  ctx.fillStyle = "#b9ad9c";
  ctx.fillRect(x0 - hw * 0.03, bottom - hw * 0.012, hw * 1.06, hw * 0.018);
  ctx.fillStyle = "#a3978a";
  ctx.fillRect(hx - dw * 0.9, bottom + hw * 0.006, dw * 1.8, hw * 0.016);
  ctx.fillStyle = "#8f8376";
  ctx.fillRect(hx - dw * 1.1, bottom + hw * 0.022, dw * 2.2, hw * 0.016);
}

function drawLawn(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { W, H } = g;
  const y0 = l.horizon;
  ctx.fillStyle = sceneGradients(ctx, W, H, y0).lawn;
  ctx.fillRect(0, y0, W, H - y0);
  // night tint
  if (g.starA > 0) {
    ctx.fillStyle = `rgba(10,10,40,${0.25 * g.starA})`;
    ctx.fillRect(0, y0, W, H - y0);
  }
  // path from the steps down to the bottom
  const hx = l.houseX;
  const dw = l.houseW * 0.12;
  ctx.fillStyle = "#8d7a5c";
  ctx.beginPath();
  ctx.moveTo(hx - dw * 1.1, y0 + l.houseW * 0.04);
  ctx.lineTo(hx + dw * 1.1, y0 + l.houseW * 0.04);
  ctx.lineTo(hx + dw * 2.6, H);
  ctx.lineTo(hx - dw * 2.6, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < 16; i++) {
    const k = hash(i * 2.3);
    const yy = lerp(y0 + l.houseW * 0.05, H, k);
    const half = lerp(dw * 1.05, dw * 2.5, k);
    const xx = hx + (hash(i * 4.9) - 0.5) * 2 * half * 0.8;
    ctx.fillRect(xx, yy, 3 + k * 4, 2);
  }
  // grass tufts
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 1.7) * W;
    const y = y0 + hash(i * 3.1) * (H - y0);
    const s = 1 + hash(i * 0.9) * 2;
    ctx.fillRect(x, y, s, s * 2);
    ctx.fillRect(x + s * 1.5, y + s, s * 0.8, s * 1.3);
  }
  ctx.fillStyle = "rgba(170,230,120,0.12)";
  for (let i = 0; i < 40; i++) {
    const x = hash(i * 5.7 + 9) * W;
    const y = y0 + hash(i * 2.9 + 3) * (H - y0);
    ctx.fillRect(x, y, 2, 4);
  }
}

function drawFireflies(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { W, H } = g;
  const t = g.t;
  for (let i = 0; i < 14; i++) {
    const x = hash(i * 3.3) * W + Math.sin(t * 0.35 + i * 1.3) * W * 0.05;
    const y = l.horizon - H * 0.05 + hash(i * 1.1) * (H - l.horizon) * 0.8 + Math.cos(t * 0.5 + i * 2.1) * H * 0.02;
    const a = Math.pow(Math.max(0, Math.sin(t * 1.6 + i * 2.3)), 3);
    if (a < 0.03) continue;
    ctx.fillStyle = `rgba(200,255,120,${a * 0.35})`;
    circle(ctx, x, y, 6);
    ctx.fillStyle = `rgba(235,255,190,${a})`;
    circle(ctx, x, y, 1.8);
  }
}

function drawFence(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { W, H } = g;
  const fh = l.u * 0.09;
  const y = H - fh;
  // rails
  ctx.fillStyle = "#cfc7b8";
  ctx.fillRect(0, y + fh * 0.3, W, fh * 0.1);
  ctx.fillRect(0, y + fh * 0.68, W, fh * 0.1);
  // pickets
  const pw = l.u * 0.024;
  const step = l.u * 0.058;
  for (let x = -pw; x < W + step; x += step) {
    ctx.fillStyle = "#e8e2d6";
    ctx.beginPath();
    ctx.moveTo(x, y + fh * 0.18);
    ctx.lineTo(x + pw / 2, y);
    ctx.lineTo(x + pw, y + fh * 0.18);
    ctx.lineTo(x + pw, H);
    ctx.lineTo(x, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(x + pw * 0.65, y + fh * 0.1, pw * 0.35, H - y);
  }
}

function drawItems(ctx: CanvasRenderingContext2D, g: G, l: L) {
  const { W, H } = g;
  for (const it of g.items) {
    const x = it.x * W;
    const y = it.y * H;
    // scale up a touch as the pie comes toward the camera
    const k = clamp((y - l.winY) / (l.basketY - l.winY), 0, 1);
    const r = l.pieR * (0.72 + 0.28 * k);
    if (it.kind === "milk") drawMilk(ctx, x, y, r * 0.8, it.rot);
    else drawPie(ctx, x, y, r, it.rot, it.kind, it.flavour);
  }
}

function drawSplats(ctx: CanvasRenderingContext2D, g: G) {
  for (const s of g.splats) {
    const k = s.t / 1.4;
    const grow = 1 + Math.min(1, s.t * 6) * 0.4;
    ctx.globalAlpha = k < 0.6 ? 0.9 : 0.9 * (1 - (k - 0.6) / 0.4);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r * grow, s.r * 0.32 * grow, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s.x - s.r * 0.7 * grow, s.y + s.r * 0.1, s.r * 0.3, s.r * 0.14, 0, 0, TAU);
    ctx.ellipse(s.x + s.r * 0.8 * grow, s.y - s.r * 0.05, s.r * 0.25, s.r * 0.12, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawParticles(ctx: CanvasRenderingContext2D, g: G) {
  for (const p of g.particles) {
    const a = 1 - p.life / p.max;
    if (p.kind === "smoke") {
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = "#9a9aa4";
      circle(ctx, p.x, p.y, p.size * (1 + p.life * 2.5));
    } else if (p.kind === "spark") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(-s, -s * 0.28, s * 2, s * 0.56);
      ctx.fillRect(-s * 0.28, -s, s * 0.56, s * 2);
      ctx.restore();
    } else if (p.kind === "drop") {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size);
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloats(ctx: CanvasRenderingContext2D, g: G, l: L) {
  for (const f of g.floats) {
    const pop = f.t < 0.12 ? 1 + (1 - f.t / 0.12) * 0.5 : 1;
    const a = f.t > 0.6 ? 1 - (f.t - 0.6) / 0.4 : 1;
    ctx.save();
    ctx.translate(clamp(f.x, 40, g.W - 40), f.y - f.t * l.u * 0.12);
    ctx.scale(pop, pop);
    ctx.globalAlpha = clamp(a, 0, 1);
    label(ctx, f.text, 0, 0, Math.round(f.px * l.u), f.color, "center");
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, g: G) {
  const W = g.W;
  // time bar across the top
  const frac = clamp(g.timeLeft / RUN_SECONDS, 0, 1);
  const low = g.timeLeft < 10;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, 12, 8, W - 24, 8, 4);
  ctx.fill();
  ctx.fillStyle = low ? (Math.sin(g.t * 10) > 0 ? "#ff6b5e" : "#ff9a8e") : "#ffd54a";
  if (frac > 0) {
    roundRect(ctx, 12, 8, (W - 24) * frac, 8, 4);
    ctx.fill();
  }
  // score
  label(ctx, "SCORE", 14, 32, 13, "#e6d8f0");
  label(ctx, String(Math.round(g.shown)), 14, 56, 30, "#ffffff");
  // time
  label(ctx, "TIME", W - 14, 32, 13, "#e6d8f0", "right");
  label(ctx, String(Math.max(0, Math.ceil(g.timeLeft))), W - 14, 56, 28, low ? "#ff6b5e" : "#ffffff", "right");
  // combo pill
  if (g.combo >= 2) {
    const text = `COMBO x${g.combo}`;
    ctx.font = FONT(13);
    const tw = ctx.measureText(text).width;
    const pw = tw + 26;
    const pulse = 1 + 0.05 * Math.sin(g.t * 9);
    ctx.save();
    ctx.translate(W / 2, 36);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#8a4f9e";
    roundRect(ctx, -pw / 2, -13, pw, 26, 13);
    ctx.fill();
    ctx.strokeStyle = g.combo >= 10 ? "#ffd54a" : "#d9b7e6";
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, text, 0, 0, 13, "#fff3ff", "center", false);
    ctx.restore();
  }
  // slow badge
  if (g.slow > 0) {
    const text = "SLOW!";
    ctx.font = FONT(13);
    const pw = ctx.measureText(text).width + 26;
    const pulse = 1 + 0.08 * Math.sin(g.t * 14);
    ctx.save();
    ctx.translate(W / 2, g.combo >= 2 ? 68 : 36);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#3b7fc4";
    roundRect(ctx, -pw / 2, -13, pw, 26, 13);
    ctx.fill();
    ctx.strokeStyle = "#cfe9ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, text, 0, 0, 13, "#ffffff", "center", false);
    ctx.restore();
  }
}

function drawCountdown(ctx: CanvasRenderingContext2D, g: G) {
  const c = g.countdown;
  const go = c <= 0.6;
  const text = go ? "GO!" : String(Math.ceil(c - 0.6));
  const frac = go ? (0.6 - c) / 0.6 : 1 - ((c - 0.6) % 1);
  const scale = 1 + 0.35 * (1 - Math.min(1, frac * 4));
  ctx.save();
  ctx.translate(g.W / 2, g.H * 0.45);
  ctx.scale(scale, scale);
  ctx.globalAlpha = go ? 1 - frac * 0.6 : 1;
  label(ctx, text, 0, 0, go ? 64 : 72, go ? "#ffd54a" : "#ffffff", "center");
  ctx.restore();
  ctx.globalAlpha = 1;
  if (!go) label(ctx, "DRAG THE BASKET", g.W / 2, g.H * 0.45 + 56, 16, "#e6d8f0", "center");
}

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H } = g;
  const l = layout(W, H);
  const shakeX = g.shake > 0 ? Math.sin(g.t * 60) * g.shake * 6 : 0;

  ctx.save();
  ctx.translate(shakeX, 0);
  drawSky(ctx, g, l);
  drawOak(ctx, g, l);
  drawHouse(ctx, g, l);
  drawLawn(ctx, g, l);
  drawFireflies(ctx, g, l);
  drawSplats(ctx, g);
  drawItems(ctx, g, l);
  drawBasket(ctx, g, l);
  drawFence(ctx, g, l);
  drawParticles(ctx, g);
  ctx.restore();

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,240,190,${g.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawFloats(ctx, g, l);

  if (g.phase !== "idle") drawHud(ctx, g);
  if (g.phase === "countdown") drawCountdown(ctx, g);
}

/* ───────────── attract mode ───────────── */

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const horizon = h * 0.62;
  const sk = ctx.createLinearGradient(0, 0, 0, horizon);
  sk.addColorStop(0, "#150f33");
  sk.addColorStop(0.6, "#4a2458");
  sk.addColorStop(1, "#e2864a");
  ctx.fillStyle = sk;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = "#fff4dc";
  for (let i = 0; i < 12; i++) ctx.fillRect(hash(i * 1.3) * w, hash(i * 2.7) * horizon * 0.5, 1.5, 1.5);
  // hills + lawn
  ctx.fillStyle = "#2a1a3c";
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.quadraticCurveTo(w * 0.3, horizon - h * 0.1, w * 0.6, horizon - h * 0.03);
  ctx.quadraticCurveTo(w * 0.85, horizon - h * 0.1, w, horizon - h * 0.04);
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();
  const lg = ctx.createLinearGradient(0, horizon, 0, h);
  lg.addColorStop(0, "#3c6b35");
  lg.addColorStop(1, "#1c3a22");
  ctx.fillStyle = lg;
  ctx.fillRect(0, horizon, w, h - horizon);
  // oak at the left
  const ox = w * 0.1;
  const or = h * 0.16;
  ctx.fillStyle = "#2e1e1a";
  ctx.fillRect(ox - or * 0.12, horizon - or * 1.1, or * 0.24, or * 1.15);
  ctx.fillStyle = "#1b3a24";
  circle(ctx, ox, horizon - or * 1.5, or * 0.7);
  circle(ctx, ox - or * 0.55, horizon - or * 1.25, or * 0.5);
  circle(ctx, ox + or * 0.55, horizon - or * 1.3, or * 0.5);
  // house
  const hw = w * 0.42;
  const hx = w * 0.42;
  const top = h * 0.3;
  const peak = h * 0.1;
  const x0 = hx - hw / 2;
  ctx.fillStyle = "#d3ccc3";
  ctx.beginPath();
  ctx.moveTo(x0, horizon + 2);
  ctx.lineTo(x0, top);
  ctx.lineTo(hx, peak);
  ctx.lineTo(x0 + hw, top);
  ctx.lineTo(x0 + hw, horizon + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3f2f3f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0 - 4, top + 2);
  ctx.lineTo(hx, peak - 1);
  ctx.lineTo(x0 + hw + 4, top + 2);
  ctx.stroke();
  // porch roof + door
  ctx.fillStyle = "#3f2f3f";
  ctx.fillRect(x0 - 3, top + (horizon - top) * 0.55, hw + 6, 3);
  ctx.fillStyle = "#5a3a2a";
  ctx.fillRect(hx - hw * 0.06, top + (horizon - top) * 0.65, hw * 0.12, (horizon - top) * 0.35 + 2);
  ctx.fillStyle = "#fff1b8";
  circle(ctx, hx + hw * 0.1, top + (horizon - top) * 0.68, 1.5);
  // window with grandma
  const ww = hw * 0.18;
  const wh = ww * 1.3;
  const wx = hx;
  const wy = top + wh * 0.8;
  const glow = ctx.createRadialGradient(wx, wy, 2, wx, wy, ww * 2);
  glow.addColorStop(0, "rgba(255,200,110,0.4)");
  glow.addColorStop(1, "rgba(255,200,110,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(wx - ww * 2, wy - ww * 2, ww * 4, ww * 4);
  ctx.fillStyle = "#6b4a3e";
  ctx.fillRect(wx - ww / 2 - 2, wy - wh / 2 - 2, ww + 4, wh + 4);
  ctx.fillStyle = "#ffd98a";
  ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
  // one pie in flight at a time; a new one every 1.667 s (3 per 5 s loop)
  const period = 5 / 3;
  const n = Math.floor(t / period);
  const p = (t - n * period) / period;
  const lanes = [0.62, 0.84, 0.72];
  const landX = w * lanes[((n % 3) + 3) % 3];
  const prevX = w * lanes[(((n - 1) % 3) + 3) % 3];
  drawGrandma(ctx, wx, wy, ww, wh, p < 0.3, t);
  ctx.fillStyle = "#6b4a3e";
  ctx.fillRect(wx - ww / 2, wy + wh * 0.08, ww, 1.5);
  // lawn fence + basket
  const by = h * 0.86;
  const bw = w * 0.17;
  const bh = bw * 0.6;
  const bx = lerp(prevX, landX, 1 - Math.pow(1 - clamp(p * 1.3, 0, 1), 3));
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(bx, by + bh * 0.5, bw * 0.55, bh * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7a4f22";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(bx, by, bw * 0.42, bh * 1.1, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.fillStyle = "#b5793a";
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2, by);
  ctx.lineTo(bx + bw / 2, by);
  ctx.lineTo(bx + bw * 0.4, by + bh * 0.42);
  ctx.quadraticCurveTo(bx, by + bh * 0.6, bx - bw * 0.4, by + bh * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4a2a12";
  ctx.beginPath();
  ctx.ellipse(bx, by, bw / 2, bh * 0.22, 0, 0, TAU);
  ctx.fill();
  const pr = bw * 0.16;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = FLAVOURS[i].fill;
    ctx.beginPath();
    ctx.ellipse(bx + (i - 1) * bw * 0.2, by - bh * 0.02, pr, pr * 0.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "#8c5a2a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(bx, by, bw / 2, bh * 0.22, 0, 0, TAU);
  ctx.stroke();
  // the pie: out of the window, a little arc, down into the basket
  const px = lerp(wx + ww * 0.3, landX, 1 - (1 - p) * (1 - p));
  const py = lerp(wy - wh * 0.2, by - bh * 0.1, p * p) - h * 0.1 * Math.sin(p * Math.PI);
  drawPie(ctx, px, py, h * 0.055, t * 2, "pie", ((n % 4) + 4) % 4);
  // fence
  ctx.fillStyle = "#e8e2d6";
  for (let x = 0; x < w; x += 10) ctx.fillRect(x, h - 9, 4, 9);
  ctx.fillStyle = "#cfc7b8";
  ctx.fillRect(0, h - 6, w, 1.5);
};

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
      resetRun(st);
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    engineRef.current = { start, stop };

    const pointerX = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    };
    // The drag follows one pointer only: a second finger (or a stray mouse
    // move while a finger is down) can't yank the basket around.
    let dragId: number | null = null;
    const endDrag = () => {
      dragId = null;
      st.dragging = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragId = e.pointerId;
      st.dragging = true;
      st.target = pointerX(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* older browsers */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!st.dragging || e.pointerId !== dragId) return;
      if (e.pointerType === "mouse" && e.buttons === 0) {
        // The button was released somewhere we never heard about.
        endDrag();
        return;
      }
      st.target = pointerX(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      endDrag();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") st.keyL = true;
      else if (e.code === "ArrowRight" || e.code === "KeyD") st.keyR = true;
      else return;
      if (st.phase === "countdown" || st.phase === "playing") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") st.keyL = false;
      else if (e.code === "ArrowRight" || e.code === "KeyD") st.keyR = false;
    };
    const onBlur = () => {
      st.keyL = false;
      st.keyR = false;
      endDrag();
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
