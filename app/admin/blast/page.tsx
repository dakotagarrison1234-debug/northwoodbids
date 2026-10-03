"use client";

import { useCallback, useEffect, useState } from "react";
import { IcoUsers, IcoCheck } from "@/app/components/BidIcons";
import { PageHeader, PageBody, Panel, Btn, Notice, Eyebrow } from "../ui";

type Kind = "everyone" | "preferred" | "waiting" | "preferred_or_waiting";
type Loc = { id: string; name: string; isActive: boolean };

const KINDS: { v: Kind; label: string; sub: string; needsLoc: boolean }[] = [
  { v: "preferred", label: "Picks up at…", sub: "Everyone who chose this warehouse as their pickup spot", needsLoc: true },
  { v: "waiting", label: "Has items at…", sub: "Anyone with paid items sitting, booked, or on the way to this warehouse", needsLoc: true },
  { v: "preferred_or_waiting", label: "Both", sub: "Picks up here OR has items here — the widest local group", needsLoc: true },
  { v: "everyone", label: "Everyone", sub: "Every engaged bidder (same crowd as the auction-live text)", needsLoc: false },
];

/** GSM-7 segments at 160/153; non-GSM characters push a text to UCS-2 (70/67). */
function smsParts(msg: string) {
  const gsm = /^[\u0000-\u007F€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\n\r ]*$/;
  const isGsm = gsm.test(msg);
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  const n = msg.length <= single ? 1 : Math.ceil(msg.length / multi);
  return { n, isGsm };
}

