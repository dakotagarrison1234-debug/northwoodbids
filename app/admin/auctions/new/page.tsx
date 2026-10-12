"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody, Panel, Input, Btn, Notice, Eyebrow } from "../../ui";

// Format a Date as a value the datetime-local input understands (local time).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

// Fallback schedule when there's nothing to carry forward: tomorrow 9:00 AM, 7 days.
function fallbackStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Titles like "AMZ 12", "HD #3", "Estate 7" are a series + a number. We learn the
 * series from what's already been run and offer the next number.
 */
const SERIES_RE = /^([A-Za-z][A-Za-z0-9&' ]{0,24}?)\s*#?\s*(\d+)$/;
// A bare series with no number yet ("Estate") — offered as "<series> 1".
const BARE_SERIES_RE = /^[A-Za-z][A-Za-z0-9&' ]{0,24}$/;

type Series = { name: string; next: number };

/** Most recent series first (input is newest-first), with the next number for each. */
function learnSeries(titles: string[]): Series[] {
  const byKey = new Map<string, Series>();
  for (const raw of titles) {
    const m = SERIES_RE.exec(raw.trim());
    if (!m) continue;
    const name = m[1].trim();
    const n = parseInt(m[2], 10);
    const key = name.toLowerCase();
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { name, next: n + 1 });
    else if (n + 1 > cur.next) cur.next = n + 1;
  }
  return [...byKey.values()];
}

type ApiAuction = { title: string; startAt: string; endAt: string; archived?: boolean };

export default function NewAuctionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [series, setSeries] = useState<Series[]>([]);
  // Once the user edits a field we stop overwriting it with learned defaults.
  const touched = useRef({ title: false, dates: false });
  const [formData, setFormData] = useState(() => {
    const start = fallbackStart();
    return { title: "", startAt: toLocalInput(start), endAt: toLocalInput(new Date(start.getTime() + WEEK)) };
  });

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(d => {
      if (d.orgId) setOrgId(d.orgId);
    }).catch(() => {});
  }, []);

  // Learn naming + schedule from what's been run before. Archived (test/junk)
  // auctions are ignored so they don't steer the defaults.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auctions?take=200").then(r => r.json()).then((d: { auctions?: ApiAuction[] }) => {
      if (cancelled) return;
      const all = (d.auctions ?? []).filter((a) => !a.archived);
      if (all.length === 0) return;

      const learned = learnSeries(all.map((a) => a.title));
      setSeries(learned);

      // Name: the most recent series, next number up.
      if (!touched.current.title && learned.length > 0) {
        setFormData((f) => ({ ...f, title: `${learned[0].name} ${learned[0].next}` }));
      }

      // Schedule: the last auction's run, pushed forward a week at a time until it
      // starts in the future.
      const last = [...all].sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
      const now = Date.now();
      const start = new Date(last.startAt);
      const end = new Date(last.endAt);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        // Step by calendar days (not milliseconds) so a 9:00 AM auction stays
        // 9:00 AM across the daylight-saving switch.
        let guard = 0;
        do { start.setDate(start.getDate() + 7); end.setDate(end.getDate() + 7); } while (start.getTime() <= now && ++guard < 520);
        if (!touched.current.dates) {
          setFormData((f) => ({ ...f, startAt: toLocalInput(start), endAt: toLocalInput(end) }));
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "title") touched.current.title = true;
    else touched.current.dates = true;
    setFormData({ ...formData, [name]: value });
  };

  const pickName = (name: string) => {
    touched.current.title = true;
    setFormData((f) => ({ ...f, title: name }));
  };

  const handleSave = async () => {
    // Inline errors, not alert() — the button is already disabled for these cases,
    // so these are belt-and-braces rather than the primary feedback.
    setError(null);
    if (!formData.title.trim() || !formData.startAt || !formData.endAt) {
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
        body: JSON.stringify({ title: formData.title.trim(), startAt: startAtISO, endAt: endAtISO, organizationId: orgId }),
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

  // Chips: every known series at its next number, plus "<typed> 1" when they're
  // starting a brand-new series.
  const typed = formData.title.trim();
  const typedKey = typed.toLowerCase();
  const chips: string[] = series.map((s) => `${s.name} ${s.next}`);
  if (typed && BARE_SERIES_RE.test(typed) && !series.some((s) => s.name.toLowerCase() === typedKey)) {
    chips.unshift(`${typed} 1`);
  }

  return (
    <>
      <PageHeader title="New auction" back={{ href: "/admin/auctions", label: "Auctions" }} />

      <PageBody>
        {error && <Notice tone="red">{error}</Notice>}

        <Panel>
          <div className="px-4 sm:px-5 py-5 space-y-5">
            <div>
              <label className="block">
                <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Name</span>
                <Input name="title" value={formData.title} onChange={handleChange} placeholder="AMZ 1" autoComplete="off" />
              </label>
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {chips.map((c) => {
                    const on = c.toLowerCase() === typedKey;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => pickName(c)}
                        className={`min-h-[44px] px-4 rounded-xl border-2 text-[15px] font-bold transition-colors ${
                          on ? "bg-[#241a12] text-[#f6ecda] border-[#241a12]" : "bg-white text-[#563e2c] border-[#d9c7ab] hover:bg-[#faf5ea]"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[#f0e6d6] pt-5">
              <Eyebrow className="mb-3">When it runs</Eyebrow>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Opens</span>
                  <Input name="startAt" value={formData.startAt} onChange={handleChange} type="datetime-local" />
                </label>
                <label className="block">
                  <span className="block text-[15px] font-bold text-[#4a3a2b] mb-1.5">Closes</span>
                  <Input name="endAt" value={formData.endAt} onChange={handleChange} type="datetime-local" />
                </label>
              </div>

              {start && end && !validRange ? (
                <Notice tone="red" className="mt-4">The closing time has to be after the opening time.</Notice>
              ) : validRange ? (
                <p className="text-[15px] text-[#6f5b46] mt-4">
                  <strong className="font-extrabold text-[#241a12]">Runs for {days} day{days !== 1 ? "s" : ""}</strong>
                  {" · "}{fmt(start)} to {fmt(end)}
                </p>
              ) : null}
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
