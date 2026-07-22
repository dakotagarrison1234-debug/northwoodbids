"use client";
import { useState } from "react";

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={close}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 pb-8 sm:pb-5 shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-slate-900">Text customer</h3>
            <p className="text-base text-slate-500 truncate">
              {target.name || "Unnamed bidder"}{target.phone ? ` · ${target.phone}` : ""}
            </p>
          </div>
          <button onClick={close} className="shrink-0 text-slate-400 p-1" aria-label="Close">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l12 12M17 5L5 17" /></svg>
          </button>
        </div>

        {noPhone ? (
          <div className="mt-4 rounded-xl bg-amber-50 border-2 border-amber-200 text-amber-800 px-4 py-3 text-base">
            No phone number on file for this bidder, so they can&apos;t be texted.
          </div>
        ) : sent ? (
          <div className="mt-6 text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-lg font-bold text-green-700">Sent!</p>
          </div>
        ) : (
          <>
            {/* Templates — tap to drop a pre-written message in, then edit freely. */}
            <div className="flex flex-wrap gap-2 mt-4">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setText(fill(t.body))}
                  className="min-h-[40px] px-3.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-600 active:bg-slate-100"
                >
                  {t.label}
                </button>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              rows={5}
              autoFocus
              placeholder="Write a message…"
              className="w-full mt-3 bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-sm text-slate-400 tabular-nums">{text.length}/{MAX}</span>
              <span className="text-sm text-slate-400">Sent by SMS</span>
            </div>

            {error && <p className="text-base text-red-600 mt-2">{error}</p>}

            <div className="flex gap-3 mt-4">
              <button onClick={close} className="flex-1 min-h-[52px] rounded-xl border-2 border-slate-200 bg-white font-bold text-base text-slate-700">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={busy || !text.trim()}
                className="flex-1 min-h-[52px] rounded-xl bg-slate-900 active:bg-slate-800 disabled:opacity-40 text-white font-bold text-base"
              >
                {busy ? "Sending…" : "Send text"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
