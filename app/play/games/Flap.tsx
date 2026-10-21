"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Barn Flap — a plump hen flies right through a golden-hour farm.
   Red barn fronts scroll in from the right with an open doorway
   between the upper and lower sections; tap to flap through the
   doors. Corn in some doorways, a golden egg every so often in an
   awkward spot. Touching a barn or the ground ends the run.

   World units: everything vertical (and all physics) is in units of
   the screen HEIGHT, so portrait and landscape feel the same. The
   hen sits at a fixed screen x (CHICK_X × W). Barns live on a world
   x axis (also in H units) that scrolls past the hen: a barn's
   screen x = chickX + barn.wx − dist. Spacing between barns is 55%
   of the width, converted to H units when the barn spawns, and the
   scroll speed is spacing / period so the time between barns (and
   the warning time from the right edge) is the same in either
   orientation.
   ───────────────────────────────────────────────────────────── */

const COUNTDOWN = 3.6; // 3-2-1 then "GO!" for the last 0.6 s
const GROUND = 0.86; // ground line (fraction of H)
const CHICK_X = 0.28; // hen's screen x (fraction of W)
const R = 0.032; // hen body radius (H)
const HIT_R = 0.8; // collision radius as a fraction of R (a little forgiveness)
const GRAVITY = 2.3; // H/s²
const FLAP_V = -0.7; // H/s
const MAX_FALL = 1.15; // H/s
const HOVER_Y = 0.45; // hover height before the first tap (H)

const GAP_START = 0.32; // doorway height at the first barn (H)
const GAP_MID = 0.22; // ... by barn 30
const GAP_END = 0.17; // ... by barn 70
const GAP_LATE = 0.15; // ... by barn 110, then flat (so a run can't go forever)
const PERIOD_START = 1.7; // seconds between barns at the start
const PERIOD_MID = 1.05; // ... by barn 35
const PERIOD_END = 0.8; // ... by barn 80
const PERIOD_LATE = 0.7; // ... by barn 110, then flat
const LATE_BARN = 110;
const SPACING_W = 0.55; // barn spacing as a fraction of width

const EGG_EVERY = 12; // seconds of play between golden eggs
const CORN_CHANCE = 0.45;
const END_DELAY = 1.15; // seconds between the hit and onEnd
const CLEAN_MARGIN = 0.03; // clearance beyond the body radius for a "clean" pass (H)

const PTS_BARN = 150;
const PTS_CORN = 100;
const PTS_EGG = 500;
const PTS_STREAK = 25;
const STREAK_CAP = 10;

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

type Barn = {
  wx: number; // world x of the left edge (H)
  bw: number; // width (H)
  gapTop: number; // doorway top (H)
  gapBot: number; // doorway bottom (H)
  passed: boolean;
  minClear: number; // smallest clearance seen while the hen was inside the barn's x range (H)
  seed: number;
  corn: { y: number; taken: boolean } | null; // corn at the barn's centre x
};

type Egg = { wx: number; y: number; taken: boolean };

type Particle = {
  x: number; // screen x (H units)
  y: number; // screen y (H units)
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vrot: number;
  kind: 0 | 1 | 2; // feather / dust / sparkle
};

type Pop = { x: number; y: number; t: number; text: string; color: string; big: boolean };

type Phase = "idle" | "countdown" | "playing" | "ending" | "over";

