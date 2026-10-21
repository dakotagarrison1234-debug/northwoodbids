"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AttractFn, GameHandle, GameProps, Lot } from "./types";

/* ─────────────────────────────────────────────────────────────
   Gavel Slam — the auctioneer's timing game. A needle sweeps back
   and forth across the block; slam the gavel while it is inside
   the glowing SOLD zone to win the lot. The bullseye core pays
   double, the multiplier climbs with every clean hit (faster on a
   bullseye) and resets on a miss, every 5th combo starts a Gavel
   Frenzy (x2 and a wider zone for four slams) and some lots are
   golden (x3). Three misses and the gavel is dropped.

   DOM/React rendered on purpose (that is how the original played):
   the needle is driven straight from the RAF loop via a transform
   on a ref'd element, so what is painted is exactly what slam()
   evaluates. Everything that changes per frame lives in refs; React
   state only changes on slams.
   ───────────────────────────────────────────────────────────── */

const FALLBACK_LOTS: Lot[] = [
  "Vintage Tractor", "Hay Bale", "Deer Mount", "Rhubarb Pie", "Old Canoe",
  "Cast Iron Skillet", "Bushel of Apples", "Wood Stove", "Mason Jars", "Fishing Rod",
].map((title, i) => ({ id: `fb${i}`, title, photo: null, href: null }));

const CHATTER = [
  "Do I hear it? Goin' once...", "Twenty-five, who'll gimme thirty?",
  "Sold to the bidder in the flannel!", "Comin' up, don't blink now!",
  "Last call, folks!", "She's a beauty, who wants 'er?",
  "Wind 'er up, here we go!", "Real fine piece, this one!",
  "Who'll start the biddin' at ten?", "Don't let this'n get away!",
];

// ── Game-feel tuning ────────────────────────────────────────
const BASE_SPEED = 52;      // %/sec at round 1
const SPEED_STEP = 5.5;     // +%/sec per won lot
const MAX_SPEED = 175;
const ZONE_MAX = 28;        // starting zone width (%)
const ZONE_MIN = 8;
const ZONE_STEP = 1.3;
const BULL_FRAC = 0.18;     // bullseye = center +/- (zone width * this)
const MAX_MULT = 8;         // score multiplier cap
const FRENZY_EVERY = 5;     // every Nth combo kicks off a Gavel Frenzy
const FRENZY_LEN = 4;       // slams a frenzy lasts
const GOLDEN_CHANCE = 0.16; // chance a lot is a golden (x3) chase lot
const NEAR_MISS = 4;        // % from the zone edge that still counts as "so close"

const MAX_RAW_SCORE = 50_000; // raw cap: 20,000 shared ceiling / 0.4 scale (types.ts)

const COUNTDOWN = 3;        // seconds of 3-2-1 before the needle starts
const GO_LEN = 700;         // ms the GO! stamp hangs around
const END_BEAT = 900;       // ms between the 3rd strike and onEnd
const IDLE_ZONE = { start: 36, width: ZONE_MAX };

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; rot: number; vr: number;
};
type Phase = "idle" | "countdown" | "playing" | "ending" | "over";
type Flash = { text: string; tone: "good" | "great" | "bad"; id: number };
type Zone = { start: number; width: number };

/* ───────────── attract mode ───────────── */

const tri = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

export const drawAttract: AttractFn = (ctx, w, h, t) => {
  const loop = t % 5;
  // dark walnut stage with a warm spotlight
  ctx.fillStyle = "#140d08";
  ctx.fillRect(0, 0, w, h);
  const spot = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.9);
  spot.addColorStop(0, "rgba(255,221,150,0.22)");
  spot.addColorStop(1, "rgba(255,221,150,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);
  // bunting
  for (let i = 0; i < 7; i++) {
    const px = (i + 0.5) * (w / 7);
    ctx.fillStyle = i % 3 === 0 ? "#b45309" : i % 3 === 1 ? "#5f7a45" : "#cdbda3";
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 9 + Math.sin(t * 2 + i) * 1.2);
    ctx.closePath();
    ctx.fill();
  }

  // the meter
  const bx = w * 0.08, bw = w * 0.84, bh = h * 0.18, by = h * 0.6;
  ctx.fillStyle = "#1c130c";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "#120b06";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  const zs = bx + bw * 0.36, zw = bw * 0.28;
  ctx.fillStyle = "rgba(95,122,69,0.65)";
  ctx.fillRect(zs, by, zw, bh);
  ctx.fillStyle = "#84cc16";
  ctx.fillRect(zs, by, 2, bh);
  ctx.fillRect(zs + zw - 2, by, 2, bh);
  const pulse = 0.75 + 0.25 * Math.sin(t * 7);
  ctx.fillStyle = `rgba(190,255,120,${pulse})`;
  const bullW = zw * BULL_FRAC * 2;
  ctx.fillRect(zs + zw / 2 - bullW / 2, by, bullW, bh);

  // needle: constant-speed sweep, 2 round trips per 5 s loop
  const pos = tri(loop / 2.5 + 0.25);
  const nx = bx + pos * bw;
  const trail = ctx.createLinearGradient(nx - 18, 0, nx, 0);
  trail.addColorStop(0, "rgba(255,221,150,0)");
  trail.addColorStop(1, "rgba(255,221,150,0.45)");
  ctx.fillStyle = trail;
  ctx.fillRect(nx - 18, by, 18, bh);
  ctx.fillStyle = "#ffe4b0";
  ctx.fillRect(nx - 2, by - 2, 4, bh + 4);
  ctx.fillStyle = "#6c4d39";
  ctx.fillRect(nx - 6, by - 8, 12, 7);

  // gavel bobbing above the needle; slams when the needle crosses centre
  const s = (loop % 2.5) - 1.25; // 0 at the centre crossing
  const slamK = Math.max(0, 1 - Math.abs(s) / 0.22);
  const angle = -0.55 + Math.sin(t * 2.6) * 0.08 + slamK * 0.95;
  const gy = by - h * 0.22 - Math.sin(t * 2.6) * 3 + slamK * 6;
  const u = Math.min(w, h) * 0.09;
  ctx.save();
  ctx.translate(nx + u * 0.9, gy);
  ctx.rotate(angle);
  ctx.fillStyle = "#cdbda3";
  ctx.fillRect(-u * 2.2, -u * 0.18, u * 2.2, u * 0.36); // handle
  ctx.fillStyle = "#8a6b4f";
  ctx.fillRect(-u * 0.55, -u * 0.75, u * 1.1, u * 1.5);  // head
  ctx.fillStyle = "#f4e6cf";
  ctx.fillRect(-u * 0.55, -u * 0.75, u * 1.1, u * 0.22);
  ctx.restore();
  if (slamK > 0.5) {
    ctx.fillStyle = `rgba(190,255,120,${(slamK - 0.5) * 0.5})`;
    ctx.fillRect(zs, by - 4, zw, bh + 8);
  }
};

