"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Btn, Notice } from "../../ui";

interface Props {
  auctionId: string;
  title: string;
  description: string | null;
  startAtISO: string;
  endAtISO: string;
  status: string;
}

/** Date -> "YYYY-MM-DDTHH:mm" in the admin's LOCAL time (for <input datetime-local>). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TEXTAREA =
  "w-full bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 py-3 text-[#241a12] placeholder:text-[#b3a085] outline-none transition resize-none disabled:opacity-50";

/**
 * The auction's details form — name, description, opens, closes — rendered inside
 * the page's collapsed "Details" disclosure. Labels match the create form.
 */
export default function EditAuction({ auctionId, title, description, startAtISO, endAtISO, status }: Props) {
  const router = useRouter();
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description ?? "");
  const [start, setStart] = useState(toLocalInput(new Date(startAtISO)));
  const [end, setEnd] = useState(toLocalInput(new Date(endAtISO)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
      setMsg({ kind: "err", text: "Pick a valid closing date and time." });
      return;
    }
    let startDate: Date | null = null;
    if (isDraft) {
      startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        setMsg({ kind: "err", text: "Pick a valid opening date and time." });
        return;
      }
      if (endDate <= startDate) {
        setMsg({ kind: "err", text: "The closing time has to be after the opening time." });
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
        setMsg({ kind: "ok", text: "Saved." });
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

  return (
    <div className="px-4 sm:px-5 py-5 space-y-4">
      <label className="block">
        <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Name</span>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Name" className="disabled:opacity-50" />
      </label>

      <label className="block">
        <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Description <span className="font-semibold text-[#b3a085]">(optional)</span></span>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Shown to bidders."
          className={TEXTAREA}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isDraft && (
          <label className="block">
            <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Opens</span>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} className="disabled:opacity-50" />
          </label>
        )}
        <label className="block">
          <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Closes</span>
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} className="disabled:opacity-50" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Btn>
        {msg && (
          <Notice tone={msg.kind === "ok" ? "green" : "red"} className="py-2">{msg.text}</Notice>
        )}
      </div>
    </div>
  );
}