type G = {
  W: number;
  H: number;
  phase: Phase;
  ended: boolean;
  t: number;
  playT: number;
  countdown: number;
  waiting: boolean; // after GO, before the first tap
  score: number;
  shown: number;
  barns: number; // barns passed
  streak: number;
  bestStreak: number;
  y: number; // hen centre (H)
  vy: number;
  angle: number;
  flapT: number;
  dist: number; // world scroll (H)
  speed: number; // H/s
  spawnWx: number; // world x of the next barn
  nBarn: number; // barns spawned
  lastGapC: number;
  barnList: Barn[];
  eggs: Egg[];
  particles: Particle[];
  pops: Pop[];
  eggTimer: number;
  flash: number;
  shake: number;
  endTimer: number;
  landed: boolean;
  lastHud: number;
  seed: number;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function makeState(): G {
  return {
    W: 390,
    H: 700,
    phase: "idle",
    ended: false,
    t: 0,
    playT: 0,
    countdown: COUNTDOWN,
    waiting: false,
    score: 0,
    shown: 0,
    barns: 0,
    streak: 0,
    bestStreak: 0,
    y: HOVER_Y,
    vy: 0,
    angle: 0,
    flapT: 0,
    dist: 0,
    speed: 0.18,
    spawnWx: 0,
    nBarn: 0,
    lastGapC: 0.45,
    barnList: [],
    eggs: [],
    particles: [],
    pops: [],
    eggTimer: 0,
    flash: 0,
    shake: 0,
    endTimer: 0,
    landed: false,
    lastHud: 0,
    seed: 1,
  };
}

/* ───────────── geometry / difficulty ───────────── */

/** Hen's screen x in H units. */
const chickX = (g: G) => (CHICK_X * g.W) / g.H;
/** Screen width in H units. */
const widthU = (g: G) => g.W / g.H;
const spacingU = (g: G) => (SPACING_W * g.W) / g.H;

function gapFor(n: number) {
  if (n <= 30) return lerp(GAP_START, GAP_MID, n / 30);
  if (n <= 70) return lerp(GAP_MID, GAP_END, (n - 30) / 40);
  return lerp(GAP_END, GAP_LATE, clamp((n - 70) / (LATE_BARN - 70), 0, 1));
}

function periodFor(n: number) {
  if (n <= 35) return lerp(PERIOD_START, PERIOD_MID, n / 35);
  if (n <= 80) return lerp(PERIOD_MID, PERIOD_END, (n - 35) / 45);
  return lerp(PERIOD_END, PERIOD_LATE, clamp((n - 80) / (LATE_BARN - 80), 0, 1));
}

function spawnBarn(g: G) {
  const n = g.nBarn;
  const spacing = spacingU(g);
  const gap = gapFor(n);
  const bw = clamp(spacing * 0.32, 0.1, 0.3);
  const lo = gap / 2 + 0.07;
  const hi = GROUND - gap / 2 - 0.04;
  const jump = lerp(0.2, 0.45, clamp(n / 40, 0, 1));
  const c = n === 0 ? clamp(HOVER_Y, lo, hi) : clamp(g.lastGapC + (Math.random() * 2 - 1) * jump, lo, hi);
  g.lastGapC = c;
  const barn: Barn = {
    wx: g.spawnWx,
    bw,
    gapTop: c - gap / 2,
    gapBot: c + gap / 2,
    passed: false,
    minClear: 1,
    seed: g.seed++,
    corn: null,
  };
  let egg = false;
  if (g.eggTimer >= EGG_EVERY && n >= 3) {
    egg = true;
    g.eggTimer = 0;
    const high = Math.random() < 0.5;
    const ey = clamp(high ? barn.gapTop + 0.045 : barn.gapBot - 0.045, 0.08, GROUND - 0.07);
    g.eggs.push({ wx: g.spawnWx - spacing / 2 + bw / 2, y: ey, taken: false });
  }
  if (!egg && n >= 1 && Math.random() < CORN_CHANCE) barn.corn = { y: c, taken: false };
  g.barnList.push(barn);
  g.spawnWx += spacing;
  g.nBarn++;
}

function resetRun(g: G) {
  g.seed = 1 + Math.floor(Math.random() * 1000);
  g.phase = "countdown";
  g.ended = false;
  g.t = 0;
  g.playT = 0;
  g.countdown = COUNTDOWN;
  g.waiting = false;
  g.score = 0;
  g.shown = 0;
  g.barns = 0;
  g.streak = 0;
  g.bestStreak = 0;
  g.y = HOVER_Y;
  g.vy = 0;
  g.angle = 0;
  g.flapT = 0;
  g.dist = 0;
  g.speed = spacingU(g) / PERIOD_START;
  g.spawnWx = 0;
  g.nBarn = 0;
  g.lastGapC = HOVER_Y;
  g.barnList = [];
  g.eggs = [];
  g.particles = [];
  g.pops = [];
  g.eggTimer = 0;
  g.flash = 0;
  g.shake = 0;
  g.endTimer = 0;
  g.landed = false;
  g.lastHud = 0;
}

/** The still shown before START: the hen hovering in front of a couple of barns. */
function demoState(g: G) {
  g.phase = "idle";
  g.seed = 7;
  g.dist = 0;
  g.y = HOVER_Y;
  g.angle = 0;
  g.barnList = [];
  g.eggs = [];
  g.particles = [];
  g.pops = [];
  g.nBarn = 0;
  g.spawnWx = widthU(g) - chickX(g) * 0.5;
  g.lastGapC = 0.5;
  spawnBarn(g);
  spawnBarn(g);
  g.barnList[0].corn = { y: (g.barnList[0].gapTop + g.barnList[0].gapBot) / 2, taken: false };
}

/* ───────────── effects ───────────── */

function addFeathers(g: G, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 0.25 + Math.random() * 0.6;
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.25,
      life: 0,
      max: 0.8 + Math.random() * 0.6,
      size: 0.012 + Math.random() * 0.012,
      rot: Math.random() * TAU,
      vrot: (Math.random() - 0.5) * 12,
      kind: 0,
    });
  }
}

function addDust(g: G, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    g.particles.push({
      x: x + (Math.random() - 0.5) * 0.04,
      y: y - Math.random() * 0.01,
      vx: (Math.random() - 0.5) * 0.3 - 0.05,
      vy: -(0.04 + Math.random() * 0.1),
      life: 0,
      max: 0.4 + Math.random() * 0.3,
      size: 0.01 + Math.random() * 0.012,
      rot: 0,
      vrot: 0,
      kind: 1,
    });
  }
}

function addSparkles(g: G, x: number, y: number, n: number, gold: boolean) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 0.15 + Math.random() * 0.35;
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: 0.35 + Math.random() * 0.3,
      size: gold ? 0.008 + Math.random() * 0.008 : 0.005 + Math.random() * 0.006,
      rot: gold ? 1 : 0,
      vrot: 0,
      kind: 2,
    });
  }
}

function addPop(g: G, x: number, y: number, text: string, color: string, big = false) {
  g.pops.push({ x, y, t: 0, text, color, big });
}

function addScore(g: G, pts: number) {
  g.score = Math.min(MAX_SCORE, g.score + pts);
}

/* ───────────── simulation ───────────── */

function flap(g: G, env: Env) {
  if (g.phase !== "playing") return;
  if (g.waiting) {
    g.waiting = false;
    g.spawnWx = g.dist + widthU(g) - chickX(g) + 0.25;
  }
  g.vy = FLAP_V;
  g.flapT = 0.26;
  env.sfx.thud();
  if (g.y > GROUND - 0.13) addDust(g, chickX(g), GROUND, 6);
}

function hit(g: G, env: Env) {
  if (g.phase !== "playing") return;
  g.phase = "ending";
  g.endTimer = 0;
  g.flash = 1;
  g.shake = 1;
  g.landed = false;
  g.vy = -0.35;
  env.sfx.buzz();
  addFeathers(g, chickX(g), g.y, 18);
}

