"use client";
/**
 * Dependency-free SVG charts for the reports pages. Kept tiny and self-contained
 * (no chart library) so nothing new can break the live build. Two primitives:
 *
 *  • AreaTrend — a line + soft area fill over time, with gridlines and a marked
 *    latest point. Has a `dark` mode so it reads on the green hero card.
 *  • Donut — a proportional ring with a labelled centre and a legend.
 */

// ── Area / line trend ─────────────────────────────────────────────────────────
export function AreaTrend({
  data,
  dark = false,
  valueFmt = (n: number) => String(n),
  height = 150,
}: {
  data: { label: string; value: number }[];
  dark?: boolean;
  valueFmt?: (n: number) => string;
  height?: number;
}) {
  const W = 700;
  const H = height;
  const padL = 6, padR = 10, padT = 20, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const anyValue = data.some((d) => d.value > 0);

  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area =
    n > 0
      ? `${line} L ${x(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : "";

  const stroke = dark ? "#eef4e4" : "#6c4d39";
  const grid = dark ? "rgba(255,255,255,0.16)" : "#efe3d0";
  const labelCol = dark ? "#cfe0bb" : "#a9987c";
  const fillTop = dark ? "rgba(255,255,255,0.30)" : "rgba(108,77,57,0.20)";
  const fillBot = dark ? "rgba(255,255,255,0.02)" : "rgba(108,77,57,0.01)";
  const gid = `area-${dark ? "d" : "l"}`;

  // Thin the x-labels so they never crowd.
  const step = Math.max(1, Math.ceil(n / 6));
  const lastIdx = n - 1;

  if (!anyValue) {
    return (
      <div
        className="flex items-center justify-center text-sm rounded-xl"
        style={{ height: H, color: labelCol, border: `1px dashed ${grid}` }}
      >
        No data in this period yet
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" style={{ height: "auto" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor={fillBot} />
        </linearGradient>
      </defs>

      {/* gridlines at 1/3, 2/3, top */}
      {[0.33, 0.66, 1].map((f, i) => (
        <line
          key={i}
          x1={padL}
          x2={W - padR}
          y1={padT + innerH - f * innerH}
          y2={padT + innerH - f * innerH}
          stroke={grid}
          strokeWidth="1"
        />
      ))}

      {area && <path d={area} fill={`url(#${gid})`} />}
      {line && <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}

      {/* dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === lastIdx ? 4.5 : 2.5} fill={stroke} />
      ))}

      {/* latest value label */}
      {n > 0 && (
        <text
          x={Math.min(x(lastIdx), W - padR - 2)}
          y={Math.max(y(data[lastIdx].value) - 8, 12)}
          textAnchor={lastIdx === 0 ? "start" : "end"}
          fontSize="15"
          fontWeight="800"
          fill={stroke}
        >
          {valueFmt(data[lastIdx].value)}
        </text>
      )}

      {/* x labels */}
      {data.map((d, i) =>
        i % step === 0 || i === lastIdx ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill={labelCol}>
            {d.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ── Donut ─────────────────────────────────────────────────────────────────────
export function Donut({
  slices,
  centerTop,
  centerSub,
}: {
  slices: { label: string; value: number; color: string }[];
  centerTop: string;
  centerSub?: string;
}) {
  const active = slices.filter((s) => s.value > 0.0001);
  const total = active.reduce((s, x) => s + x.value, 0) || 1;
  const R = 56;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 150 150" className="shrink-0" width="150" height="150">
        <circle cx="75" cy="75" r={R} fill="none" stroke="#efe3d0" strokeWidth="18" />
        {active.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * CIRC;
          const seg = (
            <circle
              key={i}
              cx="75"
              cy="75"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${CIRC - dash}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 75 75)"
              strokeLinecap="butt"
            />
          );
          acc += dash;
          return seg;
        })}
        <text x="75" y="70" textAnchor="middle" fontSize="21" fontWeight="800" fill="#241a12">
          {centerTop}
        </text>
        {centerSub && (
          <text x="75" y="90" textAnchor="middle" fontSize="11" fontWeight="700" fill="#8a7559" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {centerSub}
          </text>
        )}
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5">
        {active.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-sm text-[#4a3a2b] flex-1 min-w-0 truncate">{s.label}</span>
            <span className="text-sm font-bold text-[#241a12] tabular-nums shrink-0">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