/* ───────────── component ───────────── */

const Game = forwardRef<GameHandle, GameProps>(function Game({ onEnd, onHud, sfx, lots }, ref) {
  const envRef = useRef({ onEnd, onHud, sfx });
  const lotsRef = useRef<Lot[]>(lots);
  useEffect(() => {
    envRef.current = { onEnd, onHud, sfx };
    lotsRef.current = lots;
  }, [onEnd, onHud, sfx, lots]);

  // ── React state: only changes on slams / phase changes ──────
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState<string | null>(null);
  const [goStamp, setGoStamp] = useState(0);
  const [zone, setZone] = useState<Zone>(IDLE_ZONE);
  const [strikes, setStrikes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [bestMult, setBestMult] = useState(1);
  const [multiplier, setMultiplier] = useState(1);
  const [frenzy, setFrenzy] = useState(false);
  const [golden, setGolden] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [lotIdx, setLotIdx] = useState(0);
  const [lotKey, setLotKey] = useState(0); // bumps to retrigger entrance anim
  const [chatter, setChatter] = useState(CHATTER[0]);
  const [shake, setShake] = useState<"" | "hit" | "miss">("");
  const [gavelSlam, setGavelSlam] = useState(0); // bump to retrigger slam anim

  // ── Per-frame / logic refs ──────────────────────────────────
  const phaseRef = useRef<Phase>("idle");
  const runningRef = useRef(false);   // RAF loop alive
  const playingRef = useRef(false);   // slams accepted, needle moving
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const countdownRef = useRef(0);
  const countLabelRef = useRef<string | null>(null);
  const posRef = useRef(0);
  const dirRef = useRef(1);
  const speedRef = useRef(BASE_SPEED);
  const zoneRef = useRef<Zone>(IDLE_ZONE);
  const scoreRef = useRef(0);
  const strikesRef = useRef(0);
  const comboRef = useRef(0);
  const roundRef = useRef(0);
  const bestComboRef = useRef(0);
  const multRef = useRef(1);
  const frenzyHitsRef = useRef(0);
  const goldenRef = useRef(false);
  const bestMultRef = useRef(1);
  const flashIdRef = useRef(0);
  const hudLastRef = useRef(0);
  const hudDirtyRef = useRef(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DOM refs
  const rootRef = useRef<HTMLDivElement | null>(null);
  const meterElRef = useRef<HTMLDivElement | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const scoreElRef = useRef<HTMLDivElement | null>(null);

  // Particle layer
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const particleRafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });

  // Score count-up (writes straight to the DOM, no per-frame state)
  const shownRef = useRef(0);
  const scoreAnimRef = useRef<number | null>(null);
  const animateScore = useCallback((to: number) => {
    if (scoreAnimRef.current != null) cancelAnimationFrame(scoreAnimRef.current);
    const from = shownRef.current;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 350;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      shownRef.current = v;
      if (scoreElRef.current) scoreElRef.current.textContent = v.toLocaleString();
      scoreAnimRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    scoreAnimRef.current = requestAnimationFrame(step);
  }, []);

  // ── Needle sweep loop (delta-timed, frame-rate independent) ─
  const tickRef = useRef<(ts: number) => void>(() => {});
  const tick = useCallback((ts: number) => {
    if (!runningRef.current) return;
    const last = lastRef.current ?? ts;
    lastRef.current = ts;
    // clamp dt so a tab-switch / long frame can't teleport the needle
    const dt = Math.min((ts - last) / 1000, 0.05);

    if (phaseRef.current === "countdown") {
      countdownRef.current -= dt;
      if (countdownRef.current <= 0) {
        phaseRef.current = "playing";
        playingRef.current = true;
        countLabelRef.current = null;
        setCount(null);
        setPhase("playing");
        setGoStamp((g) => g + 1);
        if (goTimer.current) clearTimeout(goTimer.current);
        goTimer.current = setTimeout(() => { goTimer.current = null; setGoStamp(0); }, GO_LEN);
      } else {
        const lbl = String(Math.ceil(countdownRef.current));
        if (lbl !== countLabelRef.current) { countLabelRef.current = lbl; setCount(lbl); }
      }
    }

    if (playingRef.current) {
      let p = posRef.current + dirRef.current * speedRef.current * dt;
      if (p >= 100) { p = 100; dirRef.current = -1; }
      if (p <= 0) { p = 0; dirRef.current = 1; }
      posRef.current = p;
      // Drive the needle straight from the real position (no React state lag), so
      // what's painted is exactly what slam() evaluates — frame-accurate & fair.
      if (markerElRef.current) markerElRef.current.style.transform = `translateX(${p}%)`;
    }

    if (hudDirtyRef.current && ts - hudLastRef.current > 100) {
      hudLastRef.current = ts;
      hudDirtyRef.current = false;
      envRef.current.onHud?.({ score: scoreRef.current, lives: 3 - strikesRef.current });
    }

    rafRef.current = requestAnimationFrame(tickRef.current);
  }, []);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  // ── Particle system (capped, self-cleaning rAF) ─────────────
  const ensureParticleLoop = useCallback(() => {
    if (particleRafRef.current != null) return;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) { particleRafRef.current = null; return; }
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ps = particlesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= 1;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy += 0.35;          // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const a = p.life / p.max;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      if (ps.length > 0) {
        particleRafRef.current = requestAnimationFrame(loop);
      } else {
        particleRafRef.current = null; // stop when idle, no wasted frames
      }
    };
    particleRafRef.current = requestAnimationFrame(loop);
  }, []);

  const burst = useCallback((bull: boolean) => {
    const root = rootRef.current;
    const meter = meterElRef.current;
    if (!root || !meter) return;
    // origin: the needle's spot on the meter, in root-relative CSS px
    const rr = root.getBoundingClientRect();
    const mr = meter.getBoundingClientRect();
    const ox = mr.left - rr.left + (posRef.current / 100) * mr.width;
    const oy = mr.top - rr.top + mr.height / 2;
    const woodChips = ["#6c4d39", "#8a6b4f", "#cdbda3", "#563e2c"];
    const sparks = ["#f59e0b", "#fbbf24", "#5f7a45", "#84cc16", "#fde68a"];
    const palette = bull ? sparks : woodChips;
    const count = Math.min(bull ? 34 : 20, 40); // cap
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI - Math.PI; // upward-ish fan
      const spd = 3 + Math.random() * (bull ? 9 : 6);
      const life = 28 + Math.random() * 26;
      particlesRef.current.push({
        x: ox, y: oy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        life, max: life,
        size: 3 + Math.random() * 5,
        color: palette[(Math.random() * palette.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
      });
    }
    // hard cap total particles to stay light
    if (particlesRef.current.length > 220) {
      particlesRef.current.splice(0, particlesRef.current.length - 220);
    }
    ensureParticleLoop();
  }, [ensureParticleLoop]);

  const triggerShake = useCallback((kind: "hit" | "miss") => {
    setShake(kind);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => { shakeTimer.current = null; setShake(""); }, kind === "miss" ? 360 : 220);
  }, []);

  const newZone = useCallback((width: number) => {
    const start = Math.random() * (100 - width);
    const z = { start, width };
    zoneRef.current = z;
    setZone(z);
  }, []);

  const advanceLot = useCallback(() => {
    const n = (lotsRef.current.length ? lotsRef.current : FALLBACK_LOTS).length;
    setLotIdx((i) => (i + 1) % n);
    setLotKey((k) => k + 1);
    setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
    // Roll the next lot's rarity: a golden lot is worth x3 (the chase).
    const g = Math.random() < GOLDEN_CHANCE;
    goldenRef.current = g;
    setGolden(g);
  }, []);

  // ── Run end: freeze, play the game-over tune, then hand off ─
  const endGame = useCallback(() => {
    runningRef.current = false;
    playingRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastRef.current = null;
    phaseRef.current = "ending";
    setPhase("ending");
    envRef.current.sfx.gameOver();
    const final = Math.min(MAX_RAW_SCORE, Math.round(scoreRef.current));
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => {
      endTimer.current = null;
      phaseRef.current = "over";
      setPhase("over");
      envRef.current.onHud?.({ score: final, lives: 0 });
      envRef.current.onEnd(final);
    }, END_BEAT);
  }, []);

  const slam = useCallback(() => {
    if (!playingRef.current) return;
    const fx = envRef.current.sfx;
    setGavelSlam((g) => g + 1); // fire the gavel slam animation
    const pos = posRef.current;
    const z = zoneRef.current;
    const inZone = pos >= z.start && pos <= z.start + z.width;
    const center = z.start + z.width / 2;
    const bull = inZone && Math.abs(pos - center) <= z.width * BULL_FRAC;
    const id = ++flashIdRef.current;

    if (inZone) {
      const wasGolden = goldenRef.current;
      // Multiplier climbs each clean hit (faster on a bullseye), resets on a miss.
      multRef.current = Math.min(MAX_MULT, multRef.current + (bull ? 2 : 1));
      const mult = multRef.current;
      comboRef.current += 1;
      roundRef.current += 1;
      bestComboRef.current = Math.max(bestComboRef.current, comboRef.current);
      bestMultRef.current = Math.max(bestMultRef.current, mult);

      // Gavel Frenzy: every Nth combo kicks off a short x2 fever with a wider target.
      // The triggering slam announces it; the NEXT four slams get the x2 + wide zone.
      const inFrenzy = frenzyHitsRef.current > 0;
      let startedFrenzy = false;
      if (comboRef.current % FRENZY_EVERY === 0 && frenzyHitsRef.current <= 0) {
        frenzyHitsRef.current = FRENZY_LEN;
        startedFrenzy = true;
      }
      const base = bull ? 200 : 100;
      const pts = base * mult * (wasGolden ? 3 : 1) * (inFrenzy ? 2 : 1);
      scoreRef.current = Math.min(MAX_RAW_SCORE, scoreRef.current + pts);
      if (inFrenzy) frenzyHitsRef.current -= 1;
      hudDirtyRef.current = true;

      animateScore(scoreRef.current);
      setCombo(comboRef.current);
      setRound(roundRef.current);
      setBestCombo(bestComboRef.current);
      setBestMult(bestMultRef.current);
      setMultiplier(mult);
      setFrenzy(frenzyHitsRef.current > 0 || startedFrenzy);

      const milestone = roundRef.current % 10 === 0;
      const label = milestone ? `${roundRef.current} LOTS!`
        : startedFrenzy ? "GAVEL FRENZY! x2"
        : wasGolden ? `GOLDEN! +${pts.toLocaleString()}`
        : bull ? `BULLSEYE! +${pts.toLocaleString()}`
        : `SOLD! +${pts.toLocaleString()}`;
      setFlash({ text: label, tone: (bull || wasGolden || startedFrenzy || milestone) ? "great" : "good", id });

      // juice
      fx.thud();
      // (fanfare is reserved for the shell's new-best jingle)
      if (startedFrenzy || bull || wasGolden) fx.bullseye(comboRef.current);
      else fx.ding(comboRef.current);
      burst(bull || wasGolden || inFrenzy);
      triggerShake("hit");

      // ramp difficulty; frenzy rewards you with a temporarily wider target.
      speedRef.current = Math.min(MAX_SPEED, BASE_SPEED + roundRef.current * SPEED_STEP);
      const baseWidth = Math.max(ZONE_MIN, ZONE_MAX - roundRef.current * ZONE_STEP);
      newZone(frenzyHitsRef.current > 0 ? Math.min(ZONE_MAX, baseWidth + 8) : baseWidth);
      advanceLot();
    } else {
      const nearMiss = Math.min(Math.abs(pos - z.start), Math.abs(pos - (z.start + z.width))) <= NEAR_MISS;
      strikesRef.current += 1;
      comboRef.current = 0;
      multRef.current = 1;
      frenzyHitsRef.current = 0;
      hudDirtyRef.current = true;
      setStrikes(strikesRef.current);
      setCombo(0);
      setMultiplier(1);
      setFrenzy(false);
      const dead = strikesRef.current >= 3;
      setFlash({ text: dead ? "GAVEL DROPPED!" : nearMiss ? "SO CLOSE!" : "MISSED!", tone: "bad", id });
      fx.thud();
      fx.buzz();
      triggerShake("miss");
      if (dead) {
        playingRef.current = false;
        endGame();
      }
    }
  }, [advanceLot, animateScore, burst, endGame, newZone, triggerShake]);

  // ── start / stop (the shell's handle) ───────────────────────
  const stop = useCallback(() => {
    runningRef.current = false;
    playingRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastRef.current = null;
    if (scoreAnimRef.current != null) cancelAnimationFrame(scoreAnimRef.current);
    scoreAnimRef.current = null;
    if (particleRafRef.current != null) cancelAnimationFrame(particleRafRef.current);
    particleRafRef.current = null;
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    if (goTimer.current) clearTimeout(goTimer.current);
    if (endTimer.current) clearTimeout(endTimer.current);
    shakeTimer.current = goTimer.current = endTimer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    envRef.current.sfx.unlock(); // the shell calls start() from the START gesture
    const lotList = lotsRef.current.length ? lotsRef.current : FALLBACK_LOTS;
    scoreRef.current = 0; strikesRef.current = 0; comboRef.current = 0;
    roundRef.current = 0; bestComboRef.current = 0;
    multRef.current = 1; frenzyHitsRef.current = 0; goldenRef.current = false; bestMultRef.current = 1;
    shownRef.current = 0;
    if (scoreElRef.current) scoreElRef.current.textContent = "0";
    particlesRef.current = [];
    hudDirtyRef.current = true;
    hudLastRef.current = 0;
    setStrikes(0); setCombo(0); setRound(0); setBestCombo(0); setBestMult(1);
    setMultiplier(1); setFrenzy(false); setGolden(false); setFlash(null); setShake("");
    setLotIdx(Math.floor(Math.random() * lotList.length));
    setLotKey((k) => k + 1);
    setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
    speedRef.current = BASE_SPEED;
    posRef.current = 0; dirRef.current = 1;
    if (markerElRef.current) markerElRef.current.style.transform = "translateX(0%)";
    newZone(ZONE_MAX);
    phaseRef.current = "countdown";
    countdownRef.current = COUNTDOWN;
    countLabelRef.current = String(COUNTDOWN);
    setCount(String(COUNTDOWN));
    setGoStamp(0);
    setPhase("countdown");
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [stop, newZone]);

  useImperativeHandle(ref, () => ({ start, stop }), [start, stop]);

  // ── Particle canvas sizing (HiDPI-aware, follows the parent) ─
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const resize = () => {
      const r = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();
    return () => ro.disconnect();
  }, []);

  // ── Keyboard: Space/Enter slams while playing; block page scroll ─
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (!playingRef.current) return;
      e.preventDefault();
      if (!e.repeat) slam();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slam]);

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => () => stop(), [stop]);

  const lotList = lots.length ? lots : FALLBACK_LOTS;
  const lot = lotList[lotIdx % lotList.length] ?? lotList[0];
  const bullW = zone.width * BULL_FRAC * 2;
  const live = phase === "playing" || phase === "countdown";
  const frozen = phase === "ending" || phase === "over";
  const showHud = phase !== "idle";

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => { e.preventDefault(); if (!e.isPrimary || e.button !== 0) return; slam(); }}
      className={`gavel-root absolute inset-0 overflow-hidden bg-[#140d08] text-[#f1e7d5] touch-none select-none cursor-pointer ${frenzy ? "frenzy" : ""}`}
    >
      {/* bunting / pennants */}
      <div className="bunting" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="pennant" style={{ ["--i" as string]: i }} />
        ))}
      </div>
      {/* warm spotlight glow + wood podium floor */}
      <div className="spotlight" aria-hidden="true" />
      <div className="floor" aria-hidden="true" />

      {/* particle layer (above stage, below nothing interactive) */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full z-30" aria-hidden="true" />

      <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center px-4 py-3 sm:px-6 ${shake === "hit" ? "shake-hit" : shake === "miss" ? "shake-miss" : ""}`}>
        <div className="w-full max-w-xl flex flex-col gap-2 sm:gap-3">
          {/* HUD */}
          <div className={`grid grid-cols-3 items-center gap-2 min-h-[52px] ${showHud ? "" : "invisible"}`}>
            <div className="text-left">
              <div className="text-[13px] uppercase tracking-wider text-[#d8c19a] font-bold">Score</div>
              <div ref={scoreElRef} className="font-display text-2xl sm:text-3xl font-black text-[#bfe08a] leading-none tabular-nums">0</div>
            </div>
            {/* multiplier + frenzy, the star of the HUD */}
            <div className="flex flex-col items-center">
              <div
                key={multiplier}
                className={`font-display font-black leading-none ${multiplier > 1 ? "text-3xl sm:text-4xl mult-pop" : "text-lg"}`}
                style={multiplier > 1
                  ? { color: "#ffcf5c", textShadow: "0 0 18px rgba(245,158,11,0.8)" }
                  : { color: "#8a7559" }}
              >
                x{multiplier}
              </div>
              <div className="text-[13px] uppercase tracking-wider font-bold text-[#d8c19a]">Multiplier</div>
              {frenzy ? (
                <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-black text-[#fff2cf] px-2.5 py-0.5 rounded-full bg-[#b45309]/60 border border-[#f59e0b]/70 animate-pulse whitespace-nowrap">FRENZY x2</span>
              ) : combo > 1 ? (
                <span className="mt-1 text-[13px] font-bold text-[#e9d9bd]">{combo}x combo</span>
              ) : null}
            </div>
            {/* lives as gavels */}
            <div className="flex justify-end gap-1.5" aria-label={`${3 - strikes} lives left`}>
              {[0, 1, 2].map((i) => (
                <GavelLife key={i} lost={i < strikes} />
              ))}
            </div>
          </div>

          {/* Lot on the block: pedestal card with entrance anim */}
          <div key={lotKey} className={`lot-card relative rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-h-[84px] ${golden ? "golden" : ""}`}>
            <div className="lot-spot" aria-hidden="true" />
            {golden && (
              <span className="golden-badge absolute -top-2.5 right-3 z-10 text-[13px] font-display font-black text-[#5a3a00] px-2.5 py-0.5 rounded-full">
                GOLDEN x3
              </span>
            )}
            <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[#efe3d0] shrink-0 grid place-items-center shadow-md ${golden ? "ring-2 ring-[#f59e0b]" : "ring-2 ring-[#fffdf7]"}`}>
              <LotGlyph />
            </div>
            <div className="relative min-w-0">
              <div className="text-[13px] text-[#8a7559] uppercase tracking-wider font-bold">Lot #{round + 1}</div>
              <div className="font-display font-extrabold text-base sm:text-lg text-[#241a12] leading-snug line-clamp-2">{lot?.title}</div>
              <div className="text-[13px] text-[#6c4d39] italic mt-0.5 truncate">{chatter}</div>
            </div>
          </div>

          {/* Swing meter */}
          <div className="relative">
            <div ref={meterElRef} className="meter relative h-14 rounded-2xl overflow-hidden">
              {/* SOLD zone */}
              <div className="zone absolute top-0 bottom-0" style={{ left: `${zone.start}%`, width: `${zone.width}%` }}>
                <span className="zone-label">SOLD</span>
              </div>
              {/* bullseye core */}
              <div className="bullseye absolute top-0 bottom-0" style={{ left: `${zone.start + zone.width / 2 - zone.width * BULL_FRAC}%`, width: `${bullW}%` }} />
              {/* needle trail + gavel-head needle (GPU transform, driven by the RAF loop) */}
              <div ref={markerElRef} className="marker-wrap absolute top-0 bottom-0 left-0 w-full pointer-events-none" style={{ transform: "translateX(0%)", willChange: "transform" }}>
                <div className="marker-trail" />
                <div className="marker" />
              </div>
            </div>
            {/* tick guides */}
            <div className="flex justify-between text-[13px] text-[#a8997d] font-semibold px-1 mt-1 uppercase tracking-wide">
              <span>Going once</span><span>twice</span><span>SOLD!</span>
            </div>
          </div>

          {/* flash stamp */}
          <div className="relative h-9">
            {flash && <div key={flash.id} className={`stamp ${flash.tone}`}>{flash.text}</div>}
          </div>

          {/* SLAM button (visual; the whole screen is the hit target) while live,
              the run's stats once the gavel has dropped */}
          {frozen ? (
            <div className="flex justify-center gap-2 sm:gap-3 over-in">
              <div className="stat-pill">
                <div className="font-display text-xl sm:text-2xl font-black text-[#6c4d39]">{round}</div>
                <div className="text-[13px] uppercase tracking-wider text-[#8a7559] font-bold">Lots Won</div>
              </div>
              <div className="stat-pill">
                <div className="font-display text-xl sm:text-2xl font-black text-[#b45309]">{bestCombo}x</div>
                <div className="text-[13px] uppercase tracking-wider text-[#8a7559] font-bold">Best Combo</div>
              </div>
              <div className="stat-pill">
                <div className="font-display text-xl sm:text-2xl font-black text-[#c98a00]">x{bestMult}</div>
                <div className="text-[13px] uppercase tracking-wider text-[#8a7559] font-bold">Top Mult</div>
              </div>
            </div>
          ) : (
            <div>
              <div
                role="button"
                aria-label="Slam the gavel"
                aria-disabled={!live}
                className={`slam-btn w-full font-display font-black text-2xl py-4 sm:py-5 rounded-2xl text-white select-none flex items-center justify-center gap-3 ${live ? "" : "opacity-60"}`}
              >
                <span key={gavelSlam} className="gavel-icon"><GavelSvg /></span>
                SLAM!
              </div>
              <p className="text-center text-[#8a7559] text-[13px] mt-2">tap anywhere or press Space</p>
            </div>
          )}
        </div>
      </div>

      {/* 3-2-1 countdown and GO! stamp */}
      {phase === "countdown" && count && (
        <div className="absolute inset-0 z-40 grid place-items-center pointer-events-none">
          <div key={count} className="count font-display font-black text-white text-7xl sm:text-8xl">{count}</div>
        </div>
      )}
      {goStamp > 0 && (
        <div className="absolute inset-0 z-40 grid place-items-center pointer-events-none">
          <div key={goStamp} className="go font-display font-black text-[#ffd54a] text-6xl sm:text-7xl">GO!</div>
        </div>
      )}

      {/* Styles (rustic + premium, all scoped) */}
      <style jsx>{`
        .gavel-root {
          background:
            radial-gradient(120% 90% at 50% -10%, #3a2a1c 0%, #2f2114 45%, #140d08 100%);
        }
        .spotlight {
          position: absolute;
          inset: -20% -10% auto -10%;
          height: 75%;
          background: radial-gradient(60% 75% at 50% 0%, rgba(255,221,150,0.28) 0%, rgba(255,200,120,0.10) 35%, transparent 70%);
          pointer-events: none;
        }
        /* wood podium floor under everything */
        .floor {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 34%;
          background:
            repeating-linear-gradient(90deg, rgba(255,253,247,0.025) 0 2px, transparent 2px 26px),
            linear-gradient(180deg, transparent, rgba(108,77,57,0.45) 60%, rgba(86,62,44,0.6));
          pointer-events: none;
        }

        /* Bunting */
        .bunting {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 26px;
          display: flex;
          justify-content: space-between;
          padding: 0 6px;
          z-index: 15;
          pointer-events: none;
        }
        .pennant {
          width: 0; height: 0;
          border-left: 13px solid transparent;
          border-right: 13px solid transparent;
          border-top: 20px solid;
          animation: sway 3.2s ease-in-out infinite;
          animation-delay: calc(var(--i) * -0.22s);
        }
        .pennant:nth-child(3n+1) { border-top-color: #b45309; }
        .pennant:nth-child(3n+2) { border-top-color: #5f7a45; }
        .pennant:nth-child(3n)   { border-top-color: #cdbda3; }
        @keyframes sway { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(2px) rotate(2deg); } }

        /* Lot card */
        .lot-card {
          background: linear-gradient(180deg, rgba(255,253,247,0.97), rgba(245,236,221,0.95));
          border: 1px solid rgba(255,253,247,0.5);
          box-shadow: 0 14px 30px -16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.7);
          color: #241a12;
          animation: lotIn 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lot-spot {
          position: absolute; inset: -40% 10% auto 10%; height: 120%;
          background: radial-gradient(50% 90% at 50% -10%, rgba(255,221,150,0.5), transparent 70%);
          pointer-events: none;
        }
        @keyframes lotIn {
          from { opacity: 0; transform: translateY(-14px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Meter */
        .meter {
          background: linear-gradient(180deg, #1c130c, #2a1d12);
          border: 1px solid #120b06;
          box-shadow: inset 0 4px 12px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,253,247,0.08);
        }
        .zone {
          background: linear-gradient(180deg, rgba(95,122,69,0.55), rgba(74,98,52,0.7));
          border-left: 2px solid #84cc16;
          border-right: 2px solid #84cc16;
          box-shadow: 0 0 18px rgba(132,204,22,0.5), inset 0 0 14px rgba(132,204,22,0.25);
          display: grid; place-items: center;
        }
        .zone-label {
          font-family: var(--font-bitter), serif;
          font-weight: 900;
          font-size: 11px;
          letter-spacing: 2px;
          color: #eaffd0;
          text-shadow: 0 1px 3px rgba(0,0,0,0.6);
          opacity: 0.9;
        }
        .bullseye {
          background: linear-gradient(180deg, rgba(190,255,120,0.85), rgba(132,204,22,0.95));
          box-shadow: 0 0 20px rgba(190,255,120,0.9), inset 0 0 8px rgba(255,255,255,0.6);
          border-radius: 4px;
          animation: bull 0.9s ease-in-out infinite;
        }
        @keyframes bull { 0%,100% { opacity: 0.75; } 50% { opacity: 1; } }

        .marker {
          position: absolute;
          top: -3px; bottom: -3px;
          left: -3px;
          width: 6px;
          border-radius: 4px;
          background: linear-gradient(180deg, #fffdf7, #e8b563);
          box-shadow: 0 0 12px rgba(255,221,150,0.9), 0 0 2px #000;
        }
        .marker::after { /* gavel-head cap on top of the needle */
          content: "";
          position: absolute;
          top: -9px; left: 50%;
          width: 16px; height: 11px;
          transform: translateX(-50%);
          border-radius: 3px;
          background: linear-gradient(180deg, #8a6b4f, #563e2c);
          box-shadow: 0 1px 3px rgba(0,0,0,0.6);
        }
        .marker-trail {
          position: absolute;
          top: 0; bottom: 0; left: -22px;
          width: 22px;
          background: linear-gradient(90deg, transparent, rgba(255,221,150,0.45));
          filter: blur(1px);
        }

        /* SLAM button */
        .slam-btn {
          background: linear-gradient(180deg, #6f8a4f 0%, #5f7a45 55%, #4a6135 100%);
          box-shadow: 0 9px 0 #38492a, 0 16px 28px -10px rgba(0,0,0,0.55);
          transition: transform 0.07s ease, box-shadow 0.07s ease, filter 0.15s;
        }
        .gavel-root:active .slam-btn { transform: translateY(7px); box-shadow: 0 2px 0 #38492a, 0 6px 12px -6px rgba(0,0,0,0.5); }
        .gavel-icon { display: inline-flex; transform-origin: 80% 80%; animation: slamHit 0.42s cubic-bezier(0.3, 1.4, 0.5, 1); }
        @keyframes slamHit {
          0%   { transform: rotate(-32deg) translateY(-2px); }
          45%  { transform: rotate(14deg) translateY(2px); }
          65%  { transform: rotate(-6deg); }
          100% { transform: rotate(0deg); }
        }

        /* Flash stamp */
        .stamp {
          position: absolute;
          left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          font-family: var(--font-bitter), serif;
          font-weight: 900;
          font-size: 22px;
          letter-spacing: 1px;
          white-space: nowrap;
          padding: 2px 14px;
          border-radius: 8px;
          animation: stampIn 0.9s ease-out forwards;
        }
        .stamp.good { color: #cdeaa0; text-shadow: 0 2px 10px rgba(95,122,69,0.7); }
        .stamp.great { color: #eaffc0; text-shadow: 0 2px 16px rgba(132,204,22,0.9); }
        .stamp.bad { color: #fca5a5; text-shadow: 0 2px 10px rgba(220,38,38,0.6); }
        @keyframes stampIn {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(2) rotate(-14deg); }
          18%  { opacity: 1; transform: translate(-50%, -50%) scale(0.95) rotate(-4deg); }
          32%  { transform: translate(-50%, -50%) scale(1.05) rotate(-3deg); }
          70%  { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-3deg); }
          100% { opacity: 0; transform: translate(-50%, -56%) scale(1) rotate(-3deg); }
        }

        /* Countdown + GO */
        .count {
          text-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 30px rgba(245,158,11,0.5);
          animation: countIn 0.9s ease-out forwards;
        }
        @keyframes countIn {
          0%   { opacity: 0; transform: scale(1.6); }
          20%  { opacity: 1; transform: scale(1); }
          80%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
        .go {
          text-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 36px rgba(255,213,74,0.7);
          animation: goIn 0.7s ease-out forwards;
        }
        @keyframes goIn {
          0%   { opacity: 0; transform: scale(2) rotate(-8deg); }
          25%  { opacity: 1; transform: scale(1) rotate(-3deg); }
          70%  { opacity: 1; transform: scale(1.05) rotate(-3deg); }
          100% { opacity: 0; transform: scale(1.2) rotate(-3deg); }
        }

        /* Screen shake */
        .shake-hit { animation: shakeHit 0.22s ease; }
        .shake-miss { animation: shakeMiss 0.36s ease; }
        @keyframes shakeHit {
          0%,100% { transform: translate(0,0); }
          30% { transform: translate(-3px, 2px); }
          60% { transform: translate(3px, -1px); }
        }
        @keyframes shakeMiss {
          0%,100% { transform: translate(0,0) rotate(0); }
          15% { transform: translate(-7px, 0) rotate(-0.5deg); }
          35% { transform: translate(7px, 0) rotate(0.5deg); }
          55% { transform: translate(-5px, 0); }
          75% { transform: translate(5px, 0); }
        }

        /* Run over: stats */
        .over-in { animation: overIn 0.4s ease-out; }
        @keyframes overIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .stat-pill {
          background: rgba(255,253,247,0.95);
          border: 1px solid rgba(255,253,247,0.5);
          border-radius: 14px;
          padding: 8px 14px;
          min-width: 84px;
          text-align: center;
          box-shadow: 0 8px 18px -10px rgba(0,0,0,0.5);
        }

        /* Multiplier pop */
        .mult-pop { animation: multPop 0.28s cubic-bezier(0.3, 1.5, 0.5, 1); }
        @keyframes multPop { 0% { transform: scale(1.5); } 60% { transform: scale(0.9); } 100% { transform: scale(1); } }

        /* Golden lot */
        .lot-card.golden {
          background: linear-gradient(180deg, #fff7df, #ffe9b0);
          border-color: #f0b429;
          animation: goldShimmer 1.6s ease-in-out infinite, lotIn 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes goldShimmer {
          0%,100% { box-shadow: 0 0 0 2px rgba(245,158,11,0.55), 0 16px 34px -14px rgba(245,158,11,0.5); }
          50%     { box-shadow: 0 0 0 2px rgba(245,158,11,0.95), 0 0 26px 2px rgba(245,158,11,0.55), 0 16px 34px -14px rgba(245,158,11,0.6); }
        }
        .golden-badge {
          background: linear-gradient(180deg, #ffe08a, #f0b429);
          border: 1px solid #b7791f;
          box-shadow: 0 3px 8px -2px rgba(160,110,20,0.6);
        }

        /* Gavel Frenzy fever */
        .frenzy::before {
          content: "";
          position: absolute; inset: 0;
          background: radial-gradient(130% 100% at 50% 50%, rgba(245,158,11,0.24), rgba(245,158,11,0.06) 55%, transparent 75%);
          pointer-events: none; z-index: 6;
          animation: frenzyGlow 0.7s ease-in-out infinite;
        }
        .frenzy::after {
          content: "";
          position: absolute; inset: 0;
          pointer-events: none; z-index: 6;
          /* static shadow; only opacity animates (cheap to composite) */
          box-shadow: inset 0 0 46px rgba(245,158,11,0.5), inset 0 0 0 2px rgba(245,158,11,0.7);
          animation: frenzyEdge 0.7s ease-in-out infinite;
        }
        @keyframes frenzyEdge {
          0%,100% { opacity: 0.5; }
          50%     { opacity: 1; }
        }
        @keyframes frenzyGlow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
          .pennant, .bullseye, .lot-card.golden, .frenzy::before, .frenzy::after, .mult-pop { animation: none !important; }
        }
      `}</style>
    </div>
  );
});