function update(g: G, dt: number, env: Env, now: number) {
  g.t += dt;
  if (g.phase === "idle" || g.phase === "over") return;

  const cx = chickX(g);
  const wu = widthU(g);

  // ----- decaying effects -----
  g.flash = Math.max(0, g.flash - dt * 3.2);
  g.shake = Math.max(0, g.shake - dt * 3);
  g.flapT = Math.max(0, g.flapT - dt);

  if (g.phase === "countdown") {
    g.countdown -= dt;
    g.y = HOVER_Y + Math.sin(g.t * 3.2) * 0.012;
    g.angle = Math.sin(g.t * 3.2 + 0.6) * 0.08;
    g.dist += g.speed * dt;
    if (g.countdown <= 0) {
      g.phase = "playing";
      g.waiting = true;
    }
  } else if (g.phase === "playing") {
    if (g.waiting) {
      g.y = HOVER_Y + Math.sin(g.t * 3.2) * 0.012;
      g.angle = Math.sin(g.t * 3.2 + 0.6) * 0.08;
      g.dist += g.speed * dt;
    } else {
      g.playT += dt;
      g.eggTimer += dt;
      // hen physics
      g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt);
      g.y += g.vy * dt;
      if (g.y < R) {
        g.y = R;
        g.vy = Math.max(0, g.vy);
      }
      const target = g.vy < 0 ? lerp(0, -0.55, clamp(-g.vy / -FLAP_V, 0, 1)) : lerp(0, 1.15, clamp(g.vy / MAX_FALL, 0, 1));
      g.angle = lerp(g.angle, target, 1 - Math.exp(-dt * (g.vy < 0 ? 18 : 6)));

      // scroll + difficulty
      g.speed = spacingU(g) / periodFor(g.nBarn);
      g.dist += g.speed * dt;
      while (g.spawnWx - g.dist < wu - cx + 0.35) spawnBarn(g);

      const hr = R * HIT_R;
      // ground
      if (g.y + hr > GROUND) {
        g.y = GROUND - hr;
        hit(g, env);
        addDust(g, cx, GROUND, 10);
      }

      // barns
      if (g.phase === "playing") {
        for (let i = g.barnList.length - 1; i >= 0; i--) {
          const b = g.barnList[i];
          const sx = cx + b.wx - g.dist;
          if (sx + b.bw < -0.3) {
            g.barnList.splice(i, 1);
            continue;
          }
          if (sx > cx + 0.2) continue;
          // clearance tracking while inside the barn's x range
          if (cx + R > sx && cx - R < sx + b.bw) {
            const clear = Math.min(g.y - b.gapTop, b.gapBot - g.y) - R;
            if (clear < b.minClear) b.minClear = clear;
          }
          // collision: circle vs the two rects
          const qx = clamp(cx, sx, sx + b.bw);
          const dTop = Math.hypot(cx - qx, g.y - Math.min(g.y, b.gapTop));
          const dBot = Math.hypot(cx - qx, Math.max(g.y, b.gapBot) - g.y);
          if (dTop < hr || dBot < hr) {
            hit(g, env);
            break;
          }
          // pass
          if (!b.passed && sx + b.bw < cx) {
            b.passed = true;
            g.barns++;
            const clean = b.minClear >= CLEAN_MARGIN;
            if (clean) g.streak++;
            else g.streak = 0;
            if (g.streak > g.bestStreak) g.bestStreak = g.streak;
            const bonus = clean ? PTS_STREAK * Math.min(g.streak, STREAK_CAP) : 0;
            addScore(g, PTS_BARN + bonus);
            env.sfx.ding(g.streak);
            addPop(g, cx + 0.08, g.y - 0.07, `+${PTS_BARN + bonus}`, "#fff6d8");
            if (clean && g.streak >= 2) addPop(g, cx + 0.08, g.y - 0.11, `CLEAN x${Math.min(g.streak, STREAK_CAP)}`, "#ffd45c");
          }
          // corn
          if (b.corn && !b.corn.taken) {
            const bob = Math.sin(g.t * 4 + b.seed) * 0.008;
            const kx = sx + b.bw / 2;
            if (Math.hypot(kx - cx, b.corn.y + bob - g.y) < R + 0.035) {
              b.corn.taken = true;
              addScore(g, PTS_CORN);
              env.sfx.ding(3);
              addSparkles(g, kx, b.corn.y, 8, false);
              addPop(g, kx, b.corn.y - 0.05, `+${PTS_CORN}`, "#ffe27a");
            }
          }
        }
      }

      // eggs
      for (let i = g.eggs.length - 1; i >= 0; i--) {
        const e = g.eggs[i];
        const ex = cx + e.wx - g.dist;
        if (ex < -0.2) {
          g.eggs.splice(i, 1);
          continue;
        }
        if (e.taken) continue;
        const bob = Math.sin(g.t * 3 + e.wx) * 0.008;
        if (Math.hypot(ex - cx, e.y + bob - g.y) < R + 0.04) {
          e.taken = true;
          addScore(g, PTS_EGG);
          env.sfx.bullseye(6);
          addSparkles(g, ex, e.y, 16, true);
          addPop(g, ex, e.y - 0.06, `GOLDEN EGG +${PTS_EGG}`, "#ffd34a", true);
          g.flash = Math.max(g.flash, 0.35);
        }
      }
    }
  } else if (g.phase === "ending") {
    g.endTimer += dt;
    if (!g.landed) {
      g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt);
      g.y += g.vy * dt;
      g.angle += dt * 9;
      if (g.y > GROUND - R * 0.7) {
        g.y = GROUND - R * 0.7;
        g.landed = true;
        g.angle = 1.4;
        addDust(g, cx, GROUND, 8);
      }
    }
    if (g.endTimer >= END_DELAY) {
      g.phase = "over";
      env.sfx.gameOver();
      if (!g.ended) {
        g.ended = true;
        env.onEnd(Math.round(Math.min(MAX_SCORE, g.score)));
      }
    }
  }

  // particles
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      g.particles.splice(i, 1);
      continue;
    }
    if (p.kind === 0) {
      p.vy += 0.5 * dt;
      p.vx *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 1.5;
      p.vx += Math.sin(p.life * 9 + p.rot) * 0.1 * dt;
      p.rot += p.vrot * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > GROUND - 0.005) {
        p.y = GROUND - 0.005;
        p.vy = 0;
      }
    } else if (p.kind === 1) {
      p.vx *= 1 - dt * 2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += dt * 0.03;
    } else {
      p.vx *= 1 - dt * 3;
      p.vy *= 1 - dt * 3;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // score pops
  for (let i = g.pops.length - 1; i >= 0; i--) {
    const p = g.pops[i];
    p.t += dt;
    p.y -= dt * 0.06;
    if (p.t > 0.95) g.pops.splice(i, 1);
  }

  // counting-up score
  const diff = g.score - g.shown;
  if (Math.abs(diff) < 1) g.shown = g.score;
  else g.shown += diff * Math.min(1, dt * 9);

  if (env.onHud && now - g.lastHud > 100) {
    g.lastHud = now;
    env.onHud({ score: Math.round(g.score) });
  }
}

