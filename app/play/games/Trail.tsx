"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AttractFn, GameHandle, GameProps } from "./types";
import { MAX_SCORE } from "./types";

/* ─────────────────────────────────────────────────────────────
   Trail Run — an endless runner. A farm collie tears down a dirt
   trail at golden hour; tap to hop hay bales, logs and puddles,
   hold for a bigger jump, and snag the bones and tennis balls
   floating over the trail. One trip ends the run.

   Units: physics runs in "u" px, where u = min(H, 1.25 W) — the
   screen height on landscape, a touch smaller on a narrow phone so
   there is still reaction time. The ground line is at 78% of H.
   The dog sits at a fixed screen x and the world scrolls past it;
   an entity's world x is measured in u from the start of the run
   and the dog's world x is `dist`.
   ───────────────────────────────────────────────────────────── */

const COUNTDOWN = 3.6; // 3-2-1 then "GO!" for the last 0.6 s
const GROUND = 0.78; // ground line (fraction of H)
const BASE_SPEED = 0.5; // u/s at speed 1.0
const RAMP_TIME = 70; // s to reach MAX_SPEED
const MAX_SPEED = 2.2;
const DOUBLE_SPEED = 1.5; // log + bale pairs from here on
const GRAVITY = 3.6; // u/s²
const JUMP_V = 1.0; // u/s
const HOLD_ACCEL = 2.2; // extra up-force while held (u/s²)
const HOLD_MAX = 0.22; // s
const JUMP_BUFFER = 0.12; // s — a tap just before landing still jumps
const STRIDE = 0.16; // u per run cycle
const M_PER_UNIT = 40; // metres per u (20 m/s at speed 1.0)
const SIGN_EVERY = 500; // m
const DOG_L = 0.12; // dog body length (u)
const DOG_HIT_HW = 0.035; // dog hitbox half width (u)
const PICK_R = 0.065; // pickup grab radius (u)
const PICK_LOW = 0.15; // pickup heights (u)
const PICK_HIGH = 0.27;
const END_DELAY = 1.4; // s between the tumble and onEnd
const NEAR_OBS = 0.35; // u — an empty jump this close to an obstacle breaks the streak

const PTS_M = 1; // per metre
const PTS_BONE = 100;
const PTS_BALL = 150;
const PTS_OBS = 40; // per obstacle cleared, plus
const PTS_STREAK = 20; // × streak
const STREAK_CAP = 10;

/** kind 0 = round bale, 1 = log, 2 = puddle. Sizes and hitboxes in u. */
const OBS = [
  { w: 0.1, h: 0.1, hw: 0.04, hh: 0.085 },
  { w: 0.2, h: 0.05, hw: 0.09, hh: 0.042 },
  { w: 0.2, h: 0.03, hw: 0.085, hh: 0.012 },
] as const;

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
/** Tile index wrapped to a loop length (0 = no wrap) so attract mode is seamless. */
const wrapK = (k: number, n: number) => (n > 0 ? ((k % n) + n) % n : k);

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

type ObsKind = 0 | 1 | 2;
type Obstacle = { kind: ObsKind; x: number; hw: number; hh: number; cleared: boolean; seed: number };
type Pickup = { ball: boolean; x: number; y: number; phase: number };
type Sign = { x: number; m: number };
type Particle = {
  x: number; // world (u)
  y: number; // height above ground (u)
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  spark: boolean;
};
type Sticker = { x: number; y: number; t: number; text: string; color: string; px: number }; // screen px
type Phase = "idle" | "countdown" | "playing" | "ending" | "over";

type G = {
  W: number;
  H: number;
  u: number;
  phase: Phase;
  ended: boolean;
  t: number;
  runT: number;
  countdown: number;
  speed: number;
  dist: number;
  score: number;
  shown: number;
  streak: number;
  cleared: number;
  dogY: number;
  dogVy: number;
  air: boolean;
  holding: boolean;
  holdT: number;
  buffer: number;
  jumpGot: number; // obstacles cleared + pickups grabbed during this jump
  runPhase: number;
  squash: number;
  tumble: number;
  tumbleV: number;
  obstacles: Obstacle[];
  pickups: Pickup[];
  signs: Sign[];
  particles: Particle[];
  stickers: Sticker[];
  nextObsX: number;
  nextSignM: number;
  flash: number;
  shake: number;
  endTimer: number;
  lastHud: number;
  dustT: number;
  seed: number;
};

type Env = Pick<GameProps, "onEnd" | "onHud" | "sfx">;

function makeState(): G {
  return {
    W: 390,
    H: 700,
    u: 487,
    phase: "idle",
    ended: false,
    t: 0,
    runT: 0,
    countdown: COUNTDOWN,
    speed: 1,
    dist: 0,
    score: 0,
    shown: 0,
    streak: 0,
    cleared: 0,
    dogY: 0,
    dogVy: 0,
    air: false,
    holding: false,
    holdT: 0,
    buffer: 0,
    jumpGot: 0,
    runPhase: 0,
    squash: 0,
    tumble: 0,
    tumbleV: 0,
    obstacles: [],
    pickups: [],
    signs: [],
    particles: [],
    stickers: [],
    nextObsX: 0,
    nextSignM: SIGN_EVERY,
    flash: 0,
    shake: 0,
    endTimer: 0,
    lastHud: 0,
    dustT: 0,
    seed: 1,
  };
}

/* ───────────── geometry ───────────── */

const dogScreenX = (g: G) => g.W * (g.W > g.H ? 0.25 : 0.2);
const groundY = (g: G) => g.H * GROUND;
/** world → screen */
const sx = (g: G, x: number) => dogScreenX(g) + (x - g.dist) * g.u;
const sy = (g: G, y: number) => groundY(g) - y * g.u;
/** How far past the right edge (in u) things are spawned. */
const spawnAhead = (g: G) => (g.W - dogScreenX(g)) / g.u + 0.35;

/* ───────────── spawning ───────────── */

function addObstacle(g: G, kind: ObsKind, x: number) {
  const o = OBS[kind];
  g.obstacles.push({ kind, x, hw: o.hw, hh: o.hh, cleared: false, seed: g.seed++ });
}

