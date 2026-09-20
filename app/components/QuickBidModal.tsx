"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Pusher from "pusher-js";
import Countdown from "@/app/components/Countdown";
import CardSetupModal from "@/app/components/CardSetupModal";
import { getNextValidBid, getProxySuggestions } from "@/lib/bidIncrements";
import { IcoBolt, IcoGavel } from "@/app/components/BidIcons";
import { WoodenCrate } from "@/app/components/Illustrations";

type Item = {
  id: string;
  title: string;
  condition: string;
  size?: string | null;
  retailValue: number | null;
  startingBid: number;
  currentBid: number;
  status: string;
  itemEndAt: string | null;
  packSize?: number | null;
  photos: { url: string; isPrimary: boolean }[];
  bids: { id: string; amount: number; placedAt: string }[];
  auction: { title: string; endAt: string; status: string } | null;
  org?: { id: string; stripeChargesEnabled: boolean } | null;
};

/**
 * Quick Bid — the item page in a pop-up. Tap "Bid" on any card and this opens over
 * the grid: photo, price, timer, one-tap bid (double-tap to confirm, same as the
 * item page), a max-bid field, live updates via Pusher. Close it and you're exactly
 * where you were — no navigation, no scroll jump, keep browsing.
 */
export default function QuickBidModal({ itemId, href, onClose }: { itemId: string; href: string; onClose: () => void }) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [endAt, setEndAt] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [bidCount, setBidCount] = useState(0);

  const [isWinning, setIsWinning] = useState(false);
  const [participated, setParticipated] = useState(false);
  const [userProxy, setUserProxy] = useState<{ maxAmount: number } | null>(null);
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);

  const [armed, setArmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxAmount, setMaxAmount] = useState("");
  const [maxBusy, setMaxBusy] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proxyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* no haptics */ } };

  // ── Scroll lock: the page underneath stays exactly where it was ──────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    return fetch(`/api/items/${itemId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.item) return;
        setItem(d.item);
        const p = d.item.photos.findIndex((x: { isPrimary: boolean }) => x.isPrimary);
        setPhotoIdx(p >= 0 ? p : 0);
        const end = d.item.itemEndAt ?? d.item.auction?.endAt ?? null;
        setEndAt(end);
        if (end && new Date(end) <= new Date()) setEnded(true);
        setBidCount(Array.isArray(d.item.bids) ? d.item.bids.length : 0);
      })
      .catch(() => {});
  }, [itemId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const refreshStanding = useCallback(() => {
    if (!isSignedIn) return;
    fetch(`/api/proxy-bids/${itemId}`)
      .then((r) => r.json())
      .then((d) => {
        setIsWinning(!!d.isWinning);
        setParticipated(!!d.participated);
        setUserProxy(d.userProxy ?? null);
      })
      .catch(() => {});
  }, [itemId, isSignedIn]);
  useEffect(() => { refreshStanding(); }, [refreshStanding]);

  const refreshCard = useCallback(() => {
    if (!isSignedIn || !item?.org?.id) return;
    fetch(`/api/orgs/${item.org.id}/stripe/payment-method`)
      .then((r) => r.json())
      .then((d) => setHasCard(d.hasCard === true))
      .catch(() => setHasCard(null));
  }, [isSignedIn, item?.org?.id]);
  useEffect(() => { refreshCard(); }, [refreshCard]);

  // ── Live updates ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! });
    const ch = pusher.subscribe(`item-${itemId}`);
    ch.bind("new-bid", (d: { amount: number; newEndAt?: string }) => {
      setItem((prev) => (prev ? { ...prev, currentBid: Math.max(prev.currentBid, d.amount) } : prev));
      setBidCount((c) => c + 1);
      if (d.newEndAt) { setEndAt(d.newEndAt); setEnded(false); }
      if (proxyDebounce.current) clearTimeout(proxyDebounce.current);
      proxyDebounce.current = setTimeout(refreshStanding, 500);
    });
    ch.bind("item-closed", () => { setEnded(true); load(); });
    return () => {
      ch.unbind_all();
      pusher.unsubscribe(`item-${itemId}`);
      pusher.disconnect();
      if (proxyDebounce.current) clearTimeout(proxyDebounce.current);
    };
  }, [itemId, load, refreshStanding]);

  // ── Bidding ──────────────────────────────────────────────────────────────
  const current = item?.currentBid ?? 0;
  const nextBid = current > 0 ? getNextValidBid(current) : Math.max(Math.ceil(item?.startingBid ?? 0), 1);
  const retail = item?.retailValue ?? 0;
  const off = retail > 0 && current < retail ? Math.round((1 - current / retail) * 100) : 0;

  const goSignIn = () => router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);

  const placeBid = async (amount: number) => {
    if (hasCard === false) { setShowCardModal(true); return; }
    setPlacing(true); setMessage(null);
    try {
      const res = await fetch("/api/bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, amount }) });
      const d = await res.json();
      if (d.success) {
        if (d.proxyFired) {
          setMessage({ text: `Bid of $${amount.toLocaleString()} placed — instantly outbid by an active max bid.${d.giveawayTicket ? " Still counts: +1 giveaway ticket." : ""}`, type: "error" });
          buzz([10, 60, 10]);
        } else {
          setMessage({ text: d.giveawayTicket ? `You're the top bid at $${amount.toLocaleString()}! +1 giveaway ticket.` : `You're the top bid at $${amount.toLocaleString()}!`, type: "success" });
          setFlash(true); setTimeout(() => setFlash(false), 650);
        }
        if (d.newEndAt) { setEndAt(d.newEndAt); setEnded(false); }
        refreshStanding();
      } else if (d.requiresRegistration) {
        router.push(`/register?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      } else if (d.requiresPaymentMethod) {
        setShowCardModal(true);
      } else {
        setMessage({ text: d.error || "Couldn't place that bid.", type: "error" });
      }
    } catch { setMessage({ text: "Something went wrong", type: "error" }); }
    finally { setPlacing(false); }
  };

  const quickBid = () => {
    if (!isSignedIn) { goSignIn(); return; }
    if (placing || ended) return;
    if (!armed) {
      setArmed(true); buzz(12);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 2600);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false); buzz([18, 40, 28]);
    void placeBid(nextBid);
  };
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const setMax = async () => {
    if (!isSignedIn) { goSignIn(); return; }
    const amt = parseFloat(maxAmount);
    if (!maxAmount || isNaN(amt) || amt < nextBid) { setMessage({ text: `Max bid must be at least $${nextBid.toLocaleString()}`, type: "error" }); return; }
    if (!Number.isInteger(amt)) { setMessage({ text: "Whole dollars only.", type: "error" }); return; }
    if (hasCard === false) { setShowCardModal(true); return; }
    setMaxBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/proxy-bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, maxAmount: amt }) });
      const d = await res.json();
      if (d.success) {
        setUserProxy({ maxAmount: amt }); setMaxAmount(""); setMaxOpen(false);
        setMessage({ text: d.proxyFired ? `Max bid set at $${amt.toLocaleString()} — auto-bid placed.` : `Max bid set at $${amt.toLocaleString()}. We'll bid for you up to that.`, type: "success" });
        if (d.newEndAt) { setEndAt(d.newEndAt); setEnded(false); }
        refreshStanding();
      } else if (d.requiresRegistration) router.push(`/register?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      else if (d.requiresPaymentMethod) setShowCardModal(true);
      else setMessage({ text: d.error || "Couldn't set that max bid.", type: "error" });
    } catch { setMessage({ text: "Something went wrong", type: "error" }); }
    finally { setMaxBusy(false); }
  };

  const photos = item?.photos ?? [];
  const photo = photos[photoIdx]?.url ?? photos[0]?.url ?? null;
  const standing = !isSignedIn ? null : isWinning ? "lead" : participated ? "outbid" : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={item?.title ?? "Quick bid"}>
      {/* Backdrop — tap to close */}
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#241a12]/55 backdrop-blur-[2px]" />

      {/* Sheet: bottom sheet on phones, centered card on larger screens */}
      <div className="relative w-full sm:w-[min(92vw,480px)] max-h-[92vh] sm:max-h-[88vh] bg-[#fbf4e6] rounded-t-3xl sm:rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] border border-[#e3d6bf] overflow-hidden flex flex-col nb-sheet-in">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28] inline-flex items-center gap-1.5">
            <IcoBolt className="w-3.5 h-3.5" /> Quick bid
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full grid place-items-center text-[#6f5b46] hover:bg-[#efe3d0]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-4">
          {loading || !item ? (
            <div className="py-10 flex flex-col items-center gap-3 text-[#8a7559]">
              <div className="w-7 h-7 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
              <span className="text-sm">Pulling up the lot</span>
            </div>
          ) : (
            <>
              {/* Photo */}
              <div className="relative w-full aspect-[4/3] rounded-2xl bg-white ring-1 ring-[#efe0c9] overflow-hidden">
                {photo ? (
                  <Image src={photo} alt={item.title} fill sizes="480px" className="object-contain p-2" priority />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-[#b3a085]"><WoodenCrate className="w-16 h-14 opacity-70" /></div>
                )}
                {off >= 20 && (
                  <span className="absolute top-2 left-2 rounded-md bg-[#c47b3e] text-white text-[11px] font-black px-2 py-0.5 shadow-sm tabular-nums">{off}% off</span>
                )}
                {item.packSize && item.packSize > 1 && (
                  <span className="absolute bottom-2 left-2 bg-[#241a12]/85 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{item.packSize}-Pack</span>
                )}
              </div>
              {photos.length > 1 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {photos.slice(0, 8).map((p, i) => (
                    <button key={p.url + i} onClick={() => setPhotoIdx(i)} className={`relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-white ring-1 ${i === photoIdx ? "ring-[#6c4d39]" : "ring-[#e3d6bf]"}`}>
                      <Image src={p.url} alt="" fill sizes="48px" className="object-contain p-0.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Title + meta */}
              <h3 className="font-display font-black text-lg leading-tight text-[#241a12] mt-3">{item.title}</h3>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-[#8a7559]">
                <span className="capitalize">{item.condition.toLowerCase().replace(/_/g, " ")}</span>
                {item.size && <span className="bg-[#efe3d0] border border-[#cdbda3] text-[#241a12] rounded-md px-1.5 py-0.5 font-bold">Sz {item.size}</span>}
                {retail > 0 && <span className="tabular-nums">retail <span className="line-through">${retail.toLocaleString()}</span></span>}
                <span className="tabular-nums">{bidCount} bid{bidCount !== 1 ? "s" : ""}</span>
              </div>

              {/* Price + timer */}
              <div className="mt-3 flex items-end justify-between gap-3 rounded-2xl bg-white border border-[#e3d6bf] px-4 py-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a7559]">{current > 0 ? "Current bid" : "Starting bid"}</div>
                  <div className="font-display font-black text-3xl leading-none text-[#4a7c59] tabular-nums mt-0.5">${(current > 0 ? current : nextBid).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a7559]">{ended ? "Bidding" : "Ends in"}</div>
                  <div className="font-bold text-[#241a12] tabular-nums text-sm mt-0.5">
                    {ended ? "Ended" : endAt ? <Countdown endAt={endAt} onExpire={() => setEnded(true)} /> : "—"}
                  </div>
                </div>
              </div>

              {/* Standing */}
              {standing === "lead" && (
                <div className="mt-2 rounded-xl bg-[#241a12] text-[#f0a35a] text-sm font-black px-4 py-2.5 inline-flex items-center gap-2"><IcoGavel className="w-4 h-4" /> You&apos;re in the lead{userProxy ? ` · max $${userProxy.maxAmount.toLocaleString()}` : ""}</div>
              )}
              {standing === "outbid" && !ended && (
                <div className="mt-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-black px-4 py-2.5 inline-flex items-center gap-2">You&apos;ve been outbid{userProxy ? ` · your max $${userProxy.maxAmount.toLocaleString()} was beaten` : ""}</div>
              )}

              {message && (
                <div className={`mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${message.type === "success" ? "bg-[#dcebdf] text-[#2f5d3a]" : "bg-red-50 text-red-700 border border-red-200"}`}>{message.text}</div>
              )}

              {/* Actions */}
              {!ended && (
                <div className="mt-3">
                  <button
                    onClick={quickBid}
                    disabled={placing}
                    className={`relative overflow-hidden w-full rounded-2xl py-4 font-display font-black text-lg uppercase tracking-wide transition-colors disabled:opacity-60 ${
                      armed ? "bg-[#f0a35a] text-[#241a12]" : "bg-[#6c4d39] hover:bg-[#563e2c] text-white"
                    }`}
                  >
                    {flash && <span className="absolute inset-0 bg-white/40 animate-pulse" aria-hidden />}
                    {placing ? "Placing…" : !isSignedIn ? "Sign in to bid" : armed ? `Tap again to bid $${nextBid.toLocaleString()}` : `Bid $${nextBid.toLocaleString()}`}
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button onClick={() => setMaxOpen((o) => !o)} className="text-sm font-bold text-[#6c4d39] underline underline-offset-2">
                      {userProxy ? `Max bid: $${userProxy.maxAmount.toLocaleString()} · change` : "Set a max bid"}
                    </button>
                    <Link href={href} className="text-sm font-bold text-[#6f5b46] hover:text-[#241a12] underline underline-offset-2">Full details</Link>
                  </div>
                  {maxOpen && (
                    <div className="mt-2 rounded-2xl border border-[#e3d6bf] bg-white p-3">
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {getProxySuggestions(current, 4, retail || null).map((v) => (
                          <button key={v} onClick={() => setMaxAmount(String(v))} className={`text-xs font-bold rounded-full px-3 py-1 border ${maxAmount === String(v) ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-[#faf5ea] text-[#6c4d39] border-[#e3d6bf]"}`}>${v}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                          <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder={`${nextBid} or more`} className="w-full bg-[#faf5ea] border border-[#cdbda3] rounded-xl pl-7 pr-3 py-2.5 text-[#241a12] font-bold tabular-nums" />
                        </div>
                        <button onClick={setMax} disabled={maxBusy} className="bg-[#4a7c59] hover:bg-[#3c6449] text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50">{maxBusy ? "…" : "Set max"}</button>
                      </div>
                      <p className="text-[11px] text-[#8a7559] mt-1.5">We bid for you, one step at a time, only as high as needed — never past your max.</p>
                    </div>
                  )}
                </div>
              )}
              {ended && (
                <Link href={href} className="mt-3 block text-center rounded-2xl bg-[#241a12] text-[#f6ecda] font-bold py-3">See the result</Link>
              )}
            </>
          )}
        </div>
      </div>

      {showCardModal && item?.org?.id && (
        <CardSetupModal
          orgId={item.org.id}
          onSuccess={() => { setShowCardModal(false); setHasCard(true); refreshCard(); setMessage({ text: "Card saved. Tap Bid to place your bid.", type: "success" }); }}
          onClose={() => setShowCardModal(false)}
        />
      )}
    </div>
  );
}