export default function BlastPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [kind, setKind] = useState<Kind>("preferred_or_waiting");
  const [locationId, setLocationId] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ count: number; withPhone: number; sample: { name: string; phone: string }[]; configured: boolean } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showList, setShowList] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/pickup/locations")
      .then((r) => r.json())
      .then((d) => {
        const locs: Loc[] = (d.locations ?? []).map((l: Loc) => ({ id: l.id, name: l.name, isActive: l.isActive }));
        setLocations(locs);
        const owosso = locs.find((l) => /owosso/i.test(l.name)) ?? locs[0];
        if (owosso) setLocationId(owosso.id);
      })
      .catch(() => {});
  }, []);

  const needsLoc = KINDS.find((k) => k.v === kind)?.needsLoc ?? false;

  const loadPreview = useCallback(() => {
    if (needsLoc && !locationId) return;
    setLoadingPreview(true);
    const q = new URLSearchParams({ kind, ...(needsLoc ? { locationId } : {}) });
    fetch(`/api/admin/blast?${q}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setPreview(d); else setErr(d.error); })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  }, [kind, locationId, needsLoc]);
  useEffect(() => { loadPreview(); }, [loadPreview]);
  const pick = (k: Kind) => { setKind(k); setConfirm(false); setResult(null); };
  const pickLoc = (id: string) => { setLocationId(id); setConfirm(false); setResult(null); };

  const send = async () => {
    if (!preview) return;
    setSending(true); setErr("");
    try {
      const res = await fetch("/api/admin/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: needsLoc ? { kind, locationId } : { kind }, message, confirmCount: preview.count }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't send."); if (d.count != null) loadPreview(); }
      else setResult(`Sent to ${d.sent} of ${d.total}${d.failed ? ` (${d.failed} failed)` : ""}.`);
    } catch { setErr("Something went wrong."); }
    setSending(false); setConfirm(false);
  };

  const parts = smsParts(message);
  const locName = locations.find((l) => l.id === locationId)?.name ?? "";
  const ready = message.trim().length >= 10 && preview && preview.count > 0 && preview.configured;

  return (
    <>
      <PageHeader title="Text a group" sub="One text to a slice of your bidders. Goes out through the same line as the auction-live texts." />

      <PageBody>
        {/* Who */}
        <Panel title="Who" sub="Pick the crowd first — the count updates as you go.">
          <div className="p-4 sm:p-5">
            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              {KINDS.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  onClick={() => pick(k.v)}
                  className={`text-left rounded-xl border-2 px-3.5 py-3 min-h-[56px] transition-colors ${kind === k.v ? "border-[#6c4d39] bg-[#f1e7d5]" : "border-[#e6dac6] bg-white hover:bg-[#faf5ea]"}`}
                >
                  <div className="font-bold text-[#241a12]">{k.label}{k.needsLoc && locName ? ` ${locName}` : ""}</div>
                  <div className="text-xs text-[#8a7559] leading-snug mt-0.5">{k.sub}</div>
                </button>
              ))}
            </div>
            {needsLoc && (
              <div className="flex items-center gap-2 flex-wrap">
                <Eyebrow>Warehouse</Eyebrow>
                {locations.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pickLoc(l.id)}
                    className={`min-h-[40px] text-sm font-bold rounded-full px-4 border-2 transition-colors ${locationId === l.id ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#563e2c] border-[#d9c7ab] hover:bg-[#faf5ea]"}`}
                  >
                    {l.name}{!l.isActive ? " (inactive)" : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#f4ede1] border border-[#e6dac6] px-4 py-3 min-h-[48px]">
              <div className="inline-flex items-center gap-2 font-bold text-[#241a12]">
                <IcoUsers className="w-4 h-4 text-[#6c4d39]" />
                {loadingPreview ? "Counting…" : preview ? `${preview.count} ${preview.count === 1 ? "person" : "people"}` : "—"}
                {preview && preview.withPhone < preview.count && <span className="text-xs font-semibold text-[#8a7559]">({preview.withPhone} with a phone)</span>}
              </div>
              {preview && preview.count > 0 && (
                <Btn type="button" tone="leather" variant="ghost" size="sm" onClick={() => setShowList((s) => !s)}>
                  {showList ? "Hide names" : "See names"}
                </Btn>
              )}
            </div>
            {showList && preview && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#e6dac6] bg-white divide-y divide-[#f0e6d6] text-sm">
                {preview.sample.map((r, i) => (
                  <div key={i} className="flex justify-between px-3 py-2"><span className="text-[#241a12] truncate">{r.name}</span><span className="text-[#8a7559] tabular-nums shrink-0 ml-2">{r.phone}</span></div>
                ))}
                {preview.count > preview.sample.length && <div className="px-3 py-2 text-[#8a7559]">…and {preview.count - preview.sample.length} more</div>}
              </div>
            )}
          </div>
        </Panel>

        {/* Message */}
        <Panel title="Message" sub="Keep it short — one text per person is cheapest.">
          <div className="p-4 sm:p-5">
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setConfirm(false); }}
              rows={6}
              placeholder="Northwood Bids: …"
              className="w-full bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 py-3 text-[#241a12] placeholder:text-[#b3a085] leading-relaxed outline-none transition"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8a7559]">
              <span>{message.length} characters · {parts.n} text{parts.n !== 1 ? "s" : ""} per person{!parts.isGsm ? " · special characters make texts shorter — plain quotes and dashes keep it to 160" : ""}</span>
              <span className="flex flex-wrap gap-1">
                <Btn type="button" tone="leather" variant="ghost" size="sm" onClick={() => setMessage(OWOSSO_NOTICE)}>Owosso Oct 4–11 notice</Btn>
                <Btn type="button" tone="amber" variant="ghost" size="sm" onClick={() => setMessage(OWOSSO_CORRECTION)}>Weekday correction</Btn>
              </span>
            </div>
          </div>
        </Panel>

        {preview && !preview.configured && (
          <Notice tone="amber">Texting isn&apos;t configured on this server (GHL_AUCTION_STARTED_WEBHOOK).</Notice>
        )}
        {err && <Notice tone="red">{err}</Notice>}
        {result && (
          <Notice tone="green">
            <span className="inline-flex items-center gap-2"><IcoCheck className="w-4 h-4" /> {result}</span>
          </Notice>
        )}

        {!confirm ? (
          <Btn type="button" disabled={!ready} onClick={() => setConfirm(true)}>
            Review and send
          </Btn>
        ) : (
          <Panel tone="amber" title={`Send this to ${preview?.count} ${preview?.count === 1 ? "person" : "people"}?`}>
            <div className="p-4 sm:p-5">
              <pre className="whitespace-pre-wrap text-sm text-[#4a3a2b] bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-3 mb-3 font-sans">{message}</pre>
              <div className="flex flex-wrap gap-2">
                <Btn type="button" tone="amber" onClick={send} disabled={sending}>{sending ? "Sending…" : "Yes, send it"}</Btn>
                <Btn type="button" tone="slate" variant="ghost" onClick={() => setConfirm(false)}>Back</Btn>
              </div>
            </div>
          </Panel>
        )}
      </PageBody>
    </>
  );
}

const OWOSSO_NOTICE =
  "Northwood Bids: Owosso update. We are moving, so there is no Owosso auction the week of Oct 4-11. " +
  "Still have items to grab? Porch pickup is Mon Oct 5, Fri Oct 9 and Sat Oct 10 at 1505 W South St, Owosso 48867 - book your time at https://northwoodbids.com/pickup " +
  "Then starting Oct 15, all Owosso pickups move to our NEW STOREFRONT in downtown Corunna - easier, faster, straight in and out. Questions? Just reply.";

const OWOSSO_CORRECTION =
  "Northwood Bids: Quick correction on the days! Owosso porch pickup is MONDAY Oct 5, FRIDAY Oct 9 and SATURDAY Oct 10 at 1505 W South St. " +
  "Dates were right, weekdays were wrong - sorry for the mix-up. Book at https://northwoodbids.com/pickup";