function spawnObstacle(g: G) {
  const x = g.nextObsX;
  const dbl = g.speed >= DOUBLE_SPEED && Math.random() < 0.2;
  if (dbl) {
    addObstacle(g, 1, x);
    addObstacle(g, 0, x + 0.19);
  } else {
    const r = Math.random();
    addObstacle(g, r < 0.4 ? 0 : r < 0.7 ? 1 : 2, x);
  }
  const gap = (0.75 + Math.random() * 0.8) * (0.5 + 0.35 * g.speed) + (dbl ? 0.3 : 0);
  const pr = Math.random();
  const ball = Math.random() < 0.35;
  if (pr < 0.2 && !dbl) {
    // Floating right over the obstacle: needs a held jump.
    g.pickups.push({ ball, x: x + 0.02, y: PICK_HIGH, phase: Math.random() * TAU });
  } else if (pr < 0.75) {
    g.pickups.push({
      ball,
      x: x + gap * (0.35 + Math.random() * 0.3),
      y: Math.random() < 0.5 ? PICK_LOW : PICK_HIGH,
      phase: Math.random() * TAU,
    });
  }
  g.nextObsX = x + gap;
}

function spawn(g: G) {
  const ahead = spawnAhead(g);
  let guard = 0;
  while (g.nextObsX - g.dist < ahead && guard++ < 8) spawnObstacle(g);
  while (g.nextSignM / M_PER_UNIT - g.dist < ahead) {
    g.signs.push({ x: g.nextSignM / M_PER_UNIT, m: g.nextSignM });
    g.nextSignM += SIGN_EVERY;
  }
}

function cull(g: G) {
  const edge = g.dist - 0.7;
  for (let i = g.obstacles.length - 1; i >= 0; i--) if (g.obstacles[i].x < edge) g.obstacles.splice(i, 1);
  for (let i = g.pickups.length - 1; i >= 0; i--) if (g.pickups[i].x < edge) g.pickups.splice(i, 1);
  for (let i = g.signs.length - 1; i >= 0; i--) if (g.signs[i].x < edge) g.signs.splice(i, 1);
}

/* ───────────── effects ───────────── */

function addDust(g: G, x: number, y: number, n: number, burst: boolean) {
  for (let i = 0; i < n; i++) {
    g.particles.push({
      x: x + (Math.random() - 0.5) * 0.03,
      y: y + Math.random() * 0.01,
      vx: burst ? (Math.random() - 0.5) * 0.25 : -0.02 - Math.random() * 0.05,
      vy: (burst ? 0.12 : 0.05) + Math.random() * 0.12,
      life: 0,
      max: 0.35 + Math.random() * 0.3,
      size: (burst ? 0.012 : 0.008) + Math.random() * 0.01,
      spark: false,
    });
  }
  if (g.particles.length > 120) g.particles.splice(0, g.particles.length - 120);
}

function addSparks(g: G, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    g.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.15 + Math.random() * 0.5,
      life: 0,
      max: 0.4 + Math.random() * 0.3,
      size: 0.008 + Math.random() * 0.01,
      spark: true,
    });
  }
  if (g.particles.length > 120) g.particles.splice(0, g.particles.length - 120);
}

function addSticker(g: G, x: number, y: number, text: string, color: string, px: number) {
  g.stickers.push({ x, y, t: 0, text, color, px });
  if (g.stickers.length > 6) g.stickers.shift();
}

/* ───────────── run control ───────────── */

function resetRun(g: G) {
  g.phase = "countdown";
  g.ended = false;
  g.t = 0;
  g.runT = 0;
  g.countdown = COUNTDOWN;
  g.speed = 1;
  g.dist = 0;
  g.score = 0;
  g.shown = 0;
  g.streak = 0;
  g.cleared = 0;
  g.dogY = 0;
  g.dogVy = 0;
  g.air = false;
  g.holding = false;
  g.holdT = 0;
  g.buffer = 0;
  g.jumpGot = 0;
  g.runPhase = 0;
  g.squash = 0;
  g.tumble = 0;
  g.tumbleV = 0;
  g.obstacles = [];
  g.pickups = [];
  g.signs = [];
  g.particles = [];
  g.stickers = [];
  g.nextObsX = spawnAhead(g) + 0.7; // a breath of open trail after GO
  g.nextSignM = SIGN_EVERY;
  g.flash = 0;
  g.shake = 0;
  g.endTimer = 0;
  g.lastHud = 0;
  g.dustT = 0;
  g.seed = 1 + Math.floor(Math.random() * 1000);
}

/** The still before START: the dog waiting on the trail, a bale and a bone ahead. */
function demoState(g: G) {
  g.phase = "idle";
  g.dist = 0;
  g.obstacles = [];
  g.pickups = [];
  g.signs = [];
  g.particles = [];
  g.stickers = [];
  g.seed = 7;
  addObstacle(g, 0, 0.75);
  addObstacle(g, 1, 1.6);
  g.pickups.push({ ball: false, x: 1.15, y: PICK_LOW, phase: 0 });
  g.pickups.push({ ball: true, x: 2.1, y: PICK_HIGH, phase: 1 });
  g.dogY = 0;
  g.air = false;
}

function endRun(g: G, env: Env) {
  if (g.ended) return;
  g.ended = true;
  g.phase = "over";
  env.sfx.gameOver();
  const final = clamp(Math.round(g.score), 0, MAX_SCORE);
  env.onHud?.({ score: final });
  env.onEnd(final);
}

function jump(g: G) {
  g.air = true;
  g.dogVy = JUMP_V;
  g.holdT = 0;
  g.buffer = 0;
  g.jumpGot = 0;
  addDust(g, g.dist - 0.03, 0, 4, true);
}

function press(g: G) {
  if (g.phase !== "playing") return;
  g.holding = true;
  if (!g.air) jump(g);
  else g.buffer = JUMP_BUFFER;
}

function release(g: G) {
  g.holding = false;
}

function hit(g: G, env: Env) {
  g.phase = "ending";
  g.endTimer = END_DELAY;
  g.shake = 1;
  g.flash = 0.25;
  g.air = true;
  g.dogVy = 0.9;
  g.tumbleV = -9;
  g.holding = false;
  addDust(g, g.dist, 0.02, 10, true);
  addSticker(g, dogScreenX(g), sy(g, 0.3), "OOPS!", "#ff6b5e", 0.07);
  env.sfx.buzz();
}

