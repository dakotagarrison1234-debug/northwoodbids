"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Avatar, AVATARS } from "@/app/components/Avatars";

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
];

// Tuning
const BASE_SPEED = 52;      // %/sec at round 1
const SPEED_STEP = 5.5;     // +%/sec per won lot
const MAX_SPEED = 175;
const ZONE_MAX = 28;        // starting zone width (%)
const ZONE_MIN = 8;
const ZONE_STEP = 1.3;

export default function PlayPage() {
  const { isSignedIn } = useUser();

  const [lots, setLots] = useState<Lot[]>(FALLBACK_LOTS);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [yourBest, setYourBest] = useState<number | null>(null);

  const [state, setState] = useState<"idle" | "playing" | "over">("idle");
  const [marker, setMarker] = useState(0);
  const [zone, setZone] = useState({ start: 36, width: ZONE_MAX });
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(0);
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "great" | "bad" } | null>(null);
  const [lotIdx, setLotIdx] = useState(0);
  const [chatter, setChatter] = useState(CHATTER[0]);
  const [submitting, setSubmitting] = useState(false);
  const [finalRank, setFinalRank] = useState<number | null>(null);

  // Animation refs
  const posRef = useRef(0);
  const dirRef = useRef(1);
  const speedRef = useRef(BASE_SPEED);
  const zoneRef = useRef({ start: 36, width: ZONE_MAX });
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  // Logic mirrors (read latest synchronously)
  const scoreRef = useRef(0);
  const strikesRef = useRef(0);
  const comboRef = useRef(0);
  const roundRef = useRef(0);

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

  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastRef.current = null;
    playingRef.current = false;
  };

  const tick = useCallback((ts: number) => {
    if (!playingRef.current) return;
    const last = lastRef.current ?? ts;
    lastRef.current = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    let p = posRef.current + dirRef.current * speedRef.current * dt;
    if (p >= 100) { p = 100; dirRef.current = -1; }
    if (p <= 0) { p = 0; dirRef.current = 1; }
    posRef.current = p;
    setMarker(p);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const newZone = (width: number) => {
    const start = Math.random() * (100 - width);
    const z = { start, width };
    zoneRef.current = z;
    setZone(z);
  };

  const startGame = () => {
    stopLoop();
    scoreRef.current = 0; strikesRef.current = 0; comboRef.current = 0; roundRef.current = 0;
    setScore(0); setStrikes(0); setCombo(0); setRound(0); setFlash(null); setFinalRank(null);
    setLotIdx(Math.floor(Math.random() * lots.length));
    setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
    speedRef.current = BASE_SPEED;
    posRef.current = 0; dirRef.current = 1;
    newZone(ZONE_MAX);
    setState("playing");
    playingRef.current = true;
    rafRef.current = requestAnimationFrame(tick);
  };

  const endGame = useCallback(async (finalScore: number) => {
    stopLoop();
    setState("over");
    if (isSignedIn) {
      setSubmitting(true);
      try {
        const res = await fetch("/api/game/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: finalScore }),
        });
        const d = await res.json();
        if (d.success) setFinalRank(d.rank ?? null);
      } catch { /* ignore */ }
      finally { setSubmitting(false); loadBoard(); }
    }
  }, [isSignedIn, loadBoard]);

  const slam = useCallback(() => {
    if (!playingRef.current) return;
    const pos = posRef.current;
    const z = zoneRef.current;
    const inZone = pos >= z.start && pos <= z.start + z.width;
    const center = z.start + z.width / 2;
    const bull = Math.abs(pos - center) <= z.width * 0.18;

    if (inZone) {
      const c = comboRef.current;
      const pts = (bull ? 250 : 100) + c * 25;
      scoreRef.current += pts;
      comboRef.current = c + 1;
      roundRef.current += 1;
      setScore(scoreRef.current);
      setCombo(comboRef.current);
      setRound(roundRef.current);
      setFlash({ text: bull ? `BULLSEYE!  +${pts}` : `SOLD!  +${pts}`, tone: bull ? "great" : "good" });
      // ramp up
      speedRef.current = Math.min(MAX_SPEED, BASE_SPEED + roundRef.current * SPEED_STEP);
      newZone(Math.max(ZONE_MIN, ZONE_MAX - roundRef.current * ZONE_STEP));
      setLotIdx((i) => (i + 1) % lots.length);
      setChatter(CHATTER[Math.floor(Math.random() * CHATTER.length)]);
    } else {
      strikesRef.current += 1;
      comboRef.current = 0;
      setStrikes(strikesRef.current);
      setCombo(0);
      setFlash({ text: strikesRef.current >= 3 ? "GAVEL DROPPED!" : "Missed it!", tone: "bad" });
      if (strikesRef.current >= 3) {
        playingRef.current = false;
        endGame(scoreRef.current);
      }
    }
  }, [lots.length, endGame]);

  // Keyboard: space / enter to slam, also start
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, slam]);

  useEffect(() => () => stopLoop(), []);

  const lot = lots[lotIdx] ?? lots[0];

  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      <header className="border-b border-[#e3d6bf] px-4 sm:px-6 py-4 flex items-center gap-2 bg-white/90">
        <Link href="/" className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Home</Link>
        <span className="text-[#8a7559]">/</span>
        <h1 className="text-2xl font-extrabold font-display">Auction Arcade</h1>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5 sm:p-7 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-xl font-extrabold">Going Once, Going Twice!</h2>
            </div>
            <p className="text-[#6f5b46] text-sm mb-5">Slam the gavel inside the green <span className="text-green-700 font-semibold">SOLD</span> zone to win the lot. Hit the bullseye for bonus. Three misses and you&apos;re out.</p>

            {state === "idle" && (
              <div className="text-center py-10">
                <div className="flex justify-center mb-4"><Avatar avatarKey={AVATARS[5]?.key} className="w-20 h-20" /></div>
                <p className="text-[#4a3a2b] text-base mb-6">Ready to run the auction block?</p>
                <button onClick={startGame} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-lg px-10 py-4 rounded-xl transition-colors">Start</button>
                <p className="text-[#8a7559] text-xs mt-3">Tip: tap the button or press the spacebar.</p>
              </div>
            )}

            {state === "playing" && (
              <>
                {/* HUD */}
                <div className="flex items-center justify-between mb-4 text-base">
                  <span className="font-bold">Score <span className="text-green-700">{score.toLocaleString()}</span></span>
                  {combo > 1 && <span className="text-[#6c4d39] font-bold">{combo}× combo</span>}
                  <span className="font-semibold">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < strikes ? "text-red-600" : "text-[#cdbda3]"}>✕</span>
                    ))}
                  </span>
                </div>

                {/* Lot on the block */}
                <div className="rounded-xl border border-[#e3d6bf] bg-[#faf5ea] p-4 mb-4 flex items-center gap-4 min-h-[88px]">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#efe3d0] shrink-0 flex items-center justify-center">
                    {lot?.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={lot.photo} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[#b3a085] text-[10px] text-center px-1">No photo</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-[#8a7559] uppercase tracking-wide font-semibold">Lot {round + 1}</div>
                    <div className="font-bold text-[#241a12] leading-snug line-clamp-2">{lot?.title}</div>
                    <div className="text-xs text-[#6c4d39] italic mt-0.5">{chatter}</div>
                  </div>
                </div>

                {/* Swing bar */}
                <div className="relative h-12 rounded-xl bg-[#efe3d0] border border-[#cdbda3] overflow-hidden mb-1">
                  <div className="absolute top-0 bottom-0 bg-green-500/30 border-x border-green-600" style={{ left: `${zone.start}%`, width: `${zone.width}%` }} />
                  <div className="absolute top-0 bottom-0 bg-green-600/40" style={{ left: `${zone.start + zone.width / 2 - zone.width * 0.18}%`, width: `${zone.width * 0.36}%` }} />
                  <div className="absolute top-[-2px] bottom-[-2px] w-1 bg-[#241a12] rounded" style={{ left: `calc(${marker}% - 2px)` }} />
                </div>

                {flash && (
                  <div className={`text-center font-extrabold text-lg my-2 ${flash.tone === "great" ? "text-green-700" : flash.tone === "good" ? "text-[#6c4d39]" : "text-red-600"}`}>{flash.text}</div>
                )}

                <button onClick={slam} className="w-full bg-[#4a3a2b] hover:bg-[#241a12] text-white font-extrabold text-xl py-5 rounded-xl transition-colors mt-2 select-none">
                  SLAM THE GAVEL
                </button>
                <p className="text-center text-[#8a7559] text-xs mt-2">or press spacebar</p>
              </>
            )}

            {state === "over" && (
              <div className="text-center py-8">
                <div className="text-sm text-[#8a7559] uppercase tracking-wider font-semibold">Final score</div>
                <div className="font-display text-5xl font-black text-green-700 my-1">{score.toLocaleString()}</div>
                {isSignedIn ? (
                  <p className="text-[#4a3a2b] text-base mb-5">
                    {submitting ? "Saving…" : finalRank ? `You're #${finalRank} on the board!` : "Score saved."}
                    {yourBest != null && <span className="block text-[#8a7559] text-sm mt-1">Your best: {yourBest.toLocaleString()}</span>}
                  </p>
                ) : (
                  <div className="mb-5">
                    <p className="text-[#4a3a2b] text-base mb-2">Sign in to save your score to the board.</p>
                    <SignInButton mode="modal">
                      <button className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] font-semibold px-5 py-2.5 rounded-xl">Sign in</button>
                    </SignInButton>
                  </div>
                )}
                <button onClick={startGame} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-lg px-10 py-4 rounded-xl transition-colors">Play again</button>
                {lot?.href && (
                  <div className="mt-5 text-sm">
                    <Link href={lot.href} className="text-[#6c4d39] font-semibold underline underline-offset-2">See &quot;{lot.title}&quot; in the real auction →</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#6c4d39]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M8 21h8M12 17v4M6 3h12v8a6 6 0 0 1-12 0V3z" />
              </svg>
              High Scores
            </h2>
            {leaders.length === 0 ? (
              <p className="text-[#8a7559] text-sm">No scores yet — be the first!</p>
            ) : (
              <ol className="space-y-2">
                {leaders.map((l) => (
                  <li key={l.rank} className="flex items-center gap-3">
                    <span className={`w-6 text-center font-bold ${l.rank === 1 ? "text-[#6c4d39]" : "text-[#8a7559]"}`}>{l.rank}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#efe3d0] shrink-0 flex items-center justify-center">
                      {l.avatarKey ? <Avatar avatarKey={l.avatarKey} className="w-full h-full" /> : <span className="text-[#b3a085] text-xs">?</span>}
                    </div>
                    <span className="flex-1 min-w-0 truncate font-medium text-[#241a12]">{l.name}</span>
                    <span className="font-bold text-green-700">{l.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
