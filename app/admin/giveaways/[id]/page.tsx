"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SpinWheel, { type DrawResult } from "./SpinWheel";
import TicketMachine from "./TicketMachine";
import { IcoTrophy, IcoCheck } from "@/app/components/BidIcons";

type Requirement = "NONE" | "INFO" | "ANSWER";
type EntryMode = "AUTO" | "CLICK" | "BID";
type DrawStyle = "WHEEL" | "MACHINE";
type Phase = "draft" | "scheduled" | "live" | "ended" | "complete";
type Prize = {
  id: string;
  title: string;
  retailValue: number | null;
  photo: string | null;
  status: string;
  wonBy: { clerkUserId: string; name: string } | null;
};
type Entrant = { clerkUserId: string; name: string; tickets: number };
type Winner = { clerkUserId: string; name: string; itemId: string | null; itemTitle: string };
type Detail = {
  giveaway: {
    id: string;
    title: string;
    description: string | null;
    status: "DRAFT" | "ACTIVE" | "ENDED" | "DRAWN";
    phase: Phase;
    entryMode: EntryMode;
    drawStyle: DrawStyle;
    requirement: Requirement;
    requirementPrompt: string | null;
    requirementAnswer: string | null;
    startsAt: string | null;
    endsAt: string | null;
    endedAt: string | null;
    minBidAmount: number | null;
    maxTicketsPerUser: number | null;
    requireCard: boolean;
  };
  prizes: Prize[];
  pool: Entrant[];
  winners: Winner[];
  removed: { clerkUserId: string; name: string }[];
  counts: { prizes: number; drawn: number; eligible: number; tickets: number };
  fairness: { filtered: { noCard: number; incomplete: number; blocked: number; duplicate: number }; duplicates: { name: string; sameAs: string }[] };
};

const PHASE: Record<Phase, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[#efe6d4] text-[#8a7559]" },
  scheduled: { label: "Scheduled", cls: "bg-[#e9dcc6] text-[#6c4d39]" },
  live: { label: "Live", cls: "bg-[#dff0e4] text-[#2f7a48]" },
  ended: { label: "Ended · pull winners", cls: "bg-[#fbe6c8] text-[#a85f28]" },
  complete: { label: "Complete", cls: "bg-[#e6dcff] text-[#5b46a8]" },
};
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ruleLine(g: Detail["giveaway"]) {
  if (g.entryMode === "AUTO") return g.requireCard ? "Every bidder with a card on file holds one ticket automatically." : "Every registered bidder holds one ticket automatically.";
  if (g.entryMode === "BID") {
    const bits = ["Every bid placed while it's open is one ticket (win or lose)"];
    if (g.minBidAmount != null) bits.push(`bids of $${g.minBidAmount} and up`);
    if (g.maxTicketsPerUser != null) bits.push(`max ${g.maxTicketsPerUser} per person`);
    return bits.join(" · ") + ".";
  }
  if (g.requirement === "NONE") return "Tap to enter — one ticket each.";
  if (g.requirement === "INFO") return `Tap + answer “${g.requirementPrompt}” (any answer) — one ticket each.`;
  return `Tap + answer “${g.requirementPrompt}” correctly — one ticket each.`;
}