function clearObs(g: G, o: Obstacle, env: Env) {
  o.cleared = true;
  g.cleared++;
  g.jumpGot++;
  g.streak = Math.min(STREAK_CAP, g.streak + 1);
  const pts = PTS_OBS + PTS_STREAK * g.streak;
  g.score = Math.min(MAX_SCORE, g.score + pts);
  const x = dogScreenX(g);
  if (g.streak === 5) {
    env.sfx.bullseye(5);
    g.flash = 0.2;
    addSticker(g, x, sy(g, 0.36), "NICE!", "#ffd54a", 0.085);
  } else if (g.streak === STREAK_CAP) {
    env.sfx.bullseye(10);
    g.flash = 0.25;
    addSticker(g, x, sy(g, 0.36), "ON FIRE!", "#ffb347", 0.085);
  } else {
    addSticker(g, x + g.u * 0.1, sy(g, 0.22), `+${pts}`, "#fff3d6", 0.035);
  }
}

/** Obstacles that have passed under the dog count as cleared. */
function sweepClears(g: G, env: Env) {
  const left = g.dist - DOG_HIT_HW;
  for (const o of g.obstacles) if (!o.cleared && o.x + o.hw < left) clearObs(g, o, env);
}

function sweepHits(g: G, env: Env) {
  const left = g.dist - DOG_HIT_HW;
  const right = g.dist + DOG_HIT_HW;
  for (const o of g.obstacles) {
    if (o.cleared) continue;
    if (o.x - o.hw < right && o.x + o.hw > left && g.dogY < o.hh) {
      hit(g, env);
      return;
    }
  }
  // Pickups: the dog's mouth is a little ahead of and above its feet.
  const mx = g.dist + 0.03;
  const my = g.dogY + 0.06;
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const p = g.pickups[i];
    const py = p.y + (p.ball ? Math.abs(Math.sin(g.t * 5 + p.phase)) * 0.025 : 0);
    const dx = p.x - mx;
    const dy = py - my;
    if (dx * dx + dy * dy > PICK_R * PICK_R) continue;
    g.pickups.splice(i, 1);
    const pts = p.ball ? PTS_BALL : PTS_BONE;
    g.score = Math.min(MAX_SCORE, g.score + pts);
    g.jumpGot++;
    g.flash = Math.max(g.flash, 0.1);
    addSparks(g, p.x, py, 10);
    addSticker(g, sx(g, p.x), sy(g, py) - g.u * 0.04, `+${pts}`, p.ball ? "#dcff5a" : "#ffffff", 0.04);
    env.sfx.ding(g.streak);
  }
}

function land(g: G, env: Env) {
  g.squash = 1;
  env.sfx.thud();
  addDust(g, g.dist, 0, 7, true);
  sweepClears(g, env);
  if (g.jumpGot === 0 && g.streak > 0) {
    // A jump that cleared nothing only costs the streak when it was a bungled
    // attempt at a real obstacle (one still uncleared within ~0.35 u ahead).
    // An early hop or a hop on open trail is free: no message, streak kept.
    let near = false;
    for (const o of g.obstacles) {
      if (!o.cleared && o.x - o.hw - g.dist < NEAR_OBS) {
        near = true;
        break;
      }
    }
    if (near) {
      g.streak = 0;
      addSticker(g, dogScreenX(g), sy(g, 0.26), "STREAK LOST", "#c9ced9", 0.035);
    }
  }
}

/* ───────────── update ───────────── */

function update(g: G, dt: number, env: Env, now: number) {
  g.t += dt;

  if (g.phase === "countdown") {
    g.countdown -= dt;
    if (g.countdown <= 0) g.phase = "playing";
  }
  const playing = g.phase === "playing";
  const ending = g.phase === "ending";

  // Scroll.
  let v = 0;
  if (playing) {
    g.runT += dt;
    // Ramp to MAX_SPEED over RAMP_TIME, then keep creeping up so a run can't go forever.
    g.speed = 1 + (MAX_SPEED - 1) * Math.min(1, g.runT / RAMP_TIME) + Math.max(0, g.runT - RAMP_TIME) * 0.012;
    v = BASE_SPEED * g.speed;
  } else if (ending) {
    v = BASE_SPEED * g.speed * clamp(1 - (END_DELAY - g.endTimer) / 0.45, 0, 1);
  }
  if (v > 0) {
    const d = v * dt;
    g.dist += d;
    if (playing) g.score = Math.min(MAX_SCORE, g.score + PTS_M * d * M_PER_UNIT);
    g.runPhase = (g.runPhase + d / STRIDE) % 1;
  }

  if (playing) {
    spawn(g);
    if (g.buffer > 0) g.buffer -= dt;
    if (g.air) {
      g.holdT += dt;
      g.dogVy -= GRAVITY * dt;
      if (g.holding && g.holdT < HOLD_MAX && g.dogVy > 0) g.dogVy += HOLD_ACCEL * dt;
      g.dogY += g.dogVy * dt;
      if (g.dogY <= 0) {
        g.dogY = 0;
        g.dogVy = 0;
        g.air = false;
        land(g, env);
      }
    } else if (g.buffer > 0) {
      jump(g);
    } else {
      g.dustT += dt;
      if (g.dustT > 0.11) {
        g.dustT = 0;
        addDust(g, g.dist - 0.045, 0, 2, false);
      }
    }
    if (g.phase === "playing") {
      sweepClears(g, env);
      sweepHits(g, env);
    }
  } else if (ending) {
    g.tumble += g.tumbleV * dt;
    g.dogVy -= GRAVITY * dt;
    g.dogY += g.dogVy * dt;
    if (g.dogY <= 0) {
      g.dogY = 0;
      if (g.dogVy < -0.35) {
        g.dogVy = -g.dogVy * 0.35;
        g.tumbleV *= 0.5;
        addDust(g, g.dist, 0, 5, true);
      } else {
        g.dogVy = 0;
        g.tumbleV = 0;
      }
    }
    g.endTimer -= dt;
    if (g.endTimer <= 0) endRun(g, env);
  }

  cull(g);

  // Particles.
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      g.particles.splice(i, 1);
      continue;
    }
    p.vy -= (p.spark ? 1.4 : 0.1) * dt;
    p.vx *= 1 - 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!p.spark && p.y < 0) p.y = 0;
  }

  // Stickers.
  for (let i = g.stickers.length - 1; i >= 0; i--) {
    g.stickers[i].t += dt;
    if (g.stickers[i].t > 1.1) g.stickers.splice(i, 1);
  }

  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.squash = Math.max(0, g.squash - dt * 4);
  g.shake = Math.max(0, g.shake - dt * 2);
  g.shown = Math.abs(g.score - g.shown) < 1 ? g.score : lerp(g.shown, g.score, 1 - Math.pow(0.002, dt));

  if (env.onHud && now - g.lastHud > 100 && g.phase !== "over") {
    g.lastHud = now;
    env.onHud({ score: Math.floor(g.score) });
  }
}

