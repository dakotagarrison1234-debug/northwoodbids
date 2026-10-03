"use client";
import { useState } from "react";
import { IcoCheck } from "@/app/components/BidIcons";
import { Btn, Initials, Notice } from "./ui";

export type MessageTarget = {
  clerkUserId: string;
  name: string | null;
  phone: string | null;
};

const MAX = 480;

// Fill-in templates. {name} is swapped for the recipient's first name (or a
// friendly fallback) so a common nudge is one tap, not a retype every time.
const TEMPLATES: { label: string; body: string }[] = [
  { label: "Pick a time", body: "Hi {name}, it's Northwood Bids — your items are ready! Book a pickup time here: https://northwoodbids.com/pickup" },
  { label: "Pick a location", body: "Hi {name}, this is Northwood Bids. Please choose your pickup location so we can get your wins ready: https://northwoodbids.com/pickup" },
  { label: "Ready to grab", body: "Hi {name}, your order is boxed and ready for pickup at Northwood Bids. See you soon!" },
  { label: "Payment issue", body: "Hi {name}, we couldn't process the card on file for your Northwood Bids wins. Update it here: https://northwoodbids.com/dashboard" },
];

/**
 * One "text this customer" sheet used from both the Bidders screen and the pickup
 * Waiting list. Sends through the same GoHighLevel plumbing as every automated text.
 * Render it once per screen and drive it with a `target` state.
 */
export default function MessageSheet({
  target, onClose,
}: { target: MessageTarget | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!target) return null;

  const first = (target.name?.split(" ")[0] || "there").trim();
  const fill = (body: string) => body.replace(/\{name\}/g, first);
  const noPhone = !target.phone;

  const close = () => {
    setText("");
    setError(null);
    setSent(false);
    onClose();
  };

  const send = async () => {
    const message = text.trim();
    if (!message) { setError("Type a message first."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: target.clerkUserId, message }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        setTimeout(close, 1100);
      } else {
        setError(data.error || "Couldn't send.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#241a12]/60 backdrop-blur-[2px] p-0 sm:p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Text customer"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#e6dac6] p-5 pb-8 sm:pb-5 shadow-[0_24px_60px_-20px_rgba(36,26,18,0.6)] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle on phones — it's a bottom sheet there. */}
        <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-[#e6dac6] mb-4" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Initials name={target.name} size={44} />
            <div className="min-w-0">
              <h3 className="font-display text-xl font-black text-[#241a12] leading-tight">Text customer</h3>
              <p className="text-sm text-[#8a7559] truncate">
                {target.name || "Unnamed bidder"}{target.phone ? ` · ${target.phone}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 inline-flex items-center justify-center w-11 h-11 -mr-2 -mt-2 rounded-xl text-[#8a7559] hover:bg-[#f4ede1] hover:text-[#241a12] transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5 5l12 12M17 5L5 17" /></svg>
          </button>
        </div>

        {noPhone ? (
          <Notice tone="amber" className="mt-4">
            No phone number on file for this bidder, so they can&apos;t be texted.
          </Notice>
        ) : sent ? (
          <div className="mt-6 text-center py-6">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#e6f1e8] text-[#4a7c59] grid place-items-center mb-3">
              <IcoCheck className="w-7 h-7" />
            </div>
            <p className="font-display text-lg font-black text-[#2f5d3a]">Sent!</p>
          </div>
        ) : (
          <>
            {/* Templates — tap to drop a pre-written message in, then edit freely. */}
            <div className="flex flex-wrap gap-2 mt-4">
              {TEMPLATES.map((t) => (
                <Btn key={t.label} size="sm" tone="slate" variant="outline" onClick={() => setText(fill(t.body))}>
                  {t.label}
                </Btn>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              rows={5}
              autoFocus
              placeholder="Write a message…"
              className="w-full mt-3 bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 py-3 text-base text-[#241a12] placeholder:text-[#b3a085] outline-none transition resize-none"
            />
            <div className="flex items-center justify-between mt-1.5 text-sm text-[#8a7559]">
              <span className="tabular-nums">{text.length}/{MAX}</span>
              <span>Sent by SMS</span>
            </div>

            {error && <Notice tone="red" className="mt-2">{error}</Notice>}

            <div className="flex gap-3 mt-4">
              <Btn tone="slate" variant="outline" onClick={close} className="flex-1">
                Cancel
              </Btn>
              <Btn onClick={send} disabled={busy || !text.trim()} className="flex-1">
                {busy ? "Sending…" : "Send text"}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
