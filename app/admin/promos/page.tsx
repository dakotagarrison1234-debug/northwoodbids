"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody, Panel, Pill, Btn, Input, Eyebrow, Empty, Notice, Initials } from "../ui";
import { IcoCoin, IcoLink, IcoCheck } from "@/app/components/BidIcons";

type Promo = {
  id: string;
  code: string;
  label: string;
  amount: number;
  active: boolean;
  maxClaims: number | null;
  expiresAt: string | null;
  createdAt: string;
  claims: number;
  converted: number;
  link: string;
  recent: { name: string; at: string; paid: boolean }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });

/**
 * Welcome codes — the link behind a QR on a business card or poster. Anyone can
 * scan it; each person can claim it once (account + phone number). Paste the link
 * into GHL's QR generator and you're done.
 */
export default function PromosPage() {
  const [rows, setRows] = useState<Promo[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("CARD5");
  const [label, setLabel] = useState("Business card");
  const [amount, setAmount] = useState("5");
  const [maxClaims, setMaxClaims] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/promos").then((r) => r.json()).then((d) => setRows(d.codes ?? [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // A bare "YYYY-MM-DD" parses as UTC midnight (= the evening BEFORE in Detroit),
        // so the code would die a day early. Send the end of the chosen day, local time.
        body: JSON.stringify({ code, label, amount, maxClaims, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't create."); }
      else { setCreating(false); setCode(""); setLabel(""); setMaxClaims(""); setExpiresAt(""); load(); }
    } catch { setErr("Something went wrong."); }
    setBusy(false);
  };

  const toggle = async (p: Promo) => {
    await fetch("/api/admin/promos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) });
    load();
  };

  const copy = async (p: Promo) => {
    try { await navigator.clipboard.writeText(p.link); setCopied(p.id); setTimeout(() => setCopied(null), 1600); } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader
        title="Welcome codes"
        sub="The link behind a QR code: scan, sign up, get Bid Bucks. One claim per person — account and phone number both count."
        actions={!creating && <Btn size="sm" onClick={() => setCreating(true)}>New code</Btn>}
      />
      <PageBody>
        {creating && (
          <Panel title="New welcome code" sub="Keep the code short — it's part of the link.">
            <div className="p-4 sm:p-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Eyebrow className="mb-1">Code</Eyebrow>
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CARD5" className="font-mono font-bold uppercase" />
                </div>
                <div>
                  <Eyebrow className="mb-1">Where it&apos;s printed</Eyebrow>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Business card" />
                </div>
                <div>
                  <Eyebrow className="mb-1">Bid Bucks <span className="normal-case tracking-normal font-semibold text-[#b3a085]">(spent $5 per bill)</span></Eyebrow>
                  <div className="flex gap-1.5 flex-wrap">
                    {["5", "10", "15", "20"].map((v) => (
                      <button key={v} type="button" onClick={() => setAmount(v)} className={`min-h-[44px] px-4 rounded-xl border-2 font-black text-sm ${amount === v ? "border-[#6c4d39] bg-[#6c4d39] text-white" : "border-[#e6dac6] bg-white text-[#6c4d39]"}`}>${v}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Eyebrow className="mb-1">Max claims <span className="normal-case tracking-normal font-semibold text-[#b3a085]">(blank = unlimited)</span></Eyebrow>
                  <Input value={maxClaims} onChange={(e) => setMaxClaims(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="no cap" />
                </div>
                <div>
                  <Eyebrow className="mb-1">Expires <span className="normal-case tracking-normal font-semibold text-[#b3a085]">(optional)</span></Eyebrow>
                  <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
              </div>
              {err && <Notice tone="red">{err}</Notice>}
              <div className="flex gap-2">
                <Btn onClick={create} disabled={busy}>{busy ? "Creating…" : "Create code"}</Btn>
                <Btn variant="ghost" tone="slate" onClick={() => { setCreating(false); setErr(""); }}>Cancel</Btn>
              </div>
            </div>
          </Panel>
        )}

        <Panel title="How it works" tone="leather">
          <ol className="p-4 sm:p-5 text-sm text-[#4a3a2b] space-y-1.5 list-decimal list-inside">
            <li>Create a code below and copy its link (it looks like <span className="font-mono">northwoodbids.com/go/CARD5</span>).</li>
            <li>Paste the link into GoHighLevel&apos;s QR generator and put the QR on the card: <em>Scan me — sign up, get $5 to bid.</em></li>
            <li>They scan, sign up (phone required), and the Bid Bucks land in their account with a little toast. It comes off their first winning bill of $5 or more.</li>
            <li>A second scan on the same account or the same phone number gets nothing. The same code works forever (or until you turn it off / cap it).</li>
          </ol>
        </Panel>

        {rows === null ? (
          <div className="text-[#8a7559] py-10 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <Panel><Empty text="No welcome codes yet." sub="Make one, print the QR, hand it out." action={<Btn size="sm" onClick={() => setCreating(true)}>New code</Btn>} /></Panel>
        ) : (
          <div className="space-y-3">
            {rows.map((p) => {
              const capped = p.maxClaims != null && p.claims >= p.maxClaims;
              const expired = !!p.expiresAt && new Date(p.expiresAt) < new Date();
              return (
                <Panel key={p.id} className={!p.active ? "opacity-70" : ""}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-xl text-[#241a12]">{p.code}</span>
                          <Pill tone={!p.active ? "slate" : expired ? "red" : capped ? "amber" : "green"} dot={p.active && !expired && !capped}>
                            {!p.active ? "Off" : expired ? "Expired" : capped ? "Cap reached" : "Live"}
                          </Pill>
                        </div>
                        <div className="text-sm text-[#6f5b46] mt-0.5">{p.label} · ${p.amount.toFixed(0)} Bid Bucks{p.maxClaims != null ? ` · cap ${p.maxClaims}` : ""}{p.expiresAt ? ` · expires ${fmt(p.expiresAt)}` : ""}</div>
                        <div className="mt-2 inline-flex items-center gap-2 bg-[#faf5ea] border border-[#e6dac6] rounded-lg px-3 py-1.5 text-sm font-mono text-[#241a12] max-w-full">
                          <IcoLink className="w-4 h-4 text-[#8a7559] shrink-0" /><span className="truncate">{p.link}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Btn size="sm" variant="outline" onClick={() => copy(p)}>{copied === p.id ? <><IcoCheck className="w-4 h-4" /> Copied</> : "Copy link"}</Btn>
                        <Btn size="sm" variant="outline" tone={p.active ? "slate" : "green"} onClick={() => toggle(p)}>{p.active ? "Turn off" : "Turn on"}</Btn>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-[#faf5ea] border border-[#e6dac6] p-3"><Eyebrow>Claimed</Eyebrow><div className="font-display text-2xl font-black text-[#241a12] tabular-nums">{p.claims}</div></div>
                      <div className="rounded-xl bg-[#faf5ea] border border-[#e6dac6] p-3"><Eyebrow>Went on to buy</Eyebrow><div className="font-display text-2xl font-black text-[#4a7c59] tabular-nums">{p.converted}</div></div>
                      <div className="rounded-xl bg-[#faf5ea] border border-[#e6dac6] p-3"><Eyebrow>Credit handed out</Eyebrow><div className="font-display text-2xl font-black text-[#241a12] tabular-nums inline-flex items-center gap-1"><IcoCoin className="w-4 h-4 text-[#c47b3e]" />${(p.claims * p.amount).toFixed(0)}</div></div>
                    </div>

                    {p.recent.length > 0 && (
                      <div className="mt-3">
                        <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="text-sm font-bold text-[#6c4d39] underline underline-offset-2">
                          {open === p.id ? "Hide" : "See"} recent claims
                        </button>
                        {open === p.id && (
                          <ul className="mt-2 divide-y divide-[#f0e6d6] rounded-xl border border-[#e6dac6] overflow-hidden">
                            {p.recent.map((r, i) => (
                              <li key={i} className="flex items-center gap-3 px-3 py-2 bg-white">
                                <Initials name={r.name} size={30} />
                                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[#241a12]">{r.name}</span>
                                <span className="text-xs text-[#8a7559]">{fmt(r.at)}</span>
                                {r.paid ? <Pill tone="green">Bought</Pill> : <Pill tone="slate">Not yet</Pill>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