/* ───────────── drawing: scenery ─────────────
   Every layer takes its scroll offset in px so attract mode can reuse
   it; `wrap` is the tile loop length (0 in the game). */

/** The static full-screen gradients, built once per canvas size (a new
 *  size — a resize — makes a new entry; the map is kept tiny). */
type SceneGradients = { sky: CanvasGradient; field: CanvasGradient; trail: CanvasGradient };
const gradCache = new Map<string, SceneGradients>();
function sceneGradients(ctx: CanvasRenderingContext2D, W: number, H: number): SceneGradients {
  const key = `${W}x${H}`;
  let sg = gradCache.get(key);
  if (sg) return sg;
  if (gradCache.size >= 8) gradCache.clear();
  const sky = ctx.createLinearGradient(0, 0, 0, H * GROUND);
  sky.addColorStop(0, "#2a5a9c");
  sky.addColorStop(0.45, "#6ea2d4");
  sky.addColorStop(0.78, "#e7b575");
  sky.addColorStop(1, "#f7d090");
  const field = ctx.createLinearGradient(0, H * 0.705, 0, H * (GROUND - 0.03));
  field.addColorStop(0, "#8fa548");
  field.addColorStop(1, "#b7a64c");
  const trail = ctx.createLinearGradient(0, H * (GROUND - 0.03), 0, H);
  trail.addColorStop(0, "#b7864f");
  trail.addColorStop(0.35, "#9a6a3e");
  trail.addColorStop(1, "#6e4727");
  sg = { sky, field, trail };
  gradCache.set(key, sg);
  return sg;
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, cloudOff: number, t: number) {
  const bottom = H * GROUND;
  ctx.fillStyle = sceneGradients(ctx, W, H).sky;
  ctx.fillRect(0, 0, W, bottom);
  // sun
  const cx = W * 0.74;
  const cy = H * 0.3;
  const r = H * 0.055;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.4);
  glow.addColorStop(0, "rgba(255,225,160,0.55)");
  glow.addColorStop(1, "rgba(255,225,160,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 3.4, cy - r * 3.4, r * 6.8, r * 6.8);
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  // clouds
  const P = H * 0.9;
  const k0 = Math.floor(cloudOff / P) - 1;
  const k1 = Math.floor((cloudOff + W) / P) + 1;
  ctx.fillStyle = "rgba(255,250,240,0.88)";
  for (let k = k0; k <= k1; k++) {
    const s = H * (0.028 + hash(k * 3.1) * 0.03);
    const x = k * P + hash(k * 1.7) * P * 0.6 - cloudOff + Math.sin(t * 0.3 + k) * 4;
    const y = H * (0.06 + hash(k * 2.3) * 0.24);
    if (x < -s * 4 || x > W + s * 4) continue;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.arc(x + s * 1.1, y - s * 0.45, s * 1.25, 0, TAU);
    ctx.arc(x + s * 2.4, y, s * 0.95, 0, TAU);
    ctx.rect(x - s * 0.3, y, s * 3.2, s * 0.9);
    ctx.fill();
  }
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  off: number,
  wrap: number,
  color: string,
  baseY: number,
  rmin: number,
  rmax: number,
) {
  const P = H * 0.125;
  const k0 = Math.floor(off / P) - 2;
  const k1 = Math.floor((off + W) / P) + 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = k0; k <= k1; k++) {
    const r = H * (rmin + hash(wrapK(k, wrap) * 5.3 + 0.7) * (rmax - rmin));
    const cx = k * P + P * 0.5 - off;
    ctx.moveTo(cx + r, baseY);
    ctx.arc(cx, baseY, r, 0, Math.PI, true);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillRect(0, baseY - 1, W, H * GROUND - baseY + 1);
}

function drawBarn(ctx: CanvasRenderingContext2D, x: number, baseY: number, H: number) {
  const bw = H * 0.26;
  const bh = H * 0.1;
  ctx.fillStyle = "#8f3b31";
  ctx.fillRect(x, baseY - bh, bw, bh);
  ctx.fillStyle = "#5c2b26";
  ctx.beginPath();
  ctx.moveTo(x - bw * 0.04, baseY - bh);
  ctx.lineTo(x + bw * 0.12, baseY - bh * 1.45);
  ctx.lineTo(x + bw * 0.5, baseY - bh * 1.75);
  ctx.lineTo(x + bw * 0.88, baseY - bh * 1.45);
  ctx.lineTo(x + bw * 1.04, baseY - bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + bw * 0.38, baseY - bh * 0.7, bw * 0.24, bh * 0.7);
  ctx.fillRect(x + bw * 0.46, baseY - bh * 1.95, bw * 0.08, bh * 0.22);
  ctx.strokeStyle = "rgba(255,235,210,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.38, baseY - bh * 0.7);
  ctx.lineTo(x + bw * 0.62, baseY);
  ctx.moveTo(x + bw * 0.62, baseY - bh * 0.7);
  ctx.lineTo(x + bw * 0.38, baseY);
  ctx.stroke();
  ctx.fillStyle = "#f2d49a";
  ctx.fillRect(x + bw * 0.46, baseY - bh * 1.35, bw * 0.08, bh * 0.22);
}