export default Game;

/* ───────────── small presentational helpers ───────────── */

function GavelSvg() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* mallet head */}
      <rect x="11" y="2.5" width="9.5" height="6" rx="1.4" transform="rotate(45 15.75 5.5)" fill="#f4e6cf" stroke="#3f2c1f" strokeWidth="1.2" />
      {/* handle */}
      <rect x="3.5" y="13" width="11" height="2.6" rx="1.3" transform="rotate(45 9 14.3)" fill="#cdbda3" stroke="#3f2c1f" strokeWidth="1.2" />
      {/* sound block */}
      <rect x="13" y="18.5" width="9" height="3" rx="1.2" fill="#f4e6cf" stroke="#3f2c1f" strokeWidth="1.2" />
    </svg>
  );
}

function GavelLife({ lost }: { lost: boolean }) {
  return (
    <span
      className={`grid place-items-center transition-all duration-300 ${lost ? "opacity-30 grayscale scale-90 rotate-[-25deg]" : "scale-100"}`}
      style={lost ? undefined : { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="11" y="2.5" width="9.5" height="6" rx="1.4" transform="rotate(45 15.75 5.5)" fill={lost ? "#8a7559" : "#e8b563"} stroke="#1a120b" strokeWidth="1.3" />
        <rect x="3.5" y="13" width="11" height="2.6" rx="1.3" transform="rotate(45 9 14.3)" fill={lost ? "#6c5b45" : "#cdbda3"} stroke="#1a120b" strokeWidth="1.3" />
      </svg>
    </span>
  );
}

function LotGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#b3a085" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" />
    </svg>
  );
}
