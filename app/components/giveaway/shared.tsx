"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BidCritter, IcoCheck, IcoGift, IcoTicket, IcoTrophy } from "@/app/components/BidIcons";

/* ───────────────────────────────────────────────────────────
   Northwood Bids — giveaway building blocks shared by the home
   section (GiveawayCard) and the /giveaways portal. Types mirror
   GET /api/giveaways/active exactly; keep them in sync with the route.
   ─────────────────────────────────────────────────────────── */

export type Phase = "live" | "scheduled" | "ended" | "complete";
export type EntryMode = "AUTO" | "CLICK" | "BID";
export type DrawStyle = "WHEEL" | "MACHINE";
export type Requirement = "NONE" | "INFO" | "ANSWER";

export type Prize = { id: string; title: string; retailValue: number | null; photo: string | null };

export type Giveaway = {
  id: string;
  title: string;
  description: string | null;
  phase: Phase;
  entryMode: EntryMode;
  drawStyle: DrawStyle;
  requirement: Requirement;
  requirementPrompt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  minBidAmount: number | null;
  maxTicketsPerUser: number | null;
  winners: number;
  totalValue: number;
  totalTickets: number;
  prizes: Prize[];
  me: { entered: boolean; tickets: number; eligible?: boolean; reason?: "blocked" | "incomplete" | "no_card" | "duplicate" | null; won?: boolean };
  wonBy: { name: string; prize: string }[];
};

export type Winner = {
  name: string;
  prize: string;
  photo: string | null;
  value: number | null;
  giveawayId: string;
  giveawayTitle: string;
  wonAt: string;
};

// ── Formatting ───────────────────────────────────────────────────────────────
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** "Sat, Sep 20, 6:00 PM" in Michigan time. */
export function fmtDetroit(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "today" / "yesterday" / "4 days ago" / "2 weeks ago" / "Aug 3". */
export function relativeDay(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${plural(w, "week")} ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });
}

/** Compact countdown: "2d 4h", "4h 12m", "12m 30s", "45s". Null once it's passed. */
export function untilLabel(targetIso: string, now: number): string | null {
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Ticks once a second so countdowns stay honest. Starts on mount (client only). */
export function useNow(tick = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tick);
    return () => clearInterval(id);
  }, [tick]);
  return now;
}

/** One plain sentence on how this giveaway is entered, by mode. */
export function howToEnter(g: Giveaway): string {
  if (g.entryMode === "AUTO") return "Everyone with a Northwood Bids account is entered automatically. Nothing to tap.";
  if (g.entryMode === "BID") {
    const min = g.minBidAmount != null ? ` (bids of ${money(g.minBidAmount)}+ count)` : "";
    const cap = g.maxTicketsPerUser != null ? `, up to ${g.maxTicketsPerUser} ${plural(g.maxTicketsPerUser, "ticket")} per person` : "";
    return `Every bid you place while it's open is one ticket${min}${cap}.`;
  }
  const cap = g.maxTicketsPerUser != null ? ` Max ${g.maxTicketsPerUser} ${plural(g.maxTicketsPerUser, "ticket")} per person.` : "";
  if (g.requirement === "ANSWER") return `Get the question right and you're in.${cap}`;
  if (g.requirement === "INFO") return `Answer the quick question and you're in.${cap}`;
  return `Tap "Take a ticket" and you're in.${cap}`;
}

export function drawStyleLabel(g: Giveaway) {
  return g.drawStyle === "WHEEL" ? "Drawn on the wheel" : "Drawn from the ticket machine";
}

/** "Dyson V8" for one prize, "3 prizes" for more. */
export function prizeLine(g: Giveaway) {
  if (g.prizes.length === 1) return g.prizes[0].title;
  return `${g.prizes.length} ${plural(g.prizes.length, "prize")}`;
}

// ── Small UI bits ────────────────────────────────────────────────────────────
function PulseDot() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-[#4a7c59] opacity-70 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4a7c59]" />
    </span>
  );
}

const CHIP = "inline-flex items-center gap-1.5 rounded-full text-[11px] font-black uppercase tracking-wide px-2.5 py-1 whitespace-nowrap tabular-nums";

