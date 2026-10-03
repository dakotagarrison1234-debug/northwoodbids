"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IcoTicket, IcoUsers, IcoGavel, IcoCheck, IcoGift } from "@/app/components/BidIcons";
import { PageHeader, PageBody, Panel, Row, Pill, Btn, Input, Empty, Eyebrow, type Tone } from "../ui";

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

const PHASE: Record<Phase, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  scheduled: { label: "Scheduled", tone: "leather" },
  live: { label: "Live", tone: "green" },
  ended: { label: "Ended · pull winners", tone: "amber" },
  complete: { label: "Complete", tone: "blue" },
};
const MODE_LABEL: Record<EntryMode, string> = { AUTO: "Everyone's in", CLICK: "Tap to enter", BID: "Every bid = a ticket" };

/** <input type="datetime-local"> wants local wall-clock "YYYY-MM-DDTHH:MM". */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const FIELD = "w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";

/** One tappable choice in the setup wizard (pure — lives outside the page so it isn't recreated per render). */
function Card({ on, onClick, title: t, sub, icon }: { on: boolean; onClick: () => void; title: string; sub: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 px-3.5 py-3 min-h-[56px] transition-colors ${on ? "border-[#6c4d39] bg-[#f1e7d5]" : "border-[#e6dac6] bg-white hover:bg-[#faf5ea]"}`}
    >
      <div className="flex items-center gap-1.5 font-bold text-sm text-[#241a12]">{icon}{t}</div>
      <div className="text-[11px] text-[#8a7559] leading-tight mt-0.5">{sub}</div>
    </button>
  );
}

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
  const [requireCard, setRequireCard] = useState(false);

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
          requireCard,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't create."); setBusy(false); return; }
      router.push(`/admin/giveaways/${d.id}`);
    } catch { setErr("Something went wrong."); setBusy(false); }
  };

  return (
    <>
      <PageHeader
        title="Giveaways"
        sub="Free prizes that grow the crowd."
        actions={!creating ? <Btn size="sm" onClick={() => setCreating(true)}>New giveaway</Btn> : undefined}
      />

      <PageBody>
        {creating && (
          <Panel title="Set up a giveaway" sub="Title, how people get in, when it runs, how you draw.">
            <div className="p-4 sm:p-5">
              <Eyebrow className="mb-1.5">Title</Eyebrow>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall Kickoff Giveaway" className="mb-3" />
              <Eyebrow className="mb-1.5">Description <span className="normal-case tracking-normal font-semibold">(optional — shows on the card)</span></Eyebrow>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Two winners, drawn live Friday night." className={`${FIELD} py-3 mb-4`} />

              {/* 1. How do people get tickets? */}
              <Eyebrow className="mb-1.5">How do people get a ticket?</Eyebrow>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <Card on={entryMode === "AUTO"} onClick={() => pickMode("AUTO")} icon={<IcoUsers className="w-4 h-4 text-[#6c4d39]" />} title="Everyone's in" sub="Every registered bidder holds one ticket automatically" />
                <Card on={entryMode === "CLICK"} onClick={() => pickMode("CLICK")} icon={<IcoTicket className="w-4 h-4 text-[#6c4d39]" />} title="Tap to enter" sub="They tap a button on the card (optionally answer a question)" />
                <Card on={entryMode === "BID"} onClick={() => pickMode("BID")} icon={<IcoGavel className="w-4 h-4 text-[#6c4d39]" />} title="Every bid = a ticket" sub="Each bid placed while it's open is one ticket — win or lose, they stack" />
              </div>

              {entryMode === "CLICK" && (
                <div className="rounded-xl border border-[#e6dac6] bg-[#f4ede1] p-3 mb-3">
                  <Eyebrow className="mb-2">Ask them something?</Eyebrow>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Card on={requirement === "NONE"} onClick={() => setRequirement("NONE")} title="Just a tap" sub="No question" />
                    <Card on={requirement === "INFO"} onClick={() => setRequirement("INFO")} title="Collect info" sub="Any answer counts" />
                    <Card on={requirement === "ANSWER"} onClick={() => setRequirement("ANSWER")} title="Correct answer" sub="Must get it right" />
                  </div>
                  {requirement !== "NONE" && (
                    <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={requirement === "INFO" ? "What town are you in?" : "What year did Northwood open?"} className="mb-2" />
                  )}
                  {requirement === "ANSWER" && (
                    <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Accepted answer (not case-sensitive)" />
                  )}
                </div>
              )}

              {entryMode === "BID" && (
                <div className="rounded-xl border border-[#e6dac6] bg-[#f4ede1] p-3 mb-3 grid grid-cols-2 gap-2">
                  <div>
                    <Eyebrow className="mb-1">Only bids of at least</Eyebrow>
                    <div className="flex items-center gap-1"><span className="text-[#8a7559]">$</span><Input value={minBid} onChange={(e) => setMinBid(e.target.value)} inputMode="decimal" placeholder="any amount" /></div>
                  </div>
                  <div>
                    <Eyebrow className="mb-1">Max tickets per person</Eyebrow>
                    <Input value={maxTickets} onChange={(e) => setMaxTickets(e.target.value)} inputMode="numeric" placeholder="no cap" />
                  </div>
                  <div className="col-span-2 text-[11px] text-[#8a7559]">Bids on every auction count from the moment it opens until it ends. Leave both blank for the pure “every bid is a ticket.”</div>
                </div>
              )}

              {/* Stipulations */}
              <Eyebrow className="mb-1.5">Who counts as registered</Eyebrow>
              <div className="grid grid-cols-2 gap-2 mb-1">
                <Card on={!requireCard} onClick={() => setRequireCard(false)} title="Any registered bidder" sub="Phone + email on the account, not blocked" />
                <Card on={requireCard} onClick={() => setRequireCard(true)} title="Card on file only" sub="Same bar as bidding — keeps it to real buyers" />
              </div>
              <div className="text-[11px] text-[#8a7559] mb-4">Either way it&apos;s one account per phone number — duplicate sign-ups never get a second ticket.</div>

              {/* 2. When? */}
              <Eyebrow className="mb-1.5">Entry window</Eyebrow>
              <div className="grid grid-cols-2 gap-2 mb-1">
                <div>
                  <div className="text-[11px] text-[#8a7559] mb-1">Opens</div>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div>
                  <div className="text-[11px] text-[#8a7559] mb-1">Closes</div>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div className="text-[11px] text-[#8a7559] mb-4">Leave “Opens” blank to open the moment you go live. When it closes the card flips to “Ended — pulling winners soon” and you pull them whenever you&apos;re ready.{entryMode === "BID" ? " Bid giveaways need a close time." : " Leave “Closes” blank to close it by hand."}</div>

              {/* 3. How are winners pulled? */}
              <Eyebrow className="mb-1.5">Draw style</Eyebrow>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Card on={drawStyle === "WHEEL"} onClick={() => setDrawStyle("WHEEL")} title="Prize wheel" sub="Every name on a wedge. Best when everyone holds one ticket." />
                <Card on={drawStyle === "MACHINE"} onClick={() => setDrawStyle("MACHINE")} title="Ticket machine" sub="Brass drum, claw pulls a ticket. Best for big or weighted pools." />
              </div>

              {err && <div className="text-sm text-[#a1321f] font-semibold mb-3">{err}</div>}
              <div className="flex flex-wrap gap-2">
                <Btn onClick={create} disabled={busy}>
                  {busy ? "Creating…" : "Create & add prizes"}
                </Btn>
                <Btn tone="slate" variant="ghost" onClick={() => { setCreating(false); setErr(""); }}>Cancel</Btn>
              </div>
            </div>
          </Panel>
        )}

        <Panel>
          {rows === null ? (
            <p className="text-[#8a7559] py-8 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <Empty
              icon={<IcoGift className="w-10 h-10" />}
              text="No giveaways yet."
              sub="Create one to get started."
              action={!creating ? <Btn size="sm" onClick={() => setCreating(true)}>New giveaway</Btn> : undefined}
            />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {rows.map((g) => (
                <li key={g.id}>
                  <Row
                    href={`/admin/giveaways/${g.id}`}
                    leading={
                      <span className="grid place-items-center w-10 h-10 rounded-full bg-[#f1e7d5] text-[#6c4d39]">
                        {g.phase === "complete" ? <IcoCheck className="w-5 h-5" /> : <IcoGift className="w-5 h-5" />}
                      </span>
                    }
                    title={g.title}
                    sub={[
                      MODE_LABEL[g.entryMode],
                      g.drawStyle === "MACHINE" ? "Ticket machine" : "Wheel",
                      `${g.prizeCount} prize${g.prizeCount !== 1 ? "s" : ""}${g.winnersDrawn > 0 ? `, ${g.winnersDrawn} drawn` : ""}`,
                      g.endsAt ? `${g.phase === "ended" || g.phase === "complete" ? "ended" : "ends"} ${fmt(g.endsAt)}` : null,
                    ].filter(Boolean).join(" · ")}
                    trailing={<Pill tone={PHASE[g.phase].tone} dot={g.phase === "live"}>{PHASE[g.phase].label}</Pill>}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
