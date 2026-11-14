"use client";
import { useMemo, useState } from "react";
import { Panel, Segmented, Btn, Notice } from "../../ui";

type Person = {
  clerkUserId: string;
  name: string;
  email: string;
  phone: string;
  blocked: boolean;
  neverBid: boolean;
  daysSinceSignup: number;
};

type Range = "7" | "30" | "90" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "Joined 7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "Anytime" },
];

const AGO = (d: number) => (d <= 0 ? "today" : d === 1 ? "yesterday" : d < 60 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`);

/**
 * "Send $5 to people who haven't bid": pick who (joined when, has a phone),
 * tick people or select all, and send each ONE $5 Bid Buck with a text. People
 * who already got the nudge are left out (and the server skips them anyway).
 */
export default function NudgePanel({ bidders, nudged, team, onSent }: { bidders: Person[]; nudged: string[]; team: string[]; onSent: () => void }) {
  const [range, setRange] = useState<Range>("30");
  const [phoneOnly, setPhoneOnly] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [shown, setShown] = useState(10);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const done = useMemo(() => new Set(nudged), [nudged]);
  const staff = useMemo(() => new Set(team), [team]);
  const pool = useMemo(
    () =>
      bidders
        .filter((b) => b.neverBid && !b.blocked && !done.has(b.clerkUserId) && !staff.has(b.clerkUserId))
        .filter((b) => range === "all" || b.daysSinceSignup <= Number(range))
        .filter((b) => !phoneOnly || !!b.phone)
        .sort((a, b) => a.daysSinceSignup - b.daysSinceSignup),
    [bidders, done, staff, range, phoneOnly]
  );
  const pickedInPool = pool.filter((b) => picked.has(b.clerkUserId));
  const allPicked = pool.length > 0 && pickedInPool.length === pool.length;
  const alreadyNudged = bidders.filter((b) => b.neverBid && done.has(b.clerkUserId)).length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/admin/referrals/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserIds: pickedInPool.map((b) => b.clerkUserId) }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) setResult({ ok: false, text: d.error || "Couldn't send." });
      else {
        setResult({
          ok: true,
          text: `Sent $5 to ${d.given} ${d.given === 1 ? "person" : "people"}, ${d.texted} texted.${d.skipped ? ` ${d.skipped} skipped (already bid or already got one).` : ""}`,
        });
        setPicked(new Set());
        onSent();
      }
    } catch {
      setResult({ ok: false, text: "Something went wrong." });
    }
    setBusy(false);
    setConfirming(false);
  };

  return (
    <Panel
      title="Send $5 to people who haven't bid"
      sub={`One $5 Bid Buck each, with a text${alreadyNudged ? ` · ${alreadyNudged} already sent` : ""}`}
    >
      <div className="px-4 sm:px-5 py-4 space-y-3">
        <Segmented value={range} onChange={(v) => { setRange(v); setShown(10); }} options={RANGES} className="w-full sm:w-auto" />
        <button
          type="button"
          role="switch"
          aria-checked={phoneOnly}
          onClick={() => { setPhoneOnly((v) => !v); setShown(10); }}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl bg-[#faf5ea] border border-[#e6dac6] px-4 text-left"
        >
          <span className="font-bold text-[15px] text-[#241a12]">Only people with a phone number</span>
          <span className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${phoneOnly ? "bg-[#4a7c59]" : "bg-[#d9c7ab]"}`}>
            <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${phoneOnly ? "translate-x-5" : ""}`} />
          </span>
        </button>
        {result && <Notice tone={result.ok ? "green" : "red"}>{result.text}</Notice>}
      </div>

      {pool.length === 0 ? (
        <p className="px-4 sm:px-5 pb-5 text-[15px] text-[#8a7559]">Nobody here. Everyone in this range has bid or already got $5.</p>
      ) : (
        <>
          <div className="px-4 sm:px-5 py-2.5 border-y border-[#f0e6d6] bg-[#fdfaf4] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(pool.map((b) => b.clerkUserId)))}
              className="flex items-center gap-2.5 min-h-[44px] font-bold text-[15px] text-[#241a12]"
            >
              <Box on={allPicked} />
              {allPicked ? "Clear all" : `Select all ${pool.length}`}
            </button>
            <span className="text-[15px] font-bold text-[#2f5d3a] tabular-nums">{pickedInPool.length} picked</span>
          </div>

          <ul className="divide-y divide-[#f0e6d6]">
            {pool.slice(0, shown).map((b) => {
              const on = picked.has(b.clerkUserId);
              return (
                <li key={b.clerkUserId}>
                  <button
                    type="button"
                    onClick={() => toggle(b.clerkUserId)}
                    aria-pressed={on}
                    className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[56px] text-left transition-colors ${on ? "bg-[#e6f1e8]" : "hover:bg-[#faf5ea]"}`}
                  >
                    <Box on={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-[16px] text-[#241a12] truncate">{b.name}</span>
                      <span className="block text-[14px] text-[#8a7559] truncate">{b.phone || b.email || "no contact"}</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-bold text-[#8a7559]">joined {AGO(b.daysSinceSignup)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pool.length > shown && (
            <div className="px-4 sm:px-5 py-2.5 border-t border-[#f0e6d6] flex items-center justify-between gap-3">
              <span className="text-[15px] text-[#8a7559]">{pool.length - shown} more</span>
              <Btn size="sm" variant="ghost" onClick={() => setShown((n) => n + 15)}>Show more</Btn>
            </div>
          )}

          <div className="px-4 sm:px-5 py-4 border-t border-[#f0e6d6]">
            {confirming ? (
              <div className="rounded-xl bg-[#faf5ea] border border-[#e6dac6] p-4">
                <p className="text-[15px] text-[#241a12]">
                  Give <span className="font-bold">{pickedInPool.length}</span> {pickedInPool.length === 1 ? "person" : "people"} $5 in Bid Bucks each (up to{" "}
                  <span className="font-bold">${pickedInPool.length * 5}</span> total, only spent on a winning bill of $5 or more) and text them?
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Btn tone="slate" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Back</Btn>
                  <Btn tone="green" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send"}</Btn>
                </div>
              </div>
            ) : (
              <Btn tone="green" full onClick={() => setConfirming(true)} disabled={pickedInPool.length === 0}>
                {pickedInPool.length ? `Send $5 to ${pickedInPool.length} ${pickedInPool.length === 1 ? "person" : "people"}` : "Pick people to send $5"}
              </Btn>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={`w-6 h-6 shrink-0 rounded-md border-2 grid place-items-center ${on ? "bg-[#4a7c59] border-[#4a7c59]" : "bg-white border-[#d9c7ab]"}`}>
      {on && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </span>
  );
}
