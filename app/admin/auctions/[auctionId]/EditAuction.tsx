"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  auctionId: string;
  title: string;
  startAtISO: string;
  endAtISO: string;
  status: string;
}

/** Date -> "YYYY-MM-DDTHH:mm" in the admin's LOCAL time (for <input datetime-local>). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditAuction({ auctionId, title, startAtISO, endAtISO, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [start, setStart] = useState(toLocalInput(new Date(startAtISO)));
  const [end, setEnd] = useState(toLocalInput(new Date(endAtISO)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Start time only matters before the auction opens.
  const isDraft = status === "DRAFT";

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
          endAt: endDate.toISOString(),
          ...(isDraft && startDate ? { startAt: startDate.toISOString() } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ kind: "ok", text: "Auction updated." });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: data.error || "Could not save your changes." });
      }
    } catch {
      setMsg({ kind: "err", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39] disabled:opacity-50";

  return (
    <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
      {/* Tab header — collapsed by default */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 hover:bg-[#efe3d0]/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-[#241a12]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
          Edit auction
        </span>
        <span className={`text-[#8a7559] transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
        </span>
      </button>

      {open && (
        <div className="px-5 sm:px-6 pb-6 pt-1 border-t border-[#efe3d0] space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-[#4a3a2b] mb-1.5">Auction name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Auction name"
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isDraft && (
              <label className="block">
                <span className="block text-sm font-medium text-[#4a3a2b] mb-1.5">Opens at</span>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={busy}
                  className={inputCls}
                />
              </label>
            )}
            <label className="block">
              <span className="block text-sm font-medium text-[#4a3a2b] mb-1.5">Closes at</span>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={busy}
                className={inputCls}
              />
            </label>
          </div>

          <p className="text-sm text-[#8a7559]">
            The auction opens and closes automatically at these times. To end it early, set the close
            time to now — winners are charged shortly after it closes.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            {msg && (
              <span className={`text-sm ${msg.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
