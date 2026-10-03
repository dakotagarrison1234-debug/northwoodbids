"use client";
import { useEffect, useState } from "react";
import AuctionStatusButtons from "@/app/components/AuctionStatusButtons";
import ProxyBidsPanel, { type ActiveProxy } from "./ProxyBidsPanel";
import { Panel, Input, Btn, BtnLink, Eyebrow, Notice } from "../../ui";

interface Props {
  auctionId: string;
  title: string;
  description: string | null;
  startAtISO: string;
  endAtISO: string;
  status: string;
  isOwnerOrAdmin: boolean;
  proxies: ActiveProxy[];
  /** When the "auction is live" blast went out — null means it hasn't. */
  liveNotifiedAtISO: string | null;
}

/** The page header's "Edit" button links to `#edit-auction` (kept as a literal there —
 *  exports of a "use client" module become client references on the server). */
const EDIT_ANCHOR = "edit-auction";

/** Date -> "YYYY-MM-DDTHH:mm" in the admin's LOCAL time (for <input datetime-local>). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TEXTAREA =
  "w-full bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 py-3 text-[#241a12] placeholder:text-[#b3a085] outline-none transition resize-none disabled:opacity-50";

/**
 * The auction's edit + control board. Everything that isn't a "view" lives here —
 * details, the action buttons (silent open, send live text, closing soon, settle),
 * the social flyer, and the private Active Max Bids panel — so the main manage page
 * stays clean and easy to scan.
 */
export default function EditAuction({
  auctionId, title, description, startAtISO, endAtISO, status, isOwnerOrAdmin, proxies, liveNotifiedAtISO,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description ?? "");
  const [start, setStart] = useState(toLocalInput(new Date(startAtISO)));
  const [end, setEnd] = useState(toLocalInput(new Date(endAtISO)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isDraft = status === "DRAFT";
  const isEnded = status === "CLOSED" || status === "SETTLED";

  // The page header's "Edit" button is a plain anchor to #edit-auction — open the
  // panel when we land on (or jump to) that hash so the button does what it says.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${EDIT_ANCHOR}`) setOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const save = async () => {
    setMsg(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setMsg({ kind: "err", text: "Enter an auction name." });
      return;
    }
    const endDate = new Date(end);
    if (isNaN(endDate.getTime())) {
      setMsg({ kind: "err", text: "Pick a valid end date and time." });
      return;
    }
    let startDate: Date | null = null;
    if (isDraft) {
      startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        setMsg({ kind: "err", text: "Pick a valid start date and time." });
        return;
      }
      if (endDate <= startDate) {
        setMsg({ kind: "err", text: "The end time must be after the start time." });
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: desc,
          endAt: endDate.toISOString(),
          ...(isDraft && startDate ? { startAt: startDate.toISOString() } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ kind: "ok", text: "Auction updated." });
      } else {
        setMsg({ kind: "err", text: data.error || "Could not save your changes." });
      }
    } catch {
      setMsg({ kind: "err", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div id={EDIT_ANCHOR} className="scroll-mt-4">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
              Edit auction
            </span>
          }
          sub="Open it, announce it, change the name or times."
          action={
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl hover:bg-[#f4ede1] transition-colors"
              aria-expanded={open}
              aria-label={open ? "Collapse edit auction" : "Expand edit auction"}
            >
              <span className={`inline-flex text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
              </span>
            </button>
          }
        >
          {open && (
            <div>
              {/* ── Actions ── */}
              <div className="px-4 sm:px-5 py-5 border-b border-[#f0e6d6]">
                <Eyebrow className="mb-3">Actions</Eyebrow>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                  <AuctionStatusButtons auctionId={auctionId} status={status} liveNotifiedAtISO={liveNotifiedAtISO} />
                  <BtnLink href={`/admin/auctions/${auctionId}/flyer`} variant="outline" tone="slate" className="w-full sm:w-auto">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="5.5" cy="6" r="1.2"/><path d="M2.5 11l3-3 3 3 2-2 3 3"/></svg>
                    Social flyer
                  </BtnLink>
                </div>
              </div>

              {/* ── Details ── */}
              {!isEnded && (
                <div className="px-4 sm:px-5 py-5 space-y-4">
                  <Eyebrow>Details</Eyebrow>

                  <label className="block">
                    <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Auction name</span>
                    <Input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Auction name" className="disabled:opacity-50" />
                  </label>

                  <label className="block">
                    <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Description</span>
                    <textarea
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      disabled={busy}
                      rows={3}
                      placeholder="What's in this auction? Shown to bidders."
                      className={TEXTAREA}
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {isDraft && (
                      <label className="block">
                        <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Opens at</span>
                        <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} className="disabled:opacity-50" />
                      </label>
                    )}
                    <label className="block">
                      <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Closes at</span>
                      <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} className="disabled:opacity-50" />
                    </label>
                  </div>

                  <p className="text-sm text-[#8a7559]">
                    The auction opens and closes automatically at these times. To end it early, set the close time to now.
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Btn onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save changes"}
                    </Btn>
                    {msg && (
                      <Notice tone={msg.kind === "ok" ? "green" : "red"} className="py-2">{msg.text}</Notice>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Active Max Bids (owner/admin only) — its own panel so the headroom
          number is visible without opening the editor. ── */}
      {isOwnerOrAdmin && <ProxyBidsPanel proxies={proxies} />}
    </>
  );
}
