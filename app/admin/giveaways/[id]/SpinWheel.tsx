"use client";

import { useRef, useState } from "react";

export type Entrant = { clerkUserId: string; name: string };
export type DrawResult = { winner: Entrant; prize: { id: string; title: string }; remaining: number };

// Alternating wedge colours (Northwood browns + a pop of green/gold).
const COLORS = ["#6c4d39", "#8a6b4f", "#4a7c59", "#b07a3c", "#7a5340", "#5f7f66"];
const MAX_SEG = 16; // readable wedge count; large pools sample down but still land true

function firstName(n: string) {
  const f = n.trim().split(/\s+/)[0] || n;
  return f.length > 12 ? f.slice(0, 11) + "…" : f;
}

/**
 * The giveaway wheel. Calling `onDraw` asks the SERVER for the winner (authoritative),
 * then the wheel is built so its landing wedge shows that winner and it animates to
 * rest on them. For pools bigger than the wedge count we sample names for show but
 * still plant the real winner on the landing wedge.
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
  const [names, setNames] = useState<string[]>(() =>
    entrants.slice(0, MAX_SEG).map((e) => firstName(e.name))
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState("");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep an idle wheel populated with current names.
  const idleNames = entrants.slice(0, MAX_SEG).map((e) => firstName(e.name));
  const shown = spinning ? names : idleNames.length ? idleNames : ["—"];
  const n = Math.max(shown.length, 1);
  const seg = 360 / n;

  const spin = async () => {
    if (spinning || !canSpin) return;
    setError("");
    setFlash(null);
    setSpinning(true);

    const res = await onDraw();
    if ("error" in res) {
      setError(res.error);
      setSpinning(false);
      return;
    }

    // Build the display wedges with the winner planted on a target wedge.
    const winnerName = firstName(res.winner.name);
    let display: string[];
    let targetIndex: number;
    if (entrants.length <= MAX_SEG) {
      display = entrants.map((e) => firstName(e.name));
      targetIndex = Math.max(0, entrants.findIndex((e) => e.clerkUserId === res.winner.clerkUserId));
    } else {
      const sample = [...entrants].sort(() => Math.random() - 0.5).slice(0, MAX_SEG).map((e) => firstName(e.name));
      targetIndex = Math.floor(Math.random() * MAX_SEG);
      sample[targetIndex] = winnerName;
      display = sample;
    }
    setNames(display);

    const count = display.length;
    const segDeg = 360 / count;
    // Bring the target wedge centre under the top pointer, plus a few full spins and
    // a small within-wedge jitter so it doesn't always stop dead-centre.
    const jitter = (Math.random() - 0.5) * segDeg * 0.6;
    const targetAngle = 360 - (targetIndex * segDeg + segDeg / 2) + jitter;
    const turns = 6 + Math.floor(Math.random() * 3);
    const current = rotation;
    const currentMod = ((current % 360) + 360) % 360;
    const next = current + (360 - currentMod) + turns * 360 + targetAngle;
    setRotation(next);

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setSpinning(false);
      setFlash(res.winner.name);
      onLanded(res);
    }, 4200);
  };

  const R = 150;
  const cx = 160;
  const cy = 160;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 320, height: 340 }}>
        {/* pointer */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: 2 }}
          aria-hidden
        >
          <svg width="34" height="30" viewBox="0 0 34 30">
            <path d="M17 30 L3 4 Q17 -4 31 4 Z" fill="#241a12" />
            <circle cx="17" cy="8" r="4" fill="#f0a35a" />
          </svg>
        </div>

        <svg
          width="320"
          height="320"
          viewBox="0 0 320 320"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(0.15,0.75,0.15,1)" : "none",
          }}
        >
          <circle cx={cx} cy={cy} r={R + 6} fill="#241a12" />
          {shown.map((label, i) => {
            const a0 = (i * seg - 90) * (Math.PI / 180);
            const a1 = ((i + 1) * seg - 90) * (Math.PI / 180);
            const x0 = cx + R * Math.cos(a0);
            const y0 = cy + R * Math.sin(a0);
            const x1 = cx + R * Math.cos(a1);
            const y1 = cy + R * Math.sin(a1);
            const large = seg > 180 ? 1 : 0;
            const mid = (i * seg + seg / 2 - 90) * (Math.PI / 180);
            const tx = cx + R * 0.62 * Math.cos(mid);
            const ty = cy + R * 0.62 * Math.sin(mid);
            const rot = i * seg + seg / 2;
            return (
              <g key={i}>
                <path
                  d={`M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`}
                  fill={COLORS[i % COLORS.length]}
                  stroke="#f1e7d5"
                  strokeWidth="1"
                />
                {n <= 24 && (
                  <text
                    x={tx}
                    y={ty}
                    fill="#fbf4e6"
                    fontSize={n > 12 ? 9 : 11}
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${rot} ${tx} ${ty})`}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="20" fill="#241a12" stroke="#f0a35a" strokeWidth="3" />
        </svg>
      </div>

      <button
        onClick={spin}
        disabled={spinning || !canSpin}
        className="mt-3 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-black uppercase tracking-wide px-10 py-3.5 rounded-xl text-base disabled:opacity-40 transition-colors"
      >
        {spinning ? "Spinning…" : "Spin"}
      </button>

      {flash && !spinning && (
        <div className="mt-3 text-center animate-pulse">
          <div className="text-xs font-bold uppercase tracking-wider text-[#8a7559]">Winner</div>
          <div className="text-2xl font-black text-[#4a7c59]">🎉 {flash}</div>
        </div>
      )}
      {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}
    </div>
  );
}
