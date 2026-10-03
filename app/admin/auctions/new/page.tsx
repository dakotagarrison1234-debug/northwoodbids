"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody, Panel, Input, Btn, Notice, Eyebrow } from "../../ui";

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

const TEXTAREA =
  "w-full bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 py-3 text-[#241a12] placeholder:text-[#b3a085] outline-none transition resize-none";

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
      <PageHeader
        title="New auction"
        sub="Name it, set when it runs, then add lots."
        back={{ href: "/admin/auctions", label: "All auctions" }}
      />

      <PageBody>
        {error && <Notice tone="red">{error}</Notice>}

        <Panel title="Set it up" sub="Shown to bidders on the auction page.">
          <div className="px-4 sm:px-5 py-5 space-y-5">
            <label className="block">
              <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Name</span>
              <Input name="title" value={formData.title} onChange={handleChange}
                placeholder="e.g. Weekly Overstock — Sept 12" />
            </label>
            <label className="block">
              <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Description <span className="font-semibold text-[#b3a085]">(optional)</span></span>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                placeholder="What's in this one? Shown to bidders."
                className={TEXTAREA} />
            </label>

            <div className="border-t border-[#f0e6d6] pt-5">
              <Eyebrow className="mb-3">When it runs</Eyebrow>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Opens</span>
                  <Input name="startAt" value={formData.startAt} onChange={handleChange} type="datetime-local" />
                </label>
                <label className="block">
                  <span className="block text-sm font-bold text-[#4a3a2b] mb-1.5">Closes</span>
                  <Input name="endAt" value={formData.endAt} onChange={handleChange} type="datetime-local" />
                </label>
              </div>

              {start && end && !validRange ? (
                <Notice tone="red" className="mt-4">The closing time has to be after the opening time.</Notice>
              ) : validRange ? (
                <div className="mt-4 rounded-xl bg-[#241a12] text-[#fbf4e6] px-4 py-3">
                  <Eyebrow className="!text-[#b9a688]">Runs for</Eyebrow>
                  <div className="font-display text-2xl font-black mt-0.5">{days} day{days !== 1 ? "s" : ""}</div>
                  <div className="text-sm text-[#d9c7ab] mt-1">{fmt(start)} to {fmt(end)}</div>
                </div>
              ) : null}

              <p className="text-sm text-[#8a7559] mt-4">
                It opens and closes on its own at these times. Nothing is texted to bidders when it opens —
                you send that yourself from the auction&apos;s controls when you&apos;re ready.
              </p>
            </div>

            <Btn full onClick={handleSave} disabled={saving || !formData.title.trim() || !validRange}>
              {saving ? "Creating…" : "Create auction"}
            </Btn>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
