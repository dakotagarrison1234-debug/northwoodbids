"use client";

import { useMemo, useRef, useState } from "react";

export type Entrant = { clerkUserId: string; name: string };
export type DrawResult = { winner: Entrant; prize: { id: string; title: string }; remaining: number };

// Alternating wedge colours; the winning wedge gets the gold highlight.
const COLORS = ["#6c4d39", "#8a6b4f", "#4a7c59", "#b07a3c", "#7a5340", "#5f7f66"];
const WIN_COLOR = "#f0a35a";
const SIZE = 360;
const R = 168;
const CX = SIZE / 2;
const CY = SIZE / 2;

function firstName(n: string) {
  const f = n.trim().split(/\s+/)[0] || n;
  return f.length > 14 ? f.slice(0, 13) + "…" : f;
}

/**
 * The giveaway wheel. EVERY entrant is a wedge — no sampling — so the draw is
 * visibly fair no matter how many names there are. The server picks the winner
 * (authoritative); the wheel then rotates to that entrant's real wedge, and once
 * it slows it zooms into the pointer so you can read the winning wedge even when
 * the wedges are tiny.
 */
export default function SpinWheel({
  entrants,
  canSpin,
  onDraw,
  onLanded,
}: {
  entrants: Entrant[];
  canSpin: boolean;
  onDraw: () => Promise<DrawResult | { error: string }>;
  onLanded: (r: DrawResult) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState("");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The wedges we draw. When a winner falls outside the (capped) list we append them
  // so their wedge still exists to land on.
  const [extra, setExtra] = useState<Entrant | null>(null);
  const segments = useMemo(() => (extra ? [...entrants, extra] : entrants), [entrants, extra]);
  const n = Math.max(segments.length, 1);
  const seg = 360 / n;
  const showText = n <= 30;

  const spin = async () => {
    if (spinning || !canSpin) return;
    setError("");
    setFlash(null);
    setZoom(false);
    setWinnerIdx(null);
    setExtra(null);
    setSpinning(true);

    const res = await onDraw();
    if ("error" in res) {
      setError(res.error);
      setSpinning(false);
      return;
    }

    // Land on the winner's ACTUAL wedge. If they're beyond the drawn list, append them.
    let idx = entrants.findIndex((e) => e.clerkUserId === res.winner.clerkUserId);
    let count = entrants.length;
    if (idx < 0) {
      setExtra(res.winner);
      idx = entrants.length; // appended at the end
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
      setZoom(true); // zoom into the pointer so the tiny winning wedge is readable
      setFlash(res.winner.name);
      onLanded(res);
    }, 4300);
  };

  const winnerName = flash ? firstName(flash) : "";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE + 22, maxWidth: "100%" }}>
        {/* pointer */}
        <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 0 }} aria-hidden>
          <svg width="36" height="32" viewBox="0 0 36 32">
            <path d="M18 32 L4 5 Q18 -4 32 5 Z" fill="#241a12" />
            <circle cx="18" cy="9" r="4" fill="#f0a35a" />
          </svg>
        </div>

        {/* zoom wrapper — scales into the top/pointer once the wheel settles */}
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
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
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
              const isWinner = winnerIdx === i;
              const mid = (i * seg + seg / 2 - 90) * (Math.PI / 180);
              const tx = CX + R * 0.6 * Math.cos(mid);
              const ty = CY + R * 0.6 * Math.sin(mid);
              const rot = i * seg + seg / 2;
              return (
                <g key={e.clerkUserId + i}>
                  <path
                    d={`M${CX},${CY} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`}
                    fill={isWinner ? WIN_COLOR : COLORS[i % COLORS.length]}
                    stroke={isWinner ? "#241a12" : "#f1e7d5"}
                    strokeWidth={isWinner ? 1.4 : n > 60 ? 0.3 : 0.8}
                  />
                  {(showText || isWinner) && (
                    <text
                      x={tx}
                      y={ty}
                      fill={isWinner ? "#241a12" : "#fbf4e6"}
                      fontSize={isWinner ? Math.min(11, Math.max(6, seg * 0.9)) : n > 14 ? 8 : 11}
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
        className="mt-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-black uppercase tracking-wide px-10 py-3.5 rounded-xl text-base disabled:opacity-40 transition-colors"
      >
        {spinning ? "Spinning…" : "Spin"}
      </button>

      {flash && !spinning && (
        <div className="mt-3 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-[#8a7559]">Winner</div>
          <div className="text-3xl font-black text-[#4a7c59]">🎉 {flash}</div>
          <button onClick={() => setZoom(false)} className="mt-1 text-xs text-[#8a7559] underline">
            zoom out
          </button>
        </div>
      )}
      {winnerName && spinning && <span className="sr-only">{winnerName}</span>}
      {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}
    </div>
  );
}
