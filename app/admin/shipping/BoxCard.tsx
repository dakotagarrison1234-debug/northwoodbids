"use client";
import { useState } from "react";
import PrintLabelButton from "../PrintLabelButton";
import { Btn, Pill, Eyebrow, Input, Initials, Notice, Disclosure } from "../ui";
import { type Box, type BoxOption, type Rate, type RateView, type PackInput, fmtCents, signedCents, fmtWeight, dimsLabel, trackingPill, UNPAID_NUDGE_DAYS } from "./types";

// PrintLabelButton is an <a target="_blank"> (PDF viewer), so it borrows the
// kit's outline-button look rather than being a Btn.
const printBtnCls =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[44px] px-4 text-[15px] bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea]";
const fieldCls =
  "w-full min-h-[50px] text-[17px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] outline-none transition";
const labelCls = "text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";

const Chevron = ({ open }: { open: boolean }) => (
  <span className={`text-[#cdbda3] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
  </span>
);

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" }) : "";

export type BoxCardProps = {
  box: Box;
  boxes: BoxOption[];
  configured: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (b: Box) => void;
  onRemove: (id: string) => void;
  flash: (text: string, ok: boolean) => void;
  askConfirm: (text: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }) => void;
  // The rate shown and the inline error live on the page, so Rate all / Buy all
  // can fill them in for cards they never opened.
  rate: RateView | null;
  setRate: (r: RateView | null) => void;
  err: string | null;
  setErr: (e: string | null) => void;
  /** What was typed in Box / Pounds / Ounces before this card last unmounted (tab switch). */
  pack?: PackInput;
  onPackChange?: (p: PackInput) => void;
  /** Checkbox for the bulk bar — only on tabs that have one. */
  selected?: boolean;
  onSelect?: () => void;
};

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> & { error?: string; bundle?: Box } }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function BoxCard({
  box, boxes, configured, open, onToggle, onChange, onRemove, flash, askConfirm, rate, setRate, err, setErr, pack, onPackChange, selected, onSelect,
}: BoxCardProps) {
  const name = box.buyer.name || box.ship.name || "Bidder";
  const packing = box.status === "PACKING";
  const waiting = box.status === "CLOSED";
  const collecting = box.status === "OPEN";
  const shipped = box.status === "SHIPPED" || box.status === "DELIVERED";
  const lotsTotal = box.lots.length;

  // Pack controls (prefilled from what was typed before, the last rate, or the engine's guess).
  const startOz = pack?.weightOz ?? box.packedWeightOz ?? box.weightOz;
  const [boxCode, setBoxCode] = useState<string>(pack?.boxCode ?? box.packedBoxCode ?? box.boxCode ?? boxes[0]?.code ?? "");
  const [lb, setLb] = useState<string>(String(Math.floor(startOz / 16)));
  const [oz, setOz] = useState<string>(String(startOz % 16));
  const [busy, setBusy] = useState<null | "rate" | "buy" | "refund" | "manual" | "notes" | "cancel" | `lot:${string}`>(null);
  // Manual fallback
  const [mCarrier, setMCarrier] = useState("USPS");
  const [mTracking, setMTracking] = useState("");
  const [notes, setNotes] = useState(box.notes ?? "");

  const ozOf = (lbv: string, ozv: string) => Math.max(0, Math.round((Number(lbv) || 0) * 16 + (Number(ozv) || 0)));
  const totalOz = ozOf(lb, oz);
  const chosenBox = boxes.find((b) => b.code === boxCode) ?? null;
  // Any edit to the pack inputs drops the rate shown and tells the page what's typed (Rate all uses it).
  const editPack = (next: { boxCode?: string; lb?: string; oz?: string }) => {
    const bc = next.boxCode ?? boxCode;
    const lbv = next.lb ?? lb;
    const ozv = next.oz ?? oz;
    if (next.boxCode !== undefined) setBoxCode(bc);
    if (next.lb !== undefined) setLb(lbv);
    if (next.oz !== undefined) setOz(ozv);
    setRate(null);
    onPackChange?.({ boxCode: bc, weightOz: ozOf(lbv, ozv) });
  };

  const getRate = async () => {
    setBusy("rate"); setErr(null);
    try {
      const { ok, data } = await call(`/api/admin/shipping/${box.id}/rate`, "POST", { boxCode, weightOz: totalOz });
      if (!ok) { setErr(data.error || "Couldn't get a rate."); setRate(null); return; }
      const r = data.rate as Rate;
      setRate({ ...r, chargedCents: data.chargedCents as number, spreadCents: data.spreadCents as number });
      onChange({ ...box, packedBoxCode: boxCode, packedWeightOz: totalOz, hasShipment: true });
    } catch { setErr("Something went wrong."); }
    finally { setBusy(null); }
  };

  const buy = async () => {
    setBusy("buy"); setErr(null);
    try {
      const { ok, data } = await call(`/api/admin/shipping/${box.id}/buy`, "POST");
      if (!ok) { setErr(data.error || "Couldn't buy the label."); return; }
      if (data.bundle) onChange(data.bundle);
      flash(`Label bought for ${name}${data.texted ? " and tracking texted" : ""}.`, true);
    } catch { setErr("Something went wrong."); }
    finally { setBusy(null); }
  };

  const refund = () => askConfirm(
    `Refund this label and put ${name}'s box back in the pack queue? The tracking number will stop working.`,
    async () => {
      setBusy("refund"); setErr(null);
      try {
        const { ok, data } = await call(`/api/admin/shipping/${box.id}/refund-label`, "POST");
        if (!ok) { setErr(data.error || "Couldn't refund the label."); return; }
        if (data.bundle) onChange(data.bundle);
        setRate(null);
        flash(`Label refunded. ${name}'s box is back in To pack.`, true);
      } catch { setErr("Something went wrong."); }
      finally { setBusy(null); }
    },
    { confirmLabel: "Refund label", danger: true },
  );

  const markShipped = () => {
    const go = async () => {
      setBusy("manual"); setErr(null);
      try {
        const { ok, data } = await call(`/api/admin/shipping/${box.id}/mark-shipped`, "POST", { carrier: mCarrier, trackingCode: mTracking });
        if (!ok) { setErr(data.error || "Couldn't mark it shipped."); return; }
        if (data.bundle) onChange(data.bundle);
        flash(`${name}'s box marked shipped${data.texted ? " and tracking texted" : ""}.`, true);
      } catch { setErr("Something went wrong."); }
      finally { setBusy(null); }
    };
    if (!mTracking.trim()) askConfirm(`Mark ${name}'s box shipped with no tracking number? They won't get a text.`, go, { confirmLabel: "Mark shipped" });
    else go();
  };

  const saveNotes = async () => {
    setBusy("notes"); setErr(null);
    try {
      const { ok, data } = await call(`/api/admin/shipping/${box.id}`, "PATCH", { notes });
      if (!ok) { setErr(data.error || "Couldn't save."); return; }
      if (data.bundle) onChange(data.bundle);
      flash("Notes saved.", true);
    } catch { setErr("Something went wrong."); }
    finally { setBusy(null); }
  };

  const cancel = () => askConfirm(
    `Cancel ${name}'s box? Its ${lotsTotal} lot${lotsTotal !== 1 ? "s" : ""} go back to Pickup. Shipping already paid is not refunded here.`,
    async () => {
      setBusy("cancel"); setErr(null);
      try {
        const { ok, data } = await call(`/api/admin/shipping/${box.id}`, "PATCH", { status: "CANCELLED" });
        if (!ok) { setErr(data.error || "Couldn't cancel."); return; }
        onRemove(box.id);
        flash(`${name}'s box cancelled.`, true);
      } catch { setErr("Something went wrong."); }
      finally { setBusy(null); }
    },
    { confirmLabel: "Cancel box", danger: true },
  );

  // One lot leaves the box for the pickup pipeline (unpaid straggler, or it
  // turned out not to ship). Only while there's no label.
  const removeLot = (lotId: string, label: string, paid: boolean) => askConfirm(
    paid
      ? `Move ${label} to pickup? It leaves ${name}'s box and shows on the Pickup board. Shipping they already paid for it is not refunded here.`
      : `Move ${label} to pickup? It leaves ${name}'s box and shows on the Pickup board. They still owe the item, but no shipping for it.`,
    async () => {
      setBusy(`lot:${lotId}`); setErr(null);
      try {
        const { ok, data } = await call(`/api/admin/shipping/${box.id}/remove-lot`, "POST", { itemId: lotId });
        if (!ok) { setErr(data.error || "Couldn't move that lot."); return; }
        if (data.bundle && data.bundle.status !== "CANCELLED") onChange(data.bundle);
        else onRemove(box.id);
        setRate(null);
        flash(`${label} moved to pickup${data.bundle && data.bundle.status === "CANCELLED" ? ` — ${name}'s box was empty and is gone` : ""}.`, true);
      } catch { setErr("Something went wrong."); }
      finally { setBusy(null); }
    },
    { confirmLabel: "Move to pickup" },
  );
  const canRemoveLots = !shipped && !box.labelUrl && box.status !== "CANCELLED";
  // Waiting: a lot still unpaid this long after the box closed is the thing
  // holding the box — surface it next to the Move-to-pickup button.
  const unpaidDays = (paid: boolean) => (waiting && !paid && box.daysSinceClosed > UNPAID_NUDGE_DAYS ? box.daysSinceClosed : 0);

  const spread = shipped && box.labelCostCents != null ? box.chargedCents - box.labelCostCents : null;
  const track = trackingPill(box.lastTrackingStatus, box.status);
  // Waiting: "2 of 3 here · 1 on transfer from Gladwin · 1 unpaid"
  const missing: string[] = [];
  if (waiting) {
    const onTransfer = box.lots.filter((l) => l.paid && !l.atStation);
    const unpaid = box.lots.filter((l) => !l.paid);
    const from = [...new Set(onTransfer.map((l) => l.locationName).filter(Boolean))].join(", ");
    if (onTransfer.length) missing.push(`${onTransfer.length} on transfer${from ? ` from ${from}` : ""}`);
    if (unpaid.length) missing.push(`${unpaid.length} unpaid`);
  }
  const meta = [
    box.location ? `ships from ${box.location.name}` : null,
    waiting ? `${box.lotsHere} of ${lotsTotal} lot${lotsTotal !== 1 ? "s" : ""} here` : `${lotsTotal} lot${lotsTotal !== 1 ? "s" : ""}`,
    ...missing,
    fmtWeight(box.packedWeightOz ?? box.weightOz),
    `box ${dimsLabel((boxes.find((b) => b.code === (box.packedBoxCode ?? box.boxCode)) ?? box.box)?.dims)}`,
    `charged ${fmtCents(box.chargedCents)}`,
  ].filter(Boolean).join(" · ");

  return (
    <div id={`box-${box.id}`} className={`bg-white border rounded-2xl overflow-hidden shadow-[0_6px_18px_-14px_rgba(60,40,25,0.35)] ${selected ? "border-[#6c4d39]" : "border-[#e6dac6]"}`}>
      <div className="flex items-stretch">
        {onSelect && (
          <label className="flex items-center justify-center min-w-[44px] pl-3 pr-1 cursor-pointer hover:bg-[#faf5ea]">
            <input type="checkbox" checked={!!selected} onChange={onSelect} aria-label={`Select ${name}`} className="w-6 h-6 accent-[#6c4d39] cursor-pointer" />
          </label>
        )}
        <button type="button" onClick={onToggle} aria-expanded={open} className={`flex-1 min-w-0 text-left flex items-center gap-3 ${onSelect ? "pl-2 pr-4" : "px-4"} py-4 min-h-[72px] hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors`}>
          <Initials name={name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl font-black text-[#241a12] leading-none truncate">{name}</div>
            <div className="text-[15px] text-[#8a7559] mt-1 sm:truncate">{box.ship.city}, {box.ship.state} · {meta}</div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {waiting && <Pill tone={box.lotsHere === lotsTotal ? "green" : "amber"}>{box.lotsHere} of {lotsTotal} here</Pill>}
            {collecting && <Pill tone="blue">Closes {fmtDay(box.closesAt)}</Pill>}
            {packing && rate && <Pill tone={rate.spreadCents >= 0 ? "green" : "red"}>{fmtCents(rate.cents)} · {signedCents(rate.spreadCents)}</Pill>}
            {shipped && <Pill tone={track.tone} dot>{track.label}</Pill>}
            <Chevron open={open} />
          </div>
        </button>
      </div>

      {/* Inline problem — shown whether or not the card is open, so Rate all / Buy all failures are visible on a collapsed card. */}
      {err && <div className="px-4 pb-3"><Notice tone="red">{err}</Notice></div>}

      {open && (
        <div className="border-t border-[#f0e6d6] px-4 py-4 space-y-4">
          {/* Ship-to + ship-from */}
          <div className="text-[15px] text-[#4a3a2b]">
            {box.ship.name} · {box.ship.street1}{box.ship.street2 ? `, ${box.ship.street2}` : ""}, {box.ship.city}, {box.ship.state} {box.ship.zip}
            {box.buyer.phone ? ` · ${box.buyer.phone}` : ""}
          </div>
          {box.location && (
            <div className="text-[15px] text-[#8a7559] -mt-2">Ships from {box.location.name}</div>
          )}

          {/* Lots */}
          <ul className="space-y-1.5">
            {box.lots.map((l) => (
              <li key={l.id} className="flex items-center gap-3 min-h-[56px] rounded-xl border border-[#e6dac6] bg-white px-3 py-2">
                <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#efe3d0]">
                  {l.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.thumb} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {l.code && <span className="font-mono font-extrabold text-[#563e2c] bg-[#f1e7d5] border border-[#d9c7ab] rounded px-1.5 py-0.5 text-[15px]">{l.code}</span>}
                    {l.shelf && !shipped && <span className="text-[13px] font-black uppercase tracking-wide text-[#8a7559]">{l.shelf}</span>}
                    {!shipped && !l.paid && <Pill tone="red">{unpaidDays(l.paid) ? `Unpaid ${unpaidDays(l.paid)} days` : "Unpaid"}</Pill>}
                    {!shipped && l.paid && l.atStation && waiting && <Pill tone="green">Here</Pill>}
                    {!shipped && l.paid && !l.atStation && (
                      <Pill tone="amber">{l.transferTo ? `On transfer from ${l.locationName ?? "warehouse"}` : `At ${l.locationName ?? "another warehouse"}`}</Pill>
                    )}
                  </span>
                  <span className="block mt-0.5 leading-snug line-clamp-2 text-[#241a12]">{l.title}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Pull list */}
          {!collecting && (
            <div className="flex flex-col sm:flex-row gap-2">
              <PrintLabelButton href={`/api/admin/label?type=bundle&bundle=${box.id}`} label="Print pull list" className={printBtnCls} />
              {shipped && box.labelUrl && (
                <PrintLabelButton href={box.labelUrl} label="Print label" className={`${printBtnCls} border-[#4a7c59] text-[#2f5d3a]`} />
              )}
            </div>
          )}

          {/* Pack + rate + buy */}
          {packing && (
            <div className="bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor={`box-${box.id}-size`}>Box</label>
                  <select id={`box-${box.id}-size`} value={boxCode} onChange={(e) => editPack({ boxCode: e.target.value })} className={fieldCls}>
                    {boxes.map((b) => (
                      <option key={b.code} value={b.code}>{dimsLabel(b.dims)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor={`box-${box.id}-lb`}>Pounds</label>
                  <Input id={`box-${box.id}-lb`} type="number" inputMode="numeric" min={0} max={70} value={lb} onChange={(e) => editPack({ lb: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`box-${box.id}-oz`}>Ounces</label>
                  <Input id={`box-${box.id}-oz`} type="number" inputMode="numeric" min={0} max={15} value={oz} onChange={(e) => editPack({ oz: e.target.value })} />
                </div>
              </div>

              {configured ? (
                <>
                  <Btn onClick={getRate} disabled={busy !== null || !chosenBox || totalOz < 1} tone="leather" full>
                    {busy === "rate" ? "Getting rate…" : rate ? "Get rate again" : "Get rate"}
                  </Btn>
                  {rate && (
                    <div className="rounded-xl border border-[#e6dac6] bg-white px-4 py-3">
                      <div className="font-bold text-[#241a12]">
                        {rate.label} {fmtCents(rate.cents)}{rate.days != null ? ` · ${rate.days} day${rate.days !== 1 ? "s" : ""}` : ""}
                      </div>
                      <div className="text-[15px] mt-0.5">
                        <span className="text-[#8a7559]">you charged {fmtCents(rate.chargedCents)} · </span>
                        <span className={`font-extrabold ${rate.spreadCents >= 0 ? "text-[#2f5d3a]" : "text-[#a1321f]"}`}>{signedCents(rate.spreadCents)}</span>
                      </div>
                      <Btn onClick={buy} disabled={busy !== null} tone="green" full className="mt-3">
                        {busy === "buy" ? "Buying…" : `Buy label ${fmtCents(rate.cents)}`}
                      </Btn>
                    </div>
                  )}
                </>
              ) : (
                <ManualShip carrier={mCarrier} setCarrier={setMCarrier} tracking={mTracking} setTracking={setMTracking} onSubmit={markShipped} busy={busy === "manual"} />
              )}
            </div>
          )}

          {/* Shipped: tracking + money */}
          {shipped && (
            <div className="bg-[#f4ede1] border border-[#e6dac6] rounded-xl p-4 space-y-2">
              <div className="font-bold text-[#241a12]">
                {box.serviceLabel ?? "Shipped"}{box.shippedAt ? ` · ${fmtDay(box.shippedAt)}` : ""}
              </div>
              {box.trackingCode && (
                <div className="font-mono text-[17px] break-all">
                  {box.trackingUrl ? (
                    <a href={box.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline text-[#2b4d6e]">{box.trackingCode}</a>
                  ) : box.trackingCode}
                </div>
              )}
              <div className="text-[15px]">
                <span className="text-[#8a7559]">charged {fmtCents(box.chargedCents)} · label {box.labelCostCents != null ? fmtCents(box.labelCostCents) : "unknown"}</span>
                {spread != null && <span className={`font-extrabold ${spread >= 0 ? "text-[#2f5d3a]" : "text-[#a1321f]"}`}> · {signedCents(spread)}</span>}
              </div>
              {box.deliveredAt && <div className="text-[15px] text-[#2f5d3a] font-semibold">Delivered {fmtDay(box.deliveredAt)}</div>}
            </div>
          )}

          {/* More: rare controls */}
          <Disclosure label="More">
            <div className="px-4 py-4 space-y-4">
              {packing && configured && (
                <div>
                  <Eyebrow className="mb-2">Shipped some other way</Eyebrow>
                  <ManualShip carrier={mCarrier} setCarrier={setMCarrier} tracking={mTracking} setTracking={setMTracking} onSubmit={markShipped} busy={busy === "manual"} />
                </div>
              )}
              {shipped && box.status === "SHIPPED" && (
                <Btn onClick={refund} disabled={busy !== null} tone="red" variant="outline" full>
                  {busy === "refund" ? "Refunding…" : box.labelUrl ? "Refund label" : "Unship"}
                </Btn>
              )}
              {canRemoveLots && box.lots.length > 0 && (
                <div>
                  <Eyebrow className="mb-2">Move a lot to pickup</Eyebrow>
                  <ul className="space-y-1.5">
                    {box.lots.map((l) => {
                      const label = l.code ?? l.title;
                      const days = unpaidDays(l.paid);
                      return (
                        <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e6dac6] bg-white pl-3 pr-1.5 py-1.5 min-h-[48px]">
                          <span className="min-w-0 flex items-center gap-2 flex-wrap">
                            {l.code && <span className="font-mono font-extrabold text-[#563e2c] text-[15px]">{l.code}</span>}
                            <span className="truncate text-[15px] text-[#4a3a2b]">{l.title}</span>
                          </span>
                          <span className="shrink-0 flex items-center gap-2">
                            {days > 0 && <Pill tone="red">Unpaid {days} day{days !== 1 ? "s" : ""}</Pill>}
                            <Btn onClick={() => removeLot(l.id, label, l.paid)} disabled={busy !== null} tone={days > 0 ? "red" : "slate"} variant="outline" size="sm">
                              {busy === `lot:${l.id}` ? "Moving…" : "Move to pickup"}
                            </Btn>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[15px] text-[#8a7559] mt-2">The lot goes to the Pickup board. Unpaid lots still owe the item, not the shipping.</p>
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor={`box-${box.id}-notes`}>Notes</label>
                <textarea id={`box-${box.id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${fieldCls} py-3`} />
                <Btn onClick={saveNotes} disabled={busy !== null || notes === (box.notes ?? "")} tone="slate" variant="outline" size="sm" className="mt-2">
                  {busy === "notes" ? "Saving…" : "Save notes"}
                </Btn>
              </div>
              {!shipped && !box.labelUrl && (
                <Btn onClick={cancel} disabled={busy !== null} tone="red" variant="ghost" full>
                  {busy === "cancel" ? "Cancelling…" : "Cancel box (lots back to Pickup)"}
                </Btn>
              )}
            </div>
          </Disclosure>
        </div>
      )}
    </div>
  );
}

/** Carrier + tracking inputs for the no-EasyPost path. */
function ManualShip({
  carrier, setCarrier, tracking, setTracking, onSubmit, busy,
}: { carrier: string; setCarrier: (v: string) => void; tracking: string; setTracking: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Carrier</label>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={fieldCls}>
            <option value="USPS">USPS</option>
            <option value="UPS">UPS</option>
            <option value="FedEx">FedEx</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Tracking number</label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Optional — buyer gets a text if given" autoComplete="off" />
        </div>
      </div>
      <Btn onClick={onSubmit} disabled={busy} tone="green" full>{busy ? "Saving…" : "Mark shipped"}</Btn>
    </div>
  );
}
