"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Pusher from "pusher-js";
import UserMenu from "@/app/components/UserMenu";
import CardSetupModal from "@/app/components/CardSetupModal";

type Tab = "overview" | "winning" | "losing" | "auctions" | "profile";

interface BidBase {
  itemId: string;
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
interface PastBid extends BidBase { myBid: number; finalBid: number; outcome: "won" | "lost" | "unsold"; paid: boolean; pickedUp?: boolean; storageLocation?: string | null; }
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
function IcoDown() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5v10M15 10l-5 5-5-5" />
    </svg>
  );
}
function IcoUser() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="4" />
      <path d="M2.5 18c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5" />
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

function Photo({ url, title }: { url: string | null; title: string }) {
  return url ? (
    <img src={url} alt={title} className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover shrink-0" />
  ) : (
    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#f2efe8] rounded-xl flex items-center justify-center text-[#8c8778] text-xs shrink-0">—</div>
  );
}

function formatEnd(endAt: string) {
  return new Date(endAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function BidderDashboardInner() {
  const { user, isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [cardModal, setCardModal] = useState<{ orgId: string; stripeAccountId: string } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [liveAuctions, setLiveAuctions] = useState<LiveAuction[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(false);

  const load = useCallback(() => {
    fetch("/api/my-bids")
      .then((r) => r.json())
      .then((d: DashboardData) => {
        setData(d);
        setEditName(d.profile?.name || "");
        setEditEmail(d.profile?.email || user?.primaryEmailAddress?.emailAddress || "");
        setEditPhone(d.profile?.phone || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

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
      setProfileMsg(d.success ? { text: "Profile saved.", ok: true } : { text: d.error || "Failed to save.", ok: false });
      if (d.success) load();
    } catch { setProfileMsg({ text: "Something went wrong.", ok: false }); }
    finally { setSavingProfile(false); }
  };

  const retryPayment = async (itemId: string, stripeAccountId?: string | null) => {
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
        setRetryMsg({ text: "Payment successful! Your item is ready for pickup.", ok: true });
        load();
      } else if (d.requiresAction && d.clientSecret && stripeAccountId) {
        // Card requires 3DS authentication — confirm on-session in the browser
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
          stripeAccount: stripeAccountId,
        });
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
            setRetryMsg({ text: "Payment successful! Your item is ready for pickup.", ok: true });
            load();
          } else {
            setRetryMsg({ text: cd.error || "Payment went through but we couldn't confirm it. Refresh in a minute.", ok: false });
          }
        } else {
          setRetryMsg({ text: "Payment did not complete. Please try a different card.", ok: false });
        }
      } else {
        setRetryMsg({ text: d.error || "Payment failed. Please update your card in Settings.", ok: false });
      }
    } catch {
      setRetryMsg({ text: "Something went wrong. Please try again.", ok: false });
    } finally {
      setRetryingItemId(null);
    }
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-[#faf8f4] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#09a7ad]/30 border-t-[#09a7ad] animate-spin" />
          <p className="text-[#8c8778] text-sm">Loading your dashboard…</p>
        </div>
      </main>
    );
  }
  if (!data) return null;

  const { winning, losing, past, unpaidWins } = data;
  const totalOwed = unpaidWins.reduce((s, i) => s + (i.totalDue ?? i.amountOwed), 0);
  const failedWins = unpaidWins.filter((w) => w.paymentFailed);
  const pendingWins = unpaidWins.filter((w) => !w.paymentFailed);

  const navItems: { id: Tab; label: string; shortLabel: string; count?: number; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",      shortLabel: "Home",     icon: <IcoGrid /> },
    { id: "auctions",  label: "Live Auctions", shortLabel: "Auctions", icon: <IcoGavel /> },
    { id: "winning",   label: "Active Bids",   shortLabel: "Active",   count: winning.length, icon: <IcoUp /> },
    { id: "losing",    label: "Outbid",        shortLabel: "Outbid",   count: losing.length,  icon: <IcoDown /> },
  ];

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex flex-col md:flex-row">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-white/90 border-r border-[#e5e0d5]/60 flex-col shrink-0">
        <div className="px-5 py-5 border-b border-[#e5e0d5]/60">
          <Link href="/" className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-[#09a7ad] to-[#0bbcc2] bg-clip-text text-transparent">
            Northwood Bids
          </Link>
          <p className="text-[#8c8778] text-xs mt-0.5">My Bids</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                tab === item.id
                  ? "bg-[#f2efe8] text-[#1a1916]"
                  : "text-[#8c8778] hover:text-[#1a1916] hover:bg-[#f2efe8]/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={tab === item.id ? "text-[#09a7ad]" : ""}>{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  item.id === "losing"
                    ? "bg-red-500/15 text-red-600"
                    : "bg-[#09a7ad]/15 text-[#09a7ad]"
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-[#e5e0d5]/60 pt-3 space-y-0.5">
          <Link
            href="/account"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#8c8778] hover:text-[#1a1916] hover:bg-[#f2efe8]/50 text-sm transition-colors"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="3" width="14" height="14" rx="7"/><circle cx="10" cy="8" r="3"/><path d="M4.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/></svg>
            <span>Account</span>
          </Link>
          <Link
            href="/auctions"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#8c8778] hover:text-[#1a1916] hover:bg-[#f2efe8]/50 text-sm transition-colors"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>
            <span>Browse Auctions</span>
          </Link>
          <Link
            href="/search"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#8c8778] hover:text-[#1a1916] hover:bg-[#f2efe8]/50 text-sm transition-colors"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="9" cy="9" r="6"/><path d="m17 17-3.5-3.5"/></svg>
            <span>Search Items</span>
          </Link>
        </div>
        <div className="px-3 py-4 border-t border-[#e5e0d5]/60 flex items-center gap-3">
          <UserMenu />
          <div className="min-w-0">
            <div className="text-sm text-[#1a1916] font-semibold truncate">{user?.firstName || "Account"}</div>
            <div className="text-xs text-[#8c8778] truncate">{user?.primaryEmailAddress?.emailAddress}</div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#e5e0d5]/60 bg-white/90">
          <Link href="/" className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#09a7ad] to-[#0bbcc2] bg-clip-text text-transparent">
            Northwood Bids
          </Link>
          <div className="flex items-center gap-2">
            {unpaidWins.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unpaidWins.length}
              </span>
            )}
            <UserMenu />
          </div>
        </header>

        {/* Failed charge banner */}
        {failedWins.length > 0 && (
          <div className="bg-red-500/8 border-b border-red-500/20 px-4 sm:px-8 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <div className="text-sm">
                <span className="text-red-300 font-bold">Payment failed</span>
                <span className="text-[#6b6659]"> — we couldn&apos;t charge your card for {failedWins.length} item{failedWins.length !== 1 ? "s" : ""}.</span>
              </div>
            </div>
            {retryMsg && (
              <p className={`text-sm mt-1 ${retryMsg.ok ? "text-[#09a7ad]" : "text-red-600"}`}>
                {retryMsg.text}
              </p>
            )}
          </div>
        )}

        {/* Pending wins banner */}
        {pendingWins.length > 0 && (
          <div className="bg-orange-500/8 border-b border-orange-500/20 px-4 sm:px-8 py-3">
            <div className="text-sm">
              <span className="text-orange-300 font-bold">{pendingWins.length} win{pendingWins.length !== 1 ? "s" : ""} pending payment</span>
              <span className="text-[#6b6659]"> · ${pendingWins.reduce((s, i) => s + (i.totalDue ?? i.amountOwed), 0).toLocaleString()} total{pendingWins.some((i) => (i.feeAmount ?? 0) + (i.taxAmount ?? 0) > 0) ? " (incl. fee & tax)" : ""}</span>
            </div>
            <p className="text-xs text-[#8c8778] mt-1">Your auction organizer will process payment.</p>
          </div>
        )}

        {/* Desktop page title */}
        <header className="hidden md:block border-b border-[#e5e0d5]/60 px-8 py-4">
          <h1 className="text-lg font-bold">
            {tab === "overview"  && "Overview"}
            {tab === "auctions"  && "Current Auctions"}
            {tab === "winning"   && "Active Bids"}
            {tab === "losing"    && "Outbid"}
            {tab === "profile"   && "Account"}
          </h1>
        </header>

        <div className="flex-1 overflow-auto px-4 sm:px-8 py-5 sm:py-7">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-5 max-w-3xl">

              {/* Ready for pickup */}
              {(() => {
                const awaitingPickup = past.filter(b => b.outcome === "won" && b.paid && !b.pickedUp);
                if (awaitingPickup.length === 0) return null;
                return (
                  <div className="bg-[#09a7ad]/8 border border-[#09a7ad]/25 rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <IcoPackage />
                      <span className="font-bold text-[#0bbcc2] text-sm">
                        {awaitingPickup.length} item{awaitingPickup.length !== 1 ? "s" : ""} ready for pickup
                      </span>
                    </div>
                    <p className="text-[#6b6659] text-xs mb-4">Payment confirmed. Contact the organization to arrange collection.</p>
                    <div className="space-y-3">
                      {awaitingPickup.map((b) => (
                        <div key={b.itemId} className="flex items-center gap-3">
                          <Photo url={b.photo} title={b.itemTitle} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate">{b.itemTitle}</div>
                            <div className="text-xs text-[#8c8778] truncate">{b.auctionTitle} · {b.orgName}</div>
                            {b.storageLocation && (
                              <div className="text-xs text-[#8c8778] mt-0.5">Pickup: {b.storageLocation}</div>
                            )}
                          </div>
                          <div className="shrink-0 text-[#09a7ad] font-bold text-sm ml-auto">
                            ${b.finalBid.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className={`bg-white border rounded-2xl p-3 sm:p-5 transition-all ${winning.length > 0 ? "border-[#09a7ad]/25 shadow-[0_0_20px_rgba(9,167,173,0.06)]" : "border-[#e5e0d5]"}`}>
                  <div className="text-[#8c8778] text-xs sm:text-sm mb-1">Winning</div>
                  <div className={`text-xl sm:text-2xl font-extrabold ${winning.length > 0 ? "text-[#09a7ad]" : "text-[#6b6659]"}`}>{winning.length}</div>
                </div>
                <div className={`bg-white border rounded-2xl p-3 sm:p-5 transition-all ${losing.length > 0 ? "border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]" : "border-[#e5e0d5]"}`}>
                  <div className="text-[#8c8778] text-xs sm:text-sm mb-1">Outbid</div>
                  <div className={`text-xl sm:text-2xl font-extrabold ${losing.length > 0 ? "text-red-600" : "text-[#6b6659]"}`}>{losing.length}</div>
                </div>
                <div className={`bg-white border rounded-2xl p-3 sm:p-5 transition-all ${totalOwed > 0 ? "border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.05)]" : "border-[#e5e0d5]"}`}>
                  <div className="text-[#8c8778] text-xs sm:text-sm mb-1">Owed</div>
                  <div className={`text-xl sm:text-2xl font-extrabold ${totalOwed > 0 ? "text-orange-400" : "text-[#6b6659]"}`}>${totalOwed.toLocaleString()}</div>
                </div>
              </div>

              {winning.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-[#4a4640] text-xs uppercase tracking-wider">Currently Winning</h2>
                    <button onClick={() => setTab("winning")} className="text-[#09a7ad] text-sm hover:text-[#0bbcc2] transition-colors flex items-center gap-1">
                      View all <IcoArrow />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {winning.slice(0, 3).map((b) => (
                      <Link key={b.itemId} href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                        className="flex items-center gap-3 bg-white border border-[#09a7ad]/15 rounded-2xl px-4 py-3 hover:border-[#09a7ad]/35 transition-all hover:shadow-[0_0_20px_rgba(9,167,173,0.05)]">
                        <Photo url={b.photo} title={b.itemTitle} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                          <div className="text-[#8c8778] text-xs truncate">{b.auctionTitle}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[#09a7ad] font-bold text-sm">${b.myBid.toLocaleString()}</div>
                          <div className="text-xs text-[#0a8a8f] font-semibold mt-0.5">✓ Winning</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {losing.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-[#4a4640] text-xs uppercase tracking-wider">You&apos;ve Been Outbid</h2>
                    <button onClick={() => setTab("losing")} className="text-red-600 text-sm hover:text-red-300 transition-colors flex items-center gap-1">
                      View all <IcoArrow />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {losing.slice(0, 3).map((b) => (
                      <Link key={b.itemId} href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                        className="flex items-center gap-3 bg-white border border-red-500/15 rounded-2xl px-4 py-3 hover:border-red-200 transition-all">
                        <Photo url={b.photo} title={b.itemTitle} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                          <div className="text-[#8c8778] text-xs truncate">{b.auctionTitle}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[#6b6659] font-semibold text-sm">${b.myBid.toLocaleString()}</div>
                          <div className="text-red-600 text-xs mt-0.5">High: ${b.currentBid.toLocaleString()}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Bids */}
              {past.length > 0 && (
                <div>
                  <h2 className="font-bold text-[#4a4640] text-xs uppercase tracking-wider mb-3">Recent Bids</h2>
                  <div className="space-y-2">
                    {past.slice(0, 5).map((b, i) => (
                      <div key={i}
                        className={`flex items-center gap-3 bg-white border rounded-2xl px-4 py-3 ${b.outcome === "won" ? "border-[#09a7ad]/15" : "border-[#e5e0d5]/60"}`}>
                        <Photo url={b.photo} title={b.itemTitle} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{b.itemTitle}</div>
                          <div className="text-[#8c8778] text-xs truncate">{b.auctionTitle}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-bold text-sm ${b.outcome === "won" ? "text-[#09a7ad]" : "text-[#8c8778]"}`}>
                            ${b.myBid.toLocaleString()}
                          </div>
                          <div className={`text-xs mt-0.5 ${
                            b.outcome === "won"
                              ? b.pickedUp ? "text-[#8c8778]" : "text-emerald-600 font-medium"
                              : "text-[#8c8778]"
                          }`}>
                            {b.outcome === "won"
                              ? b.pickedUp ? "Picked up" : "Won"
                              : b.outcome === "unsold" ? "Unsold" : "Lost"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {winning.length === 0 && losing.length === 0 && unpaidWins.length === 0 && past.length === 0 && (
                <div className="bg-white border border-[#e5e0d5] rounded-2xl p-12 text-center">
                  <div className="text-[#b0a99a] mb-4 flex justify-center">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 40 40" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="20" cy="20" r="16" />
                      <path d="M13 27c0-3.87 3.13-7 7-7s7 3.13 7 7" />
                      <circle cx="20" cy="15" r="4" />
                    </svg>
                  </div>
                  <p className="text-[#8c8778] mb-5 text-sm">You haven&apos;t placed any bids yet.</p>
                  <button
                    onClick={() => setTab("auctions")}
                    className="bg-[#09a7ad] hover:bg-[#0898a0] text-white font-bold px-6 py-3 rounded-2xl text-sm transition-all hover:shadow-[0_0_25px_rgba(9,167,173,0.25)]"
                  >
                    Browse Live Auctions
                  </button>
                </div>
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
                className={`flex items-center gap-4 bg-white rounded-2xl px-4 sm:px-6 py-4 transition-all group ${
                  highlighted
                    ? "border border-[#09a7ad]/30 hover:border-[#09a7ad]/60 hover:shadow-[0_0_25px_rgba(9,167,173,0.12)]"
                    : "border border-[#e5e0d5] hover:border-[#09a7ad]/35 hover:shadow-[0_0_20px_rgba(9,167,173,0.05)]"
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#09a7ad] font-semibold mb-1 truncate">{a.org.name}</div>
                  <div className="font-bold truncate group-hover:text-[#09a7ad] transition-colors">{a.title}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#8c8778]">
                    <span>{a.activeItems} item{a.activeItems !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs bg-[#09a7ad]/15 text-[#09a7ad] border border-[#09a7ad]/20 px-2 py-0.5 rounded-full font-semibold">Live</span>
                  <div className="text-xs text-[#8c8778] mt-2">
                    Ends {new Date(a.endAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </div>
                </div>
              </Link>
            );

            return (
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm text-[#8c8778]">
                    <span className="w-2 h-2 rounded-full bg-[#09a7ad] animate-pulse inline-block" />
                    {loadingAuctions ? "Loading…" : `${liveAuctions.length} live auction${liveAuctions.length !== 1 ? "s" : ""}`}
                  </div>
                  <Link href="/auctions" className="text-xs text-[#09a7ad] hover:text-[#0bbcc2] font-medium transition-colors flex items-center gap-1">
                    Full page <IcoArrow />
                  </Link>
                </div>

                {loadingAuctions ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 animate-pulse">
                        <div className="h-4 bg-[#f2efe8] rounded w-1/3 mb-3" />
                        <div className="h-5 bg-[#f2efe8] rounded w-2/3 mb-3" />
                        <div className="h-3 bg-[#f2efe8] rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                ) : liveAuctions.length === 0 ? (
                  <div className="bg-white border border-[#e5e0d5] rounded-2xl p-12 text-center">
                    <p className="text-[#8c8778] mb-2 text-sm font-semibold">No live auctions right now</p>
                    <p className="text-[#8c8778] text-xs">Check back soon — new auctions are added regularly.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Preferred org auctions — always at the top */}
                    {preferredAuctions.length > 0 && preferredOrg && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Link href={`/${preferredOrg.slug}`} className="text-xs font-bold text-[#09a7ad] uppercase tracking-wider hover:text-[#0bbcc2] transition-colors">
                            {preferredOrg.name}
                          </Link>
                          <span className="text-[#e5e0d5]">·</span>
                          <span className="text-xs text-[#8c8778]">Your organization</span>
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
                          <h3 className="text-xs font-bold text-[#8c8778] uppercase tracking-wider mb-3">Other Auctions</h3>
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

          {/* ── Active Bids ── */}
          {tab === "winning" && (
            <div className="max-w-3xl">
              {winning.length === 0 ? (
                <div className="bg-white border border-[#e5e0d5] rounded-2xl p-12 text-center">
                  <p className="text-[#8c8778] mb-4 text-sm">Not currently winning any items.</p>
                  <button onClick={() => setTab("auctions")} className="text-[#09a7ad] hover:text-[#0bbcc2] text-sm transition-colors">Browse live auctions</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {winning.map((b) => (
                    <Link key={b.itemId} href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                      className="flex items-center gap-4 bg-white border border-[#09a7ad]/15 rounded-2xl px-4 sm:px-6 py-4 hover:border-[#09a7ad]/35 transition-all hover:shadow-[0_0_20px_rgba(9,167,173,0.05)]">
                      <Photo url={b.photo} title={b.itemTitle} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{b.itemTitle}</div>
                        <div className="text-[#8c8778] text-xs sm:text-sm mt-0.5 truncate">{b.auctionTitle} · {b.orgName}</div>
                        <div className="text-[#8c8778] text-xs mt-1">Ends {formatEnd(b.itemEndAt ?? b.auctionEndAt)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[#09a7ad] font-extrabold text-lg">${b.myBid.toLocaleString()}</div>
                        <div className="text-xs bg-[#09a7ad]/15 text-[#0a8a8f] font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block">✓ Winning</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Outbid ── */}
          {tab === "losing" && (
            <div className="max-w-3xl">
              {losing.length === 0 ? (
                <div className="bg-white border border-[#e5e0d5] rounded-2xl p-12 text-center">
                  <p className="text-[#8c8778] text-sm">You&apos;re not being outbid on anything right now.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {losing.map((b) => (
                    <Link key={b.itemId} href={`/${b.orgSlug}/${b.auctionSlug}/item/${b.itemId}`}
                      className="flex items-center gap-4 bg-white border border-red-500/15 rounded-2xl px-4 sm:px-6 py-4 hover:border-red-200 transition-all">
                      <Photo url={b.photo} title={b.itemTitle} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{b.itemTitle}</div>
                        <div className="text-[#8c8778] text-xs sm:text-sm mt-0.5 truncate">{b.auctionTitle} · {b.orgName}</div>
                        <div className="text-[#8c8778] text-xs mt-1">Ends {formatEnd(b.itemEndAt ?? b.auctionEndAt)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[#8c8778] text-xs">your bid</div>
                        <div className="text-[#6b6659] font-bold">${b.myBid.toLocaleString()}</div>
                        <div className="text-[#8c8778] text-xs mt-1">high bid</div>
                        <div className="text-red-600 font-extrabold">${b.currentBid.toLocaleString()}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* ── Account ── */}
          {tab === "profile" && (
            <div className="max-w-lg">
              {/* Link to dedicated account page */}
              <Link
                href="/account"
                className="flex items-center justify-between bg-[#09a7ad]/8 border border-[#09a7ad]/20 rounded-2xl px-4 py-3 mb-5 hover:bg-[#09a7ad]/12 transition-colors group"
              >
                <div>
                  <div className="text-sm font-semibold text-[#09a7ad]">Account Settings</div>
                  <div className="text-xs text-[#6b6659] mt-0.5">Profile, payment cards & more</div>
                </div>
                <svg className="w-4 h-4 text-[#09a7ad] group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
              </Link>
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#e5e0d5]/60">
                <UserMenu />
                <div>
                  <div className="font-bold">{user?.fullName || "Your Account"}</div>
                  <div className="text-[#8c8778] text-sm">{user?.primaryEmailAddress?.emailAddress}</div>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Full Name", type: "text", value: editName, set: setEditName, placeholder: "Your name" },
                  { label: "Email Address", type: "email", value: editEmail, set: setEditEmail, placeholder: "you@example.com", hint: "Used for outbid alerts and receipts." },
                  { label: "Phone Number", type: "tel", value: editPhone, set: setEditPhone, placeholder: "+1 (555) 000-0000", hint: "Used for SMS notifications." },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="text-sm text-[#6b6659] mb-1.5 block font-medium">{f.label}</label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-white border border-[#d4cfc4]/80 rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]/60 transition-colors"
                    />
                    {f.hint && <p className="text-[#8c8778] text-xs mt-1.5">{f.hint}</p>}
                  </div>
                ))}
                {profileMsg && (
                  <p className={`text-sm px-4 py-3 rounded-xl font-medium ${
                    profileMsg.ok
                      ? "bg-[#09a7ad]/10 text-[#09a7ad] border border-[#09a7ad]/20"
                      : "bg-red-50 text-red-600 border border-red-500/20"
                  }`}>
                    {profileMsg.text}
                  </p>
                )}
                <button onClick={saveProfile} disabled={savingProfile}
                  className="bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-2xl w-full transition-all hover:shadow-[0_0_25px_rgba(9,167,173,0.2)]">
                  {savingProfile ? "Saving…" : "Save Profile"}
                </button>

                {/* Payment Methods */}
                <div className="pt-4 border-t border-[#e5e0d5]/60">
                  <h3 className="text-sm font-semibold text-[#4a4640] mb-3">Payment Methods</h3>
                  {loadingPMs ? (
                    <div className="text-[#8c8778] text-sm py-2">Loading…</div>
                  ) : paymentMethods.length === 0 ? (
                    <div className="bg-white border border-[#e5e0d5] rounded-xl px-4 py-4 text-sm text-[#8c8778]">
                      No payment methods saved yet. A card will be requested when you place your first bid.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentMethods.map((pm) => (
                        <div key={pm.orgId} className="bg-white border border-[#e5e0d5] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[#1a1916] truncate">{pm.orgName}</div>
                            {pm.hasCard ? (
                              <div className="text-xs text-[#6b6659] mt-0.5 flex items-center gap-1">
                                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                                  <rect x="1" y="3" width="14" height="10" rx="1.5" />
                                  <path d="M1 7h14" />
                                </svg>
                                {pm.brand ? (
                                  <span>{pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} ···· {pm.last4}</span>
                                ) : (
                                  <span>Card on file</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-yellow-500 mt-0.5">No card saved</div>
                            )}
                          </div>
                          {pm.stripeAccountId && pm.stripeChargesEnabled && (
                            <button
                              onClick={() => setCardModal({ orgId: pm.orgId, stripeAccountId: pm.stripeAccountId! })}
                              className="text-xs text-[#09a7ad] hover:text-[#0bbcc2] font-medium shrink-0 transition-colors"
                            >
                              {pm.hasCard ? "Update" : "Add card"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#e5e0d5]/60">
                  <Link href="/auctions" className="flex items-center justify-center gap-2 text-[#8c8778] hover:text-[#1a1916] text-sm py-2 transition-colors">
                    Browse Live Auctions <IcoArrow />
                  </Link>
                </div>
              </div>
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
            setRetryMsg({ text: "Card updated. You can now retry the payment.", ok: true });
            loadPaymentMethods();
          }}
          onClose={() => setCardModal(null)}
        />
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#e5e0d5]/60 flex z-50 safe-area-pb">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-colors ${
              tab === item.id ? "text-[#09a7ad]" : "text-[#8c8778] hover:text-[#6b6659]"
            }`}
          >
            {item.icon}
            <span className="text-[9px] font-semibold leading-none tracking-wide uppercase">{item.shortLabel}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className={`absolute top-1.5 right-[10%] text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold ${
                item.id === "losing" ? "bg-red-500 text-white" : "bg-[#09a7ad] text-white"
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

    </div>
  );
}

export default function BidderDashboard() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#faf8f4] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#09a7ad]/30 border-t-[#09a7ad] animate-spin" />
      </main>
    }>
      <BidderDashboardInner />
    </Suspense>
  );
}
