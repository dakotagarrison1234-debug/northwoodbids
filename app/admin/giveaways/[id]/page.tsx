"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SpinWheel, { type DrawResult } from "./SpinWheel";
import TicketMachine from "./TicketMachine";
import { IcoTrophy, IcoCheck } from "@/app/components/BidIcons";
import { PageHeader, PageBody, Panel, Pill, Btn, Input, Notice, Eyebrow, Initials, type Tone } from "../../ui";

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
    announcedAt: string | null;
  };
  prizes: Prize[];
  pool: Entrant[];
  winners: Winner[];
  removed: { clerkUserId: string; name: string }[];
  counts: { prizes: number; drawn: number; eligible: number; tickets: number };
  fairness: { filtered: { noCard: number; incomplete: number; blocked: number; duplicate: number }; duplicates: { name: string; sameAs: string }[] };
};

const PHASE: Record<Phase, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  scheduled: { label: "Scheduled", tone: "leather" },
  live: { label: "Live", tone: "green" },
  ended: { label: "Ended · pull winners", tone: "amber" },
  complete: { label: "Complete", tone: "blue" },
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

const SELECT = "w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] outline-none transition";

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

  // ── Announce (one text blast to every engaged bidder) ─────────────────────
  const [announcing, setAnnouncing] = useState(false);
  const [confirmAnnounce, setConfirmAnnounce] = useState(false);
  const announce = async () => {
    setAnnouncing(true);
    try {
      const res = await fetch(`/api/admin/giveaways/${id}/announce`, { method: "POST" });
      const r = await res.json();
      if (!res.ok) setMsg(r.error || "Couldn't send.");
      else setMsg(`Texted ${r.sent} bidder${r.sent === 1 ? "" : "s"}.`);
    } catch { setMsg("Something went wrong."); }
    setAnnouncing(false);
    setConfirmAnnounce(false);
    load();
  };

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

  if (!d) {
    return (
      <>
        <PageHeader back={{ href: "/admin/giveaways", label: "Giveaways" }} tabs={false} title="Giveaway" />
        <PageBody><p className="text-[#8a7559] py-8 text-center">Loading…</p></PageBody>
      </>
    );
  }

  const g = d.giveaway;
  const isDraft = g.status === "DRAFT";
  const isActive = g.status === "ACTIVE";
  const isEnded = g.status === "ENDED";
  const unclaimed = d.prizes.filter((p) => !p.wonBy).length;
  const canSpin = (isActive || isEnded) && unclaimed > 0 && d.counts.eligible > 0;
  const phase = PHASE[g.phase];
  const poolLine = `${d.counts.tickets.toLocaleString()} tickets · ${d.counts.eligible.toLocaleString()} people · ${unclaimed} prize${unclaimed !== 1 ? "s" : ""} left`;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/giveaways", label: "Giveaways" }}
        tabs={false}
        eyebrow="Giveaway"
        title={g.title}
        sub={ruleLine(g)}
        actions={<Pill tone={phase.tone} dot={g.phase === "live"}>{phase.label}</Pill>}
      />

      <PageBody>
        <div className="text-sm text-[#8a7559] flex flex-wrap gap-x-3 gap-y-1 -mt-1">
          <span>{g.drawStyle === "MACHINE" ? "Ticket machine" : "Prize wheel"}</span>
          {g.startsAt && <span>· opens {fmt(g.startsAt)}</span>}
          {g.endsAt && <span>· {g.phase === "ended" || g.phase === "complete" ? "closed" : "closes"} {fmt(g.endedAt ?? g.endsAt)}</span>}
          {!g.endsAt && !isDraft && g.phase !== "complete" && <span>· closes when you end it</span>}
        </div>

        {msg && <Notice tone={msg.startsWith("Texted") ? "green" : "red"}>{msg}</Notice>}

        {/* Status actions */}
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <Btn tone="green" onClick={() => patch({ status: "ACTIVE" })}>
              Go live (show on home)
            </Btn>
          )}
          {isActive && (
            <>
              {g.phase === "live" && !g.announcedAt && (
                confirmAnnounce ? (
                  <span className="inline-flex flex-wrap items-center gap-2 bg-[#fbeed8] border border-[#eed3ab] rounded-xl px-3 py-2 text-sm">
                    <span className="text-[#8a4f1c] font-semibold">Text every bidder that it&apos;s live?</span>
                    <Btn tone="ink" size="sm" onClick={announce} disabled={announcing}>{announcing ? "Sending…" : "Yes, send"}</Btn>
                    <Btn tone="slate" variant="ghost" size="sm" onClick={() => setConfirmAnnounce(false)}>cancel</Btn>
                  </span>
                ) : (
                  <Btn tone="ink" onClick={() => setConfirmAnnounce(true)}>
                    Announce (text everyone)
                  </Btn>
                )
              )}
              {g.announcedAt && <span className="self-center text-xs text-[#8a7559]">Announced {fmt(g.announcedAt)}</span>}
              <Btn tone="amber" onClick={() => patch({ status: "ENDED" })}>
                End now (close entries)
              </Btn>
              <Btn tone="slate" variant="outline" onClick={() => setEditEnd(editEnd == null ? toLocalInput(g.endsAt) : null)}>
                Change close time
              </Btn>
              {d.counts.drawn === 0 && (
                <Btn tone="slate" variant="outline" onClick={() => patch({ status: "DRAFT" })}>
                  Unpublish
                </Btn>
              )}
            </>
          )}
          {isEnded && d.counts.drawn === 0 && (
            <Btn tone="slate" variant="outline" onClick={() => setEditEnd(editEnd == null ? toLocalInput(g.endsAt) : null)}>
              Reopen with a new close time
            </Btn>
          )}
          {(isActive || isEnded) && (
            <Btn tone="slate" variant="outline" onClick={() => patch({ drawStyle: g.drawStyle === "MACHINE" ? "WHEEL" : "MACHINE" })}>
              Switch to {g.drawStyle === "MACHINE" ? "wheel" : "ticket machine"}
            </Btn>
          )}
          {g.status === "DRAWN" && (
            <Btn tone="slate" variant="outline" onClick={() => patch({ archived: true })}>
              Archive
            </Btn>
          )}
        </div>

        {editEnd != null && (
          <Panel title={isEnded ? "New close time" : "Change close time"}>
            <div className="p-4 sm:p-5 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 sm:flex-none">
                <Eyebrow className="mb-1">{isEnded ? "New close time" : "Closes"}</Eyebrow>
                <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </div>
              <Btn
                onClick={async () => {
                  await patch({ endsAt: editEnd ? new Date(editEnd).toISOString() : null, ...(isEnded ? { status: "ACTIVE" } : {}) });
                  setEditEnd(null);
                }}
              >
                {isEnded ? "Reopen" : "Save"}
              </Btn>
              <Btn tone="slate" variant="ghost" onClick={() => setEditEnd(null)}>Cancel</Btn>
            </div>
          </Panel>
        )}

        {/* ── Draw (live, ended, or complete) ────────────────────────────────── */}
        {(isActive || isEnded || g.status === "DRAWN") && (
          <Panel title="Pull winners" sub={poolLine}>
            <div className="p-4 sm:p-5">
              {isActive && unclaimed > 0 && (
                <Notice tone="amber" className="mb-3">
                  Entries are still open — tickets keep stacking until it closes. You can pull now, but most people wait for “Ended”.
                </Notice>
              )}
              {unclaimed === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[#2f5d3a] font-display font-black text-lg"><IcoTrophy className="w-5 h-5" /> All prizes drawn!</div>
              ) : d.counts.eligible === 0 ? (
                <div className="text-center py-6 text-[#8a7559]">No tickets in the drum yet.</div>
              ) : (
                <>
                  <div className="flex justify-center mb-3">
                    <Btn tone="ink" onClick={() => setPresenting(true)}>
                      Full-screen draw (for the camera)
                    </Btn>
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
            </div>
          </Panel>
        )}

        {/* ── Prizes ─────────────────────────────────────────────────────────── */}
        <Panel title={`Prizes (${d.counts.prizes})`} sub="Each prize = one winner.">
          {d.prizes.length === 0 ? (
            <div className="px-4 sm:px-5 py-4 text-sm text-[#8a7559]">No prizes yet — add one below.</div>
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {d.prizes.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[56px]">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#efe3d0] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#241a12] truncate">{p.title}</div>
                    <div className="text-sm text-[#8a7559] truncate">
                      {p.retailValue != null ? `$${p.retailValue.toFixed(2)} value` : "No value set"}
                      {p.wonBy ? ` · won by ${p.wonBy.name}` : ""}
                    </div>
                  </div>
                  {p.wonBy ? (
                    <Pill tone="green">Won</Pill>
                  ) : (
                    <Btn tone="red" variant="ghost" size="sm" className="-mr-2" onClick={() => removePrize(p.id)}>Remove</Btn>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(isDraft || isActive || isEnded) && (
            <div className="border-t border-[#f0e6d6] bg-[#faf5ea] p-4 sm:p-5">
              <Eyebrow className="mb-2">Add a prize</Eyebrow>
              <Input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Prize name" className="mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input value={pValue} onChange={(e) => setPValue(e.target.value)} placeholder="Retail value $" inputMode="decimal" />
                <select value={pLoc} onChange={(e) => setPLoc(e.target.value)} className={SELECT}>
                  <option value="">Location…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" id="prize-photo" />
                <label htmlFor="prize-photo" className="cursor-pointer inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-xl bg-white border-2 border-[#e6dac6] text-[#6f5b46] text-sm font-bold hover:bg-[#faf5ea] transition-colors">
                  {uploading ? "Uploading…" : pPhoto ? "Photo added" : "Add photo"}
                </label>
                {pPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pPhoto} alt="" className="w-10 h-10 rounded-lg object-cover" />
                )}
              </div>
              <Btn onClick={addPrize} disabled={addingPrize || uploading}>
                {addingPrize ? "Adding…" : "Add prize"}
              </Btn>
            </div>
          )}
        </Panel>

        {/* ── Entrants ───────────────────────────────────────────────────────── */}
        <Panel title={`Tickets (${d.counts.tickets.toLocaleString()})`} sub={`across ${d.counts.eligible.toLocaleString()} people`}>
          <div className="p-4 sm:p-5 space-y-3">
            <p className="text-sm text-[#8a7559]">
              {g.entryMode === "AUTO"
                ? "Every registered bidder is in automatically. Remove anyone you want to exclude, or hand out bonus tickets."
                : g.entryMode === "BID"
                  ? "Tickets are counted live from bids placed in the window. Remove anyone, hand-add someone, or give bonus tickets."
                  : "Bidders who tapped in (and answered, if asked) hold a ticket. You can hand-add, remove, or give bonus tickets."}
            </p>
            {g.entryMode === "BID" && d.pool.length > 0 && (
              <div className="rounded-xl border border-[#e6dac6] bg-[#f4ede1] p-3">
                <Eyebrow className="mb-1.5">Top ticket holders</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                  {d.pool.slice(0, 12).map((e) => (
                    <span key={e.clerkUserId} className="text-xs bg-white border border-[#e6dac6] rounded-full px-2.5 py-1 text-[#6f5b46]">
                      {e.name} · <b className="text-[#241a12]">{e.tickets}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#e6dac6] bg-[#f4ede1] p-3 text-xs text-[#6f5b46]">
              <Eyebrow className="mb-1">Fair-play filter</Eyebrow>
              {g.requireCard ? "Card on file, " : ""}phone + email, not blocked, one account per phone number. Kept out right now:{" "}
              {g.requireCard && <><b className="text-[#241a12]">{d.fairness.filtered.noCard}</b> no card · </>}<b className="text-[#241a12]">{d.fairness.filtered.incomplete}</b> incomplete · <b className="text-[#241a12]">{d.fairness.filtered.blocked}</b> blocked · <b className="text-[#241a12]">{d.fairness.filtered.duplicate}</b> duplicate phone.
              {(isDraft || isActive) && (
                <button type="button" onClick={() => patch({ requireCard: !g.requireCard })} className="ml-2 underline font-semibold text-[#6c4d39] min-h-[24px]">
                  {g.requireCard ? "Switch to any registered bidder" : "Require a card on file"}
                </button>
              )}
              {d.fairness.duplicates.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.fairness.duplicates.map((x, i) => (
                    <span key={i} className="bg-[#fbeed8] text-[#8a4f1c] rounded-full px-2 py-0.5 font-semibold">{x.name} = {x.sameAs}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a bidder to add or remove…" />
              {q.trim() && (
                <div className="mt-1 bg-white border border-[#e6dac6] rounded-xl overflow-hidden divide-y divide-[#f0e6d6]">
                  {results.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-[#8a7559]">No matching bidders.</div>
                  ) : (
                    results.map((r) => (
                      <div key={r.clerkUserId} className="flex items-center justify-between gap-2 px-3 py-2 min-h-[56px]">
                        <Initials name={r.name} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#241a12] text-sm truncate">
                            {r.name}
                            {r.inWheel && !r.won && <span className="ml-2 text-[11px] font-bold text-[#8a4f1c]">{r.tickets} ticket{r.tickets !== 1 ? "s" : ""}{r.bonusTickets > 0 ? ` (+${r.bonusTickets} bonus)` : ""}</span>}
                          </div>
                          {r.email && <div className="text-xs text-[#8a7559] truncate">{r.email}</div>}
                          {r.ineligible && (
                            <div className="text-[11px] font-bold text-[#8a4f1c]">
                              {r.ineligible === "no_card" ? "No card on file — can't hold a ticket" : r.ineligible === "incomplete" ? "Account incomplete — can't hold a ticket" : r.ineligible === "blocked" ? "Blocked" : `Duplicate phone — same as ${r.duplicateOf ?? "another account"}`}
                            </div>
                          )}
                        </div>
                        {!r.won && !r.removed && !r.ineligible && (
                          <Btn tone="leather" variant="outline" size="sm" onClick={() => setBonus(r.clerkUserId, r.bonusTickets)}>
                            Bonus
                          </Btn>
                        )}
                        {r.won ? (
                          <Pill tone="green"><IcoCheck className="w-3 h-3" /> Won</Pill>
                        ) : r.inWheel ? (
                          <Btn tone="red" variant="outline" size="sm" onClick={() => setRemoved(r.clerkUserId, true)}>
                            Remove
                          </Btn>
                        ) : r.removed ? (
                          <Btn tone="green" variant="outline" size="sm" onClick={() => setRemoved(r.clerkUserId, false)}>
                            Restore
                          </Btn>
                        ) : r.ineligible ? null : (
                          <Btn tone="leather" variant="outline" size="sm" onClick={() => addName(r.clerkUserId)}>
                            Add
                          </Btn>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {d.removed.length > 0 && (
              <div className="rounded-xl border border-[#e6dac6] bg-[#f4ede1] p-3">
                <Eyebrow className="mb-2">Removed from wheel ({d.removed.length})</Eyebrow>
                <div className="flex flex-wrap gap-2">
                  {d.removed.map((r) => (
                    <Btn key={r.clerkUserId} tone="slate" variant="outline" size="sm" onClick={() => setRemoved(r.clerkUserId, false)}>
                      {r.name} · restore
                    </Btn>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* ── Winners ────────────────────────────────────────────────────────── */}
        {d.winners.length > 0 && (
          <Panel title={`Winners (${d.winners.length})`} tone="green">
            <ul className="divide-y divide-[#f0e6d6]">
              {d.winners.map((w) => (
                <li key={w.clerkUserId + w.itemId} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 min-h-[56px] bg-[#e6f1e8]">
                  <span className="grid place-items-center w-10 h-10 rounded-full bg-white text-[#4a7c59] shrink-0"><IcoTrophy className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#241a12] truncate">{w.name}</div>
                    <div className="text-sm text-[#2f5d3a] truncate">won {w.itemTitle} — added to their pickups</div>
                  </div>
                  {w.itemId && (
                    confirmRevert === w.itemId ? (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-xs text-[#8a7559]">Undo?</span>
                        <Btn tone="red" variant="outline" size="sm" onClick={() => revert(w.itemId!)}>Yes, undo</Btn>
                        <Btn tone="slate" variant="ghost" size="sm" onClick={() => setConfirmRevert(null)}>cancel</Btn>
                      </div>
                    ) : (
                      <Btn tone="slate" variant="ghost" size="sm" className="-mr-2" onClick={() => setConfirmRevert(w.itemId)}>
                        Undo win
                      </Btn>
                    )
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageBody>

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
    </>
  );
}
