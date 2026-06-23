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

  // Quick duration chips: set the end date relative to the current start.
  const setDuration = (days: number) => {
    const base = formData.startAt ? new Date(formData.startAt) : defaultStart();
    const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    setFormData((prev) => ({ ...prev, endAt: toLocalInput(end) }));
  };

  const handleSave = async () => {
    if (!formData.title || !formData.startAt || !formData.endAt) {
      alert("Please fill in title, start date, and end date");
      return;
    }
    if (new Date(formData.endAt) <= new Date(formData.startAt)) {
      alert("End date must be after start date");
      return;
    }
    if (!orgId) { alert("Business not loaded. Please refresh."); return; }
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
        alert("Error: " + data.error);
      }
    } catch { alert("Something went wrong."); }
    finally { setSaving(false); }
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/auctions" className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Auctions</Link>
          <span className="text-[#8a7559]">/</span>
          <h1 className="text-2xl sm:text-3xl font-semibold">New Auction</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base px-6 py-3.5 rounded-xl font-semibold shrink-0 transition-colors">
          {saving ? "Creating..." : "Create Auction"}
        </button>
      </header>

      <div className="px-6 sm:px-8 py-6 max-w-2xl">
        <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 sm:p-7 space-y-6">
          <div>
            <label className="text-base text-[#6f5b46] mb-1.5 block">Auction Title *</label>
            <input name="title" value={formData.title} onChange={handleChange}
              placeholder="e.g. Spring Gala 2025"
              className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]" />
          </div>
          <div>
            <label className="text-base text-[#6f5b46] mb-1.5 block">Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
              placeholder="Tell bidders about this auction..."
              className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-base text-[#6f5b46] mb-1.5 block">Start Date & Time *</label>
              <input name="startAt" value={formData.startAt} onChange={handleChange} type="datetime-local"
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]" />
            </div>
            <div>
              <label className="text-base text-[#6f5b46] mb-1.5 block">End Date & Time *</label>
              <input name="endAt" value={formData.endAt} onChange={handleChange} type="datetime-local"
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]" />
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-sm text-[#8a7559] self-center mr-1">Run for:</span>
                {[
                  { label: "3 days", days: 3 },
                  { label: "1 week", days: 7 },
                  { label: "2 weeks", days: 14 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setDuration(opt.days)}
                    className="text-base font-semibold bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12] px-4 py-2.5 rounded-xl transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[#8a7559] text-sm mt-2">
                These dates are set for you — change them any time. The auction goes live automatically at its start time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
