"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  auctionId: string;
  endAtISO: string;
  status: string;
}

/** Date -> "YYYY-MM-DDTHH:mm" in the admin's LOCAL time (for <input datetime-local>). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditEndTime({ auctionId, endAtISO, status }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(toLocalInput(new Date(endAtISO)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isLive = status === "OPEN" || status === "CLOSING";

  const save = async (iso: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endAt: iso }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ kind: "ok", text: "End time updated." });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: data.error || "Could not update the end time." });
      }
    } catch {
      setMsg({ kind: "err", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const saveFromInput = () => {
    const d = new Date(value); // datetime-local is interpreted as local time
    if (isNaN(d.getTime())) {
      setMsg({ kind: "err", text: "Pick a valid date and time." });
      return;
    }
    save(d.toISOString());
  };

  const quickSet = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60_000);
    setValue(toLocalInput(d));
    save(d.toISOString());
  };

  return (
    <div className="bg-white border border-[#e3d6bf] rounded-xl p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-[#241a12] mb-1">Edit end time</h2>
      <p className="text-sm text-[#6f5b46] mb-4">
        Reschedule when this auction closes. All items snap to the new end time, and the
        &ldquo;ending soon&rdquo; text is re-armed so it can send again.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="flex-1">
          <span className="block text-sm font-medium text-[#4a3a2b] mb-1.5">Closes at</span>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39] disabled:opacity-50"
          />
        </label>
        <button
          onClick={saveFromInput}
          disabled={busy}
          className="bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Saving…" : "Save end time"}
        </button>
      </div>

      {isLive && (
        <div className="mt-4 pt-4 border-t border-[#efe3d0]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b3a085] mb-2">Quick test</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => quickSet(50)}
              disabled={busy}
              className="flex-1 bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              Set ~50 min out → triggers &ldquo;ending soon&rdquo; text
            </button>
            <button
              onClick={() => quickSet(-1)}
              disabled={busy}
              className="flex-1 bg-[#4a3a2b] hover:bg-[#241a12] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              Set end to now → closes &amp; charges (~1 min)
            </button>
          </div>
          <p className="text-xs text-[#8a7559] mt-2">
            These rely on the every-minute job, so allow up to a minute. The &ldquo;ending soon&rdquo;
            text only sends if an item has at least one active bidder.
          </p>
        </div>
      )}

      {msg && (
        <p className={`text-sm mt-3 ${msg.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
