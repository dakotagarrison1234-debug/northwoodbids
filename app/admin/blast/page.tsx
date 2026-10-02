"use client";

import { useCallback, useEffect, useState } from "react";
import { IcoMegaphone, IcoUsers, IcoCheck } from "@/app/components/BidIcons";

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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-2 mb-1">
        <IcoMegaphone className="w-6 h-6 text-[#6c4d39]" />
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#241a12]">Text a group</h1>
      </div>
      <p className="text-sm text-[#8a7559] mb-5">One text to a slice of your bidders. Goes out through the same line as the auction-live texts.</p>

      {/* Who */}
      <section className="rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-4 mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-2">Who</div>
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          {KINDS.map((k) => (
            <button key={k.v} type="button" onClick={() => pick(k.v)} className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${kind === k.v ? "border-[#6c4d39] bg-white" : "border-[#e3d6bf] bg-white/60 hover:bg-white"}`}>
              <div className="font-bold text-sm text-[#241a12]">{k.label}{k.needsLoc && locName ? ` ${locName}` : ""}</div>
              <div className="text-[11px] text-[#8a7559] leading-tight mt-0.5">{k.sub}</div>
            </button>
          ))}
        </div>
        {needsLoc && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#6f5b46]">Warehouse</span>
            {locations.map((l) => (
              <button key={l.id} type="button" onClick={() => pickLoc(l.id)} className={`text-xs font-bold rounded-full px-3 py-1.5 border ${locationId === l.id ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#6c4d39] border-[#cdbda3]"}`}>
                {l.name}{!l.isActive ? " (inactive)" : ""}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white border border-[#e3d6bf] px-3 py-2.5">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#241a12]">
            <IcoUsers className="w-4 h-4 text-[#6c4d39]" />
            {loadingPreview ? "Counting…" : preview ? `${preview.count} ${preview.count === 1 ? "person" : "people"}` : "—"}
            {preview && preview.withPhone < preview.count && <span className="text-xs font-semibold text-[#8a7559]">({preview.withPhone} with a phone)</span>}
          </div>
          {preview && preview.count > 0 && (
            <button type="button" onClick={() => setShowList((s) => !s)} className="text-xs font-semibold text-[#6c4d39] underline">{showList ? "Hide names" : "See names"}</button>
          )}
        </div>
        {showList && preview && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#e3d6bf] bg-white divide-y divide-[#efe6d4] text-sm">
            {preview.sample.map((r, i) => (
              <div key={i} className="flex justify-between px-3 py-1.5"><span className="text-[#241a12]">{r.name}</span><span className="text-[#8a7559] tabular-nums">{r.phone}</span></div>
            ))}
            {preview.count > preview.sample.length && <div className="px-3 py-1.5 text-[#8a7559]">…and {preview.count - preview.sample.length} more</div>}
          </div>
        )}
      </section>

      {/* Message */}
      <section className="rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-4 mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-[#8a7559] mb-2">Message</div>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value); setConfirm(false); }}
          rows={6}
          placeholder="Northwood Bids: …"
          className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] leading-relaxed"
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8a7559]">
          <span>{message.length} characters · {parts.n} text{parts.n !== 1 ? "s" : ""} per person{!parts.isGsm ? " · special characters make texts shorter — plain quotes and dashes keep it to 160" : ""}</span>
          <button type="button" onClick={() => setMessage(OWOSSO_NOTICE)} className="underline font-semibold text-[#6c4d39]">Use the Owosso Oct 4–11 notice</button>
        </div>
      </section>

      {preview && !preview.configured && (
        <div className="mb-4 rounded-xl bg-[#fbe6c8] text-[#a85f28] px-4 py-2.5 text-sm font-semibold">Texting isn&apos;t configured on this server (GHL_AUCTION_STARTED_WEBHOOK).</div>
      )}
      {err && <div className="mb-4 rounded-xl bg-[#fbe9e5] text-red-700 px-4 py-2.5 text-sm font-semibold">{err}</div>}
      {result && <div className="mb-4 rounded-xl bg-[#dcebdf] text-[#2f5d3a] px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2"><IcoCheck className="w-4 h-4" /> {result}</div>}

      {!confirm ? (
        <button type="button" disabled={!ready} onClick={() => setConfirm(true)} className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-40">
          Review and send
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-[#c47b3e] bg-white p-4">
          <div className="font-bold text-[#241a12] mb-1">Send this to {preview?.count} {preview?.count === 1 ? "person" : "people"}?</div>
          <pre className="whitespace-pre-wrap text-sm text-[#6f5b46] bg-[#faf5ea] rounded-xl p-3 mb-3 font-sans">{message}</pre>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={sending} className="bg-[#c47b3e] hover:bg-[#a85f28] text-white font-black px-6 py-2.5 rounded-xl text-sm disabled:opacity-50">{sending ? "Sending…" : "Yes, send it"}</button>
            <button type="button" onClick={() => setConfirm(false)} className="text-[#6f5b46] font-semibold px-4 py-2.5 text-sm">Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

const OWOSSO_NOTICE =
  "Northwood Bids: Heads up, Owosso! No auction or regular pickups Oct 4-11 while we move. " +
  "Items from earlier auctions: book a PORCH PICKUP on Sun Oct 5, Wed Oct 8 or Thu Oct 9 at 1505 W South St, Owosso MI 48867 - https://northwoodbids.com/pickup " +
  "Big news: we are opening a NEW STOREFRONT in Corunna for easier, faster pickups. Details soon. Questions? Just reply.";