function drawTrees(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, wrap: number, barn: boolean) {
  const baseY = H * 0.71;
  const P = H * 0.125;
  const k0 = Math.floor(off / P) - 3;
  const k1 = Math.floor((off + W) / P) + 1;
  for (let k = k0; k <= k1; k++) {
    const hk = wrapK(k, wrap);
    if (barn && ((k % 24) + 24) % 24 === 9) drawBarn(ctx, k * P - off, baseY, H);
    for (let j = 0; j < 2; j++) {
      const r1 = hash(hk * 1.1 + j * 7.7);
      const r2 = hash(hk * 2.2 + j * 3.3);
      const x = k * P + (j * 0.5 + r1 * 0.45) * P - off;
      const th = H * (0.07 + r2 * 0.08);
      const tw = th * 0.5;
      ctx.fillStyle = j === 0 ? "#24433a" : "#2e5444";
      ctx.beginPath();
      ctx.moveTo(x, baseY - th);
      ctx.lineTo(x + tw * 0.55, baseY - th * 0.5);
      ctx.lineTo(x + tw * 0.3, baseY - th * 0.5);
      ctx.lineTo(x + tw, baseY);
      ctx.lineTo(x - tw, baseY);
      ctx.lineTo(x - tw * 0.3, baseY - th * 0.5);
      ctx.lineTo(x - tw * 0.55, baseY - th * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawField(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const y0 = H * 0.705;
  const y1 = H * (GROUND - 0.03);
  ctx.fillStyle = sceneGradients(ctx, W, H).field;
  ctx.fillRect(0, y0, W, y1 - y0 + 1);
}

function drawFence(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, wrap: number) {
  const baseY = H * (GROUND - 0.03);
  const P = H * 0.25;
  const k0 = Math.floor(off / P) - 1;
  const k1 = Math.floor((off + W) / P) + 1;
  ctx.fillStyle = "#6f4b2c";
  ctx.fillRect(0, baseY - H * 0.032, W, H * 0.009);
  ctx.fillRect(0, baseY - H * 0.06, W, H * 0.009);
  const pw = H * 0.013;
  const ph = H * 0.085;
  for (let k = k0; k <= k1; k++) {
    const x = k * P + P * 0.15 - off;
    ctx.fillStyle = "#5a3a20";
    ctx.fillRect(x, baseY - ph, pw, ph);
    ctx.fillStyle = "#8a613a";
    ctx.fillRect(x, baseY - ph, pw * 0.3, ph);
    // a tuft of grass at the foot of every other post
    if (hash(wrapK(k, wrap) * 2.1) > 0.4) {
      ctx.strokeStyle = "#6f8d3a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = -2; j <= 2; j++) {
        ctx.moveTo(x + pw / 2 + j * 2, baseY);
        ctx.lineTo(x + pw / 2 + j * 5, baseY - H * 0.018 - Math.abs(j) * 1.5);
      }
      ctx.stroke();
    }
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, wrap: number, t: number) {
  const top = H * (GROUND - 0.03);
  const gy = H * GROUND;
  ctx.fillStyle = sceneGradients(ctx, W, H).trail;
  ctx.fillRect(0, top, W, H - top);
  ctx.fillStyle = "rgba(255,230,180,0.25)";
  ctx.fillRect(0, top, W, 2);
  // tire ruts
  ctx.strokeStyle = "rgba(60,35,15,0.28)";
  ctx.lineWidth = H * 0.014;
  for (const ry of [gy + H * 0.04, gy + H * 0.105]) {
    if (ry > H) continue;
    ctx.beginPath();
    for (let x = -10; x <= W + 30; x += 24) {
      const y = ry + Math.sin((x + off) * 0.03) * 1.5;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // pebbles
  const P = H * 0.0625;
  const k0 = Math.floor(off / P) - 1;
  const k1 = Math.floor((off + W) / P) + 1;
  for (let k = k0; k <= k1; k++) {
    const hk = wrapK(k, wrap);
    const r = hash(hk * 7.1);
    if (r < 0.5) continue;
    const x = k * P + hash(hk * 1.3) * P - off;
    const y = top + H * 0.02 + hash(hk * 2.9) * (H - top - H * 0.02);
    const s = 1.5 + hash(hk * 4.4) * 2;
    ctx.fillStyle = r > 0.75 ? "rgba(255,235,200,0.35)" : "rgba(60,35,15,0.4)";
    ctx.fillRect(x, y, s * 1.4, s);
  }
  // a wobble of heat shimmer on the far edge, very subtle
  ctx.fillStyle = `rgba(255,220,160,${0.05 + 0.03 * Math.sin(t * 2)})`;
  ctx.fillRect(0, top - 2, W, 2);
}

function drawGrassFG(ctx: CanvasRenderingContext2D, W: number, H: number, off: number, wrap: number) {
  const P = H * 0.05;
  const k0 = Math.floor(off / P) - 1;
  const k1 = Math.floor((off + W) / P) + 1;
  ctx.strokeStyle = "rgba(58,98,38,0.92)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = k0; k <= k1; k++) {
    const hk = wrapK(k, wrap);
    const x = k * P + hash(hk * 1.9) * P - off;
    const hgt = H * (0.04 + hash(hk * 2.8) * 0.05);
    const lean = (hash(hk * 3.7) - 0.5) * hgt * 0.5;
    for (let j = -1; j <= 1; j++) {
      ctx.moveTo(x + j * 3, H + 2);
      ctx.quadraticCurveTo(x + j * 3 + lean * 0.5, H - hgt * 0.6, x + j * 3 + lean + j * hgt * 0.25, H - hgt * (1 - Math.abs(j) * 0.25));
    }
  }
  ctx.stroke();
}

/* ───────────── drawing: things on the trail ───────────── */

function drawBale(ctx: CanvasRenderingContext2D, cx: number, gy: number, r: number) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, gy, r * 1.1, r * 0.18, 0, 0, TAU);
  ctx.fill();
  const cy = gy - r;
  ctx.fillStyle = "#d9a63f";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#b07d24";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0.4, 5.6);
  ctx.moveTo(cx + r * 0.48, cy);
  ctx.arc(cx, cy, r * 0.48, 0, 5.0);
  ctx.moveTo(cx + r * 0.22, cy);
  ctx.arc(cx, cy, r * 0.22, 0, 4.2);
  ctx.stroke();
  ctx.strokeStyle = "#9c6c1c";
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  // loose straw on top
  ctx.strokeStyle = "#efc75a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(cx + i * r * 0.25, cy - r * 0.95);
    ctx.lineTo(cx + i * r * 0.35, cy - r * 1.18);
  }
  ctx.stroke();
}

function drawLog(ctx: CanvasRenderingContext2D, cx: number, gy: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, gy, w * 0.55, h * 0.25, 0, 0, TAU);
  ctx.fill();
  const x = cx - w / 2;
  const y = gy - h;
  ctx.fillStyle = "#6b4423";
  roundRect(ctx, x, y, w, h, h * 0.45);
  ctx.fill();
  ctx.fillStyle = "rgba(255,220,170,0.18)";
  roundRect(ctx, x + w * 0.05, y + h * 0.1, w * 0.85, h * 0.25, h * 0.12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ly = y + h * (0.4 + i * 0.2);
    ctx.moveTo(x + w * 0.1, ly);
    ctx.quadraticCurveTo(x + w * 0.45, ly + (i % 2 ? 2 : -2), x + w * 0.85, ly);
  }
  ctx.stroke();
  // stub of a branch
  ctx.fillStyle = "#5a3819";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, y + h * 0.2);
  ctx.lineTo(x + w * 0.2, y - h * 0.35);
  ctx.lineTo(x + w * 0.32, y - h * 0.3);
  ctx.lineTo(x + w * 0.36, y + h * 0.2);
  ctx.closePath();
  ctx.fill();
  // cut end with rings
  const ex = cx + w / 2 - h * 0.12;
  const ey = gy - h / 2;
  ctx.fillStyle = "#caa36e";
  ctx.beginPath();
  ctx.ellipse(ex, ey, h * 0.3, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#a07c4a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(ex, ey, h * 0.2, h * 0.34, 0, 0, TAU);
  ctx.moveTo(ex + h * 0.1, ey);
  ctx.ellipse(ex, ey, h * 0.1, h * 0.17, 0, 0, TAU);
  ctx.stroke();
}

function drawPuddle(ctx: CanvasRenderingContext2D, cx: number, gy: number, w: number, h: number, t: number) {
  ctx.fillStyle = "#6a4629";
  ctx.beginPath();
  ctx.ellipse(cx, gy - h * 0.1, w * 0.53, h * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#5f93c4";
  ctx.beginPath();
  ctx.ellipse(cx, gy - h * 0.15, w * 0.48, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.12, gy - h * 0.28, w * 0.22, h * 0.16, 0, 0, TAU);
  ctx.fill();
  const rp = (t * 0.7) % 1;
  ctx.strokeStyle = `rgba(255,255,255,${0.4 * (1 - rp)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.12, gy - h * 0.15, w * 0.3 * rp + 1, h * 0.3 * rp + 0.5, 0, 0, TAU);
  ctx.stroke();
}

function drawBone(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.rect(-s * 0.7, -s * 0.22, s * 1.4, s * 0.44);
  for (const ex of [-s * 0.72, s * 0.72]) {
    for (const ey of [-s * 0.27, s * 0.27]) {
      ctx.moveTo(ex + s * 0.3, ey);
      ctx.arc(ex, ey, s * 0.3, 0, TAU);
    }
  }
  ctx.strokeStyle = "#b9a883";
  ctx.lineWidth = s * 0.22;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = "#f7f0de";
  ctx.fill();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "#cfe24a";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0.6, 2.2);
  ctx.fill();
  ctx.strokeStyle = "#f6f8e8";
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  ctx.arc(x - r * 0.95, y, r * 0.95, -0.95, 0.95);
  ctx.moveTo(x + r * 0.95 - r * 0.95 * Math.cos(0.95), y - r * 0.95 * Math.sin(0.95));
  ctx.arc(x + r * 0.95, y, r * 0.95, Math.PI - 0.95, Math.PI + 0.95);
  ctx.stroke();
}

function drawSign(ctx: CanvasRenderingContext2D, x: number, baseY: number, u: number, m: number) {
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(x - u * 0.008, baseY - u * 0.15, u * 0.016, u * 0.15);
  ctx.fillStyle = "#efe0b4";
  roundRect(ctx, x - u * 0.07, baseY - u * 0.2, u * 0.14, u * 0.058, u * 0.008);
  ctx.fill();
  ctx.strokeStyle = "#7a5633";
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, String(m), x, baseY - u * 0.171, Math.round(u * 0.032), "#5a3a20", "center", false);
}

/* ───────────── drawing: the dog ───────────── */

type DogPose = {
  run: number; // 0..1 run cycle (quantised to 4 frames)
  air: number; // 0 running, 1 jump pose (legs tucked, ears up)
  stand: number; // 0..1 standing still (idle)
  vy: number; // vertical speed (u/s) for the lean
  squash: number; // 0..1 landing squash
  wag: number; // tail wag offset (rad)
  bob: number; // idle body bob (L units, up = positive)
  pant: number; // 0..1 tongue out
  rot: number; // tumble angle
};

/** x,y = the point under the dog's feet on the ground (screen px); L = body length px. Faces right. */
function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, L: number, p: DogPose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.rot);
  const sq = Math.sin(Math.min(1, p.squash) * Math.PI) * 0.22;
  ctx.scale(L * (1 + sq * 0.8), L * (1 - sq));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const b = -p.bob;
  const air = p.air;
  const frame = Math.floor(p.run * 4) % 4;

  const leg = (hx: number, hy: number, off: number, front: boolean, near: boolean) => {
    const ang = (frame / 4 + off) * TAU;
    let fx = hx + 0.17 * Math.cos(ang);
    let fy = -Math.max(0, Math.sin(ang)) * 0.14;
    fx = lerp(fx, hx + (near ? 0.04 : -0.04), p.stand);
    fy = lerp(fy, 0, p.stand);
    const tx = front ? hx + 0.22 : hx - 0.22;
    const ty = front ? -0.28 : -0.2;
    fx = lerp(fx, tx, air);
    fy = lerp(fy, ty, air);
    const kx = (hx + fx) / 2 + (front ? 0.05 : -0.07);
    const ky = (hy + b + fy) / 2;
    ctx.strokeStyle = near ? "#121212" : "#2e2e2e";
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(hx, hy + b);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.strokeStyle = near ? "#f2f2f2" : "#cfcfcf";
    ctx.beginPath();
    ctx.moveTo(lerp(kx, fx, 0.6), lerp(ky, fy, 0.6));
    ctx.lineTo(fx, fy);
    ctx.stroke();
  };

  // far legs, tail, body, near legs, head
  leg(-0.3, -0.4, 0.5, false, false);
  leg(0.3, -0.42, 0.0, true, false);

  // tail
  const a = lerp(0.95 + p.wag, 0.35 + p.wag * 0.3, air);
  const bx = -0.44;
  const by = -0.56 + b;
  const tipX = bx - 0.42 * Math.cos(a);
  const tipY = by - 0.42 * Math.sin(a);
  const cX = bx - 0.35 * Math.cos(a - 0.6);
  const cY = by - 0.35 * Math.sin(a - 0.6);
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 0.11;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(cX, cY, tipX, tipY);
  ctx.stroke();
  const q = 0.7;
  const qx = (1 - q) * (1 - q) * bx + 2 * (1 - q) * q * cX + q * q * tipX;
  const qy = (1 - q) * (1 - q) * by + 2 * (1 - q) * q * cY + q * q * tipY;
  ctx.strokeStyle = "#f2f2f2";
  ctx.beginPath();
  ctx.moveTo(qx, qy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // body
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.ellipse(0, -0.47 + b, 0.46, 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.ellipse(0.22, -0.36 + b, 0.2, 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.36, -0.58 + b, 0.12, 0.15, 0, 0, TAU);
  ctx.fill();

  leg(-0.28, -0.38, 0.0, false, true);
  leg(0.32, -0.4, 0.5, true, true);

  // neck + collar
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 0.24;
  ctx.beginPath();
  ctx.moveTo(0.32, -0.6 + b);
  ctx.lineTo(0.5, -0.78 + b);
  ctx.stroke();
  ctx.strokeStyle = "#d8402f";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.36, -0.62 + b);
  ctx.lineTo(0.47, -0.72 + b);
  ctx.stroke();
  ctx.fillStyle = "#f0c84a";
  ctx.beginPath();
  ctx.arc(0.43, -0.6 + b, 0.03, 0, TAU);
  ctx.fill();

  // far ear (only shows when they're up)
  if (air > 0.05) {
    ctx.fillStyle = "#2e2e2e";
    ctx.beginPath();
    ctx.moveTo(0.52, -0.95 + b);
    ctx.lineTo(0.62, -0.92 + b);
    ctx.lineTo(lerp(0.62, 0.64, air), lerp(-0.95, -1.1, air) + b);
    ctx.closePath();
    ctx.fill();
  }

  // head
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.arc(0.54, -0.82 + b, 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.ellipse(0.68, -0.76 + b, 0.14, 0.095, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.57, -0.87 + b, 0.045, 0.1, 0, 0, TAU);
  ctx.fill();
  if (p.pant > 0.05) {
    ctx.fillStyle = "#e8707f";
    ctx.beginPath();
    ctx.ellipse(0.72, -0.66 + b, 0.035, 0.055 * p.pant, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#1b1b1b";
  ctx.beginPath();
  ctx.arc(0.8, -0.78 + b, 0.038, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.arc(0.74, -0.72 + b, 0.05, 0.2, 1.4);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0.6, -0.85 + b, 0.038, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(0.615, -0.85 + b, 0.022, 0, TAU);
  ctx.fill();
  // near ear: floppy on the ground, up in the air, flapping with the stride
  const flap = (frame === 1 || frame === 3 ? 0.03 : 0) + clamp(-p.vy * 0.04, -0.04, 0.04);
  const earX = lerp(0.36, 0.42, air);
  const earY = lerp(-0.7 + flap, -1.12, air);
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.moveTo(0.44, -0.95 + b);
  ctx.lineTo(0.54, -0.94 + b);
  ctx.lineTo(earX, earY + b);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c98a6a";
  ctx.beginPath();
  ctx.moveTo(0.46, -0.92 + b);
  ctx.lineTo(0.51, -0.915 + b);
  ctx.lineTo(lerp(0.46, 0.51, 0.5) + (earX - 0.485) * 0.6, lerp(-0.92, earY, 0.6) + b);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, gy: number, L: number, hgt: number) {
  const k = clamp(1 - hgt / 0.35, 0.25, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`;
  ctx.beginPath();
  ctx.ellipse(x + L * 0.05, gy, L * 0.5 * (0.5 + 0.5 * k), L * 0.09 * (0.5 + 0.5 * k), 0, 0, TAU);
  ctx.fill();
}

/* ───────────── drawing: overlays ───────────── */

function drawParticles(ctx: CanvasRenderingContext2D, g: G) {
  for (const p of g.particles) {
    const a = 1 - p.life / p.max;
    const x = sx(g, p.x);
    const y = sy(g, p.y);
    const s = p.size * g.u;
    if (p.spark) {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.size > 0.013 ? "#fff6c8" : "#ffd54a";
      ctx.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6);
      ctx.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2);
    } else {
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = "#d9c3a0";
      ctx.beginPath();
      ctx.arc(x, y - s, s * (1 + p.life * 2.5), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawStickers(ctx: CanvasRenderingContext2D, g: G) {
  for (const s of g.stickers) {
    const pop = s.t < 0.15 ? 1 + (1 - s.t / 0.15) * 0.5 : 1;
    const a = s.t > 0.7 ? 1 - (s.t - 0.7) / 0.4 : 1;
    ctx.save();
    ctx.translate(clamp(s.x, 50, g.W - 50), s.y - s.t * 30);
    ctx.rotate(-0.06);
    ctx.scale(pop, pop);
    ctx.globalAlpha = clamp(a, 0, 1);
    label(ctx, s.text, 0, 0, Math.round(s.px * g.u), s.color, "center");
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, g: G) {
  const W = g.W;
  label(ctx, "SCORE", 14, 30, 13, "#f3e6c8");
  label(ctx, String(Math.floor(g.shown)), 14, 54, 30, "#ffffff");
  label(ctx, `${Math.floor(g.dist * M_PER_UNIT)} m`, 14, 82, 15, "#ffd54a");
  if (g.streak >= 2) {
    const text = `STREAK x${g.streak}`;
    ctx.font = FONT(13);
    const tw = ctx.measureText(text).width;
    const pw = tw + 26;
    const pulse = 1 + 0.04 * Math.sin(g.t * 9);
    ctx.save();
    ctx.translate(W - 14 - pw / 2, 32);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = g.streak >= STREAK_CAP ? "#d9532f" : "#3b8bd9";
    roundRect(ctx, -pw / 2, -13, pw, 26, 13);
    ctx.fill();
    ctx.strokeStyle = "#ffd54a";
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, text, 0, 0, 13, "#fff3d6", "center", false);
    ctx.restore();
  }
  // speed meter
  const lvl = Math.round(((g.speed - 1) / (MAX_SPEED - 1)) * 8);
  label(ctx, "SPEED", W - 14, 62, 13, "#f3e6c8", "right");
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i < lvl + 1 ? (i >= 6 ? "#ff6b5e" : "#ffd54a") : "rgba(255,255,255,0.22)";
    ctx.fillRect(W - 14 - (8 - i) * 9, 72, 6, 8);
  }
}

function drawCountdown(ctx: CanvasRenderingContext2D, g: G) {
  const c = g.countdown;
  const go = c <= 0.6;
  const text = go ? "GO!" : String(Math.ceil(c - 0.6));
  const frac = go ? (0.6 - c) / 0.6 : 1 - ((c - 0.6) % 1);
  const scale = 1 + 0.35 * (1 - Math.min(1, frac * 4));
  ctx.save();
  ctx.translate(g.W / 2, g.H * 0.38);
  ctx.scale(scale, scale);
  ctx.globalAlpha = go ? 1 - frac * 0.6 : 1;
  label(ctx, text, 0, 0, go ? 64 : 72, go ? "#ffd54a" : "#ffffff", "center");
  ctx.restore();
  ctx.globalAlpha = 1;
  if (!go) {
    label(ctx, "TAP TO JUMP", g.W / 2, g.H * 0.38 + 56, 16, "#ffffff", "center");
    label(ctx, "HOLD FOR A BIG ONE", g.W / 2, g.H * 0.38 + 78, 13, "#f3e6c8", "center");
  }
}

function render(ctx: CanvasRenderingContext2D, g: G) {
  const { W, H, u } = g;
  const gy = groundY(g);
  const px = g.dist * u;
  const shakeX = g.shake > 0 ? Math.sin(g.t * 60) * g.shake * 7 : 0;
  const shakeY = g.shake > 0 ? Math.cos(g.t * 47) * g.shake * 4 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawSky(ctx, W, H, px * 0.05 + g.t * 6, g.t);
  drawHills(ctx, W, H, px * 0.1, 0, "#7b8fc4", H * 0.64, 0.12, 0.22);
  drawHills(ctx, W, H, px * 0.2, 0, "#5c74a8", H * 0.68, 0.07, 0.14);
  drawTrees(ctx, W, H, px * 0.3, 0, true);
  drawField(ctx, W, H);
  drawFence(ctx, W, H, px * 0.8, 0);
  drawTrail(ctx, W, H, px, 0, g.t);

  for (const s of g.signs) drawSign(ctx, sx(g, s.x), gy - H * 0.03, u, s.m);

  for (const o of g.obstacles) {
    const x = sx(g, o.x);
    const d = OBS[o.kind];
    if (x < -d.w * u || x > W + d.w * u) continue;
    if (o.kind === 0) drawBale(ctx, x, gy, d.h * u * 0.5);
    else if (o.kind === 1) drawLog(ctx, x, gy, d.w * u, d.h * u);
    else drawPuddle(ctx, x, gy, d.w * u, d.h * u, g.t + o.seed);
  }

  for (const p of g.pickups) {
    const x = sx(g, p.x);
    if (x < -u * 0.1 || x > W + u * 0.1) continue;
    if (p.ball) {
      const y = sy(g, p.y + Math.abs(Math.sin(g.t * 5 + p.phase)) * 0.025);
      drawBall(ctx, x, y, u * 0.02);
    } else {
      drawBone(ctx, x, sy(g, p.y), u * 0.03, Math.sin(g.t * 2 + p.phase) * 0.3 - 0.3);
    }
  }

  // dust behind the dog
  drawParticles(ctx, g);

  // the dog
  const dx = dogScreenX(g);
  const L = DOG_L * u;
  const idle = g.phase === "idle" || g.phase === "countdown";
  drawShadow(ctx, dx, gy, L, g.dogY);
  let rot = g.tumble;
  if (g.phase === "playing" && g.air) rot = -clamp(g.dogVy * 0.22, -0.22, 0.25);
  drawDog(ctx, dx, sy(g, g.dogY), L, {
    run: g.runPhase,
    air: g.phase === "playing" && g.air ? 1 : 0,
    stand: idle ? 1 : 0,
    vy: g.dogVy,
    squash: g.squash,
    wag: idle ? Math.sin(g.t * 12) * 0.35 : Math.sin(g.t * 16) * 0.22,
    bob: idle ? 0.02 + 0.02 * Math.sin(g.t * 6) : 0,
    pant: idle ? 0.6 + 0.4 * Math.sin(g.t * 6) : g.speed > 1.8 ? 0.6 : 0,
    rot,
  });

  drawGrassFG(ctx, W, H, px * 1.2, 0);
  ctx.restore();

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,245,210,${g.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawStickers(ctx, g);

  if (g.phase !== "idle") drawHud(ctx, g);
  if (g.phase === "countdown") drawCountdown(ctx, g);
}

/* ───────────── attract mode ─────────────
   A 5 s loop: the trail scrolls 2.5 h per loop, and every layer's
   tile period divides its parallax distance so the wrap is seamless. */

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const tm = t % 5;
  const px = tm * BASE_SPEED * h;
  drawSky(ctx, w, h, 0, t);
  drawHills(ctx, w, h, px * 0.1, 2, "#7b8fc4", h * 0.64, 0.12, 0.22);
  drawHills(ctx, w, h, px * 0.2, 4, "#5c74a8", h * 0.68, 0.07, 0.14);
  drawTrees(ctx, w, h, px * 0.3, 6, false);
  drawField(ctx, w, h);
  drawFence(ctx, w, h, px * 0.8, 8);
  drawTrail(ctx, w, h, px, 40, t);
  const gy = h * GROUND;
  const dogX = w * 0.28;
  // a bale rolls up to the dog at 2.6 s
  const bx = dogX + (2.6 - tm) * BASE_SPEED * h;
  if (bx > -h * 0.1 && bx < w + h * 0.1) drawBale(ctx, bx, gy, h * 0.07);
  // the hop: starts at 2.27 s, 0.67 s in the air
  const tj = tm - 2.27;
  const air = tj >= 0 && tj <= 0.667;
  const hgt = air ? 1.2 * tj - 1.8 * tj * tj : 0;
  const L = h * 0.2;
  drawShadow(ctx, dogX, gy, L, hgt);
  drawDog(ctx, dogX, gy - hgt * h, L, {
    run: (tm * BASE_SPEED) / STRIDE,
    air: air ? 1 : 0,
    stand: 0,
    vy: air ? 1.2 - 3.6 * tj : 0,
    squash: tj > 0.667 && tj < 0.9 ? 1 - (tj - 0.667) / 0.233 : 0,
    wag: Math.sin(t * 16) * 0.22,
    bob: 0,
    pant: 0,
    rot: air ? -clamp((1.2 - 3.6 * tj) * 0.22, -0.22, 0.25) : 0,
  });
  drawGrassFG(ctx, w, h, px * 1.2, 60);
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
      st.u = Math.min(H, W * 1.25);
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
      press(st);
    };
    const onUp = () => release(st);
    // Losing window focus mid-hold (tab switch, alt-tab) never fires pointerup.
    const onBlur = () => release(st);
    const isJumpKey = (e: KeyboardEvent) => e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW";
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isJumpKey(e)) return;
      if (st.phase === "idle" || st.phase === "over") return;
      e.preventDefault();
      if (!e.repeat) press(st);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isJumpKey(e)) release(st);
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);
    resize();

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