export default function ManageGiveaway() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [presentSize, setPresentSize] = useState(360);
  useEffect(() => {
    const calc = () => setPresentSize(Math.max(260, Math.min(460, Math.min(window.innerWidth - 40, window.innerHeight - 300))));
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const load = useCallback(() => {
    fetch(`/api/admin/giveaways/${id}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setD(data); })
      .catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/pickup/locations")
      .then((r) => r.json())
      .then((r) => setLocations((r.locations ?? []).filter((l: { isActive: boolean }) => l.isActive).map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))))
      .catch(() => {});
  }, []);

  // ── Prize add form ────────────────────────────────────────────────────────
  const [pTitle, setPTitle] = useState("");
  const [pValue, setPValue] = useState("");
  const [pLoc, setPLoc] = useState("");
  const [pPhoto, setPPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addingPrize, setAddingPrize] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileType = file.type || "image/jpeg";
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, fileType }) });
      const { signedUrl, publicUrl } = await res.json();
      await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": fileType } });
      setPPhoto(publicUrl);
    } catch { setMsg("Photo upload failed."); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addPrize = async () => {
    if (!pTitle.trim()) { setMsg("Prize needs a name."); return; }
    setAddingPrize(true);
    try {
      const res = await fetch(`/api/admin/giveaways/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pTitle, retailValue: pValue, locationId: pLoc, photos: pPhoto ? [pPhoto] : [] }),
      });
      const r = await res.json();
      if (!res.ok) { setMsg(r.error || "Couldn't add prize."); }
      else { setPTitle(""); setPValue(""); setPPhoto(null); load(); }
    } catch { setMsg("Something went wrong."); }
    setAddingPrize(false);
  };

  const removePrize = async (itemId: string) => {
    const res = await fetch(`/api/admin/giveaways/${id}/items?itemId=${itemId}`, { method: "DELETE" });
    const r = await res.json();
    if (!res.ok) setMsg(r.error || "Couldn't remove.");
    else load();
  };

  // ── Status ────────────────────────────────────────────────────────────────
  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/giveaways/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json();
    if (!res.ok) setMsg(r.error || "Couldn't update.");
    else { setMsg(""); load(); }
  };

  // ── Entrants ──────────────────────────────────────────────────────────────
  type Match = { clerkUserId: string; name: string; email: string; inWheel: boolean; tickets: number; bonusTickets: number; removed: boolean; won: boolean; ineligible: "blocked" | "incomplete" | "no_card" | "duplicate" | null; duplicateOf: string | null };
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Match[]>([]);

  const runSearch = useCallback((term: string) => {
    if (!term.trim()) { setResults([]); return; }
    fetch(`/api/admin/giveaways/${id}/entries?q=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then((r) => setResults(r.bidders ?? []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const addName = async (clerkUserId: string) => {
    await fetch(`/api/admin/giveaways/${id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clerkUserId }) });
    runSearch(q); load();
  };
  const setRemoved = async (clerkUserId: string, removed: boolean) => {
    await fetch(`/api/admin/giveaways/${id}/entries`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clerkUserId, removed }) });
    runSearch(q); load();
  };
  const setBonus = async (clerkUserId: string, current: number) => {
    const v = window.prompt("Bonus tickets for this person (0 to clear):", String(current));
    if (v == null) return;
    await fetch(`/api/admin/giveaways/${id}/entries`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clerkUserId, bonusTickets: Number(v) || 0 }) });
    runSearch(q); load();
  };

  // ── Edit window / draw style (while published) ────────────────────────────
  const [editEnd, setEditEnd] = useState<string | null>(null);

  const draw = useCallback(async (): Promise<DrawResult | { error: string }> => {
    const res = await fetch(`/api/admin/giveaways/${id}/draw`, { method: "POST" });
    const r = await res.json();
    if (!res.ok) return { error: r.error || "Couldn't draw." };
    return r as DrawResult;
  }, [id]);

  // Commit a previewed win (fires on the card's "Done" button).
  const award = useCallback(async (r: DrawResult): Promise<void> => {
    const res = await fetch(`/api/admin/giveaways/${id}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkUserId: r.winner.clerkUserId, itemId: r.prize.id, token: r.token }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "award failed"); }
    load();
  }, [id, load]);

  // Undo a committed win (someone won who shouldn't have) — frees the prize to re-draw.
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);
  const revert = async (itemId: string) => {
    const res = await fetch(`/api/admin/giveaways/${id}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    const r = await res.json();
    if (!res.ok) setMsg(r.error || "Couldn't undo.");
    setConfirmRevert(null);
    load();
  };

  if (!d) return <div className="max-w-3xl mx-auto px-4 py-10 text-[#8a7559]">Loading…</div>;

  const g = d.giveaway;
  const isDraft = g.status === "DRAFT";
  const isActive = g.status === "ACTIVE";
  const isEnded = g.status === "ENDED";
  const unclaimed = d.prizes.filter((p) => !p.wonBy).length;
  const canSpin = (isActive || isEnded) && unclaimed > 0 && d.counts.eligible > 0;
  const phase = PHASE[g.phase];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <Link href="/admin/giveaways" className="text-[#6f5b46] hover:text-[#241a12] text-sm font-semibold">← Giveaways</Link>

      <div className="flex items-start justify-between gap-3 mt-2 mb-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#241a12]">{g.title}</h1>
        <span className={`shrink-0 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${phase.cls}`}>{phase.label}</span>
      </div>
      <div className="text-sm text-[#8a7559] mb-1">{ruleLine(g)}</div>
      <div className="text-xs text-[#8a7559] mb-4 flex flex-wrap gap-x-3">
        <span>{g.drawStyle === "MACHINE" ? "Ticket machine" : "Prize wheel"}</span>
        {g.startsAt && <span>· opens {fmt(g.startsAt)}</span>}
        {g.endsAt && <span>· {g.phase === "ended" || g.phase === "complete" ? "closed" : "closes"} {fmt(g.endedAt ?? g.endsAt)}</span>}
        {!g.endsAt && !isDraft && g.phase !== "complete" && <span>· closes when you end it</span>}
      </div>

      {msg && <div className="mb-4 rounded-xl bg-[#fbe9e5] text-red-700 px-4 py-2.5 text-sm font-semibold">{msg}</div>}

      {/* Status actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {isDraft && (
          <button onClick={() => patch({ status: "ACTIVE" })} className="bg-[#4a7c59] hover:bg-[#3c6449] text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            Go live (show on home)
          </button>
        )}
        {isActive && (
          <>
            <button onClick={() => patch({ status: "ENDED" })} className="bg-[#c47b3e] hover:bg-[#a85f28] text-white font-bold px-5 py-2.5 rounded-xl text-sm">
              End now (close entries)
            </button>
            <button onClick={() => setEditEnd(editEnd == null ? toLocalInput(g.endsAt) : null)} className="bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold px-4 py-2.5 rounded-xl text-sm">
              Change close time
            </button>
            {d.counts.drawn === 0 && (
              <button onClick={() => patch({ status: "DRAFT" })} className="bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold px-4 py-2.5 rounded-xl text-sm">
                Unpublish
              </button>
            )}
          </>
        )}
        {isEnded && d.counts.drawn === 0 && (
          <button onClick={() => setEditEnd(editEnd == null ? toLocalInput(g.endsAt) : null)} className="bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold px-4 py-2.5 rounded-xl text-sm">
            Reopen with a new close time
          </button>
        )}
        {(isActive || isEnded) && (
          <button onClick={() => patch({ drawStyle: g.drawStyle === "MACHINE" ? "WHEEL" : "MACHINE" })} className="bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold px-4 py-2.5 rounded-xl text-sm">
            Switch to {g.drawStyle === "MACHINE" ? "wheel" : "ticket machine"}
          </button>
        )}
        {g.status === "DRAWN" && (
          <button onClick={() => patch({ archived: true })} className="bg-white border border-[#cdbda3] text-[#6f5b46] font-semibold px-4 py-2.5 rounded-xl text-sm">
            Archive
          </button>
        )}
      </div>

      {editEnd != null && (
        <div className="mb-6 rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-4 flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-1">{isEnded ? "New close time" : "Closes"}</div>
            <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
          </div>
          <button
            onClick={async () => {
              await patch({ endsAt: editEnd ? new Date(editEnd).toISOString() : null, ...(isEnded ? { status: "ACTIVE" } : {}) });
              setEditEnd(null);
            }}
            className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-4 py-2.5 rounded-xl text-sm"
          >
            {isEnded ? "Reopen" : "Save"}
          </button>
          <button onClick={() => setEditEnd(null)} className="text-[#6f5b46] font-semibold px-3 py-2.5 text-sm">Cancel</button>
        </div>
      )}

      {/* ── Draw (live, ended, or complete) ────────────────────────────────── */}
      {(isActive || isEnded || g.status === "DRAWN") && (
        <section className="mb-8 rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-lg text-[#241a12]">Pull winners</h2>
            <div className="text-sm text-[#8a7559]">
              {d.counts.tickets.toLocaleString()} tickets · {d.counts.eligible.toLocaleString()} people · {unclaimed} prize{unclaimed !== 1 ? "s" : ""} left
            </div>
          </div>
          {isActive && unclaimed > 0 && (
            <div className="text-xs text-[#a85f28] font-semibold mb-3">
              Entries are still open — tickets keep stacking until it closes. You can pull now, but most people wait for “Ended”.
            </div>
          )}
          {unclaimed === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[#4a7c59] font-bold"><IcoTrophy className="w-5 h-5" /> All prizes drawn!</div>
          ) : d.counts.eligible === 0 ? (
            <div className="text-center py-6 text-[#8a7559]">No tickets in the drum yet.</div>
          ) : (
            <>
              <div className="flex justify-center mb-3 mt-2">
                <button
                  onClick={() => setPresenting(true)}
                  className="inline-flex items-center gap-2 bg-[#241a12] hover:bg-black text-[#f6ecda] font-bold px-5 py-2.5 rounded-xl text-sm"
                >
                  Full-screen draw (for the camera)
                </button>
              </div>
              {g.drawStyle === "MACHINE" ? (
                <TicketMachine
                  entrants={d.pool}
                  totalTickets={d.counts.tickets}
                  canSpin={canSpin}
                  brand="Northwood Bids"
                  giveawayTitle={g.title}
                  size={640}
                  onDraw={draw}
                  onAward={award}
                />
              ) : (
                <SpinWheel
                  entrants={d.pool}
                  canSpin={canSpin}
                  brand="Northwood Bids"
                  giveawayTitle={g.title}
                  onDraw={draw}
                  onAward={award}
                />
              )}
            </>
          )}
        </section>
      )}

      {/* ── Prizes ─────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="font-bold text-lg text-[#241a12] mb-2">Prizes ({d.counts.prizes})</h2>
        <p className="text-xs text-[#8a7559] mb-3">Each prize = one winner.</p>

        <div className="space-y-2 mb-4">
          {d.prizes.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#e3d6bf] bg-white px-3 py-2.5">
              {p.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#efe6d4] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#241a12] truncate">{p.title}</div>
                <div className="text-xs text-[#8a7559]">
                  {p.retailValue != null ? `$${p.retailValue.toFixed(2)} value` : "No value set"}
                  {p.wonBy ? ` · won by ${p.wonBy.name}` : ""}
                </div>
              </div>
              {!p.wonBy && (
                <button onClick={() => removePrize(p.id)} className="text-red-600 text-sm font-semibold shrink-0">Remove</button>
              )}
            </div>
          ))}
          {d.prizes.length === 0 && <div className="text-sm text-[#8a7559]">No prizes yet — add one below.</div>}
        </div>

        {(isDraft || isActive || isEnded) && (
          <div className="rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-4">
            <div className="font-semibold text-[#6f5b46] text-sm mb-2">Add a prize</div>
            <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Prize name" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 mb-2 text-[#241a12]" />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={pValue} onChange={(e) => setPValue(e.target.value)} placeholder="Retail value $" inputMode="decimal" className="bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
              <select value={pLoc} onChange={(e) => setPLoc(e.target.value)} className="bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]">
                <option value="">Location…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" id="prize-photo" />
              <label htmlFor="prize-photo" className="cursor-pointer bg-white border border-[#cdbda3] rounded-xl px-3 py-2 text-sm text-[#6f5b46] font-semibold">
                {uploading ? "Uploading…" : pPhoto ? "Photo added" : "Add photo"}
              </label>
              {pPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pPhoto} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
            </div>
            <button onClick={addPrize} disabled={addingPrize || uploading} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
              {addingPrize ? "Adding…" : "Add prize"}
            </button>
          </div>
        )}
      </section>

      {/* ── Entrants ───────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="font-bold text-lg text-[#241a12] mb-1">Tickets ({d.counts.tickets.toLocaleString()} across {d.counts.eligible.toLocaleString()} people)</h2>
        <p className="text-xs text-[#8a7559] mb-3">
          {g.entryMode === "AUTO"
            ? "Every registered bidder is in automatically. Remove anyone you want to exclude, or hand out bonus tickets."
            : g.entryMode === "BID"
              ? "Tickets are counted live from bids placed in the window. Remove anyone, hand-add someone, or give bonus tickets."
              : "Bidders who tapped in (and answered, if asked) hold a ticket. You can hand-add, remove, or give bonus tickets."}
        </p>
        {g.entryMode === "BID" && d.pool.length > 0 && (
          <div className="mb-3 rounded-xl border border-[#e3d6bf] bg-white/70 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a7559] mb-1.5">Top ticket holders</div>
            <div className="flex flex-wrap gap-1.5">
              {d.pool.slice(0, 12).map((e) => (
                <span key={e.clerkUserId} className="text-xs bg-[#f6ecda] border border-[#e3d6bf] rounded-full px-2.5 py-1 text-[#6f5b46]">
                  {e.name} · <b className="text-[#241a12]">{e.tickets}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 rounded-xl border border-[#e3d6bf] bg-white/70 p-3 text-xs text-[#6f5b46]">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a7559] mb-1">Fair-play filter</div>
          {g.requireCard ? "Card on file, " : ""}phone + email, not blocked, one account per phone number. Kept out right now:{" "}
          {g.requireCard && <><b className="text-[#241a12]">{d.fairness.filtered.noCard}</b> no card · </>}<b className="text-[#241a12]">{d.fairness.filtered.incomplete}</b> incomplete · <b className="text-[#241a12]">{d.fairness.filtered.blocked}</b> blocked · <b className="text-[#241a12]">{d.fairness.filtered.duplicate}</b> duplicate phone.
          {(isDraft || isActive) && (
            <button onClick={() => patch({ requireCard: !g.requireCard })} className="ml-2 underline font-semibold text-[#6c4d39]">
              {g.requireCard ? "Switch to any registered bidder" : "Require a card on file"}
            </button>
          )}
          {d.fairness.duplicates.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.fairness.duplicates.map((x, i) => (
                <span key={i} className="bg-[#fbe6c8] text-[#a85f28] rounded-full px-2 py-0.5 font-semibold">{x.name} = {x.sameAs}</span>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a bidder to add or remove…" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
          {q.trim() && (
            <div className="mt-1 bg-white border border-[#cdbda3] rounded-xl overflow-hidden divide-y divide-[#efe6d4]">
              {results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-[#8a7559]">No matching bidders.</div>
              ) : (
                results.map((r) => (
                  <div key={r.clerkUserId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#241a12] text-sm truncate">
                        {r.name}
                        {r.inWheel && !r.won && <span className="ml-2 text-[11px] font-bold text-[#a85f28]">{r.tickets} ticket{r.tickets !== 1 ? "s" : ""}{r.bonusTickets > 0 ? ` (+${r.bonusTickets} bonus)` : ""}</span>}
                      </div>
                      {r.email && <div className="text-xs text-[#8a7559] truncate">{r.email}</div>}
                      {r.ineligible && (
                        <div className="text-[11px] font-bold text-[#a85f28]">
                          {r.ineligible === "no_card" ? "No card on file — can't hold a ticket" : r.ineligible === "incomplete" ? "Account incomplete — can't hold a ticket" : r.ineligible === "blocked" ? "Blocked" : `Duplicate phone — same as ${r.duplicateOf ?? "another account"}`}
                        </div>
                      )}
                    </div>
                    {!r.won && !r.removed && !r.ineligible && (
                      <button onClick={() => setBonus(r.clerkUserId, r.bonusTickets)} className="shrink-0 text-xs font-bold text-[#6c4d39] border border-[#cdbda3] rounded-full px-3 py-1 hover:bg-[#f6ecda]">
                        Bonus
                      </button>
                    )}
                    {r.won ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#4a7c59]"><IcoCheck className="w-3.5 h-3.5" /> Won</span>
                    ) : r.inWheel ? (
                      <button onClick={() => setRemoved(r.clerkUserId, true)} className="shrink-0 text-xs font-bold text-red-600 border border-red-200 rounded-full px-3 py-1 hover:bg-red-50">
                        Remove
                      </button>
                    ) : r.removed ? (
                      <button onClick={() => setRemoved(r.clerkUserId, false)} className="shrink-0 text-xs font-bold text-[#4a7c59] border border-[#cdecd4] rounded-full px-3 py-1 hover:bg-[#f2f9f4]">
                        Restore
                      </button>
                    ) : r.ineligible ? null : (
                      <button onClick={() => addName(r.clerkUserId)} className="shrink-0 text-xs font-bold text-[#6c4d39] border border-[#cdbda3] rounded-full px-3 py-1 hover:bg-[#f6ecda]">
                        Add
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {d.removed.length > 0 && (
          <div className="rounded-xl border border-[#e3d6bf] bg-[#fbf4e6] p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-2">Removed from wheel ({d.removed.length})</div>
            <div className="flex flex-wrap gap-2">
              {d.removed.map((r) => (
                <button key={r.clerkUserId} onClick={() => setRemoved(r.clerkUserId, false)} className="text-xs bg-white border border-[#cdbda3] rounded-full px-3 py-1 text-[#6f5b46] hover:bg-[#f6ecda]">
                  {r.name} · restore
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Full-screen presentation (customer-facing draw) ────────────────── */}
      {presenting && (
        <div className="fixed inset-0 z-[70] bg-gradient-to-b from-[#241a12] to-[#12100c] flex flex-col items-center justify-center px-4">
          <button
            onClick={() => setPresenting(false)}
            className="absolute top-4 right-4 text-[#f1e7d5]/70 hover:text-[#f1e7d5] font-bold text-sm bg-white/10 rounded-full px-4 py-2"
          >
            Exit
          </button>
          <div className="text-center mb-3">
            <div className="text-[#f0a35a] font-black uppercase tracking-[0.24em] text-xs">Northwood Bids Giveaway</div>
            <div className="text-[#fbf4e6] font-display text-2xl sm:text-3xl font-black mt-1">{g.title}</div>
            <div className="text-[#c9b79a] text-sm mt-1">
              {d.counts.tickets.toLocaleString()} tickets · {d.counts.eligible.toLocaleString()} people · {unclaimed} prize{unclaimed !== 1 ? "s" : ""} left
            </div>
          </div>
          {canSpin && g.drawStyle === "MACHINE" ? (
            <TicketMachine
              entrants={d.pool}
              totalTickets={d.counts.tickets}
              canSpin={canSpin}
              brand="Northwood Bids"
              giveawayTitle={g.title}
              size={Math.min(1100, typeof window !== "undefined" ? window.innerWidth - 32 : 900)}
              onDraw={draw}
              onAward={award}
            />
          ) : canSpin ? (
            <SpinWheel
              entrants={d.pool}
              canSpin={canSpin}
              brand="Northwood Bids"
              giveawayTitle={g.title}
              size={presentSize}
              onDraw={draw}
              onAward={award}
            />
          ) : (
            <div className="text-[#fbf4e6] text-lg font-bold">{unclaimed === 0 ? "All prizes drawn!" : "No tickets in the drum."}</div>
          )}
        </div>
      )}

      {/* ── Winners ────────────────────────────────────────────────────────── */}
      {d.winners.length > 0 && (
        <section className="mb-10">
          <h2 className="font-bold text-lg text-[#241a12] mb-2">Winners ({d.winners.length})</h2>
          <div className="space-y-2">
            {d.winners.map((w) => (
              <div key={w.clerkUserId + w.itemId} className="flex items-center justify-between gap-3 rounded-xl border border-[#dcecdf] bg-[#f2f9f4] px-4 py-3">
                <div className="min-w-0">
                  <div className="font-bold text-[#241a12] truncate inline-flex items-center gap-1.5"><IcoTrophy className="w-4 h-4 text-[#4a7c59]" /> {w.name}</div>
                  <div className="text-xs text-[#4a7c59] truncate">won {w.itemTitle} — added to their pickups</div>
                </div>
                {w.itemId && (
                  confirmRevert === w.itemId ? (
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-[#8a7559]">Undo?</span>
                      <button onClick={() => revert(w.itemId!)} className="text-xs font-bold text-red-600 border border-red-200 rounded-full px-2.5 py-1 hover:bg-red-50">Yes, undo</button>
                      <button onClick={() => setConfirmRevert(null)} className="text-xs text-[#8a7559]">cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRevert(w.itemId)} className="shrink-0 text-xs font-semibold text-[#8a7559] underline">
                      Undo win
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
