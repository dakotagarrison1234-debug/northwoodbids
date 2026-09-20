"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IcoTicket, IcoUsers, IcoGavel, IcoCheck } from "@/app/components/BidIcons";

type Requirement = "NONE" | "INFO" | "ANSWER";
type EntryMode = "AUTO" | "CLICK" | "BID";
type DrawStyle = "WHEEL" | "MACHINE";
type Phase = "draft" | "scheduled" | "live" | "ended" | "complete";
type GiveawayRow = {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ENDED" | "DRAWN";
  phase: Phase;
  entryMode: EntryMode;
  drawStyle: DrawStyle;
  requirement: Requirement;
  prizeCount: number;
  winnersDrawn: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

const PHASE: Record<Phase, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[#efe6d4] text-[#8a7559]" },
  scheduled: { label: "Scheduled", cls: "bg-[#e9dcc6] text-[#6c4d39]" },
  live: { label: "Live", cls: "bg-[#dff0e4] text-[#2f7a48]" },
  ended: { label: "Ended · pull winners", cls: "bg-[#fbe6c8] text-[#a85f28]" },
  complete: { label: "Complete", cls: "bg-[#e6dcff] text-[#5b46a8]" },
};
const MODE_LABEL: Record<EntryMode, string> = { AUTO: "Everyone's in", CLICK: "Tap to enter", BID: "Every bid = a ticket" };

/** <input type="datetime-local"> wants local wall-clock "YYYY-MM-DDTHH:MM". */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function GiveawaysPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GiveawayRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ── Setup form ─────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("AUTO");
  const [requirement, setRequirement] = useState<Requirement>("NONE");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [drawStyle, setDrawStyle] = useState<DrawStyle>("WHEEL");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [minBid, setMinBid] = useState("");
  const [maxTickets, setMaxTickets] = useState("");

  const load = () => {
    fetch("/api/admin/giveaways")
      .then((r) => r.json())
      .then((d) => setRows(d.giveaways ?? []))
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  const pickMode = (m: EntryMode) => {
    setEntryMode(m);
    if (m !== "CLICK") setRequirement("NONE");
    if (m === "BID") setDrawStyle("MACHINE");
  };

  const create = async () => {
    setErr("");
    if (!title.trim()) { setErr("Give it a title."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/giveaways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, entryMode, drawStyle,
          requirement: entryMode === "CLICK" ? requirement : "NONE",
          requirementPrompt: prompt, requirementAnswer: answer,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          minBidAmount: entryMode === "BID" ? minBid : null,
          maxTicketsPerUser: entryMode === "BID" ? maxTickets : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't create."); setBusy(false); return; }
      router.push(`/admin/giveaways/${d.id}`);
    } catch { setErr("Something went wrong."); setBusy(false); }
  };

  const Card = ({ on, onClick, title: t, sub, icon }: { on: boolean; onClick: () => void; title: string; sub: string; icon?: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${on ? "border-[#6c4d39] bg-white" : "border-[#e3d6bf] bg-white/60 hover:bg-white"}`}
    >
      <div className="flex items-center gap-1.5 font-bold text-sm text-[#241a12]">{icon}{t}</div>
      <div className="text-[11px] text-[#8a7559] leading-tight mt-0.5">{sub}</div>
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#241a12]">Giveaways</h1>
        {!creating && (
          <button onClick={() => setCreating(true)} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-4 py-2.5 rounded-xl text-sm">
            + New giveaway
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-6 rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-5">
          <h2 className="font-bold text-lg text-[#241a12] mb-3">Set up a giveaway</h2>

          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall Kickoff Giveaway" className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 mb-3 text-[#241a12]" />
          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Description <span className="font-normal text-[#8a7559]">(optional — shows on the card)</span></label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Two winners, drawn live Friday night." className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 mb-4 text-[#241a12]" />

          {/* 1. How do people get tickets? */}
          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">How do people get a ticket?</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <Card on={entryMode === "AUTO"} onClick={() => pickMode("AUTO")} icon={<IcoUsers className="w-4 h-4 text-[#6c4d39]" />} title="Everyone's in" sub="Every registered bidder holds one ticket automatically" />
            <Card on={entryMode === "CLICK"} onClick={() => pickMode("CLICK")} icon={<IcoTicket className="w-4 h-4 text-[#6c4d39]" />} title="Tap to enter" sub="They tap a button on the card (optionally answer a question)" />
            <Card on={entryMode === "BID"} onClick={() => pickMode("BID")} icon={<IcoGavel className="w-4 h-4 text-[#6c4d39]" />} title="Every bid = a ticket" sub="Each bid placed while it's open is one ticket — win or lose, they stack" />
          </div>

          {entryMode === "CLICK" && (
            <div className="rounded-xl border border-[#e3d6bf] bg-white/60 p-3 mb-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-2">Ask them something?</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <Card on={requirement === "NONE"} onClick={() => setRequirement("NONE")} title="Just a tap" sub="No question" />
                <Card on={requirement === "INFO"} onClick={() => setRequirement("INFO")} title="Collect info" sub="Any answer counts" />
                <Card on={requirement === "ANSWER"} onClick={() => setRequirement("ANSWER")} title="Correct answer" sub="Must get it right" />
              </div>
              {requirement !== "NONE" && (
                <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={requirement === "INFO" ? "What town are you in?" : "What year did Northwood open?"} className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 mb-2 text-[#241a12]" />
              )}
              {requirement === "ANSWER" && (
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Accepted answer (not case-sensitive)" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
              )}
            </div>
          )}

          {entryMode === "BID" && (
            <div className="rounded-xl border border-[#e3d6bf] bg-white/60 p-3 mb-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-1">Only bids of at least</div>
                <div className="flex items-center gap-1"><span className="text-[#8a7559]">$</span><input value={minBid} onChange={(e) => setMinBid(e.target.value)} inputMode="decimal" placeholder="any amount" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" /></div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-1">Max tickets per person</div>
                <input value={maxTickets} onChange={(e) => setMaxTickets(e.target.value)} inputMode="numeric" placeholder="no cap" className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
              </div>
              <div className="col-span-2 text-[11px] text-[#8a7559]">Bids on every auction count from the moment it opens until it ends. Leave both blank for the pure “every bid is a ticket.”</div>
            </div>
          )}

          {/* 2. When? */}
          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Entry window</label>
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div>
              <div className="text-[11px] text-[#8a7559] mb-1">Opens</div>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
            </div>
            <div>
              <div className="text-[11px] text-[#8a7559] mb-1">Closes</div>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full bg-white border border-[#cdbda3] rounded-xl px-3 py-2.5 text-[#241a12]" />
            </div>
          </div>
          <div className="text-[11px] text-[#8a7559] mb-4">Leave “Opens” blank to open the moment you go live. When it closes the card flips to “Ended — pulling winners soon” and you pull them whenever you're ready.{entryMode === "BID" ? " Bid giveaways need a close time." : " Leave “Closes” blank to close it by hand."}</div>

          {/* 3. How are winners pulled? */}
          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Draw style</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Card on={drawStyle === "WHEEL"} onClick={() => setDrawStyle("WHEEL")} title="Prize wheel" sub="Every name on a wedge. Best when everyone holds one ticket." />
            <Card on={drawStyle === "MACHINE"} onClick={() => setDrawStyle("MACHINE")} title="Ticket machine" sub="Brass drum, claw pulls a ticket. Best for big or weighted pools." />
          </div>

          {err && <div className="text-sm text-red-600 font-semibold mb-3">{err}</div>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
              {busy ? "Creating…" : "Create & add prizes"}
            </button>
            <button onClick={() => { setCreating(false); setErr(""); }} className="text-[#6f5b46] font-semibold px-4 py-2.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {rows === null ? (
        <div className="text-[#8a7559] py-10 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[#8a7559] py-10 text-center">No giveaways yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((g) => (
            <Link key={g.id} href={`/admin/giveaways/${g.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] px-4 py-3.5 hover:bg-[#f6ecda] transition-colors">
              <div className="min-w-0">
                <div className="font-bold text-[#241a12] truncate">{g.title}</div>
                <div className="text-xs text-[#8a7559] mt-0.5 flex flex-wrap gap-x-2">
                  <span>{MODE_LABEL[g.entryMode]}</span>
                  <span>· {g.drawStyle === "MACHINE" ? "Ticket machine" : "Wheel"}</span>
                  <span>· {g.prizeCount} prize{g.prizeCount !== 1 ? "s" : ""}{g.winnersDrawn > 0 ? `, ${g.winnersDrawn} drawn` : ""}</span>
                  {g.endsAt && <span>· {g.phase === "ended" || g.phase === "complete" ? "ended" : "ends"} {fmt(g.endsAt)}</span>}
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${PHASE[g.phase].cls}`}>
                {g.phase === "complete" && <IcoCheck className="w-3 h-3" />}{PHASE[g.phase].label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
