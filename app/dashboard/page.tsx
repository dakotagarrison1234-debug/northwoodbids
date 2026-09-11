"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Pusher from "pusher-js";
import UserMenu from "@/app/components/UserMenu";
import CardSetupModal from "@/app/components/CardSetupModal";
import { PineMark } from "@/app/components/Illustrations";
import { IcoTrophy, IcoGift, IcoCheck, IcoBolt, IcoCoin, IcoTarget, IcoGavel as IcoGavelBrand, IcoSpark, IcoTruck, IcoUsers, IcoLock } from "@/app/components/BidIcons";
import EmptyState from "@/app/components/EmptyState";
import Skeleton from "@/app/components/Skeleton";
import PickupStatusCard from "@/app/components/PickupStatusCard";
import ItemCardTimer from "@/app/components/ItemCardTimer";
import { money } from "@/lib/format";

type Tab = "overview" | "active" | "history" | "auctions" | "profile";

interface BidBase {
  itemId: string;
  auctionId: string | null;
  itemTitle: string;
  itemStatus: string;
  photo: string | null;
  auctionTitle: string;
  auctionSlug: string;
  auctionEndAt: string;
  auctionStatus: string;
  orgName: string;
  orgSlug: string;
}
interface WinningBid extends BidBase { myBid: number; currentBid: number; itemEndAt: string | null; }
interface LosingBid extends BidBase { myBid: number; currentBid: number; itemEndAt: string | null; }
interface PastBid extends BidBase { myBid: number; finalBid: number; outcome: "won" | "lost" | "unsold"; paid: boolean; pickedUp?: boolean; storageLocation?: string | null; giveaway?: boolean; }
interface UnpaidWin extends BidBase {
  amountOwed: number;
  paymentFailed?: boolean;
  orgId?: string;
  orgStripeAccountId?: string | null;
  feePercent?: number;
  taxPercent?: number;
  feeAmount?: number;
  taxAmount?: number;
  totalDue?: number;
}
interface Profile {
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredOrgId?: string | null;
  preferredOrg?: { id: string; name: string; slug: string; logoUrl: string | null } | null;
}
interface DashboardData { profile: Profile | null; winning: WinningBid[]; losing: LosingBid[]; past: PastBid[]; unpaidWins: UnpaidWin[]; }

interface LiveAuction {
  id: string;
  title: string;
  slug: string;
  endAt: string;
  org: { id: string; name: string; slug: string; logoUrl: string | null };
  activeItems: number;
}

interface PaymentMethod {
  orgId: string;
  orgName: string;
  orgSlug: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  hasCard: boolean;
  last4: string | null;
  brand: string | null;
}

// ── SVG Nav Icons ─────────────────────────────────────────────────────────────
function IcoGrid() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IcoUp() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15V5M5 10l5-5 5 5" />
    </svg>
  );
}
function IcoGavel() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 3.5 16 9l-1.5 1.5L9 5l1.5-1.5z" />
      <path d="M9 5 5 9l-1 2 2-1 4-4" />
      <path d="M14 12l-8 8" />
      <path d="M3 17h5" />
    </svg>
  );
}
function IcoArrow() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function IcoPackage() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

