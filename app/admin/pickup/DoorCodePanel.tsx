"use client";

import { useState } from "react";
import { Btn, Eyebrow, Pill } from "../ui";
import { IcoLock, IcoBolt } from "@/app/components/BidIcons";

type Door = { code: string | null; status: string | null; sentAt: string | null; locks: { id: string; name: string }[] };

/**
 * The door-code strip on an appointment card (only at locations with locks).
 * Big code for reading over the phone, status of the programming, and the
 * buttons staff reach for when someone is standing outside: Resend, New code,
 * Unlock (per door).
 */
export default function DoorCodePanel({ appointmentId, door, scheduled, onChange }: { appointmentId: string; door: Door; scheduled: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: "resend" | "new" | "revoke" | "check") => {
    setBusy(action); setNote(null);
    try {
      const r = await fetch(`/api/admin/pickup/appointments/${appointmentId}/door`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok) setNote({ ok: false, text: d.error || "Didn't work." });
      else setNote({ ok: true, text: action === "resend" ? "Texted." : action === "new" ? (d.sent ? "New code made and texted." : "New code made. Text didn't go out — no phone?") : action === "revoke" ? "Code removed from the locks." : d.doorCodeStatus === "set" ? "On the locks and working." : d.doorCodeStatus === "failed" ? "The lock rejected it — try New code." : "Still programming…" });
      onChange();
    } catch { setNote({ ok: false, text: "Something went wrong." }); }
    setBusy(null);
  };

  const unlock = async (lockId: string, name: string) => {
    setBusy(`unlock:${lockId}`); setNote(null);
    try {
      const r = await fetch(`/api/admin/doors/${lockId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlock" }) });
      const d = await r.json();
      setNote(r.ok ? { ok: true, text: `${name} unlock sent — give it a few seconds.` } : { ok: false, text: d.error || `${name} didn't respond.` });
    } catch { setNote({ ok: false, text: "Something went wrong." }); }
    setBusy(null);
  };

  const status: { tone: "green" | "amber" | "red" | "slate"; label: string } =
    !door.code ? { tone: "slate", label: "No code" }
    : door.status === "set" ? { tone: "green", label: "On the locks" }
    : door.status === "failed" ? { tone: "red", label: "Failed" }
    : { tone: "amber", label: "Programming" };

  return (
    <div className="mt-4 rounded-xl border border-[#e6dac6] bg-[#faf5ea] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-full bg-[#241a12] text-[#f0a35a] grid place-items-center shrink-0"><IcoLock className="w-5 h-5" /></span>
          <div className="min-w-0">
            <Eyebrow>Door code</Eyebrow>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-black text-3xl tracking-[0.2em] text-[#241a12] tabular-nums">{door.code ?? "----"}</span>
              <Pill tone={status.tone} dot={status.tone === "green"}>{status.label}</Pill>
            </div>
            <div className="text-[13px] text-[#8a7559]">
              {door.locks.map((l) => l.name).join(" + ")}
              {door.sentAt ? ` · texted ${new Date(door.sentAt).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : door.code ? " · not texted yet" : ""}
            </div>
          </div>
        </div>
        {scheduled && (
          <div className="flex flex-wrap gap-2">
            {door.code && <Btn size="sm" variant="outline" onClick={() => run("resend")} disabled={busy !== null}>{busy === "resend" ? "Sending…" : "Resend"}</Btn>}
            <Btn size="sm" variant="outline" tone="amber" onClick={() => run("new")} disabled={busy !== null}>{busy === "new" ? "Making…" : door.code ? "New code" : "Make code"}</Btn>
            {door.code && door.status !== "set" && <Btn size="sm" variant="ghost" tone="slate" onClick={() => run("check")} disabled={busy !== null}>Check</Btn>}
          </div>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {door.locks.map((l) => (
          <Btn key={l.id} size="sm" tone="green" variant="outline" onClick={() => unlock(l.id, l.name)} disabled={busy !== null}>
            <IcoBolt className="w-4 h-4" /> {busy === `unlock:${l.id}` ? "Unlocking…" : `Unlock ${l.name.toLowerCase()}`}
          </Btn>
        ))}
        {scheduled && door.code && (
          <Btn size="sm" variant="ghost" tone="red" onClick={() => run("revoke")} disabled={busy !== null}>Remove code</Btn>
        )}
      </div>
      {note && <div className={`mt-2 text-[15px] font-semibold ${note.ok ? "text-[#2f5d3a]" : "text-[#a84a2f]"}`}>{note.text}</div>}
    </div>
  );
}
