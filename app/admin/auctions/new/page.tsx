"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NewAuctionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "", description: "", startAt: "", endAt: "",
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
      <header className="border-b border-[#e5e0d5] px-4 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/admin/auctions" className="text-[#6b6659] hover:text-[#1a1916] text-sm shrink-0">← Auctions</Link>
          <span className="text-[#8c8778]">/</span>
          <h1 className="text-lg sm:text-xl font-semibold">New Auction</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white text-sm px-4 sm:px-6 py-2 rounded-lg font-semibold shrink-0">
          {saving ? "Creating..." : "Create Auction"}
        </button>
      </header>

      <div className="px-4 sm:px-8 py-6 max-w-2xl">
        <div className="bg-white border border-[#e5e0d5] rounded-xl p-6 space-y-6">
          <div>
            <label className="text-sm text-[#6b6659] mb-1 block">Auction Title *</label>
            <input name="title" value={formData.title} onChange={handleChange}
              placeholder="e.g. Spring Gala 2025"
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-lg px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]" />
          </div>
          <div>
            <label className="text-sm text-[#6b6659] mb-1 block">Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
              placeholder="Tell bidders about this auction..."
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-lg px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad] resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#6b6659] mb-1 block">Start Date & Time *</label>
              <input name="startAt" value={formData.startAt} onChange={handleChange} type="datetime-local"
                className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-lg px-4 py-3 text-[#1a1916] focus:outline-none focus:border-[#09a7ad]" />
            </div>
            <div>
              <label className="text-sm text-[#6b6659] mb-1 block">End Date & Time *</label>
              <input name="endAt" value={formData.endAt} onChange={handleChange} type="datetime-local"
                className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-lg px-4 py-3 text-[#1a1916] focus:outline-none focus:border-[#09a7ad]" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
