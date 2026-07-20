"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Format a Date as a value the datetime-local input understands (local time).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Sensible defaults: start tomorrow at 9:00 AM, run for 7 days.
function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default function NewAuctionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [formData, setFormData] = useState(() => {
    const start = defaultStart();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      title: "", description: "",
      startAt: toLocalInput(start),
      endAt: toLocalInput(end),
    };
  });

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(d => {
      if (d.orgId) setOrgId(d.orgId);
    }).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    // Inline errors, not alert() — the button is already disabled for these cases,
    // so these are belt-and-braces rather than the primary feedback.
    setError(null);
    if (!formData.title || !formData.startAt || !formData.endAt) {
      setError("Give it a name and both dates.");
      return;
    }
    if (new Date(formData.endAt) <= new Date(formData.startAt)) {
      setError("The closing time has to be after the opening time.");
      return;
    }
    if (!orgId) { setError("Business not loaded — pull down to refresh."); return; }
    setSaving(true);
    try {
      // Convert datetime-local values (local time, no tz) to UTC ISO strings
      // so Vercel (UTC) stores the correct moment the user intended.
      const startAtISO = new Date(formData.startAt).toISOString();
      const endAtISO = new Date(formData.endAt).toISOString();
      const res = await fetch("/api/auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, startAt: startAtISO, endAt: endAtISO, organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        // Go straight to the new auction's manage page
        router.push(`/admin/auctions/${data.auction.id}`);
      } else {
        setError(data.error || "Could not create the auction.");
      }
    } catch { setError("Something went wrong. Please try again."); }
    finally { setSaving(false); }
  };

  const input =
    "w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[52px] text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400";

  // Plain-English summary of what they've set, so the dates aren't just two
  // opaque pickers. Bad ranges are caught here rather than on submit.
  const start = formData.startAt ? new Date(formData.startAt) : null;
  const end = formData.endAt ? new Date(formData.endAt) : null;
  const validRange = start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start;
  const days = validRange ? Math.round((end.getTime() - start.getTime()) / 864e5) : 0;
  const fmt = (d: Date) =>
    d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/auctions" className="text-slate-500 text-base font-semibold shrink-0 py-2 pr-1">← Auctions</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">New auction</h1>
        </div>
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-2xl w-full space-y-4">
        {error && (
          <p className="text-base text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1.5">Name *</span>
            <input name="title" value={formData.title} onChange={handleChange}
              placeholder="e.g. Weekly Overstock — Sept 12"
              className={input} />
          </label>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1.5">Description</span>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
              placeholder="What's in this one? Shown to bidders."
              className={`${input} py-3 resize-none`} />
          </label>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          <div className="text-sm font-bold text-slate-600 uppercase tracking-wide">When it runs</div>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1.5">Opens</span>
            <input name="startAt" value={formData.startAt} onChange={handleChange} type="datetime-local" className={input} />
          </label>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1.5">Closes</span>
            <input name="endAt" value={formData.endAt} onChange={handleChange} type="datetime-local" className={input} />
          </label>

          {start && end && !validRange ? (
            <p className="text-base text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
              The closing time has to be after the opening time.
            </p>
          ) : validRange ? (
            <div className="rounded-xl bg-slate-900 text-white px-4 py-3">
              <div className="text-sm text-slate-400 font-bold uppercase tracking-wide">Runs for</div>
              <div className="text-xl font-extrabold mt-0.5">{days} day{days !== 1 ? "s" : ""}</div>
              <div className="text-sm text-slate-300 mt-1">{fmt(start)} → {fmt(end)}</div>
            </div>
          ) : null}

          <p className="text-sm text-slate-500">
            It opens and closes on its own at these times. Nothing is texted to bidders when it opens —
            you send that yourself from the auction&apos;s controls when you&apos;re ready.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !formData.title.trim() || !validRange}
          className="w-full min-h-[52px] bg-slate-900 active:bg-slate-800 disabled:opacity-40 text-white text-base font-bold rounded-xl transition-colors"
        >
          {saving ? "Creating…" : "Create auction"}
        </button>
      </div>
    </>
  );
}