function IcoHistory() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </svg>
  );
}
function IcoCard({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IcoAlert({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function Photo({ url, title }: { url: string | null; title: string }) {
  return url ? (
    <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shrink-0 border border-[#e3d6bf]">
      <Image src={url} alt={title} fill sizes="56px" className="object-cover" />
    </div>
  ) : (
    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#efe3d0] border border-[#e3d6bf] rounded-xl shrink-0" />
  );
}

function formatEnd(endAt: string) {
  return new Date(endAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ── Themed section header for bid lists ──────────────────────────────────────
   A colour bar + eyebrow + display title + count pill. Same DNA as the home
   page SectionHeader, sized down for the account area. */
type Tone = "lead" | "outbid" | "won" | "owed" | "live" | "neutral";
const TONE: Record<Tone, { bar: string; tint: string; eyebrow: string; pill: string }> = {
  lead:    { bar: "bg-[#4a7c59]", tint: "from-[#dcebdf] to-transparent", eyebrow: "text-[#2f5d3a]", pill: "bg-[#4a7c59] text-white" },
  outbid:  { bar: "bg-[#c0392b]", tint: "from-[#f6dcd7] to-transparent", eyebrow: "text-[#a3271b]", pill: "bg-[#c0392b] text-white" },
  won:     { bar: "bg-[#c47b3e]", tint: "from-[#f7e4c9] to-transparent", eyebrow: "text-[#a85f28]", pill: "bg-[#c47b3e] text-white" },
  owed:    { bar: "bg-[#f0a35a]", tint: "from-[#fbe7cf] to-transparent", eyebrow: "text-[#a85f28]", pill: "bg-[#c47b3e] text-white" },
  live:    { bar: "bg-[#4a7c59]", tint: "from-[#dcebdf] to-transparent", eyebrow: "text-[#2f5d3a]", pill: "bg-[#4a7c59] text-white" },
  neutral: { bar: "bg-[#6c4d39]", tint: "from-[#e9dcc6] to-transparent", eyebrow: "text-[#6c4d39]", pill: "bg-[#6c4d39] text-white" },
};
function ListHeader({
  tone,
  eyebrow,
  title,
  count,
  action,
  id,
}: {
  tone: Tone;
  eyebrow: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  id?: string;
}) {
  const t = TONE[tone];
  return (
    <div id={id} className={`relative rounded-2xl bg-gradient-to-r ${t.tint} pl-5 pr-3 py-3 mb-3 flex items-center justify-between gap-3 scroll-mt-24`}>
      <span className={`absolute left-0 top-2.5 bottom-2.5 w-1.5 rounded-full ${t.bar}`} aria-hidden />
      <div className="min-w-0 pl-1">
        <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${t.eyebrow}`}>{eyebrow}</div>
        <h2 className="font-display text-xl sm:text-2xl font-black leading-none tracking-tight text-[#241a12] mt-0.5">{title}</h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {count != null && count > 0 && (
          <span className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 font-display font-black text-sm tabular-nums ${t.pill}`}>{count}</span>
        )}
        {action}
      </div>
    </div>
  );
}

/** Small status chip in brand colours. */
function Chip({ tone, children }: { tone: "moss" | "amber" | "red" | "leather" | "tan"; children: React.ReactNode }) {
  const c =
    tone === "moss" ? "bg-[#4a7c59]/12 text-[#2f5d3a] border-[#4a7c59]/25"
    : tone === "amber" ? "bg-[#f0a35a]/18 text-[#8a4f1c] border-[#c47b3e]/30"
    : tone === "red" ? "bg-red-50 text-red-700 border-red-200"
    : tone === "leather" ? "bg-[#6c4d39]/10 text-[#6c4d39] border-[#6c4d39]/25"
    : "bg-[#f1e7d5] text-[#6f5b46] border-[#e3d6bf]";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${c}`}>{children}</span>
  );
}

function BidderDashboardInner() {
  const { user, isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab =
    rawTab === "winning" || rawTab === "losing" || rawTab === "active"
      ? "active"
      : rawTab === "history" || rawTab === "auctions" || rawTab === "profile"
      ? rawTab
      : "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryMsg, setRetryMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [cardModal, setCardModal] = useState<{ orgId: string; stripeAccountId: string } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([]);
  // Outbid items the bidder dismissed ("not interested") — hidden from active lists.
  // Persisted per-device so the choice sticks across reloads.
  const [dismissedLosing, setDismissedLosing] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nb_dismissed_losing");
      if (raw) setDismissedLosing(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const dismissLosing = (itemId: string) => {
    setDismissedLosing((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      try { localStorage.setItem("nb_dismissed_losing", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const [loadingAuctions, setLoadingAuctions] = useState(false);

  const load = useCallback(() => {
    fetch("/api/my-bids")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load bids");
        return r.json();
      })
      .then((d: DashboardData) => {
        setData(d);
        setEditName(d.profile?.name || "");
        setEditEmail(d.profile?.email || user?.primaryEmailAddress?.emailAddress || "");
        setEditPhone(d.profile?.phone || "");
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [user]);

  // User-triggered retry: reset state, then re-run the fetch.
  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in?redirect_url=/dashboard"); return; }
    load();
  }, [isLoaded, isSignedIn, router, load]);

  // Real-time Pusher updates — re-fetch when any active bid item gets a new bid
  useEffect(() => {
    if (!data) return;
    const activeItems = [...(data.winning ?? []), ...(data.losing ?? [])];
    if (activeItems.length === 0) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channels = activeItems.map((b) => {
      const ch = pusher.subscribe(`item-${b.itemId}`);
      ch.bind("new-bid", () => load());
      return ch;
    });

    return () => {
      channels.forEach((ch) => ch.unbind_all());
      pusher.disconnect();
    };
  }, [data, load]);

  const loadPaymentMethods = useCallback(() => {
    setLoadingPMs(true);
    fetch("/api/payment-methods")
      .then(r => r.json())
      .then(d => setPaymentMethods(d.paymentMethods ?? []))
      .catch(() => {/* non-critical */})
      .finally(() => setLoadingPMs(false));
  }, []);

  const loadLiveAuctions = useCallback(() => {
    setLoadingAuctions(true);
    fetch("/api/live-auctions")
      .then(r => r.json())
      .then(d => setLiveAuctions(d.auctions ?? []))
      .catch(() => {/* non-critical */})
      .finally(() => setLoadingAuctions(false));
  }, []);

  useEffect(() => {
    if (tab === "profile") loadPaymentMethods();
    if (tab === "auctions") loadLiveAuctions();
  }, [tab, loadPaymentMethods, loadLiveAuctions]);

  // Live auction list updates — re-fetch when any auction opens or closes
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
    const ch = pusher.subscribe("auctions");
    ch.bind("auction-updated", () => {
      if (tab === "auctions") loadLiveAuctions();
    });
    return () => {
      ch.unbind_all();
      pusher.disconnect();
    };
  }, [tab, loadLiveAuctions]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
      });
      const d = await res.json();
      setProfileMsg(d.success ? { text: "Saved.", ok: true } : { text: d.error || "Couldn't save that. Try again.", ok: false });
      if (d.success) load();
    } catch { setProfileMsg({ text: "Something went wrong. Try again.", ok: false }); }
    finally { setSavingProfile(false); }
  };

  const retryPayment = async (itemId: string) => {
    setRetryingItemId(itemId);
    setRetryMsg(null);
    try {
      const res = await fetch("/api/retry-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const d = await res.json();
      if (d.success) {
        setRetryMsg({ text: "Paid. Your item is ready for pickup.", ok: true });
        load();
      } else if (d.requiresAction && d.clientSecret) {
        // Card requires 3DS authentication — confirm on-session in the browser.
        // Direct charges live on the platform account, so no stripeAccount option.
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (!stripe) {
          setRetryMsg({ text: "Could not load payment form. Please try again.", ok: false });
          return;
        }
        const result = await stripe.confirmCardPayment(d.clientSecret);
        if (result.error) {
          setRetryMsg({ text: result.error.message || "Authentication failed. Please try again.", ok: false });
          return;
        }
        if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing") {
          // Record the confirmed payment server-side
          const c = await fetch("/api/retry-payment/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, paymentIntentId: result.paymentIntent.id }),
          });
          const cd = await c.json();
          if (cd.success) {
            setRetryMsg({ text: "Paid. Your item is ready for pickup.", ok: true });
            load();
          } else {
            setRetryMsg({ text: cd.error || "Payment went through but we couldn't confirm it. Refresh in a minute.", ok: false });
          }
        } else {
          setRetryMsg({ text: "Payment did not complete. Please try a different card.", ok: false });
        }
      } else {
        setRetryMsg({ text: d.error || "Payment failed. Please update your card in Account.", ok: false });
      }
    } catch {
      setRetryMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setRetryingItemId(null);
    }
  };

  // Pay ALL unpaid wins in one charge (one card approval, one Stripe fee).
  const retryAll = async () => {
    setRetryingAll(true);
    setRetryMsg(null);
    try {
      const res = await fetch("/api/retry-payment/all", { method: "POST" });
      const d = await res.json();
      if (d.success) {
        setRetryMsg({ text: "Paid. Your items are ready for pickup.", ok: true });
        load();
      } else if (d.requiresAction && d.clientSecret) {
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (!stripe) {
          setRetryMsg({ text: "Could not load payment form. Please try again.", ok: false });
          return;
        }
        const result = await stripe.confirmCardPayment(d.clientSecret);
        if (result.error) {
          setRetryMsg({ text: result.error.message || "Authentication failed. Please try again.", ok: false });
          return;
        }
        if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing") {
          const c = await fetch("/api/retry-payment/all/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentIntentId: result.paymentIntent.id }),
          });
          const cd = await c.json();
          if (cd.success) {
            setRetryMsg({ text: "Paid. Your items are ready for pickup.", ok: true });
            load();
          } else {
            setRetryMsg({ text: cd.error || "Payment went through but we couldn't confirm it. Refresh in a minute.", ok: false });
          }
        } else {
          setRetryMsg({ text: "Payment did not complete. Please try a different card.", ok: false });
        }
      } else {
        setRetryMsg({ text: d.error || "Payment failed. Please update your card in Account.", ok: false });
      }
    } catch {
      setRetryMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setRetryingAll(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
        {/* Page title placeholder */}
        <div className="border-b border-[#e3d6bf]/60 px-5 sm:px-8 py-4">
          <Skeleton className="h-7 w-36" />
        </div>
        <div className="px-5 sm:px-8 py-5 sm:py-7 max-w-3xl">
          {/* Sub-nav pills */}
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 sm:h-24 rounded-2xl" />
            ))}
          </div>
          {/* A few bid rows */}
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3"
              >
                <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl shrink-0" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <div className="text-right shrink-0">
                  <Skeleton className="h-4 w-16 mb-1.5 ml-auto" />
                  <Skeleton className="h-3 w-12 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }
  if (loadError || !data) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-4">
        <div className="bg-white border border-[#e3d6bf] rounded-2xl px-6 py-12 text-center max-w-md w-full">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-600">
            <IcoAlert className="w-[22px] h-[22px]" />
          </div>
          <p className="font-display text-lg font-bold text-[#241a12]">Couldn&apos;t pull up your bids</p>
          <p className="text-sm text-[#8a7559] mt-2">Check your connection and give it another go.</p>
          <button
            onClick={retryLoad}
            className="inline-block mt-6 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { winning, losing, past, unpaidWins } = data;
  // Outbid items the bidder dismissed are hidden from the active "outbid" lists.
  const visibleLosing = losing.filter((b) => !dismissedLosing.has(b.itemId));
  // Active bids ordered by soonest end first, so the most urgent are up top.
  const endMs = (b: { itemEndAt: string | null; auctionEndAt: string }) =>
    new Date(b.itemEndAt ?? b.auctionEndAt).getTime();
  const winningSorted = [...winning].sort((a, b) => endMs(a) - endMs(b));
  const losingSorted = [...visibleLosing].sort((a, b) => endMs(a) - endMs(b));
  const totalOwed = unpaidWins.reduce((s, i) => s + (i.totalDue ?? i.amountOwed), 0);
  const failedWins = unpaidWins.filter((w) => w.paymentFailed);
  const pendingWins = unpaidWins.filter((w) => !w.paymentFailed);
  const pastWins = past.filter((b) => b.outcome === "won");
  const activeCount = winning.length + visibleLosing.length;

  const myBidsTabs: Tab[] = ["overview", "active", "history"];
  const inMyBids = myBidsTabs.includes(tab);

  const firstName = user?.firstName || data.profile?.name?.split(" ")[0] || null;

  const navItems: { key: string; label: string; shortLabel: string; count?: number; icon: React.ReactNode; active: boolean; primary?: boolean; onClick: () => void }[] = [
    {
      key: "myBids",
      label: "Your bids",
      shortLabel: "Bids",
      icon: <IcoGrid />,
      active: inMyBids,
      primary: true, // primary destination — highlighted
      onClick: () => setTab(activeCount > 0 ? "active" : "overview"),
      count: activeCount,
    },
    {
      key: "auctions",
      label: "Live auctions",
      shortLabel: "Live",
      icon: <IcoGavel />,
      active: tab === "auctions",
      onClick: () => setTab("auctions"),
    },
    {
      key: "pickup",
      label: "Pickup",
      shortLabel: "Pickup",
      icon: <IcoPackage />,
      active: false, // lives on its own page
      onClick: () => router.push("/pickup"),
    },
  ];

  const pageTitle = inMyBids ? "Your bids" : tab === "auctions" ? "Live auctions" : "Account";
  const pageEyebrow = inMyBids
    ? (firstName ? `${firstName}'s corner` : "Bidder's corner")
    : tab === "auctions" ? "Open right now" : "Settings";

  return (
    <div className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex flex-col md:flex-row">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-white/90 border-r border-[#e3d6bf]/60 flex-col shrink-0">
        <div className="px-5 py-5 border-b border-[#e3d6bf]/60">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">
            <PineMark className="w-3.5 h-3.5 shrink-0" /> Northwood Bids
          </div>
          <p className="font-display text-xl font-black text-[#241a12] leading-tight mt-0.5">Your corner</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                item.active
                  ? "bg-[#6c4d39] text-white shadow-sm"
                  : item.primary
                  ? "text-[#6c4d39] hover:bg-[#faf5ea] font-semibold"
                  : "text-[#8a7559] hover:text-[#241a12] hover:bg-[#faf5ea]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={item.active ? "text-[#f0a35a]" : ""}>{item.icon}</span>
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold tabular-nums ${item.active ? "bg-white/20 text-white" : "bg-[#f0a35a]/25 text-[#8a4f1c]"}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-[#e3d6bf]/60">
          <Link href="/account" className="flex items-center gap-2 text-xs font-semibold text-[#8a7559] hover:text-[#241a12] transition-colors">
            <IcoUsers className="w-4 h-4" /> Account settings
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-5 py-3 border-b border-[#e3d6bf]/60 bg-white/90">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6c4d39] truncate">{pageEyebrow}</div>
            <div className="font-display text-xl font-black leading-tight">{pageTitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {unpaidWins.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#c47b3e] text-white text-[11px] font-bold px-2 py-1 rounded-full">
                <IcoCoin className="w-3.5 h-3.5" /> {unpaidWins.length} owed
              </span>
            )}
          </div>
        </header>

        {/* Failed charge — prominent, actionable */}
        {failedWins.length > 0 && (
          <div className="bg-red-50 border-b border-red-500/25 px-5 sm:px-8 py-4">
            <div className="flex items-start gap-2.5 mb-1">
              <IcoAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-base font-black text-red-700">
                  Card declined on {failedWins.length} item{failedWins.length !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-[#6f5b46] mt-0.5">
                  Retry below, or <Link href="/account" className="font-semibold text-[#6c4d39] underline underline-offset-2">update your card</Link> first.
                </p>
              </div>
            </div>

            {retryMsg && (
              <p className={`text-sm mb-2 ml-7 font-semibold ${retryMsg.ok ? "text-[#2f5d3a]" : "text-red-600"}`}>
                {retryMsg.text}
              </p>
            )}

            {/* One-tap pay everything owed — a single charge instead of item by item. */}
            {failedWins.length > 1 && (
              <button
                onClick={retryAll}
                disabled={retryingAll || retryingItemId !== null}
                className="ml-7 mb-1 inline-flex items-center gap-2 bg-[#4a7c59] hover:bg-[#3d6749] disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
              >
                {retryingAll
                  ? "Processing"
                  : `Pay all ${failedWins.length} · ${money(failedWins.reduce((s, w) => s + (w.totalDue ?? w.amountOwed), 0))}`}
              </button>
            )}

            <div className="mt-3 space-y-2">
              {failedWins.map((w) => {
                const due = w.totalDue ?? w.amountOwed;
                const retrying = retryingItemId === w.itemId;
                return (
                  <div
                    key={w.itemId}
                    className="flex flex-wrap items-center gap-3 bg-white border border-red-500/25 rounded-xl px-4 py-3"
                  >
                    <Photo url={w.photo} title={w.itemTitle} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#241a12] truncate">{w.itemTitle}</div>
                      <div className="text-xs text-[#8a7559] truncate">{w.auctionTitle} · {w.orgName}</div>
                      <div className="text-xs text-red-600 font-semibold mt-0.5">
                        Declined · {money(due)} due
                        {(w.feeAmount ?? 0) + (w.taxAmount ?? 0) > 0 ? " (incl. fee & tax)" : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => retryPayment(w.itemId)}
                      disabled={retrying || retryingAll}
                      className="shrink-0 bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
                    >
                      {retrying ? "Processing" : "Pay this one"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending wins banner */}
        {pendingWins.length > 0 && (
          <div className="bg-[#f7e4c9] border-b border-[#c47b3e]/30 px-5 sm:px-8 py-3 flex items-start gap-2.5">
            <IcoCoin className="w-4 h-4 text-[#a85f28] shrink-0 mt-0.5" />
            <div className="text-sm min-w-0">
              <span className="text-[#8a4f1c] font-bold">{pendingWins.length} win{pendingWins.length !== 1 ? "s" : ""} settling</span>
              <span className="text-[#6f5b46]"> · {money(pendingWins.reduce((s, i) => s + (i.totalDue ?? i.amountOwed), 0))}{pendingWins.some((i) => (i.feeAmount ?? 0) + (i.taxAmount ?? 0) > 0) ? " incl. fee & tax" : ""}</span>
              <p className="text-xs text-[#8a7559] mt-0.5">Nothing to do. Your card on file is charged a few minutes after the auction closes.</p>
            </div>
          </div>
        )}

        {/* Desktop page title */}
        <header className="hidden md:block border-b border-[#e3d6bf]/60 px-8 py-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6c4d39]">{pageEyebrow}</div>
          <h1 className="font-display text-2xl font-black leading-tight">{pageTitle}</h1>
        </header>

        <div className="flex-1 overflow-auto px-5 sm:px-8 py-5 sm:py-7">

          {/* ── My Bids segmented sub-nav ── */}
          {inMyBids && (() => {
            const subTabs: { id: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
              { id: "overview", label: "Overview", icon: <IcoGrid /> },
              { id: "active",   label: "In play",  count: activeCount,     icon: <IcoUp /> },
              { id: "history",  label: "Won",      count: pastWins.length, icon: <IcoHistory /> },
            ];
            return (
              <div className="mb-5 sm:mb-6 -mx-1 px-1 overflow-x-auto">
                <div role="tablist" className="inline-flex flex-nowrap gap-1 p-1 rounded-2xl bg-white border border-[#e3d6bf]">
                  {subTabs.map((st) => {
                    const isActive = tab === st.id;
                    return (
                      <button
                        key={st.id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setTab(st.id)}
                        className={`flex items-center gap-2 py-2 px-4 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                          isActive
                            ? "bg-[#6c4d39] text-white shadow-sm"
                            : "text-[#6f5b46] hover:bg-[#faf5ea] hover:text-[#241a12]"
                        }`}
                      >
                        <span className={`shrink-0 ${isActive ? "text-[#f0a35a]" : ""}`}>{st.icon}</span>
                        {st.label}
                        {st.count !== undefined && st.count > 0 && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                            isActive ? "bg-white/20 text-white" : "bg-[#f1e7d5] text-[#6c4d39]"
                          }`}>
                            {st.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-5 max-w-3xl">

              {/* Pickup status — distinguishes ready vs being-transferred vs scheduled */}
              <PickupStatusCard />

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={() => setTab("active")}
                  className={`text-left bg-white border rounded-2xl p-3 sm:p-4 transition-all nb-lift ${winning.length > 0 ? "border-[#4a7c59]/40" : "border-[#e3d6bf]"}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] text-[#2f5d3a]">
                    <IcoTrophy className="w-3.5 h-3.5" /> <span className="truncate">In the lead</span>
                  </div>
                  <div className={`font-display text-2xl sm:text-3xl font-black mt-1 tabular-nums ${winning.length > 0 ? "text-[#4a7c59]" : "text-[#8a7559]"}`}>{winning.length}</div>
                </button>
                <button
                  onClick={() => setTab("active")}
                  className={`text-left bg-white border rounded-2xl p-3 sm:p-4 transition-all nb-lift ${visibleLosing.length > 0 ? "border-red-500/30" : "border-[#e3d6bf]"}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] text-red-700">
                    <IcoTarget className="w-3.5 h-3.5" /> <span className="truncate">Outbid</span>
                  </div>
                  <div className={`font-display text-2xl sm:text-3xl font-black mt-1 tabular-nums ${visibleLosing.length > 0 ? "text-red-600" : "text-[#8a7559]"}`}>{visibleLosing.length}</div>
                </button>
                <button
                  onClick={() => setTab("history")}
                  className={`text-left bg-white border rounded-2xl p-3 sm:p-4 transition-all nb-lift ${totalOwed > 0 ? "border-[#c47b3e]/40" : "border-[#e3d6bf]"}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] text-[#a85f28]">
                    <IcoCoin className="w-3.5 h-3.5" /> <span className="truncate">Owed</span>
                  </div>
                  <div className={`font-display text-2xl sm:text-3xl font-black mt-1 tabular-nums ${totalOwed > 0 ? "text-[#c47b3e]" : "text-[#8a7559]"}`}>{money(totalOwed)}</div>
                </button>
              </div>

              {winning.length > 0 && (
                <div>
                  <ListHeader
                    tone="lead"
                    eyebrow="Hold the line"
                    title="In the lead"
                    count={winning.length}
                    action={
                      <button onClick={() => setTab("active")} className="text-[#6c4d39] text-xs font-bold hover:text-[#c47b3e] transition-colors inline-flex items-center gap-1">
                        Details <IcoArrow />
                      </button>
                    }
                  />
                  <div className="space-y-2">
                    {winning.map((b) => {
                      const ended = new Date(b.itemEndAt ?? b.auctionEndAt).getTime() <= Date.now();
                      return (
                      <Link key={b.itemId} href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                        className="flex items-center gap-3 bg-white border border-[#4a7c59]/25 rounded-2xl px-4 py-3 hover:border-[#4a7c59]/60 transition-all nb-lift">
                        <Photo url={b.photo} title={b.itemTitle} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                          <div className="text-[#8a7559] text-xs truncate">{b.auctionTitle}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[#2f5d3a] font-display font-black text-base tabular-nums">{money(b.myBid)}</div>
                          <div className="mt-0.5">
                            <Chip tone="moss">
                              {ended ? <><IcoTrophy className="w-3 h-3" /> Won</> : <><IcoCheck className="w-3 h-3" /> Leading</>}
                            </Chip>
                          </div>
                        </div>
                      </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {visibleLosing.length > 0 && (
                <div>
                  <ListHeader
                    tone="outbid"
                    eyebrow="Someone stepped in"
                    title="Being outbid"
                    count={visibleLosing.length}
                    action={
                      <button onClick={() => setTab("active")} className="text-[#6c4d39] text-xs font-bold hover:text-[#c47b3e] transition-colors inline-flex items-center gap-1">
                        Details <IcoArrow />
                      </button>
                    }
                  />
                  <div className="space-y-2">
                    {losingSorted.map((b) => (
                      <div key={b.itemId} className="flex items-center gap-2 bg-white border border-red-500/20 rounded-2xl pl-4 pr-2 py-3 hover:border-red-300 transition-all">
                        <Link href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`} className="flex items-center gap-3 flex-1 min-w-0">
                          <Photo url={b.photo} title={b.itemTitle} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                            <div className="text-[#8a7559] text-xs truncate">{b.auctionTitle}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[#6f5b46] text-xs">you {money(b.myBid)}</div>
                            <div className="text-red-600 font-display font-black text-base tabular-nums">{money(b.currentBid)}</div>
                          </div>
                        </Link>
                        <button
                          onClick={() => dismissLosing(b.itemId)}
                          aria-label="Not interested, remove from this list"
                          title="Not interested, remove from this list"
                          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#b3a085] hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {winning.length === 0 && visibleLosing.length === 0 && unpaidWins.length === 0 && past.length === 0 && (
                <EmptyState
                  art="critter"
                  framed
                  title="Your first $2 bid is waiting"
                  message="Brand-name overstock, lots starting at two bucks, pickup in Owosso or Gladwin. Once you bid, everything you're chasing shows up here."
                  cta={
                    <button
                      onClick={() => setTab("auctions")}
                      className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
                    >
                      <IcoGavelBrand className="w-4 h-4" /> See what&apos;s live
                    </button>
                  }
                />
              )}

              {/* Quiet moment: has history, but nothing in play right now */}
              {winning.length === 0 && visibleLosing.length === 0 && (unpaidWins.length > 0 || past.length > 0) && (
                <EmptyState
                  framed
                  title="Nothing in play right now"
                  message="Your wins are under the Won tab. Fresh lots open every week."
                  cta={
                    <button
                      onClick={() => setTab("auctions")}
                      className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
                    >
                      <IcoGavelBrand className="w-4 h-4" /> See what&apos;s live
                    </button>
                  }
                />
              )}
            </div>
          )}

          {/* ── Current Auctions ── */}
          {tab === "auctions" && (() => {
            const preferredOrgId = data.profile?.preferredOrg?.id;
            const preferredOrg = data.profile?.preferredOrg;
            const preferredAuctions = preferredOrgId ? liveAuctions.filter(a => a.org.id === preferredOrgId) : [];
            const otherAuctions = preferredOrgId ? liveAuctions.filter(a => a.org.id !== preferredOrgId) : liveAuctions;

            const AuctionCard = ({ a, highlighted }: { a: LiveAuction; highlighted?: boolean }) => (
              <Link key={a.id} href={`/${a.org.slug}/${a.slug}`}
                className={`flex items-center gap-4 bg-white rounded-2xl px-5 sm:px-6 py-4 transition-all group nb-lift ${
                  highlighted
                    ? "border border-[#6c4d39]/40 hover:border-[#6c4d39]"
                    : "border border-[#e3d6bf] hover:border-[#6c4d39]/50"
                }`}>
                <span className="w-11 h-11 rounded-xl bg-[#faf5ea] border border-[#e3d6bf] text-[#6c4d39] flex items-center justify-center shrink-0">
                  <IcoGavelBrand className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a85f28] truncate">{a.org.name}</div>
                  <div className="font-display font-black text-base truncate group-hover:text-[#6c4d39] transition-colors">{a.title}</div>
                  <div className="text-xs text-[#8a7559] mt-0.5">
                    {a.activeItems} lot{a.activeItems !== 1 ? "s" : ""} open
                  </div>
                </div>
                {(() => {
                  const msLeft = new Date(a.endAt).getTime() - Date.now();
                  const closing = msLeft > 0 && msLeft < 3_600_000; // closing within 1h
                  const closingNow = msLeft > 0 && msLeft < 300_000; // final 5 min
                  return (
                    <div className="text-right shrink-0">
                      <Chip tone={closingNow ? "red" : closing ? "amber" : "moss"}>
                        {closingNow ? <><IcoBolt className="w-3 h-3" /> Closing now</> : closing ? "Closing soon" : "Open"}
                      </Chip>
                      <div className="text-xs text-[#8a7559] mt-1.5">
                        Ends {new Date(a.endAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })()}
              </Link>
            );

            return (
              <div className="max-w-3xl">
                <ListHeader
                  tone="live"
                  eyebrow={loadingAuctions ? "Checking the board" : `${liveAuctions.length} auction${liveAuctions.length !== 1 ? "s" : ""} open`}
                  title="Live now"
                  action={
                    <Link href="/auctions" className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-bold transition-colors inline-flex items-center gap-1">
                      Full board <IcoArrow />
                    </Link>
                  }
                />

                {loadingAuctions ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-4 bg-white border border-[#e3d6bf] rounded-2xl px-5 py-4">
                        <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
                        <div className="flex-1">
                          <Skeleton className="h-3 w-1/4 mb-2" />
                          <Skeleton className="h-4 w-2/3 mb-2" />
                          <Skeleton className="h-3 w-1/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : liveAuctions.length === 0 ? (
                  <EmptyState
                    framed
                    title="The board's clear for now"
                    message="New lots post most weeks. Star what you like on the next drop and we'll keep it on your watchlist."
                    cta={
                      <Link href="/auctions" className="inline-block bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors">
                        See upcoming
                      </Link>
                    }
                  />
                ) : (
                  <div className="space-y-6">
                    {/* Preferred org auctions — always at the top */}
                    {preferredAuctions.length > 0 && preferredOrg && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Link href={`/${preferredOrg.slug}`} className="text-[11px] font-black text-[#6c4d39] uppercase tracking-[0.14em] hover:text-[#c47b3e] transition-colors">
                            {preferredOrg.name}
                          </Link>
                          <span className="text-[#cdbda3]">·</span>
                          <span className="text-xs text-[#8a7559]">Your home auction</span>
                        </div>
                        <div className="space-y-3">
                          {preferredAuctions.map(a => <AuctionCard key={a.id} a={a} highlighted />)}
                        </div>
                      </div>
                    )}

                    {/* All other live auctions */}
                    {otherAuctions.length > 0 && (
                      <div>
                        {preferredAuctions.length > 0 && (
                          <h3 className="text-[11px] font-black text-[#8a7559] uppercase tracking-[0.14em] mb-3">Also open</h3>
                        )}
                        <div className="space-y-3">
                          {otherAuctions.map(a => <AuctionCard key={a.id} a={a} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Active Bids (winning + outbid combined) ── */}
          {tab === "active" && (
            <div className="max-w-3xl space-y-8">
              {winning.length === 0 && visibleLosing.length === 0 ? (
                <EmptyState
                  art="critter"
                  framed
                  title="No bids in play"
                  message="Nothing's live under your name right now. Find a lot you like and the countdown shows up here."
                  cta={
                    <button
                      onClick={() => setTab("auctions")}
                      className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
                    >
                      <IcoGavelBrand className="w-4 h-4" /> See what&apos;s live
                    </button>
                  }
                />
              ) : (
                <>
                  {/* You're winning */}
                  {winning.length > 0 && (
                    <section>
                      <ListHeader tone="lead" eyebrow="Hold the line" title="In the lead" count={winning.length} />
                      <div className="space-y-3">
                        {winningSorted.map((b) => {
                          const ended = new Date(b.itemEndAt ?? b.auctionEndAt).getTime() <= Date.now();
                          return (
                          <div key={b.itemId}
                            className="flex flex-wrap items-center gap-4 bg-white border border-[#4a7c59]/35 rounded-2xl px-5 sm:px-6 py-4">
                            <Photo url={b.photo} title={b.itemTitle} />
                            <div className="flex-1 min-w-0">
                              <div className="font-bold truncate">{b.itemTitle}</div>
                              <div className="text-[#8a7559] text-xs sm:text-sm mt-0.5 truncate">{b.auctionTitle} · {b.orgName}</div>
                              <div className="text-[#8a7559] text-xs mt-1 flex items-center gap-2 flex-wrap">
                                {ended ? (
                                  "Bidding closed. Finalizing your win."
                                ) : (
                                  <>
                                    <ItemCardTimer itemId={b.itemId} endAt={new Date(b.itemEndAt ?? b.auctionEndAt).toISOString()} inline />
                                    <span>Ends {formatEnd(b.itemEndAt ?? b.auctionEndAt)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[#8a7559] text-[10px] font-bold uppercase tracking-wider">Your bid</div>
                              <div className="text-[#2f5d3a] font-display font-black text-xl tabular-nums">{money(b.myBid)}</div>
                              <div className="mt-1">
                                <Chip tone="moss">
                                  {ended ? <><IcoTrophy className="w-3 h-3" /> Won</> : <><IcoCheck className="w-3 h-3" /> Leading</>}
                                </Chip>
                              </div>
                            </div>
                            <Link
                              href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                              className="w-full sm:w-auto shrink-0 text-center bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-sm px-5 py-3 rounded-xl transition-colors"
                            >
                              {ended ? "View lot" : "Raise your max"}
                            </Link>
                          </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* You've been outbid — id is the deep-link target for the
                      coalesced outbid text ("outbid on 3 items" → /dashboard#outbid). */}
                  {visibleLosing.length > 0 && (
                    <section>
                      <ListHeader id="outbid" tone="outbid" eyebrow="Someone stepped in" title="Being outbid" count={visibleLosing.length} />
                      <div className="space-y-3">
                        {losingSorted.map((b) => {
                          const nextBid = b.currentBid > b.myBid ? b.currentBid : null;
                          return (
                            <div key={b.itemId}
                              className="flex flex-wrap items-center gap-4 bg-white border border-red-500/25 rounded-2xl px-5 sm:px-6 py-4">
                              <Photo url={b.photo} title={b.itemTitle} />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold truncate">{b.itemTitle}</div>
                                <div className="text-[#8a7559] text-xs sm:text-sm mt-0.5 truncate">{b.auctionTitle} · {b.orgName}</div>
                                <div className="text-[#8a7559] text-xs mt-1 flex items-center gap-2 flex-wrap">
                                  <ItemCardTimer itemId={b.itemId} endAt={new Date(b.itemEndAt ?? b.auctionEndAt).toISOString()} inline />
                                  <span>Ends {formatEnd(b.itemEndAt ?? b.auctionEndAt)}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[#8a7559] text-[10px] font-bold uppercase tracking-wider">Your bid</div>
                                <div className="text-[#6f5b46] font-bold tabular-nums">{money(b.myBid)}</div>
                                <div className="text-[#8a7559] text-[10px] font-bold uppercase tracking-wider mt-1">High bid</div>
                                <div className="text-red-600 font-display font-black text-xl tabular-nums">{money(b.currentBid)}</div>
                              </div>
                              <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                                <Link
                                  href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                                  className="text-center bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-5 py-3 rounded-xl transition-colors"
                                >
                                  Take it back{nextBid !== null ? ` (beat ${money(nextBid)})` : ""}
                                </Link>
                                <button
                                  onClick={() => dismissLosing(b.itemId)}
                                  className="text-center text-[#8a7559] hover:text-red-600 text-xs font-semibold transition-colors"
                                >
                                  Let it go
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Bid History (past wins only, grouped by auction) ── */}
          {tab === "history" && (() => {
            type Group = { key: string; auctionTitle: string; orgName: string; auctionId: string | null; endAt: string; items: PastBid[] };
            const groups = new Map<string, Group>();
            for (const b of pastWins) {
              const key = b.auctionId ?? `slug:${b.auctionSlug}`;
              const g = groups.get(key);
              if (g) g.items.push(b);
              else groups.set(key, { key, auctionTitle: b.auctionTitle, orgName: b.orgName, auctionId: b.auctionId, endAt: b.auctionEndAt, items: [b] });
            }
            const grouped = [...groups.values()].sort(
              (a, c) => new Date(c.endAt).getTime() - new Date(a.endAt).getTime()
            );

            if (grouped.length === 0) {
              return (
                <div className="max-w-3xl">
                  <EmptyState
                    framed
                    title="No wins on the shelf yet"
                    message="When the gavel falls your way, the lot, the receipt and the pickup details all land here."
                    cta={
                      <button
                        onClick={() => setTab("auctions")}
                        className="inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
                      >
                        <IcoGavelBrand className="w-4 h-4" /> See what&apos;s live
                      </button>
                    }
                  />
                </div>
              );
            }

            return (
              <div className="max-w-3xl space-y-6">
                <ListHeader
                  tone="won"
                  eyebrow="Yours now"
                  title={totalOwed > 0 ? "Won, paid and owed" : "Won and paid"}
                  count={pastWins.length}
                  action={
                    <Link href="/pickup" className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-bold transition-colors inline-flex items-center gap-1">
                      Pickup <IcoArrow />
                    </Link>
                  }
                />
                {grouped.map((g) => (
                  <section key={g.key} className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#e3d6bf]/60 bg-[#fbf4e6]/70">
                      <div className="min-w-0">
                        <div className="font-display font-black truncate text-[#241a12]">{g.auctionTitle}</div>
                        <div className="text-xs text-[#8a7559] mt-0.5 truncate">
                          {g.orgName} · {g.items.length} lot{g.items.length !== 1 ? "s" : ""} won · closed {new Date(g.endAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      {g.auctionId && (
                        <Link
                          href={`/invoice/${g.auctionId}`}
                          className="shrink-0 inline-flex items-center gap-2 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors"
                        >
                          Receipt <IcoArrow />
                        </Link>
                      )}
                    </div>
                    <div className="divide-y divide-[#e3d6bf]/50">
                      {g.items.map((b) => (
                        <div key={b.itemId} className="flex items-center gap-4 px-5 sm:px-6 py-3.5">
                          <Photo url={b.photo} title={b.itemTitle} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {b.giveaway ? (
                                <Chip tone="moss"><IcoGift className="w-3 h-3" /> Free win</Chip>
                              ) : b.paid ? (
                                <Chip tone="moss"><IcoCheck className="w-3 h-3" /> Paid</Chip>
                              ) : (
                                <Chip tone="amber"><IcoCoin className="w-3 h-3" /> Owed</Chip>
                              )}
                              {b.pickedUp ? (
                                <Chip tone="tan"><IcoCheck className="w-3 h-3" /> Picked up</Chip>
                              ) : (
                                <Chip tone="leather"><IcoTruck className="w-3 h-3" /> Ready for pickup</Chip>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[#6c4d39] font-display font-black tabular-nums">{b.giveaway ? "Free" : money(b.finalBid)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()}


          {/* ── Account ── */}
          {tab === "profile" && (
            <div className="max-w-lg space-y-5">
              {/* Link to dedicated account page */}
              <Link
                href="/account"
                className="flex items-center justify-between bg-white border border-[#e3d6bf] rounded-2xl px-4 py-3.5 hover:border-[#6c4d39]/50 transition-colors group nb-lift"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#6c4d39] text-white flex items-center justify-center shrink-0"><IcoSpark className="w-4 h-4" /></span>
                  <div>
                    <div className="text-sm font-bold text-[#241a12]">Full account settings</div>
                    <div className="text-xs text-[#8a7559] mt-0.5">Critter, card on file, pickup warehouse</div>
                  </div>
                </div>
                <span className="text-[#6c4d39] group-hover:translate-x-0.5 transition-transform"><IcoArrow /></span>
              </Link>

              <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4 border-b border-[#e3d6bf] bg-[#fbf4e6]/70">
                  <UserMenu />
                  <div className="min-w-0">
                    <div className="font-display font-black truncate">{user?.fullName || "Your account"}</div>
                    <div className="text-[#8a7559] text-xs truncate">{user?.primaryEmailAddress?.emailAddress}</div>
                  </div>
                </div>
                <div className="px-5 py-5 space-y-4">
                  {[
                    { label: "Name", type: "text", value: editName, set: setEditName, placeholder: "Your name" },
                    { label: "Email", type: "email", value: editEmail, set: setEditEmail, placeholder: "you@example.com", hint: "Receipts and outbid alerts land here." },
                    { label: "Mobile", type: "tel", value: editPhone, set: setEditPhone, placeholder: "(989) 555-0123", hint: "Text alerts when you're outbid, win, or your pickup is ready." },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="text-sm text-[#6f5b46] mb-1.5 block font-semibold">{f.label}</label>
                      <input
                        type={f.type}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3 text-sm text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] transition-colors"
                      />
                      {f.hint && <p className="text-[#8a7559] text-xs mt-1.5">{f.hint}</p>}
                    </div>
                  ))}
                  {profileMsg && (
                    <p className={`text-sm px-4 py-3 rounded-xl font-semibold ${
                      profileMsg.ok
                        ? "bg-[#4a7c59]/10 text-[#2f5d3a] border border-[#4a7c59]/25"
                        : "bg-red-50 text-red-700 border border-red-500/20"
                    }`}>
                      {profileMsg.text}
                    </p>
                  )}
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl w-full transition-colors text-sm">
                    {savingProfile ? "Saving" : "Save changes"}
                  </button>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e3d6bf] bg-[#fbf4e6]/70">
                  <span className="w-9 h-9 rounded-xl bg-[#6c4d39] text-white flex items-center justify-center shrink-0"><IcoCard className="w-4 h-4" /></span>
                  <div>
                    <h3 className="font-display font-bold text-[#241a12] leading-tight">Card on file</h3>
                    <p className="text-xs text-[#8a7559] mt-0.5">Charged only when you win.</p>
                  </div>
                </div>
                <div className="px-5 py-5">
                  {loadingPMs ? (
                    <div className="text-[#8a7559] text-sm py-2">Checking your card</div>
                  ) : paymentMethods.length === 0 ? (
                    <div className="flex items-start gap-3 bg-[#faf5ea] border border-dashed border-[#cdbda3] rounded-xl px-4 py-4 text-sm text-[#6f5b46]">
                      <IcoLock className="w-5 h-5 text-[#6c4d39] shrink-0 mt-0.5" />
                      <span>No card yet. We ask for one the first time you bid; it stays with Stripe, never with us.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentMethods.map((pm) => (
                        <div key={pm.orgId} className="bg-[#faf5ea] border border-[#e3d6bf] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#241a12] truncate">
                              {pm.hasCard
                                ? pm.brand
                                  ? <span className="capitalize">{pm.brand} ending in {pm.last4}</span>
                                  : "Card on file"
                                : "No card saved"}
                            </div>
                            <div className="text-xs text-[#8a7559] mt-0.5 truncate">{pm.orgName}</div>
                          </div>
                          {pm.stripeChargesEnabled && (
                            <button
                              onClick={() => setCardModal({ orgId: pm.orgId, stripeAccountId: pm.stripeAccountId ?? "" })}
                              className="text-xs text-[#6c4d39] hover:text-white hover:bg-[#6c4d39] font-bold shrink-0 transition-colors border border-[#6c4d39]/40 px-3 py-1.5 rounded-lg"
                            >
                              {pm.hasCard ? "Update" : "Add card"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Link href="/auctions" className="flex items-center justify-center gap-2 text-[#6c4d39] hover:text-[#563e2c] text-sm font-bold py-2 transition-colors">
                <IcoGavelBrand className="w-4 h-4" /> See what&apos;s live <IcoArrow />
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* Card update modal */}
      {cardModal && (
        <CardSetupModal
          orgId={cardModal.orgId}
          stripeAccountId={cardModal.stripeAccountId}
          onSuccess={() => {
            setCardModal(null);
            setRetryMsg({ text: "Card updated. You can retry the payment now.", ok: true });
            loadPaymentMethods();
          }}
          onClose={() => setCardModal(null)}
        />
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#e3d6bf]/60 flex z-50 bar-safe-bottom safe-x">
        {navItems.map((item) => {
          const color = item.active
            ? "text-[#6c4d39]"
            : item.primary ? "text-[#8a5a2f]" : "text-[#8a7559] hover:text-[#6f5b46]";
          return (
          <button
            key={item.key}
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-colors ${color}`}
          >
            {item.active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#f0a35a]" aria-hidden />}
            {item.icon}
            <span className="text-[9px] font-bold leading-none tracking-wide uppercase">{item.shortLabel}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className="absolute top-1.5 right-[14%] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-[#c47b3e]">
                {item.count}
              </span>
            )}
          </button>
          );
        })}
      </nav>

    </div>
  );
}

export default function BidderDashboard() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#f1e7d5] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
      </main>
    }>
      <BidderDashboardInner />
    </Suspense>
  );
}