/* ───────────── scenery ───────────── */

/** The static full-screen gradients, built once per canvas size (a resize
 *  makes a new entry; the map is kept tiny). */
type SceneGradients = { sky: CanvasGradient; ground: CanvasGradient };
const gradCache = new Map<string, SceneGradients>();
function sceneGradients(ctx: CanvasRenderingContext2D, W: number, H: number): SceneGradients {
  const key = `${W}x${H}`;
  let sg = gradCache.get(key);
  if (sg) return sg;
  if (gradCache.size >= 8) gradCache.clear();
  const sky = ctx.createLinearGradient(0, 0, 0, H * GROUND);
  sky.addColorStop(0, "#2b2760");
  sky.addColorStop(0.32, "#8c4668");
  sky.addColorStop(0.62, "#df7448");
  sky.addColorStop(1, "#f7d089");
  const ground = ctx.createLinearGradient(0, H * GROUND, 0, H);
  ground.addColorStop(0, "#7d5c38");
  ground.addColorStop(1, "#46311e");
  sg = { sky, ground };
  gradCache.set(key, sg);
  return sg;
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = sceneGradients(ctx, W, H).sky;
  ctx.fillRect(0, 0, W, H);
}

function drawSun(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const sx = W * 0.74;
  const sy = H * 0.2;
  const r = H * 0.065;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(t * 0.08);
  ctx.fillStyle = "rgba(255,225,150,0.09)";
  for (let i = 0; i < 10; i++) {
    ctx.rotate(TAU / 10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(H * 0.6, -H * 0.04);
    ctx.lineTo(H * 0.6, H * 0.04);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 3.2);
  g.addColorStop(0, "rgba(255,235,170,0.55)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 3.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff1bb";
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
}

function drawClouds(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, t: number) {
  const span = W + H * 0.5;
  ctx.fillStyle = "rgba(255,238,222,0.72)";
  for (let i = 0; i < 6; i++) {
    const sc = H * (0.022 + hash(i + 21) * 0.025);
    const x = span - ((hash(i) * span + off * 0.35 + t * H * 0.012 * (0.6 + hash(i + 3))) % span) - H * 0.25;
    const y = H * (0.05 + hash(i + 9) * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, sc, 0, TAU);
    ctx.arc(x + sc * 1.1, y - sc * 0.35, sc * 1.25, 0, TAU);
    ctx.arc(x + sc * 2.4, y, sc * 0.95, 0, TAU);
    ctx.fill();
  }
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  off: number,
  color: string,
  amp: number,
  lam: number,
  base: number,
  ph: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const x = (W * i) / n;
    const xw = (x + off) / H;
    const y = base - amp * (0.55 + 0.45 * Math.sin(xw * lam + ph)) - amp * 0.35 * Math.sin(xw * lam * 2.7 + ph * 1.7);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawSilo(ctx: CanvasRenderingContext2D, x: number, base: number, H: number) {
  const w = H * 0.045;
  const h = H * 0.16;
  ctx.fillStyle = "#9fa3ab";
  ctx.fillRect(x - w / 2, base - h, w, h);
  ctx.fillStyle = "#7c8089";
  ctx.fillRect(x + w * 0.15, base - h, w * 0.35, h);
  ctx.fillStyle = "#b9bcc3";
  ctx.beginPath();
  ctx.arc(x, base - h, w / 2, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,60,70,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = base - (h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.stroke();
  }
}

function drawWindmill(ctx: CanvasRenderingContext2D, x: number, base: number, H: number, t: number) {
  const h = H * 0.17;
  const top = base - h;
  ctx.fillStyle = "#6b5a4a";
  ctx.beginPath();
  ctx.moveTo(x - H * 0.022, base);
  ctx.lineTo(x + H * 0.022, base);
  ctx.lineTo(x + H * 0.006, top);
  ctx.lineTo(x - H * 0.006, top);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,240,220,0.25)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = base - (h * i) / 4;
    const hw = lerp(H * 0.022, H * 0.006, i / 4);
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x + hw, y);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(x, top);
  ctx.rotate(t * 1.3);
  ctx.strokeStyle = "#e9dcc4";
  ctx.lineWidth = Math.max(1, H * 0.004);
  ctx.fillStyle = "rgba(233,220,196,0.55)";
  const bl = H * 0.065;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bl, 0);
    ctx.stroke();
    ctx.fillRect(bl * 0.3, -bl * 0.12, bl * 0.65, bl * 0.12);
  }
  ctx.restore();
  ctx.fillStyle = "#3a2d22";
  ctx.beginPath();
  ctx.arc(x, top, H * 0.006, 0, TAU);
  ctx.fill();
}

function drawFarStructures(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, t: number) {
  const T = H * 1.3;
  const i0 = Math.floor(off / T) - 1;
  const i1 = Math.floor((off + W) / T) + 1;
  const base = H * (GROUND - 0.03);
  for (let i = i0; i <= i1; i++) {
    const k = Math.floor(hash(i * 5 + 2) * 3);
    if (k === 0) continue;
    const x = i * T + hash(i * 5 + 3) * T * 0.6 - off;
    if (x < -H * 0.2 || x > W + H * 0.2) continue;
    if (k === 1) drawSilo(ctx, x, base, H);
    else drawWindmill(ctx, x, base, H, t + i);
  }
}

