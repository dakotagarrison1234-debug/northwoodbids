"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Prize = { id: string; title: string; retailValue: number | null; photo: string | null };
type Giveaway = {
  id: string;
  title: string;
  description: string | null;
  requirement: "NONE" | "INFO" | "ANSWER";
  requirementPrompt: string | null;
  endsAt: string | null;
  winners: number;
  totalValue: number;
  prizes: Prize[];
};

/**
 * Home-page giveaway banner. Self-fetches the single active giveaway and renders
 * nothing when there isn't one. Shows the prize(s) + value and, for signed-in
 * bidders, their entry state or a join form (for info/answer giveaways).
 */
export default function GiveawayCard() {
  const [g, setG] = useState<Giveaway | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [entered, setEntered] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/giveaways/active")
      .then((r) => r.json())
      .then((d) => {
        if (d.giveaway) { setG(d.giveaway); setSignedIn(!!d.signedIn); setEntered(!!d.entered); }
      })
      .catch(() => {});
  }, []);

  if (!g) return null;

  const join = async () => {
    setErr("");
    if (g.requirement !== "NONE" && !answer.trim()) { setErr("Fill this in to enter."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/giveaways/${g.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't enter."); setBusy(false); return; }
      setEntered(true);
    } catch { setErr("Something went wrong."); }
    setBusy(false);
  };

  const hero = g.prizes[0];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 mt-4 mb-2">
      <div className="relative overflow-hidden rounded-3xl border-2 border-[#4a7c59]/25 bg-gradient-to-br from-[#f3ead6] via-[#fbf4e6] to-[#eaf3ec] p-5 sm:p-7 shadow-[0_10px_30px_-12px_rgba(74,124,89,0.4)]">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[#4a7c59]/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-col sm:flex-row gap-5 items-center">
          {hero?.photo && (
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.photo} alt={hero.title} className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border border-[#e3d6bf] shadow-md" />
            </div>
          )}

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 bg-[#4a7c59] text-white text-[11px] font-black uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-2">
              🎁 Free Giveaway
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-black text-[#241a12] leading-tight">{g.title}</h3>
            <p className="text-sm text-[#6f5b46] mt-1">
              {g.prizes.length === 1 ? hero?.title : `${g.winners} winners`}
              {g.totalValue > 0 && <span className="font-bold text-[#4a7c59]"> · ${g.totalValue.toFixed(0)} value</span>}
            </p>
            {g.description && <p className="text-sm text-[#8a7559] mt-1.5 line-clamp-2">{g.description}</p>}

            {/* Entry state */}
            <div className="mt-4">
              {!signedIn ? (
                <Link href="/sign-up" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm">
                  Sign up free to enter
                </Link>
              ) : entered ? (
                <div className="inline-flex items-center gap-2 bg-[#dff0e4] text-[#2f7a48] font-bold px-4 py-2.5 rounded-xl text-sm">
                  ✅ You're entered — good luck!
                </div>
              ) : g.requirement === "NONE" ? (
                <div className="inline-flex items-center gap-2 bg-[#dff0e4] text-[#2f7a48] font-bold px-4 py-2.5 rounded-xl text-sm">
                  ✅ You're automatically entered!
                </div>
              ) : (
                <div className="max-w-sm mx-auto sm:mx-0">
                  <label className="block text-sm font-semibold text-[#6f5b46] mb-1">{g.requirementPrompt}</label>
                  <div className="flex gap-2">
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="flex-1 bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]"
                      placeholder="Your answer"
                    />
                    <button onClick={join} disabled={busy} className="bg-[#4a7c59] hover:bg-[#3c6449] text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
                      {busy ? "…" : "Enter"}
                    </button>
                  </div>
                  {err && <div className="text-xs text-red-600 font-semibold mt-1">{err}</div>}
                </div>
              )}
            </div>

            {g.prizes.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center sm:justify-start">
                {g.prizes.slice(0, 6).map((p) => (
                  <span key={p.id} className="text-[11px] bg-white/70 border border-[#e3d6bf] rounded-full px-2.5 py-1 text-[#6f5b46]">
                    {p.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
