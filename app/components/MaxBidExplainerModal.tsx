"use client";
import { useEffect } from "react";
import { IcoLock, IcoBolt, IcoCoin } from "./BidIcons";
import { GavelEmblem } from "./Illustrations";

/**
 * "How a max bid works" — the one explainer a first-time bidder actually needs.
 * Bottom sheet on phones, centered card on desktop. Espresso header band, cream
 * body, three plain steps and a worked example. Escape / backdrop tap closes.
 */
export default function MaxBidExplainerModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps: { Icon: (p: { className?: string }) => React.ReactElement; title: string; body: string }[] = [
    { Icon: IcoLock, title: "Name your ceiling", body: "The most you'd pay for this lot. Nobody else ever sees it." },
    { Icon: IcoBolt, title: "We bid for you", body: "Every time someone bids, we answer with the smallest step that keeps you in front." },
    { Icon: IcoCoin, title: "Pay only what it took", body: "If nobody pushes you, you win below your ceiling. Outbid past it? We text you." },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-[#241a12]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="maxbid-explainer-title"
    >
      <div className="bg-[#fbf4e6] w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-[0_24px_60px_-24px_rgba(36,26,18,0.7)] overflow-hidden border border-[#e3d6bf] nb-rise">

        {/* Header band */}
        <div className="relative px-5 pt-5 pb-4 text-[#f6ecda]" style={{ background: "linear-gradient(140deg,#241a12,#3a2a1b)" }}>
          <GavelEmblem className="absolute -right-6 -top-6 w-28 h-28 opacity-[0.08]" />
          <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[#f6ecda]/30" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f0a35a]">Max bid</p>
              <h2 id="maxbid-explainer-title" className="font-display text-xl font-black leading-tight mt-0.5">Set it once. We hold the line.</h2>
              <p className="text-[#f6ecda]/75 text-sm mt-1">No refreshing, no last-second scramble.</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full grid place-items-center text-[#f6ecda]/70 hover:text-[#f6ecda] hover:bg-white/10 transition-colors shrink-0 -mr-1 -mt-1"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Steps */}
        <ol className="px-5 pt-4 pb-1 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className="relative w-9 h-9 rounded-xl bg-white border border-[#e3d6bf] grid place-items-center shrink-0 text-[#6c4d39]">
                <s.Icon className="w-4.5 h-4.5" />
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-[#6c4d39] text-white text-[9px] font-black grid place-items-center">{i + 1}</span>
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="text-sm font-bold text-[#241a12] leading-tight">{s.title}</div>
                <div className="text-xs text-[#6f5b46] mt-0.5 leading-snug">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        {/* Worked example */}
        <div className="mx-5 mt-4 bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3.5">
          <div className="text-[10px] text-[#8a7559] font-black uppercase tracking-[0.18em] mb-2.5">Say you set $85</div>
          <div className="flex items-center gap-2">
            <div className="text-center shrink-0">
              <div className="text-[11px] text-[#8a7559] mb-0.5">Your ceiling</div>
              <div className="font-display font-black text-[#241a12] text-xl tabular-nums">$85</div>
            </div>
            <svg className="w-5 h-5 text-[#cdbda3] shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 10h12M12 5l5 5-5 5"/></svg>
            <div className="text-center shrink-0">
              <div className="text-[11px] text-[#8a7559] mb-0.5">Top rival bid</div>
              <div className="font-display font-black text-[#6f5b46] text-xl tabular-nums">$25</div>
            </div>
            <svg className="w-5 h-5 text-[#cdbda3] shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 10h12M12 5l5 5-5 5"/></svg>
            <div className="flex-1 bg-[#4a7c59]/10 border border-[#4a7c59]/30 rounded-xl px-3 py-1.5 text-center">
              <div className="text-[11px] text-[#3c6449] mb-0.5 font-semibold">You win at</div>
              <div className="font-display font-black text-[#3c6449] text-xl tabular-nums">$30</div>
            </div>
          </div>
          <p className="text-[11px] text-[#6f5b46] mt-2.5 leading-snug">One step over the next-best bidder. The other $55 stays in your pocket.</p>
        </div>

        {/* CTA */}
        <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
          <button
            onClick={onClose}
            className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