function drawPines(ctx: CanvasRenderingContext2D, W: number, H: number, off: number) {
  const T = H * 0.07;
  const i0 = Math.floor(off / T) - 1;
  const i1 = Math.floor((off + W) / T) + 2;
  const base = H * GROUND + 2;
  for (let i = i0; i <= i1; i++) {
    const x = i * T + hash(i * 7 + 1) * T * 0.7 - off;
    const hgt = H * (0.06 + hash(i * 7 + 2) * 0.11);
    const wd = hgt * 0.42;
    const shade = hash(i * 7 + 3);
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(x - wd * 0.08, base - hgt * 0.2, wd * 0.16, hgt * 0.2);
    ctx.fillStyle = shade < 0.5 ? "#2f5c3c" : "#254a30";
    ctx.beginPath();
    ctx.moveTo(x, base - hgt);
    ctx.lineTo(x + wd * 0.55, base - hgt * 0.55);
    ctx.lineTo(x + wd * 0.3, base - hgt * 0.55);
    ctx.lineTo(x + wd, base - hgt * 0.15);
    ctx.lineTo(x - wd, base - hgt * 0.15);
    ctx.lineTo(x - wd * 0.3, base - hgt * 0.55);
    ctx.lineTo(x - wd * 0.55, base - hgt * 0.55);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, off: number) {
  const gy = H * GROUND;
  ctx.fillStyle = sceneGradients(ctx, W, H).ground;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = "#5f9c3a";
  ctx.fillRect(0, gy, W, H * 0.03);
  ctx.fillStyle = "#3f7a2a";
  ctx.fillRect(0, gy + H * 0.03, W, H * 0.008);
  // pebbles
  const T = H * 0.09;
  const i0 = Math.floor(off / T) - 1;
  const i1 = Math.floor((off + W) / T) + 1;
  ctx.fillStyle = "rgba(255,230,190,0.18)";
  for (let i = i0; i <= i1; i++) {
    const x = i * T + hash(i * 11 + 5) * T - off;
    const y = gy + H * 0.05 + hash(i * 11 + 6) * (H - gy - H * 0.06);
    ctx.beginPath();
    ctx.ellipse(x, y, H * 0.006, H * 0.003, 0, 0, TAU);
    ctx.fill();
  }
}

function drawFence(ctx: CanvasRenderingContext2D, W: number, H: number, off: number) {
  const gy = H * GROUND;
  const T = H * 0.11;
  const i0 = Math.floor(off / T) - 1;
  const i1 = Math.floor((off + W) / T) + 1;
  const top = gy + H * 0.035;
  const ph = H * 0.07;
  ctx.fillStyle = "#8a6a44";
  ctx.fillRect(0, top + ph * 0.3, W, Math.max(2, H * 0.008));
  ctx.fillRect(0, top + ph * 0.68, W, Math.max(2, H * 0.008));
  ctx.fillStyle = "#6e5233";
  for (let i = i0; i <= i1; i++) {
    const x = i * T - off;
    ctx.fillRect(x, top, Math.max(2, H * 0.012), ph);
  }
}

function drawTufts(ctx: CanvasRenderingContext2D, W: number, H: number, off: number) {
  const gy = H * GROUND;
  const T = H * 0.045;
  const i0 = Math.floor(off / T) - 1;
  const i1 = Math.floor((off + W) / T) + 1;
  ctx.strokeStyle = "#7cc24a";
  ctx.lineWidth = Math.max(1, H * 0.004);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    const x = i * T + hash(i * 3 + 1) * T - off;
    const hgt = H * (0.012 + hash(i * 3 + 2) * 0.014);
    ctx.moveTo(x, gy + 2);
    ctx.lineTo(x - hgt * 0.4, gy - hgt);
    ctx.moveTo(x, gy + 2);
    ctx.lineTo(x + hgt * 0.1, gy - hgt * 1.2);
    ctx.moveTo(x, gy + 2);
    ctx.lineTo(x + hgt * 0.5, gy - hgt * 0.8);
  }
  ctx.stroke();
}

/* ───────────── barns & pickups ───────────── */

function barnBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, trim: number, H: number) {
  if (h <= 0) return;
  ctx.fillStyle = "#b5321f";
  ctx.fillRect(x, y, w, h);
  // planks
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  const n = 6;
  for (let i = 1; i < n; i++) ctx.fillRect(x + (w * i) / n - 0.5, y, Math.max(1, w * 0.012), h);
  // board rows
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  const row = H * 0.055;
  for (let yy = y + row; yy < y + h; yy += row) ctx.fillRect(x, yy, w, 1);
  // light / shade
  ctx.fillStyle = "rgba(255,220,180,0.12)";
  ctx.fillRect(x + trim, y, w * 0.12, h);
  ctx.fillStyle = "rgba(60,0,0,0.18)";
  ctx.fillRect(x + w - trim - w * 0.14, y, w * 0.14, h);
  // corner trim
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(x, y, trim, h);
  ctx.fillRect(x + w - trim, y, trim, h);
}

function drawBarn(ctx: CanvasRenderingContext2D, x: number, bw: number, gapTop: number, gapBot: number, H: number) {
  const gy = H * GROUND;
  const trim = Math.max(2, bw * 0.07);
  const capH = H * 0.026;
  const capO = bw * 0.1;

  // ----- upper section -----
  const topBot = gapTop - capH;
  barnBody(ctx, x, -H * 0.05, bw, topBot + H * 0.05, trim, H);
  // hay-loft window
  const wx = x + bw / 2;
  const ws = Math.min(bw * 0.4, H * 0.06);
  const wy = topBot - H * 0.05 - ws / 2;
  if (wy - ws / 2 > -H * 0.02) {
    ctx.fillStyle = "#f5f1e8";
    ctx.fillRect(wx - ws / 2 - trim * 0.6, wy - ws / 2 - trim * 0.6, ws + trim * 1.2, ws + trim * 1.2);
    ctx.fillStyle = "#3a2412";
    ctx.fillRect(wx - ws / 2, wy - ws / 2, ws, ws);
    ctx.fillStyle = "#e3b94c";
    ctx.fillRect(wx - ws / 2, wy + ws * 0.12, ws, ws * 0.38);
    ctx.fillStyle = "rgba(120,80,20,0.5)";
    ctx.fillRect(wx - ws / 2, wy + ws * 0.3, ws, 1.5);
    ctx.strokeStyle = "#f5f1e8";
    ctx.lineWidth = Math.max(1.5, trim * 0.45);
    ctx.beginPath();
    ctx.moveTo(wx - ws / 2, wy - ws / 2);
    ctx.lineTo(wx + ws / 2, wy + ws / 2);
    ctx.moveTo(wx + ws / 2, wy - ws / 2);
    ctx.lineTo(wx - ws / 2, wy + ws / 2);
    ctx.stroke();
  }
  // lintel cap at the bottom of the upper section
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(x - capO, topBot, bw + capO * 2, capH);
  ctx.fillStyle = "rgba(80,20,10,0.35)";
  ctx.fillRect(x - capO, topBot + capH - Math.max(2, capH * 0.25), bw + capO * 2, Math.max(2, capH * 0.25));
  ctx.fillStyle = "#b5321f";
  ctx.fillRect(x - capO + trim, topBot + capH * 0.3, bw + capO * 2 - trim * 2, capH * 0.3);

  // ----- lower section -----
  // roof cap (gambrel-ish)
  ctx.fillStyle = "#4a3a34";
  ctx.beginPath();
  ctx.moveTo(x - capO, gapBot + capH);
  ctx.lineTo(x - capO * 0.3, gapBot);
  ctx.lineTo(x + bw + capO * 0.3, gapBot);
  ctx.lineTo(x + bw + capO, gapBot + capH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f5f1e8";
  ctx.fillRect(x - capO, gapBot + capH - Math.max(2, capH * 0.3), bw + capO * 2, Math.max(2, capH * 0.3));
  barnBody(ctx, x, gapBot + capH, bw, gy - gapBot - capH, trim, H);
  // X-brace door on the lower section
  const dh = Math.min(H * 0.12, gy - gapBot - capH - H * 0.02);
  if (dh > H * 0.04) {
    const dw = bw - trim * 2 - bw * 0.16;
    const dx = x + trim + bw * 0.08;
    const dy = gy - dh;
    ctx.strokeStyle = "#f5f1e8";
    ctx.lineWidth = Math.max(1.5, trim * 0.5);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + dw, dy + dh);
    ctx.moveTo(dx + dw, dy);
    ctx.lineTo(dx, dy + dh);
    ctx.stroke();
  }
}

