"use client";

import { useMemo, useRef, useState } from "react";

export type Entrant = { clerkUserId: string; name: string };
export type DrawResult = { winner: Entrant; prize: { id: string; title: string }; remaining: number };

const COLORS = ["#6c4d39", "#8a6b4f", "#4a7c59", "#b07a3c", "#7a5340", "#5f7f66"];
const WIN_COLOR = "#f0a35a";
// Show a name on EVERY wedge up to this many entrants (fairness); above it the wedges
// are too thin to read anyway and we rely on the end-of-spin zoom + winner card.
const LABEL_ALL_UP_TO = 300;

function firstName(n: string) {
  const f = n.trim().split(/\s+/)[0] || n;
  return f.length > 14 ? f.slice(0, 13) + "…" : f;
}

/**
 * The giveaway wheel. EVERY entrant is a labelled wedge so a crowd can see there's no
 * funny business. The server picks the winner; the wheel rotates to that entrant's real
 * wedge, zooms in so the winning name is readable, and pops a branded winner card that's
 * built to screenshot and share.
 */
export default function SpinWheel({
  entrants,
  canSpin,
  brand,
  giveawayTitle,
  size = 360,
  onDraw,
  onAward,
}: {
  entrants: Entrant[];
  canSpin: boolean;
  brand: string;
  giveawayTitle: string;
  size?: number;
  onDraw: () => Promise<DrawResult | { error: string }>;
  onAward: (r: DrawResult) => Promise<void>;
}) {
  const R = size * 0.47;
  const CX = size / 2;
  const CY = size / 2;

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  // Only true AFTER the wheel stops — keeps the winning wedge from being highlighted
  // (and thus visible) while it's still spinning.
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [error, setError] = useState("");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [extra, setExtra] = useState<Entrant | null>(null);
  const segments = useMemo(() => (extra ? [...entrants, extra] : entrants), [entrants, extra]);
  const n = Math.max(segments.length, 1);
  const seg = 360 / n;
  const labelAll = n <= LABEL_ALL_UP_TO;

  const spin = async () => {
    if (spinning || !canSpin) return;
    setError("");
    setResult(null);
    setZoom(false);
    setWinnerIdx(null);
    setRevealed(false);
    setExtra(null);
    setSpinning(true);

    const res = await onDraw();
    if ("error" in res) {
      setError(res.error);
      setSpinning(false);
      return;
    }

    let idx = entrants.findIndex((e) => e.clerkUserId === res.winner.clerkUserId);
    let count = entrants.length;
    if (idx < 0) {
      setExtra(res.winner);
      idx = entrants.length;
      count = entrants.length + 1;
    }
    setWinnerIdx(idx);

    const segDeg = 360 / count;
    const jitter = (Math.random() - 0.5) * segDeg * 0.5;
    const targetAngle = 360 - (idx * segDeg + segDeg / 2) + jitter;
    const turns = 6 + Math.floor(Math.random() * 3);
    const current = rotation;
    const currentMod = ((current % 360) + 360) % 360;
    const next = current + (360 - currentMod) + turns * 360 + targetAngle;
    setRotation(next);

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setSpinning(false);
      setRevealed(true); // now it's safe to highlight the winning wedge
      setZoom(true);
      setResult(res); // preview only — nothing is awarded until "Done"
    }, 4300);
  };

  // ✕ on the card = discard this winner and spin again (nothing was awarded).
  const respin = () => {
    setResult(null);
    setZoom(false);
    setTimeout(spin, 60);
  };

  // "Done" = commit the win (adds the prize to the winner's orders & pickups).
  const confirmWin = async () => {
    if (!result || awarding) return;
    setAwarding(true);
    try {
      await onAward(result);
      setResult(null);
      setZoom(false);
    } catch {
      setError("Couldn't award the prize. Try again.");
    }
    setAwarding(false);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size + 22, maxWidth: "100%" }}>
        <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 0 }} aria-hidden>
          <svg width="36" height="32" viewBox="0 0 36 32">
            <path d="M18 32 L4 5 Q18 -4 32 5 Z" fill="#241a12" />
            <circle cx="18" cy="9" r="4" fill="#f0a35a" />
          </svg>
        </div>

        <div
          className="absolute inset-0"
          style={{
            top: 16,
            transformOrigin: "50% 14%",
            transform: zoom ? "scale(2.5)" : "scale(1)",
            transition: "transform 700ms cubic-bezier(0.2,0.8,0.2,1)",
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.12,0.72,0.12,1)" : "none",
            }}
          >
            <circle cx={CX} cy={CY} r={R + 5} fill="#241a12" />
            {segments.map((e, i) => {
              const a0 = (i * seg - 90) * (Math.PI / 180);
              const a1 = ((i + 1) * seg - 90) * (Math.PI / 180);
              const x0 = CX + R * Math.cos(a0);
              const y0 = CY + R * Math.sin(a0);
              const x1 = CX + R * Math.cos(a1);
              const y1 = CY + R * Math.sin(a1);
              const large = seg > 180 ? 1 : 0;
              const isWinner = revealed && winnerIdx === i;
              const midDeg = i * seg + seg / 2 - 90;
              const mid = midDeg * (Math.PI / 180);
              const tx = CX + R * 0.55 * Math.cos(mid);
              const ty = CY + R * 0.55 * Math.sin(mid);
              // Run the name ALONG the wedge's spoke (radially) so it follows its
              // section — readable on the left, upside-down on the right, like a
              // real prize wheel.
              const rot = midDeg;
              return (
                <g key={e.clerkUserId + i}>
                  <path
                    d={`M${CX},${CY} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`}
                    fill={isWinner ? WIN_COLOR : COLORS[i % COLORS.length]}
                    stroke={isWinner ? "#241a12" : "#f1e7d5"}
                    strokeWidth={isWinner ? 1.4 : n > 60 ? 0.3 : 0.8}
                  />
                  {(labelAll || isWinner) && (
                    <text
                      x={tx}
                      y={ty}
                      fill={isWinner ? "#241a12" : "#fbf4e6"}
                      fontSize={isWinner ? Math.min(12, Math.max(6, seg * 0.9)) : n > 40 ? 7 : n > 14 ? 9 : 11}
                      fontWeight={isWinner ? 800 : 700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${rot} ${tx} ${ty})`}
                    >
                      {firstName(e.name)}
                    </text>
                  )}
                </g>
              );
            })}
            <circle cx={CX} cy={CY} r="18" fill="#241a12" stroke="#f0a35a" strokeWidth="3" />
          </svg>
        </div>
      </div>

      <div className="text-xs text-[#8a7559] mt-1">{entrants.length.toLocaleString()} names on the wheel</div>

      <button
        onClick={spin}
        disabled={spinning || !canSpin}
        className="mt-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-black uppercase tracking-wide px-12 py-4 rounded-xl text-lg disabled:opacity-40 transition-colors shadow-lg"
      >
        {spinning ? "Spinning…" : "Spin"}
      </button>

      {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}

      {/* ── Winner reveal ────────────────────────────────────────────────────── */}
      {result && !spinning && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center p-4 bg-black/50">
          {/* The card itself is ONLY the shareable winner content — no admin buttons,
              nothing a customer shouldn't see. This is the part you screenshot. */}
          <div className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-[#f3ead6] via-[#fbf4e6] to-[#eaf3ec] border-4 border-[#4a7c59]/30">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#4a7c59]/15 blur-2xl" aria-hidden />
            <div className="relative px-7 pt-8 pb-7 text-center">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7559]">{brand}</div>
              <div className="text-sm font-bold text-[#6f5b46] mt-0.5">{giveawayTitle}</div>

              <div className="my-4 text-6xl">🎉</div>

              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#4a7c59]">Winner</div>
              <div className="font-display text-4xl font-black text-[#241a12] leading-tight mt-1 break-words">
                {result.winner.name}
              </div>

              <div className="mt-4 inline-block rounded-2xl bg-white/70 border border-[#e3d6bf] px-5 py-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7559]">Won</div>
                <div className="text-lg font-black text-[#6c4d39] leading-tight">{result.prize.title}</div>
              </div>

              <div className="mt-4 text-[11px] text-[#8a7559]">
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>

          {/* Admin controls — OUTSIDE the card so they never appear on a screenshot. */}
          <div className="w-full max-w-sm mt-4 flex flex-col gap-2">
            <button
              onClick={confirmWin}
              disabled={awarding}
              className="w-full bg-[#4a7c59] hover:bg-[#3c6449] text-white font-black px-5 py-3.5 rounded-xl text-base disabled:opacity-50 shadow-lg"
            >
              {awarding ? "Awarding…" : "Done — add to their orders"}
            </button>
            <button
              onClick={respin}
              disabled={awarding}
              className="w-full bg-white/10 hover:bg-white/20 text-[#f1e7d5] font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50 border border-white/20"
            >
              Re-spin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
