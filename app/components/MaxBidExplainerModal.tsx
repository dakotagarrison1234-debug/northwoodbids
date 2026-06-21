"use client";

export default function MaxBidExplainerModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[#241a12] font-extrabold text-lg leading-tight">How Max Bidding Works</h2>
            <p className="text-[#8a7559] text-sm mt-0.5">Set it once — we handle the rest.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#b3a085] hover:text-[#6f5b46] w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#efe3d0] transition-colors shrink-0 mt-0.5"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>
        </div>

        {/* 3 points */}
        <div className="px-5 space-y-3.5 pb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#6c4d39]/10 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="#6c4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 7h14"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-[#241a12]">Set your limit</div>
              <div className="text-xs text-[#6f5b46] mt-0.5">The most you'd ever pay. It stays completely private.</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#6c4d39]/10 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="#6c4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 9h4l-1 5 6-7H9l1-5z"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-[#241a12]">We auto-bid for you</div>
              <div className="text-xs text-[#6f5b46] mt-0.5">We place the minimum bid needed to keep you winning — instantly, every time someone bids.</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#6c4d39]/10 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="#6c4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 2H2V5a4 4 0 0 0 2.9 3.84M12 2h2V5a4 4 0 0 1-2.9 3.84M4 2h8v4a4 4 0 0 1-8 0V2zM6 13h4M8 11v2"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-[#241a12]">You only pay what it takes</div>
              <div className="text-xs text-[#6f5b46] mt-0.5">If nobody matches you, you win below your max. You're notified the moment you're outbid.</div>
            </div>
          </div>
        </div>

        {/* Example */}
        <div className="mx-5 mb-5 bg-[#f6ecda] border border-[#6c4d39]/20 rounded-xl px-4 py-3.5">
          <div className="text-[10px] text-[#6c4d39] font-bold uppercase tracking-widest mb-2.5">Example</div>
          <div className="flex items-center gap-2 text-sm">
            <div className="text-center">
              <div className="text-[11px] text-[#8a7559] mb-1">Your max</div>
              <div className="font-black text-[#241a12] text-xl">$85</div>
            </div>
            <svg className="w-5 h-5 text-[#c4b59a] shrink-0 mx-1" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10h12M12 5l5 5-5 5"/></svg>
            <div className="flex-1 bg-white border border-[#6c4d39]/30 rounded-lg px-3 py-1.5 text-center">
              <div className="text-[11px] text-[#8a7559] mb-0.5">You win at</div>
              <div className="font-black text-[#6c4d39] text-xl">$30</div>
            </div>
          </div>
          <p className="text-[11px] text-[#6f5b46] mt-2.5 text-center">You set $85 — but nobody bid higher than $25, so you win at $30. Not $85.</p>
        </div>

        {/* CTA */}
        <div className="px-5 pb-5">
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