function drawCorn(ctx: CanvasRenderingContext2D, x: number, y: number, H: number) {
  const s = H * 0.02;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.55);
  ctx.fillStyle = "#5aa23a";
  ctx.beginPath();
  ctx.ellipse(-s * 0.35, s * 0.85, s * 0.42, s * 1.05, 0.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.35, s * 0.85, s * 0.42, s * 1.05, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f6c73a";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s * 1.25, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(170,105,10,0.35)";
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath();
      ctx.arc(j * s * 0.3, i * s * 0.42, s * 0.11, 0, TAU);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(90,50,0,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s * 1.25, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawEgg(ctx: CanvasRenderingContext2D, x: number, y: number, H: number, t: number) {
  const s = H * 0.03;
  const glow = ctx.createRadialGradient(x, y, s * 0.4, x, y, s * 2.4);
  glow.addColorStop(0, "rgba(255,215,90,0.45)");
  glow.addColorStop(1, "rgba(255,215,90,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, s * 2.4, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 2.5) * 0.15);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, "#fff0a8");
  g.addColorStop(0.5, "#f2c230");
  g.addColorStop(1, "#b8860b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.72, s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,80,0,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.25, -s * 0.4, s * 0.15, s * 0.28, 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  // sparkle
  const sp = (t * 3) % TAU;
  ctx.save();
  ctx.translate(x + s * 0.9, y - s * 0.9);
  ctx.rotate(sp);
  ctx.strokeStyle = "#fff8d0";
  ctx.lineWidth = Math.max(1, H * 0.003);
  const l = s * (0.35 + 0.15 * Math.sin(t * 7));
  ctx.beginPath();
  ctx.moveTo(-l, 0);
  ctx.lineTo(l, 0);
  ctx.moveTo(0, -l);
  ctx.lineTo(0, l);
  ctx.stroke();
  ctx.restore();
}

/* ───────────── the hen ───────────── */

function drawChicken(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, frame: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const outline = "rgba(90,45,15,0.5)";
  const lw = Math.max(1, s * 0.08);
  // tail feathers
  ctx.fillStyle = "#8a4b2a";
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-0.85 * s, -0.15 * s + i * 0.16 * s);
    ctx.rotate(-0.95 + i * 0.4);
    ctx.beginPath();
    ctx.ellipse(-0.4 * s, 0, 0.5 * s, 0.17 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // feet
  ctx.strokeStyle = "#e8891f";
  ctx.lineWidth = Math.max(1.5, s * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const fx of [-0.2, 0.25]) {
    ctx.beginPath();
    ctx.moveTo(fx * s, 0.6 * s);
    ctx.lineTo(fx * s - 0.05 * s, 1.15 * s);
    ctx.lineTo(fx * s - 0.35 * s, 1.25 * s);
    ctx.moveTo(fx * s - 0.05 * s, 1.15 * s);
    ctx.lineTo(fx * s + 0.25 * s, 1.27 * s);
    ctx.stroke();
  }
  // body
  const g = ctx.createRadialGradient(-0.25 * s, -0.35 * s, 0.1 * s, 0, 0, 1.25 * s);
  g.addColorStop(0, "#fffaf0");
  g.addColorStop(1, "#ead3a2");
  ctx.fillStyle = g;
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(0, 0.05 * s, 1.05 * s, 0.92 * s, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // head
  ctx.fillStyle = "#fff6e3";
  ctx.beginPath();
  ctx.arc(0.6 * s, -0.6 * s, 0.6 * s, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // comb
  ctx.fillStyle = "#d9332b";
  for (let i = 0; i < 3; i++) {
    const cx = 0.6 * s + (-0.18 + i * 0.22) * s;
    const cy = -1.18 * s - (i === 1 ? 0.1 * s : 0);
    ctx.beginPath();
    ctx.arc(cx, cy, 0.17 * s, 0, TAU);
    ctx.fill();
  }
  // wattle
  ctx.beginPath();
  ctx.ellipse(0.92 * s, -0.12 * s, 0.13 * s, 0.22 * s, 0, 0, TAU);
  ctx.fill();
  // beak
  ctx.fillStyle = "#f2a21b";
  ctx.beginPath();
  ctx.moveTo(1.1 * s, -0.7 * s);
  ctx.lineTo(1.65 * s, -0.48 * s);
  ctx.lineTo(1.1 * s, -0.3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,60,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1.12 * s, -0.5 * s);
  ctx.lineTo(1.6 * s, -0.48 * s);
  ctx.stroke();
  // eye
  ctx.fillStyle = "#2a1a10";
  ctx.beginPath();
  ctx.arc(0.8 * s, -0.72 * s, 0.12 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0.845 * s, -0.77 * s, 0.045 * s, 0, TAU);
  ctx.fill();
  // wing (3 frames: up / mid / down)
  const wa = frame === 0 ? -0.9 : frame === 2 ? 0.55 : -0.1;
  ctx.save();
  ctx.translate(-0.1 * s, -0.05 * s);
  ctx.rotate(wa);
  ctx.fillStyle = "#ead09a";
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(-0.3 * s, 0.12 * s, 0.66 * s, 0.32 * s, 0.12, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,80,30,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-0.3 * s, 0.05 * s);
  ctx.lineTo(-0.9 * s, 0.25 * s);
  ctx.moveTo(-0.3 * s, 0.15 * s);
  ctx.lineTo(-0.85 * s, 0.4 * s);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function wingFrame(g: G): number {
  if (g.phase === "ending" || g.phase === "over") return 1;
  if (g.flapT > 0) {
    if (g.flapT > 0.17) return 0;
    if (g.flapT > 0.08) return 2;
    return 1;
  }
  if (g.phase === "idle" || g.phase === "countdown" || g.waiting) return [0, 1, 2, 1][Math.floor(g.t * 9) % 4];
  return 1;
}

/* ───────────── render ───────────── */

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H } = g;
  const cx = chickX(g);
  const offPx = g.dist * H;

  ctx.save();
  if (g.shake > 0) {
    const s = g.shake * g.shake * H * 0.02;
    ctx.translate((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s);
  }

  drawSky(ctx, W, H);
  drawSun(ctx, W, H, g.t);
  drawClouds(ctx, W, H, offPx * 0.08, g.t);
  drawHills(ctx, W, H, offPx * 0.1, "#7b5b7e", H * 0.22, 3.1, H * (GROUND - 0.02), 1.3);
  drawHills(ctx, W, H, offPx * 0.16, "#5a6b58", H * 0.15, 4.3, H * (GROUND - 0.01), 4.1);
  drawFarStructures(ctx, W, H, offPx * 0.16, g.t);
  drawPines(ctx, W, H, offPx * 0.32);
  drawGround(ctx, W, H, offPx);

  // barns, corn, eggs
  for (const b of g.barnList) {
    const sx = (cx + b.wx - g.dist) * H;
    if (sx > W + H * 0.1 || sx + b.bw * H < -H * 0.1) continue;
    drawBarn(ctx, sx, b.bw * H, b.gapTop * H, b.gapBot * H, H);
    if (b.corn && !b.corn.taken) {
      const bob = Math.sin(g.t * 4 + b.seed) * 0.008;
      drawCorn(ctx, sx + (b.bw * H) / 2, (b.corn.y + bob) * H, H);
    }
  }
  for (const e of g.eggs) {
    if (e.taken) continue;
    const ex = (cx + e.wx - g.dist) * H;
    if (ex < -H * 0.1 || ex > W + H * 0.1) continue;
    const bob = Math.sin(g.t * 3 + e.wx) * 0.008;
    drawEgg(ctx, ex, (e.y + bob) * H, H, g.t);
  }

  drawFence(ctx, W, H, offPx * 1.12);

  // hen shadow
  const shAlpha = clamp(1 - (GROUND - g.y) / 0.5, 0.08, 0.35);
  const shW = R * H * lerp(1.6, 0.8, clamp((GROUND - g.y) / 0.5, 0, 1));
  ctx.fillStyle = `rgba(40,20,0,${shAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(cx * H, (GROUND + 0.012) * H, shW, shW * 0.3, 0, 0, TAU);
  ctx.fill();

  // hen
  drawChicken(ctx, cx * H, g.y * H, R * H, g.angle, wingFrame(g));

  // particles
  for (const p of g.particles) {
    const a = 1 - p.life / p.max;
    if (p.kind === 0) {
      ctx.save();
      ctx.translate(p.x * H, p.y * H);
      ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(255,246,225,${(0.95 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * H, p.size * H * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(150,100,60,${(0.4 * a).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-p.size * H, 0);
      ctx.lineTo(p.size * H, 0);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 1) {
      ctx.fillStyle = `rgba(214,184,140,${(0.55 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x * H, p.y * H, p.size * H, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = p.rot ? `rgba(255,220,90,${a.toFixed(3)})` : `rgba(255,245,200,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x * H, p.y * H, p.size * H * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
  }

  drawTufts(ctx, W, H, offPx);

  // score pops
  for (const p of g.pops) {
    const a = p.t < 0.6 ? 1 : 1 - (p.t - 0.6) / 0.35;
    const sc = p.t < 0.12 ? 0.6 + (p.t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (p.t - 0.12) * 0.5);
    const px = clamp(H * (p.big ? 0.032 : 0.026), 13, 26) * sc;
    ctx.globalAlpha = clamp(a, 0, 1);
    label(ctx, p.text, clamp(p.x * H, px * 2, W - px * 2), p.y * H, px, p.color, "center");
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // ----- HUD (not shaken) -----
  if (g.phase !== "idle") drawHud(ctx, g);

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(g.flash * 0.6).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H } = g;
  const base = clamp(H * 0.036, 16, 30);
  const pad = base * 0.6;

  const small = Math.max(13, base * 0.72);
  const tiny = Math.max(13, base * 0.5);

  // score + barns (top-left)
  label(ctx, String(Math.round(g.shown)), pad, pad + base * 0.6, base * 1.5, "#fff6dc");
  label(ctx, `BARNS ${g.barns}`, pad, pad + base * 2.1, small, "#ffd98a");

  // streak pill (top-right): one short line, kept above the lintel of a barn
  // whose doorway sits at the 0.07 H floor (its top door edge is at 0.07 H,
  // the pill's bottom is pad + base * 1.1 = 1.7 base < 0.07 H for every size).
  const streakText = `STREAK ${g.streak}`;
  const bestText = `BEST ${g.bestStreak}`;
  ctx.font = FONT(small);
  const sw = ctx.measureText(streakText).width;
  ctx.font = FONT(tiny);
  const bwid = ctx.measureText(bestText).width;
  const pillH = base * 1.1;
  const inset = base * 0.55;
  const gapW = base * 0.5;
  const pillW = inset * 2 + sw + gapW + bwid;
  const px = W - pad - pillW;
  const py = pad;
  ctx.fillStyle = g.streak >= 2 ? "rgba(120,70,0,0.6)" : "rgba(0,0,0,0.45)";
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = g.streak >= 2 ? "rgba(255,210,90,0.9)" : "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(1.5, base * 0.08);
  ctx.stroke();
  label(ctx, streakText, px + inset, py + pillH / 2, small, g.streak >= 2 ? "#ffd45c" : "#fff", "left", false);
  label(ctx, bestText, px + inset + sw + gapW, py + pillH / 2 + 0.5, tiny, "rgba(255,255,255,0.75)", "left", false);

  // countdown
  if (g.phase === "countdown") {
    const n = Math.ceil(g.countdown - 0.6);
    const go = n <= 0;
    const frac = go ? 1 - g.countdown / 0.6 : n - (g.countdown - 0.6);
    const pop = 1 + 0.25 * Math.max(0, 1 - frac * 4);
    const px2 = clamp(H * 0.12, 48, 110) * pop;
    ctx.globalAlpha = go ? 1 : clamp(1.4 - frac, 0, 1);
    label(ctx, go ? "GO!" : String(n), W / 2, H * 0.4, px2, go ? "#ffd45c" : "#fff6dc", "center");
    ctx.globalAlpha = 1;
    label(ctx, "TAP TO FLAP", W / 2, H * 0.4 + px2 * 0.9, Math.max(13, base * 0.8), "rgba(255,255,255,0.85)", "center");
  } else if (g.phase === "playing" && g.waiting) {
    const a = 0.6 + 0.4 * Math.sin(g.t * 6);
    ctx.globalAlpha = a;
    label(ctx, "TAP TO FLAP", W / 2, H * 0.4, base * 1.1, "#fff6dc", "center");
    ctx.globalAlpha = 1;
  }
}

/* ───────────── attract mode ───────────── */

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const tt = t % 5;
  const gy = h * GROUND;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, "#2b2760");
  sky.addColorStop(0.4, "#9a4a68");
  sky.addColorStop(1, "#f7d089");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // sun
  ctx.fillStyle = "rgba(255,235,170,0.35)";
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.22, h * 0.16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff1bb";
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.22, h * 0.07, 0, TAU);
  ctx.fill();
  // hills: profile is periodic over w/2 and scrolls w/2 per loop, so it is seamless
  const hoff = tt * 0.1 * w;
  ctx.fillStyle = "#7b5b7e";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 16; i++) {
    const x = (w * i) / 16;
    const u = ((x + hoff) / w) * TAU;
    ctx.lineTo(x, gy - h * 0.1 - h * 0.09 * Math.sin(u * 2) - h * 0.05 * Math.sin(u * 6 + 1));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // pines: 8 per screen width, pattern periodic over w, scrolls w per loop
  const poff = (tt * 0.2 * w) % w;
  ctx.fillStyle = "#2f5c3c";
  for (let k = 0; k < 8; k++) {
    const x = ((((k * w) / 8 + hash(k + 1) * (w / 10) - poff) % w) + w) % w;
    const hgt = h * (0.08 + hash(k + 2) * 0.1);
    for (const xx of x > w - hgt ? [x, x - w] : [x]) {
      ctx.beginPath();
      ctx.moveTo(xx, gy - hgt);
      ctx.lineTo(xx + hgt * 0.4, gy);
      ctx.lineTo(xx - hgt * 0.4, gy);
      ctx.closePath();
      ctx.fill();
    }
  }
  // ground
  ctx.fillStyle = "#6b4d2e";
  ctx.fillRect(0, gy, w, h - gy);
  ctx.fillStyle = "#5f9c3a";
  ctx.fillRect(0, gy, w, h * 0.035);
  // barns: two per 5 s loop, spacing w/2, speed w/5 per second
  const bw = w * 0.14;
  const capH = h * 0.03;
  const gaps = [0.336, 0.564];
  for (let k = 0; k < 2; k++) {
    const p = (tt * 0.2 * w + k * 0.5 * w) % w;
    for (const x of [w - p, -p]) {
      if (x + bw < 0 || x > w) continue;
      const c = gaps[k] * h;
      const gap = h * 0.3;
      ctx.fillStyle = "#b5321f";
      ctx.fillRect(x, 0, bw, c - gap / 2 - capH);
      ctx.fillRect(x, c + gap / 2 + capH, bw, gy - c - gap / 2 - capH);
      ctx.fillStyle = "#f5f1e8";
      ctx.fillRect(x, 0, bw * 0.08, c - gap / 2 - capH);
      ctx.fillRect(x + bw * 0.92, 0, bw * 0.08, c - gap / 2 - capH);
      ctx.fillRect(x, c + gap / 2 + capH, bw * 0.08, gy - c - gap / 2);
      ctx.fillRect(x + bw * 0.92, c + gap / 2 + capH, bw * 0.08, gy - c - gap / 2);
      ctx.fillRect(x - bw * 0.1, c - gap / 2 - capH, bw * 1.2, capH);
      ctx.fillStyle = "#4a3a34";
      ctx.fillRect(x - bw * 0.1, c + gap / 2, bw * 1.2, capH);
      ctx.fillStyle = "#3a2412";
      ctx.fillRect(x + bw * 0.3, c - gap / 2 - capH - bw * 0.6, bw * 0.4, bw * 0.4);
    }
  }
  // hen
  const cy = h * 0.45 + h * 0.12 * Math.sin((tt * TAU) / 5);
  const ang = Math.cos((tt * TAU) / 5) * 0.45;
  const frame = [0, 1, 2, 1][Math.floor(t * 10) % 4];
  drawChicken(ctx, w * 0.3, cy, h * 0.05, ang, frame);
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
      if (st.phase === "idle") demoState(st);
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

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      flap(st, envRef.current);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "ArrowUp") return;
      if (st.phase === "idle" || st.phase === "over") return;
      e.preventDefault();
      if (!e.repeat) flap(st, envRef.current);
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
