"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Avatar, AVATARS } from "@/app/components/Avatars";
import { SoundFx } from "./_sound";

type Lot = { id: string; title: string; photo: string | null; href: string | null };
type Leader = { rank: number; name: string; avatarKey: string | null; score: number };

const FALLBACK_LOTS: Lot[] = [
  "Vintage Tractor", "Hay Bale", "Deer Mount", "Rhubarb Pie", "Old Canoe",
  "Cast Iron Skillet", "Bushel of Apples", "Wood Stove", "Mason Jars", "Fishing Rod",
].map((title, i) => ({ id: `fb${i}`, title, photo: null, href: null }));

const CHATTER = [
  "Do I hear it? Goin' once…", "Twenty-five, who'll gimme thirty?",
  "Sold to the bidder in the flannel!", "Comin' up — don't blink now!",
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
const BULL_FRAC = 0.18;     // bullseye = center ± (zone width * this)

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; rot: number; vr: number;
};

export default function PlayPage() {
  const { isSignedIn } = useUser();

  const [lots, setLots] = useState<Lot[]>(FALLBACK_LOTS);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [yourBest, setYourBest] = useState<number | null>(null);

  const [state, setState] = useState<"idle" | "playing" | "over">("idle");
  const [marker, setMarker] = useState(0);
  const [zone, setZone] = useState({ start: 36, width: ZONE_MAX });
  const [displayScore, setDisplayScore] = useState(0); // animated count-up
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "great" | "bad"; id: number } | null>(null);
  const [lotIdx, setLotIdx] = useState(0);
  const [lotKey, setLotKey] = useState(0); // bumps to retrigger entrance anim
  const [chatter, setChatter] = useState(CHATTER[0]);
  const [submitting, setSubmitting] = useState(false);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [shake, setShake] = useState<"" | "hit" | "miss">("");
  const [gavelSlam, setGavelSlam] = useState(0); // bump to retrigger slam anim
  const [muted, setMuted] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("northwood_arcade_muted") === "1");
  const [newBest, setNewBest] = useState(false);

  // ── Animation / logic refs (read latest synchronously) ─────
  const posRef = useRef(0);
  const dirRef = useRef(1);
  const speedRef = useRef(BASE_SPEED);
  const zoneRef = useRef({ start: 36, width: ZONE_MAX });
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const strikesRef = useRef(0);
  const comboRef = useRef(0);
  const roundRef = useRef(0);
  const bestComboRef = useRef(0);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Particle layer
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const particleRafRef = useRef<number | null>(null);

  // Sound (single instance for the page's lifetime; created in an effect
  // so we never touch the ref's value during render). Initial mute state is
  // read straight from localStorage so we don't need a setState-in-effect.
  const sfxRef = useRef<SoundFx | null>(null);
  useEffect(() => {
    const fx = new SoundFx();
    sfxRef.current = fx;
    return () => { fx.close(); sfxRef.current = null; };
  }, []);

  const loadBoard = useCallback(() => {
    fetch("/api/game/leaderboard")
      .then((r) => r.json())
      .then((d) => { setLeaders(d.leaders ?? []); setYourBest(d.you?.best ?? null); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBoard();
    fetch("/api/game/items")
      .then((r) => r.json())
      .then((d) => { if (d.lots && d.lots.length >= 4) setLots(d.lots); })
      .catch(() => {});
  }, [loadBoard]);

  // ── Marker sweep loop (delta-timed → frame-rate independent) ─
  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastRef.current = null;
    playingRef.current = false;
  }, []);

  // Hold the rAF callback in a ref so the loop can re-schedule itself
  // without the function referencing its own (not-yet-declared) binding.
  const tickRef = useRef<(ts: number) => void>(() => {});
  const tick = useCallback((ts: number) => {
    if (!playingRef.current) return;
    const last = lastRef.current ?? ts;
    lastRef.current = ts;
    // clamp dt so a tab-switch / long frame can't teleport the marker
    const dt = Math.min((ts - last) / 1000, 0.05);
    let p = posRef.current + dirRef.current * speedRef.current * dt;
    if (p >= 100) { p = 100; dirRef.current = -1; }
    if (p <= 0) { p = 0; dirRef.current = 1; }
    posRef.current = p;
    setMarker(p);
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, []);
  // keep the self-scheduling ref pointed at the latest tick (set off-render)
  useEffect(() => { tickRef.current = tick; }, [tick]);

  // ── Score count-up animation ────────────────────────────────
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = displayScore;
    const to = score;
    if (from === to) return;
    const dur = 350;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  // ── Particle system (capped, self-cleaning rAF) ─────────────
  const ensureParticleLoop = useCallback(() => {
    if (particleRafRef.current != null) return;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) { particleRafRef.current = null; return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        particleRafRef.current = null; // stop when idle → no wasted frames
      }
    };
    particleRafRef.current = requestAnimationFrame(loop);
  }, []);

  const burst = useCallback((bull: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width, h = canvas.height;
    // origin near the meter (vertical center of the play area)
    const ox = (marker / 100) * w;
    const oy = h * 0.62;
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
  }, [marker, ensureParticleLoop]);

  const confetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const colors = ["#5f7a45", "#f59e0b", "#6c4d39", "#84cc16", "#fbbf24", "#fffdf7"];
    for (let i = 0; i < 80; i++) {
      const life = 70 + Math.random() * 50;
      particlesRef.current.push({
        x: Math.random() * w,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 4,
        vy: 1 + Math.random() * 3,
        life, max: life,
        size: 4 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.5,
      });
    }
    ensureParticleLoop();
  }, [ensureParticleLoop]);

  // keep canvas backing-store sized to its display box (HiDPI-aware)
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(r.width));
    canvas.height = Math.max(1, Math.floor(r.height));
  }, []);
  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas, state]);

  const triggerShake = (kind: "hit" | "miss") => {
    setShake(kind);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(""), kind === "miss" ? 360 : 220);
  };

  const newZone = (width: number) => {
    const start = Math.random() * (100 - width);
    const z = { start, width };
    zoneRef.current = z;
    setZone(z);
  };

  const advanceLot = useCallback(() => {
    setLotIdx((i) => (i + 1) % lots.length);
    setLotKey((k) => k + 1);
    setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
  }, [lots.length]);

  const startGame = useCallback(() => {
    sfxRef.current?.unlock(); // unlock audio inside the gesture
    stopLoop();
    scoreRef.current = 0; strikesRef.current = 0; comboRef.current = 0;
    roundRef.current = 0; bestComboRef.current = 0;
    setScore(0); setDisplayScore(0); setStrikes(0); setCombo(0); setRound(0);
    setBestCombo(0); setFlash(null); setFinalRank(null); setNewBest(false);
    setLotIdx(Math.floor(Math.random() * lots.length));
    setLotKey((k) => k + 1);
    setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
    speedRef.current = BASE_SPEED;
    posRef.current = 0; dirRef.current = 1;
    newZone(ZONE_MAX);
    setState("playing");
    playingRef.current = true;
    // size canvas after the playing layout mounts
    requestAnimationFrame(() => { sizeCanvas(); });
    rafRef.current = requestAnimationFrame(tick);
  }, [lots.length, stopLoop, tick, sizeCanvas]);

  const endGame = useCallback(async (finalScore: number) => {
    stopLoop();
    setState("over");
    sfxRef.current?.gameOver();
    const isBest = yourBest == null || finalScore > yourBest;
    if (isSignedIn) {
      setSubmitting(true);
      try {
        const res = await fetch("/api/game/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: finalScore }),
        });
        const d = await res.json();
        if (d.success) {
          setFinalRank(d.rank ?? null);
          const beat = d.best != null ? finalScore >= d.best : isBest;
          if (beat && finalScore > 0) {
            setNewBest(true);
            setTimeout(() => { confetti(); sfxRef.current?.fanfare(); }, 250);
          }
        }
      } catch { /* ignore */ }
      finally { setSubmitting(false); loadBoard(); }
    }
  }, [isSignedIn, loadBoard, yourBest, stopLoop, confetti]);

  const slam = useCallback(() => {
    if (!playingRef.current) return;
    setGavelSlam((g) => g + 1); // fire the gavel slam animation
    const pos = posRef.current;
    const z = zoneRef.current;
    const inZone = pos >= z.start && pos <= z.start + z.width;
    const center = z.start + z.width / 2;
    const bull = inZone && Math.abs(pos - center) <= z.width * BULL_FRAC;
    const id = Date.now();

    if (inZone) {
      const c = comboRef.current;
      const pts = (bull ? 250 : 100) + c * 25;
      scoreRef.current += pts;
      comboRef.current = c + 1;
      roundRef.current += 1;
      bestComboRef.current = Math.max(bestComboRef.current, comboRef.current);
      setScore(scoreRef.current);
      setCombo(comboRef.current);
      setRound(roundRef.current);
      setBestCombo(bestComboRef.current);
      setFlash({ text: bull ? `BULLSEYE!  +${pts}` : `SOLD!  +${pts}`, tone: bull ? "great" : "good", id });
      // juice
      sfxRef.current?.thud();
      if (bull) sfxRef.current?.bullseye(c); else sfxRef.current?.ding(c);
      burst(bull);
      triggerShake("hit");
      // ramp difficulty
      speedRef.current = Math.min(MAX_SPEED, BASE_SPEED + roundRef.current * SPEED_STEP);
      newZone(Math.max(ZONE_MIN, ZONE_MAX - roundRef.current * ZONE_STEP));
      advanceLot();
    } else {
      strikesRef.current += 1;
      comboRef.current = 0;
      setStrikes(strikesRef.current);
      setCombo(0);
      const dead = strikesRef.current >= 3;
      setFlash({ text: dead ? "GAVEL DROPPED!" : "MISSED!", tone: "bad", id });
      sfxRef.current?.thud();
      sfxRef.current?.buzz();
      triggerShake("miss");
      if (dead) {
        playingRef.current = false;
        endGame(scoreRef.current);
      }
    }
  }, [advanceLot, endGame, burst]);

  // ── Keyboard: Space/Enter to slam or start; block page scroll ─
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (state === "playing") slam();
        else startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, slam, startGame]);

  // ── Cleanup on unmount: cancel rAFs, timers, close audio ────
  useEffect(() => {
    return () => {
      stopLoop();
      if (particleRafRef.current) cancelAnimationFrame(particleRafRef.current);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      sfxRef.current?.close();
    };
  }, [stopLoop]);

  const toggleMute = () => {
    sfxRef.current?.unlock();
    setMuted(sfxRef.current?.toggleMute() ?? false);
  };

  const lot = lots[lotIdx] ?? lots[0];
  const bullW = zone.width * BULL_FRAC * 2;
  const comboPct = Math.min(100, (combo / 10) * 100);

  return (
    <div className="min-h-screen text-[#241a12] arcade-root">
      <header className="border-b border-[#e3d6bf] px-4 sm:px-6 py-4 flex items-center gap-2 bg-[#fffdf7]/85 backdrop-blur relative z-20">
        <Link href="/" className="text-[#6c4d39] hover:text-[#241a12] text-base font-semibold shrink-0">← Home</Link>
        <span className="text-[#8a7559]">/</span>
        <h1 className="text-2xl font-extrabold font-display">Auction Arcade</h1>
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          aria-pressed={muted}
          className="ml-auto w-10 h-10 rounded-full grid place-items-center text-[#6c4d39] hover:text-[#241a12] hover:bg-[#efe3d0] transition-colors"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m22 9-6 6M16 9l6 6" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
            </svg>
          )}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* ── Game column ── */}
        <div className="lg:col-span-2">
          <div className={`stage relative overflow-hidden rounded-3xl ${shake === "hit" ? "shake-hit" : shake === "miss" ? "shake-miss" : ""}`}>
            {/* bunting / pennants */}
            <div className="bunting" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="pennant" style={{ ["--i" as string]: i }} />
              ))}
            </div>
            {/* warm spotlight glow */}
            <div className="spotlight" aria-hidden="true" />

            {/* particle layer (above stage, below buttons) */}
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full z-30" aria-hidden="true" />

            <div className="relative z-20 p-5 sm:p-7 pt-9">
              <div className="text-center mb-1">
                <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tight title-glow">Going Once, Going Twice!</h2>
              </div>

              {/* ── IDLE / START SCREEN ── */}
              {state === "idle" && (
                <div className="text-center py-8 sm:py-12">
                  <div className="flex justify-center mb-5">
                    <div className="bob relative">
                      <div className="absolute inset-0 rounded-full bg-[#f59e0b]/25 blur-xl scale-110" />
                      <Avatar avatarKey={AVATARS[5]?.key} className="relative w-24 h-24 drop-shadow-lg" />
                    </div>
                  </div>
                  <p className="text-[#4a3a2b] text-base sm:text-lg mb-1 font-medium">Run the auction block!</p>
                  <p className="text-[#6c4d39] text-sm mb-7 max-w-sm mx-auto">
                    Slam the gavel inside the green <span className="text-[#5f7a45] font-bold">SOLD</span> zone to win each lot.
                    Nail the bullseye for bonus, stack your combo, and don&apos;t miss thrice.
                  </p>
                  <button onClick={startGame} className="start-btn font-display font-black text-xl px-12 py-4 rounded-2xl text-white">
                    START
                  </button>
                  <p className="text-[#8a7559] text-xs mt-4">Tap the button or press <kbd className="kbd">Space</kbd></p>
                </div>
              )}

              {/* ── PLAYING SCREEN ── */}
              {state === "playing" && (
                <>
                  {/* HUD */}
                  <div className="grid grid-cols-3 items-center gap-2 mb-4 mt-3">
                    <div className="text-left">
                      <div className="text-[10px] uppercase tracking-widest text-[#8a7559] font-bold">Score</div>
                      <div className="font-display text-2xl sm:text-3xl font-black text-[#3f5230] leading-none tabular-nums">{displayScore.toLocaleString()}</div>
                    </div>
                    {/* combo flame meter */}
                    <div className="flex flex-col items-center">
                      <div className={`text-sm font-black ${combo > 1 ? "text-[#b45309]" : "text-[#cdbda3]"} transition-colors`}>
                        {combo > 1 ? `${combo}× COMBO` : "COMBO"}
                      </div>
                      <div className="w-full max-w-[120px] h-2.5 rounded-full bg-[#e6d8bf] overflow-hidden mt-1 border border-[#d8c7a6]">
                        <div className="h-full rounded-full combo-fill" style={{ width: `${comboPct}%` }} />
                      </div>
                      {combo >= 3 && <span className="flame text-base leading-none mt-0.5" aria-hidden="true">🔥</span>}
                    </div>
                    {/* lives as gavels */}
                    <div className="flex justify-end gap-1.5" aria-label={`${3 - strikes} lives left`}>
                      {[0, 1, 2].map((i) => (
                        <GavelLife key={i} lost={i < strikes} />
                      ))}
                    </div>
                  </div>

                  {/* Lot on the block — pedestal card with entrance anim */}
                  <div key={lotKey} className="lot-card relative rounded-2xl p-4 mb-5 flex items-center gap-4 min-h-[92px]">
                    <div className="lot-spot" aria-hidden="true" />
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-[#efe3d0] shrink-0 grid place-items-center ring-2 ring-[#fffdf7] shadow-md">
                      {lot?.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={lot.photo} alt="" className="w-full h-full object-cover" />
                        : <LotGlyph />}
                    </div>
                    <div className="relative min-w-0">
                      <div className="text-[10px] text-[#8a7559] uppercase tracking-widest font-bold">Lot #{round + 1}</div>
                      <div className="font-display font-extrabold text-lg text-[#241a12] leading-snug line-clamp-2">{lot?.title}</div>
                      <div className="text-xs text-[#6c4d39] italic mt-0.5">{chatter}</div>
                    </div>
                  </div>

                  {/* Swing meter */}
                  <div className="relative mb-2">
                    <div className="meter relative h-14 rounded-2xl overflow-hidden">
                      {/* SOLD zone */}
                      <div className="zone absolute top-0 bottom-0" style={{ left: `${zone.start}%`, width: `${zone.width}%` }}>
                        <span className="zone-label">SOLD</span>
                      </div>
                      {/* bullseye core */}
                      <div className="bullseye absolute top-0 bottom-0" style={{ left: `${zone.start + zone.width / 2 - zone.width * BULL_FRAC}%`, width: `${bullW}%` }} />
                      {/* marker trail + gavel-head marker (GPU transform) */}
                      <div className="marker-wrap absolute top-0 bottom-0 left-0 w-full pointer-events-none" style={{ transform: `translateX(${marker}%)`, willChange: "transform" }}>
                        <div className="marker-trail" />
                        <div className="marker" />
                      </div>
                    </div>
                    {/* center tick guides */}
                    <div className="flex justify-between text-[9px] text-[#a8997d] font-semibold px-1 mt-1 uppercase tracking-wide">
                      <span>Going once</span><span>twice</span><span>SOLD!</span>
                    </div>
                  </div>

                  {/* flash stamp */}
                  {flash && (
                    <div className="relative h-9 my-1">
                      <div key={flash.id} className={`stamp ${flash.tone}`}>{flash.text}</div>
                    </div>
                  )}

                  {/* SLAM button with SVG gavel */}
                  <button
                    onClick={slam}
                    aria-label="Slam the gavel"
                    className="slam-btn group w-full font-display font-black text-2xl py-5 rounded-2xl text-white mt-2 select-none flex items-center justify-center gap-3"
                  >
                    <span key={gavelSlam} className="gavel-icon"><GavelSvg /></span>
                    SLAM!
                  </button>
                  <p className="text-center text-[#8a7559] text-xs mt-2">tap, click the stage, or press <kbd className="kbd">Space</kbd></p>
                </>
              )}

              {/* ── GAME OVER SCREEN ── */}
              {state === "over" && (
                <div className="text-center py-6 sm:py-8 over-in">
                  <div className="text-xs text-[#8a7559] uppercase tracking-widest font-bold">Final Score</div>
                  <div className="font-display text-6xl font-black text-[#3f5230] my-1 tabular-nums">{score.toLocaleString()}</div>

                  {newBest && (
                    <div className="best-badge inline-flex items-center gap-1.5 font-display font-black text-[#b45309] text-sm mb-2">
                      ⭐ NEW PERSONAL BEST!
                    </div>
                  )}

                  {/* stats */}
                  <div className="flex justify-center gap-3 my-4">
                    <div className="stat-pill">
                      <div className="font-display text-2xl font-black text-[#6c4d39]">{round}</div>
                      <div className="text-[10px] uppercase tracking-widest text-[#8a7559] font-bold">Lots Won</div>
                    </div>
                    <div className="stat-pill">
                      <div className="font-display text-2xl font-black text-[#b45309]">{bestCombo}×</div>
                      <div className="text-[10px] uppercase tracking-widest text-[#8a7559] font-bold">Best Combo</div>
                    </div>
                  </div>

                  {isSignedIn ? (
                    <p className="text-[#4a3a2b] text-base mb-5">
                      {submitting ? "Saving…" : finalRank ? `You're #${finalRank} on the board!` : "Score saved."}
                      {yourBest != null && <span className="block text-[#8a7559] text-sm mt-1">Your best: {yourBest.toLocaleString()}</span>}
                    </p>
                  ) : (
                    <div className="mb-5">
                      <p className="text-[#4a3a2b] text-base mb-2">Sign in to save your score to the board.</p>
                      <SignInButton mode="modal">
                        <button className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] font-semibold px-5 py-2.5 rounded-xl">Sign in to save your score</button>
                      </SignInButton>
                    </div>
                  )}

                  <button onClick={startGame} className="start-btn font-display font-black text-xl px-12 py-4 rounded-2xl text-white">
                    Play Again
                  </button>

                  {lot?.href && (
                    <div className="mt-5 text-sm">
                      <Link href={lot.href} className="text-[#6c4d39] font-semibold underline underline-offset-2 hover:text-[#241a12]">
                        See &quot;{lot.title}&quot; in the real auction →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* full-stage click target while playing (sits below HUD content) */}
            {state === "playing" && (
              <button
                onClick={slam}
                aria-label="Slam the gavel"
                tabIndex={-1}
                className="absolute inset-0 z-10 cursor-pointer"
              />
            )}
          </div>
        </div>

        {/* ── Leaderboard ── */}
        <div>
          <div className="board rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-black mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#b45309]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M8 21h8M12 17v4M6 3h12v8a6 6 0 0 1-12 0V3z" />
              </svg>
              High Scores
            </h2>
            {leaders.length === 0 ? (
              <p className="text-[#8a7559] text-sm">No scores yet — be the first!</p>
            ) : (
              <ol className="space-y-1.5">
                {leaders.map((l) => (
                  <li key={l.rank} className={`board-row flex items-center gap-3 rounded-xl px-2.5 py-2 ${l.rank === 1 ? "first" : ""}`}>
                    <span className={`w-6 text-center font-display font-black ${l.rank === 1 ? "text-[#b45309]" : l.rank <= 3 ? "text-[#6c4d39]" : "text-[#a8997d]"}`}>
                      {l.rank === 1 ? "👑" : l.rank}
                    </span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#efe3d0] shrink-0 grid place-items-center ring-1 ring-[#e3d6bf]">
                      {l.avatarKey ? <Avatar avatarKey={l.avatarKey} className="w-full h-full" /> : <span className="text-[#b3a085] text-xs">?</span>}
                    </div>
                    <span className="flex-1 min-w-0 truncate font-semibold text-[#241a12]">{l.name}</span>
                    <span className="font-display font-black text-[#3f5230] tabular-nums">{l.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
            {isSignedIn && yourBest != null && (
              <div className="mt-4 pt-4 border-t border-[#e3d6bf] flex items-center justify-between text-sm">
                <span className="text-[#8a7559] font-semibold uppercase tracking-wide text-xs">Your best</span>
                <span className="font-display font-black text-[#3f5230]">{yourBest.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Styles (rustic + premium, all scoped) ── */}
      <style jsx>{`
        .arcade-root {
          background:
            radial-gradient(1200px 500px at 50% -120px, #fbf3e2 0%, #f1e7d5 55%, #ebdfc8 100%);
          min-height: 100vh;
        }
        .kbd {
          display: inline-block;
          padding: 1px 7px;
          border-radius: 6px;
          background: #fffdf7;
          border: 1px solid #cdbda3;
          box-shadow: 0 1px 0 #cdbda3;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          color: #4a3a2b;
        }

        /* ── Stage ── */
        .stage {
          background:
            radial-gradient(120% 90% at 50% -10%, #3a2a1c 0%, #2f2114 45%, #241a12 100%);
          border: 1px solid #1a120b;
          box-shadow:
            0 30px 60px -25px rgba(36,26,18,0.55),
            inset 0 1px 0 rgba(255,253,247,0.06);
          color: #f1e7d5;
        }
        .stage :global(h2.title-glow) {
          color: #f6ecd8;
          text-shadow: 0 2px 18px rgba(245,158,11,0.35), 0 1px 0 #1a120b;
        }
        .spotlight {
          position: absolute;
          inset: -20% -10% auto -10%;
          height: 75%;
          background: radial-gradient(60% 75% at 50% 0%, rgba(255,221,150,0.28) 0%, rgba(255,200,120,0.10) 35%, transparent 70%);
          pointer-events: none;
        }

        /* wood podium floor under everything */
        .stage::after {
          content: "";
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 34%;
          background:
            repeating-linear-gradient(90deg, rgba(255,253,247,0.025) 0 2px, transparent 2px 26px),
            linear-gradient(180deg, transparent, rgba(108,77,57,0.45) 60%, rgba(86,62,44,0.6));
          pointer-events: none;
          z-index: 0;
        }

        /* ── Bunting ── */
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
          filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));
          animation: sway 3.2s ease-in-out infinite;
          animation-delay: calc(var(--i) * -0.22s);
        }
        .pennant:nth-child(3n+1) { border-top-color: #b45309; }
        .pennant:nth-child(3n+2) { border-top-color: #5f7a45; }
        .pennant:nth-child(3n)   { border-top-color: #cdbda3; }
        @keyframes sway { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(2px) rotate(2deg); } }

        /* ── Start button ── */
        .start-btn {
          background: linear-gradient(180deg, #7a5740 0%, #6c4d39 55%, #563e2c 100%);
          box-shadow: 0 8px 0 #3f2c1f, 0 14px 24px -8px rgba(0,0,0,0.5);
          transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.15s;
          animation: pulse 2.2s ease-in-out infinite;
        }
        .start-btn:hover { filter: brightness(1.07); }
        .start-btn:active { transform: translateY(6px); box-shadow: 0 2px 0 #3f2c1f, 0 6px 12px -6px rgba(0,0,0,0.5); }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }

        /* mascot bob */
        .bob { animation: bob 2.4s ease-in-out infinite; }
        @keyframes bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-9px) rotate(2deg); } }

        /* ── Lot card ── */
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

        /* ── Meter ── */
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

        .marker-wrap { /* width 0; children positioned relative to the swept point */ }
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

        /* ── Combo fill ── */
        .combo-fill {
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          box-shadow: 0 0 10px rgba(245,158,11,0.7);
          transition: width 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .flame { animation: flick 0.5s ease-in-out infinite alternate; }
        @keyframes flick { from { transform: translateY(0) scale(1); } to { transform: translateY(-2px) scale(1.15); } }

        /* ── SLAM button ── */
        .slam-btn {
          background: linear-gradient(180deg, #6f8a4f 0%, #5f7a45 55%, #4a6135 100%);
          box-shadow: 0 9px 0 #38492a, 0 16px 28px -10px rgba(0,0,0,0.55);
          transition: transform 0.07s ease, box-shadow 0.07s ease, filter 0.15s;
        }
        .slam-btn:hover { filter: brightness(1.06); }
        .slam-btn:active { transform: translateY(7px); box-shadow: 0 2px 0 #38492a, 0 6px 12px -6px rgba(0,0,0,0.5); }
        .gavel-icon { display: inline-flex; transform-origin: 80% 80%; animation: slamHit 0.42s cubic-bezier(0.3, 1.4, 0.5, 1); }
        @keyframes slamHit {
          0%   { transform: rotate(-32deg) translateY(-2px); }
          45%  { transform: rotate(14deg) translateY(2px); }
          65%  { transform: rotate(-6deg); }
          100% { transform: rotate(0deg); }
        }

        /* ── Flash stamp ── */
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

        /* ── Screen shake ── */
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

        /* ── Game over ── */
        .over-in { animation: overIn 0.4s ease-out; }
        @keyframes overIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .stat-pill {
          background: rgba(255,253,247,0.95);
          border: 1px solid rgba(255,253,247,0.5);
          border-radius: 14px;
          padding: 8px 18px;
          min-width: 92px;
          box-shadow: 0 8px 18px -10px rgba(0,0,0,0.5);
        }
        .best-badge { animation: pop 0.5s ease-out; }
        @keyframes pop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }

        /* ── Leaderboard ── */
        .board {
          background: linear-gradient(180deg, #fffdf7, #f7efe0);
          border: 1px solid #e3d6bf;
          box-shadow: 0 16px 40px -22px rgba(36,26,18,0.4);
        }
        .board-row { transition: background 0.15s; }
        .board-row:hover { background: #f3e9d6; }
        .board-row.first {
          background: linear-gradient(90deg, rgba(245,158,11,0.16), rgba(245,158,11,0.04));
          box-shadow: inset 0 0 0 1px rgba(245,158,11,0.35);
        }

        @media (prefers-reduced-motion: reduce) {
          .start-btn, .bob, .pennant, .bullseye, .flame { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Small presentational helpers ── */

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