/** Status chip that reads differently per phase. Live and scheduled tick every second. */
export function PhaseChip({ g }: { g: Giveaway }) {
  const now = useNow();
  if (g.phase === "live") {
    const left = g.endsAt ? untilLabel(g.endsAt, now) : null;
    const text = !g.endsAt ? "Ends when we say" : left ? `Ends in ${left}` : "Wrapping up";
    return (
      <span className={`${CHIP} bg-[#dcebdf] text-[#2f5d3a]`}>
        <PulseDot /> {text}
      </span>
    );
  }
  if (g.phase === "scheduled") {
    const left = g.startsAt ? untilLabel(g.startsAt, now) : null;
    return <span className={`${CHIP} bg-[#e9dcc6] text-[#6c4d39]`}>{left ? `Opens in ${left}` : "Opening soon"}</span>;
  }
  if (g.phase === "ended") {
    return <span className={`${CHIP} bg-[#f7e4c9] text-[#a85f28]`}>Ended &mdash; pulling winners soon</span>;
  }
  return (
    <span className={`${CHIP} bg-[#efe3d0] text-[#6f5b46]`}>
      <IcoTrophy className="w-3.5 h-3.5" /> Winners drawn
    </span>
  );
}

/**
 * Prize photo that fills its wrapper (pass sizing via className), with the
 * mascot standing in when no photo exists and a "+N" tag for multi-prize drops.
 */
export function PrizeArt({ g, className = "" }: { g: Giveaway; className?: string }) {
  const hero = g.prizes.find((p) => p.photo) ?? g.prizes[0];
  const extra = g.prizes.length - 1;
  return (
    <div className={`relative overflow-hidden bg-[#faf5ea] ${className}`}>
      {hero?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.photo} alt={hero.title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <BidCritter className="w-[46%] h-[46%] max-w-28 max-h-28 opacity-95" />
        </div>
      )}
      {extra > 0 && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-[#241a12]/80 text-white text-[10px] font-black px-1.5 py-0.5 tabular-nums">
          <IcoGift className="w-3 h-3" /> +{extra} more
        </span>
      )}
    </div>
  );
}

/** "1,284 tickets in the drum" plus the viewer's own standing when signed in. */
export function TicketLine({ g, signedIn, className = "" }: { g: Giveaway; signedIn: boolean; className?: string }) {
  const mine = !signedIn
    ? null
    : g.me.won
      ? "You won a prize here"
      : g.me.tickets > 0
        ? `You hold ${num(g.me.tickets)} ${plural(g.me.tickets, "ticket")}`
        : g.me.entered
          ? "You're in"
          : null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6f5b46] ${className}`}>
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <IcoTicket className="w-3.5 h-3.5 text-[#a85f28]" />
        {num(g.totalTickets)} {plural(g.totalTickets, "ticket")} in the drum
      </span>
      {mine && (
        <span className="inline-flex items-center gap-1 font-bold text-[#2f5d3a]">
          <IcoCheck className="w-3.5 h-3.5" /> {mine}
        </span>
      )}
    </div>
  );
}

// ── Entry CTA ────────────────────────────────────────────────────────────────
const BTN_LEATHER = "inline-flex items-center justify-center bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_MOSS = "inline-flex items-center justify-center bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function InPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#dcebdf] text-[#2f5d3a] font-bold text-sm px-3.5 py-2 rounded-xl">
      <IcoCheck className="w-4 h-4" /> {children}
    </span>
  );
}

/**
 * The action area for one giveaway. Only live giveaways get actions; every
 * other phase is explained by the PhaseChip, so this renders nothing for them.
 * `onEntered` lets the owner flip the card to "You're in" after a successful tap.
 */
export function EntryBlock({
  g,
  signedIn,
  onEntered,
  className = "",
}: {
  g: Giveaway;
  signedIn: boolean;
  onEntered: (id: string, tickets: number) => void;
  className?: string;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (g.phase !== "live") return null;

  if (!signedIn) {
    return (
      <div className={className}>
        <Link href="/sign-up" className={BTN_LEATHER}>Sign up free to enter</Link>
      </div>
    );
  }

  // Same bar as bidding. Say exactly what's missing instead of a silent "you're in"
  // that would never actually be in the drum.
  if (g.me.eligible === false && !g.me.won) {
    const r = g.me.reason;
    if (r === "no_card") {
      return (
        <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
          <p className="text-sm text-[#6f5b46] flex-1 min-w-0">Add a payment card to your account to be in the drum — same rule as bidding, nothing is charged.</p>
          <Link href="/account" className={`${BTN_LEATHER} shrink-0`}>Add a card</Link>
        </div>
      );
    }
    if (r === "incomplete") {
      return (
        <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
          <p className="text-sm text-[#6f5b46] flex-1 min-w-0">Finish your account (phone + email) to be in the drum.</p>
          <Link href="/register" className={`${BTN_LEATHER} shrink-0`}>Finish setup</Link>
        </div>
      );
    }
    if (r === "duplicate") {
      return <p className={`text-sm text-[#6f5b46] ${className}`}>This phone number is already on another account — that account holds the tickets.</p>;
    }
    return <p className={`text-sm text-[#6f5b46] ${className}`}>This account isn&apos;t eligible for giveaways.</p>;
  }

  if (g.me.won) {
    return (
      <div className={className}>
        <InPill>You won a prize in this one</InPill>
      </div>
    );
  }

  if (g.entryMode === "AUTO") {
    return (
      <div className={className}>
        <InPill>You&apos;re automatically in</InPill>
      </div>
    );
  }

  if (g.entryMode === "BID") {
    const notes: string[] = [];
    if (g.minBidAmount != null) notes.push(`bids of ${money(g.minBidAmount)}+ count`);
    if (g.maxTicketsPerUser != null) notes.push(`max ${g.maxTicketsPerUser} ${plural(g.maxTicketsPerUser, "ticket")} per person`);
    return (
      <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#241a12] leading-snug">Every bid you place is a ticket</p>
          {notes.length > 0 && <p className="text-xs text-[#8a7559] mt-0.5">{notes.join(" · ")}</p>}
        </div>
        <Link href="/auctions" className={`${BTN_MOSS} shrink-0`}>Go bid</Link>
      </div>
    );
  }

  // CLICK
  if (g.me.entered) {
    return (
      <div className={className}>
        <InPill>You&apos;re in</InPill>
      </div>
    );
  }

  const needsAnswer = g.requirement !== "NONE";
  const join = async () => {
    setErr("");
    if (needsAnswer && !answer.trim()) {
      setErr("Fill this in to enter.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/giveaways/${g.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsAnswer ? { answer: answer.trim() } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Couldn't take a ticket just now.");
        return;
      }
      onEntered(g.id, Number(d.tickets ?? 1));
    } catch {
      setErr("Something went wrong. Give it another go.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      {needsAnswer ? (
        <label className="block">
          <span className="block text-xs font-bold text-[#6f5b46] mb-1.5">{g.requirementPrompt || "Answer to enter"}</span>
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") join(); }}
              disabled={busy}
              maxLength={300}
              placeholder="Your answer"
              className="flex-1 min-w-0 bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-sm text-[#241a12] placeholder:text-[#b3a085] focus:outline-none focus:border-[#6c4d39]/60"
            />
            <button type="button" onClick={join} disabled={busy} className={`${BTN_MOSS} shrink-0`}>
              {busy ? "One sec" : "Take a ticket"}
            </button>
          </div>
        </label>
      ) : (
        <button type="button" onClick={join} disabled={busy} className={BTN_MOSS}>
          <IcoTicket className="w-4 h-4 mr-1.5" /> {busy ? "One sec" : "Take a ticket"}
        </button>
      )}
      {err && <p className="text-xs text-red-600 font-semibold mt-1.5">{err}</p>}
      {g.maxTicketsPerUser != null && (
        <p className="text-[11px] text-[#8a7559] mt-1.5">Max {g.maxTicketsPerUser} {plural(g.maxTicketsPerUser, "ticket")} per person.</p>
      )}
    </div>
  );
}

/** Immutable "you're in now" update for a list of giveaways after a successful join. */
export function markEntered(list: Giveaway[], id: string, tickets: number): Giveaway[] {
  return list.map((g) =>
    g.id === id
      ? {
          ...g,
          me: { ...g.me, entered: true, tickets: Math.max(1, tickets), eligible: true, reason: null },
          totalTickets: g.me.entered ? g.totalTickets : g.totalTickets + 1,
        }
      : g
  );
}
