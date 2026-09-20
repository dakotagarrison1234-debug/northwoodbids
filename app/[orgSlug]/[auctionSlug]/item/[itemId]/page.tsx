"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Pusher from "pusher-js";
import Countdown from "@/app/components/Countdown";
import { getNextValidBid, getProxySuggestions } from "@/lib/bidIncrements";
import { IcoStar, IcoShare, IcoBolt, IcoTruck, IcoLock, IcoGavel } from "@/app/components/BidIcons";
import { PineMark } from "@/app/components/Illustrations";
import LocationBadge from "@/app/components/LocationBadge";
import CardSetupModal from "@/app/components/CardSetupModal";
import MaxBidExplainerModal from "@/app/components/MaxBidExplainerModal";
import ExpandableDescription from "@/app/components/ExpandableDescription";
import Skeleton from "@/app/components/Skeleton";

/* ── Presentation helpers (display only) ─────────────────────────────────── */

/** "just now" / "4m ago" / "3h ago" / "Tue 2:14 PM" — for the bid ledger. */
function relTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Math.max(0, now - t);
  if (diff < 45_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Small on-brand section heading: pine mark + slab-serif title + hairline. */
function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <PineMark className="w-4 h-4 shrink-0" />
      <h3 className="font-display font-bold text-base text-[#241a12] leading-none">{children}</h3>
      <span className="flex-1 h-px bg-[#e3d6bf]" aria-hidden="true" />
      {aside}
    </div>
  );
}

/** Meta chip — one look for condition / size / pack / category / collection. */
function Chip({ tone = "cream", children }: { tone?: "cream" | "ink" | "leather" | "moss" | "amber"; children: React.ReactNode }) {
  const tones = {
    cream: "bg-[#efe3d0] border-[#e3d6bf] text-[#6f5b46]",
    ink: "bg-[#241a12] border-[#241a12] text-[#f6ecda]",
    leather: "bg-[#6c4d39]/10 border-[#6c4d39]/25 text-[#563e2c]",
    moss: "bg-[#4a7c59]/12 border-[#4a7c59]/30 text-[#3c6449]",
    amber: "bg-[#f0a35a]/20 border-[#c47b3e]/40 text-[#8a4f1c]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${tones}`}>
      {children}
    </span>
  );
}

interface Item {
  id: string;
  title: string;
  description: string | null;
  condition: string;
  size?: string | null;
  category: string | null;
  retailValue: number | null;
  startingBid: number;
  currentBid: number;
  donorName: string | null;
  taxDeductible: boolean;
  storageLocation: string | null;
  status: string;
  itemEndAt: string | null;
  packSize?: number | null;
  transferable?: boolean;
  locationName?: string | null;
  photos: { url: string; isPrimary: boolean }[];
  bids: { id: string; amount: number; clerkUserId?: string; bidder?: string; placedAt: string; isProxy?: boolean }[];
  auction: { title: string; endAt: string; status: string } | null;
  org?: { id: string; stripeAccountId: string | null; stripeChargesEnabled: boolean; platformFeePercent?: number; taxPercent?: number } | null;
}

type LiveBid = { user: string; amount: number; time: string; isProxy?: boolean };

export default function ItemPage() {
  const params = useParams();
  const router = useRouter();
  const { orgSlug, auctionSlug, itemId } = params as {
    orgSlug: string; auctionSlug: string; itemId: string;
  };
  const { isSignedIn, isLoaded, user } = useUser();

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  // Bidding
  const [placing, setPlacing] = useState(false);
  // Double-tap quick bid: armed = first tap landed, waiting for the confirm tap.
  const [quickArmed, setQuickArmed] = useState(false);
  const [bidFlash, setBidFlash] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Proxy bid
  const [proxyAmount, setProxyAmount] = useState("");
  const [proxyPlacing, setProxyPlacing] = useState(false);
  const [proxyMessage, setProxyMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [userProxy, setUserProxy] = useState<{ maxAmount: number } | null>(null);
  const [hasActiveProxy, setHasActiveProxy] = useState(false);
  const [cancellingProxy, setCancellingProxy] = useState(false);

  // Winning state
  const [isWinning, setIsWinning] = useState(false);

  const [liveBids, setLiveBids] = useState<LiveBid[]>([]);
  const [bidCount, setBidCount] = useState(0); // live total, ticks up on every bid
  // Trailing-debounce the winner/proxy refetch so a burst of bids = one query.
  const proxyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedOnceRef = useRef(false); // skip the very first Pusher connect

  // Card-on-file gate
  // null = not yet checked, true = has card, false = no card
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showMaxBidExplainer, setShowMaxBidExplainer] = useState(false);

  // ── Watchlist + share ──
  const [watched, setWatched] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // Star state + the user's referral code (so a share doubles as a Bid Bucks invite).
  // Prefetched on mount: navigator.share must fire inside the tap, so no awaits then.
  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/watchlist").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.ids)) setWatched(d.ids.includes(itemId));
    }).catch(() => {});
    fetch("/api/referral/summary").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.code) setRefCode(String(d.code));
    }).catch(() => {});
  }, [isSignedIn, itemId]);

  const toggleWatch = async () => {
    if (watchBusy) return;
    const next = !watched;
    setWatched(next); // optimistic
    setWatchBusy(true);
    try {
      const res = next
        ? await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) })
        : await fetch(`/api/watchlist?itemId=${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!res.ok) setWatched(!next); // revert
    } catch { setWatched(!next); }
    setWatchBusy(false);
  };

  const shareItem = async () => {
    if (typeof window === "undefined" || !item) return;
    const path = window.location.pathname;
    // Signed-in bidders share through their referral link so the recipient lands on
    // THIS lot and, if they sign up, credits the sharer's Bid Bucks.
    const url = refCode
      ? `${window.location.origin}/r/${refCode}?to=${encodeURIComponent(path)}`
      : `${window.location.origin}${path}`;
    const data = { title: item.title, text: `Check out this lot on Northwood Bids — bidding starts at $2.`, url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch { /* cancelled */ return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
      setTimeout(() => setShareNote(null), 1800);
    } catch { /* ignore */ }
  };

  // Stable bidder anonymization map
  const bidderMapRef = useRef<Map<string, string>>(new Map());
  const bidderCounterRef = useRef(0);
  const assignBidder = (uid: string): string => {
    if (!bidderMapRef.current.has(uid)) {
      bidderCounterRef.current += 1;
      bidderMapRef.current.set(uid, `Bidder ${bidderCounterRef.current}`);
    }
    return bidderMapRef.current.get(uid)!;
  };

  const [effectiveEndAt, setEffectiveEndAt] = useState<string | null>(null);
  const [biddingEnded, setBiddingEnded] = useState(false);
  const userProxyRef = useRef<{ maxAmount: number } | null>(null);
  userProxyRef.current = userProxy;
  const wasWinningRef = useRef(false);
  const [outbidFlash, setOutbidFlash] = useState(false);
  // Has this user bid on THIS lot? Drives a persistent standing banner so a bidder
  // who missed the outbid alert doesn't wrongly assume they're still winning.
  const [participated, setParticipated] = useState(false);
  // One-time celebratory pop when you newly take the lead.
  const [winFlash, setWinFlash] = useState(false);

  // Staff/admin viewing get an inline "Edit listing" link.
  const [me, setMe] = useState<{ orgId: string | null; isSuperAdmin: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(d => setMe({ orgId: d.orgId ?? null, isSuperAdmin: !!d.isSuperAdmin })).catch(() => {});
  }, []);

  // Photo carousel
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  // Slow clock for the bid ledger's relative times ("4m ago"). Display only.
  const [ledgerNow, setLedgerNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setLedgerNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Load item data
  useEffect(() => {
    fetch(`/api/items/${itemId}`)
      .then(r => r.json())
      .then(d => {
        if (d.item) {
          setItem(d.item);
          const primaryIdx = d.item.photos.findIndex((p: { isPrimary: boolean }) => p.isPrimary);
          setSelectedPhotoIdx(primaryIdx >= 0 ? primaryIdx : 0);
          const end = d.item.itemEndAt ?? d.item.auction?.endAt ?? null;
          setEffectiveEndAt(end);
          if (end && new Date(end) <= new Date()) setBiddingEnded(true);
          setBidCount(Array.isArray(d.item.bids) ? d.item.bids.length : 0);
          const sorted = [...d.item.bids].sort(
            (a: Item["bids"][0], b: Item["bids"][0]) =>
              new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
          );
          // Fix #1: only show last 5 bids
          setLiveBids(sorted.reverse().slice(0, 5).map((b: Item["bids"][0]) => ({
            user: assignBidder(b.bidder ?? b.clerkUserId ?? ""),
            amount: b.amount,
            // ISO timestamp — rendered as a relative "4m ago" in the ledger.
            time: b.placedAt,
            isProxy: b.isProxy ?? false,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [itemId]);

  // Helper: refresh proxy status from server
  const refreshProxyStatus = useCallback(() => {
    const hadProxy = !!userProxyRef.current;
    fetch(`/api/proxy-bids/${itemId}`)
      .then(r => r.json())
      .then(d => {
        // One-time pulse on the persistent standing banner when the user's max bid
        // was just beaten, OR they were the leader and just lost the lead.
        const wasWinning = wasWinningRef.current;
        const lostLead = wasWinning && d.isWinning === false;
        if ((hadProxy && !d.userProxy) || lostLead) {
          setOutbidFlash(true);
          setTimeout(() => setOutbidFlash(false), 3000);
        }
        // Newly took the lead → one-time celebratory pop on the standing banner.
        if (!wasWinning && d.isWinning) {
          setWinFlash(true);
          setTimeout(() => setWinFlash(false), 1600);
        }
        wasWinningRef.current = !!d.isWinning;
        setParticipated(!!d.participated);
        setUserProxy(d.userProxy ?? null);
        setHasActiveProxy(d.hasActiveProxy ?? false);
        // Fix #4: update winning state
        setIsWinning(d.isWinning ?? false);
      })
      .catch(() => {/* non-critical */});
  }, [itemId]);

  // Load proxy status on mount
  useEffect(() => {
    if (!itemId) return;
    refreshProxyStatus();
  }, [itemId, refreshProxyStatus]);

  // Check if the signed-in user has a card on file for this org
  const refreshCardStatus = useCallback(() => {
    if (!isSignedIn || !item?.org?.id) return;
    fetch(`/api/orgs/${item.org.id}/stripe/payment-method`)
      .then((r) => r.json())
      .then((d) => {
        setHasCard(d.hasCard === true);
        setCardLast4(d.last4 ?? null);
        setCardBrand(d.brand ?? null);
      })
      .catch(() => setHasCard(null)); // null = unknown, don't block bidding
  }, [isSignedIn, item?.org?.id]);

  useEffect(() => {
    refreshCardStatus();
  }, [refreshCardStatus]);

  // Pusher real-time updates
  useEffect(() => {
    if (!itemId) return;
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
    const channel = pusher.subscribe(`item-${itemId}`);

    channel.bind("new-bid", (data: {
      amount: number;
      isProxy?: boolean;
      hasActiveProxy?: boolean;
      newEndAt?: string;
    }) => {
      // Monotonic guard: never let a late/duplicate event show a lower price.
      setItem(prev => prev ? { ...prev, currentBid: Math.max(prev.currentBid, data.amount) } : prev);
      setBidCount(c => c + 1);
      // Privacy: the broadcast no longer carries any user id. We derive an opaque
      // "Bidder N" label client-side by incrementing our own per-page counter on
      // each live bid event — no real/truncated Clerk id is ever on the wire.
      bidderCounterRef.current += 1;
      const liveLabel = `Bidder ${bidderCounterRef.current}`;
      // Fix #1: cap live bids at 5
      setLiveBids(prev => [
        {
          user: liveLabel,
          amount: data.amount,
          time: "just now",
          isProxy: data.isProxy ?? false,
        },
        ...prev,
      ].slice(0, 5));
      if (data.hasActiveProxy !== undefined) setHasActiveProxy(data.hasActiveProxy);
      if (data.newEndAt) {
        setEffectiveEndAt(data.newEndAt);
        setBiddingEnded(false);
      }
      // Winner/proxy state only matters to a signed-in bidder. Debounce so a burst
      // of bids collapses into a single refetch (avoids a query-per-viewer stampede).
      if (isSignedIn) {
        if (proxyDebounceRef.current) clearTimeout(proxyDebounceRef.current);
        proxyDebounceRef.current = setTimeout(() => refreshProxyStatus(), 500);
      }
    });

    channel.bind("proxy-update", (data: { hasActiveProxy: boolean }) => {
      setHasActiveProxy(data.hasActiveProxy);
    });

    // Item closed server-side — flip the UI to "ended" instantly and pull fresh
    // status (sold/unsold, current price) instead of waiting for the local timer.
    channel.bind("item-closed", () => {
      setBiddingEnded(true);
      fetch(`/api/items/${itemId}`)
        .then((r) => r.json())
        .then((d) => { if (d.item) setItem(d.item); })
        .catch(() => {});
    });

    // Catch-up after a reconnect or tab-refocus: events missed during a WebSocket
    // drop are gone, so pull the authoritative current price/count/end fresh.
    const catchUp = () => {
      fetch(`/api/items/${itemId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.item) return;
          setItem((prev) => prev ? { ...prev, currentBid: Math.max(prev.currentBid, d.item.currentBid) } : d.item);
          if (Array.isArray(d.item.bids)) setBidCount(d.item.bids.length);
          const end = d.item.itemEndAt ?? d.item.auction?.endAt ?? null;
          if (end) setEffectiveEndAt(end);
        })
        .catch(() => {});
      if (isSignedIn) refreshProxyStatus();
    };
    pusher.connection.bind("connected", () => {
      if (!connectedOnceRef.current) { connectedOnceRef.current = true; return; }
      catchUp();
    });
    const onVisible = () => { if (document.visibilityState === "visible") catchUp(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      channel.unbind_all();
      pusher.connection.unbind_all();
      pusher.unsubscribe(`item-${itemId}`);
      pusher.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      if (proxyDebounceRef.current) clearTimeout(proxyDebounceRef.current);
    };
  }, [itemId, refreshProxyStatus, isSignedIn]);

  // Fix #7: auto-refresh 75s after bidding ends (to pick up cron job results)
  const handleExpire = useCallback(() => {
    setBiddingEnded(true);
    setTimeout(() => window.location.reload(), 75_000);
  }, []);

  // Manual bid handler
  /**
   * Double-tap quick bid.
   *
   * First tap arms (2.6s window), second tap places the next minimum increment.
   * A single tap deliberately does nothing: this spends real money, and a stray
   * thumb on a scrolling page shouldn't cost anyone $16. Arming is cheaper than a
   * confirm modal — no context switch, and the second tap lands in the same spot.
   *
   * Haptics are best-effort. `navigator.vibrate` works on Android; iOS Safari does
   * not expose it at all, which is why the visual feedback has to carry the moment
   * on its own rather than being a bonus on top of the buzz.
   */
  const buzz = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* unsupported — visuals cover it */ }
  };

  const handleQuickBid = () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (placing) return;

    if (!quickArmed) {
      setQuickArmed(true);
      buzz(12); // light tick — "I heard you"
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setQuickArmed(false), 2600);
      return;
    }

    // Second tap — commit.
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setQuickArmed(false);
    buzz([18, 40, 28]); // heavier double-thump on commit
    const currentBid = item?.currentBid || 0;
    const next = currentBid > 0 ? getNextValidBid(currentBid) : Math.ceil(item?.startingBid || 0);
    void placeBid(next);
  };

  // Clear the arming timer if the user navigates away mid-window.
  useEffect(() => () => { if (armTimerRef.current) clearTimeout(armTimerRef.current); }, []);

  /**
   * Shared bid submission. Both entry points funnel through here so the card gate,
   * popcorn-extension handling and error paths can't drift apart.
   */
  const placeBid = async (amount: number) => {
    // Card gate — show modal if no card on file
    if (hasCard === false) {
      setShowCardModal(true);
      return;
    }

    setPlacing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, amount }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.proxyFired) {
          setMessage({
            text: `Bid of $${amount.toLocaleString()} placed — instantly outbid by an active max bid.${data.giveawayTicket ? " Still counts: +1 giveaway ticket." : ""}`,
            type: "error",
          });
          buzz([10, 60, 10]); // stutter = "you're already behind again"
        } else {
          setMessage({
            text: data.giveawayTicket
              ? `You're the top bid at $${amount.toLocaleString()}! +1 giveaway ticket (${data.giveawayTicket}).`
              : `You're the top bid at $${amount.toLocaleString()}!`,
            type: "success",
          });
          // Success moment: light sweep across the button + a confident buzz.
          setBidFlash(true);
          setTimeout(() => setBidFlash(false), 650);
        }
        if (data.newEndAt) {
          setEffectiveEndAt(data.newEndAt);
          setBiddingEnded(false);
        }
      } else if (data.requiresRegistration) {
        router.push(`/register?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      } else if (data.requiresPaymentMethod) {
        setShowCardModal(true);
      } else {
        setMessage({ text: data.error, type: "error" });
      }
    } catch {
      setMessage({ text: "Something went wrong", type: "error" });
    } finally {
      setPlacing(false);
    }
  };


  // Set / update proxy bid handler
  const handleSetProxy = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const amount = parseFloat(proxyAmount);
    const currentBid = item?.currentBid || 0;
    const minProxy = currentBid > 0 ? getNextValidBid(currentBid) : Math.max(Math.ceil(item?.startingBid || 0), 1);
    if (!proxyAmount || isNaN(amount) || amount < minProxy) {
      setProxyMessage({ text: `Max bid must be at least $${minProxy.toLocaleString()}`, type: "error" });
      return;
    }
    if (!Number.isInteger(amount)) {
      setProxyMessage({ text: "Whole dollars only — no cents.", type: "error" });
      return;
    }

    // Card gate — show modal if no card on file
    if (hasCard === false) {
      setShowCardModal(true);
      return;
    }

    setProxyPlacing(true);
    setProxyMessage(null);
    try {
      const res = await fetch("/api/proxy-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, maxAmount: amount }),
      });
      const data = await res.json();
      if (data.success) {
        setUserProxy({ maxAmount: amount });
        setHasActiveProxy(true);
        setProxyAmount("");
        setProxyMessage({
          text: data.proxyFired
            ? `Max bid set at $${amount.toLocaleString()} — auto-bid placed!`
            : `Max bid set at $${amount.toLocaleString()}. We'll bid for you automatically.`,
          type: "success",
        });
        if (data.newEndAt) {
          setEffectiveEndAt(data.newEndAt);
          setBiddingEnded(false);
        }
      } else if (data.requiresRegistration) {
        router.push(`/register?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      } else if (data.requiresPaymentMethod) {
        setShowCardModal(true);
      } else {
        setProxyMessage({ text: data.error, type: "error" });
      }
    } catch {
      setProxyMessage({ text: "Something went wrong", type: "error" });
    } finally {
      setProxyPlacing(false);
    }
  };

  // Cancel proxy handler
  const handleCancelProxy = async () => {
    setCancellingProxy(true);
    setProxyMessage(null);
    try {
      const res = await fetch(`/api/proxy-bids/${itemId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        // Clear OUR proxy and sync the badge from the server's remaining-proxy count
        // (don't call refreshProxyStatus here — it would misread the cleared proxy
        // as "your max bid was beaten").
        setUserProxy(null);
        setHasActiveProxy(data.hasActiveProxy ?? false);
        setProxyAmount("");
        setProxyMessage({ text: "Max bid cancelled. Any bids already placed for you still stand.", type: "success" });
      } else {
        setProxyMessage({ text: data.error || "Failed to cancel proxy", type: "error" });
      }
    } catch {
      setProxyMessage({ text: "Something went wrong", type: "error" });
    } finally {
      setCancellingProxy(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
        {/* Breadcrumb placeholder */}
        <div className="max-w-6xl mx-auto px-6 sm:px-8 pt-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
          {/* Left: photo */}
          <div>
            <Skeleton className="w-full aspect-square rounded-2xl mb-3" />
            {/* Mirrors the real thumbnail strip (flex, 64px squares) so nothing
                shifts when the photos land. */}
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="w-16 h-16 shrink-0 rounded-lg" />
              ))}
            </div>
          </div>
          {/* Right: title + bid box */}
          <div>
            <div className="flex gap-2 mb-3">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-3/4 mb-3" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3 mb-6" />
            {/* Bid card */}
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-9 w-32" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-4 w-10 mb-2 ml-auto" />
                  <Skeleton className="h-6 w-8 ml-auto" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-xl mb-4" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-5">
        <div className="text-center max-w-sm w-full">
          <IcoGavel className="w-10 h-10 text-[#cdbda3] mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold mb-2">That lot&apos;s gone quiet</h1>
          <p className="text-[#6f5b46] text-sm mb-6">It may have been pulled, or the link is off by a character. Plenty more on the block.</p>
          <div className="flex flex-col gap-2.5">
            <Link href={`/${orgSlug}/${auctionSlug}`} className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold py-3 rounded-xl transition-colors">
              Back to auction
            </Link>
            <Link href="/auctions" className="w-full border border-[#cdbda3] hover:border-[#b3a085] text-[#4a3a2b] hover:text-[#241a12] font-medium py-3 rounded-xl transition-colors">
              Browse all auctions
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currentBid = item.currentBid || item.startingBid;
  const minBid = item.currentBid > 0 ? getNextValidBid(item.currentBid) : Math.max(Math.ceil(item.startingBid), 1);
  const minProxy = item.currentBid > 0 ? getNextValidBid(item.currentBid) : Math.max(Math.ceil(item.startingBid), 1);
  // $5 rungs above the current bid, capped at retail (no point suggesting a max above
  // what the item is worth).
  const proxySuggestions = getProxySuggestions(item.currentBid || 0, 4, item.retailValue);
  const auctionClosed = item.auction?.status === "CLOSED" || item.auction?.status === "SETTLED";
  const itemSold = item.status === "SOLD" || item.status === "PENDING_PICKUP" || item.status === "PICKED_UP";
  const itemNotActive = item.status !== "ACTIVE";
  const biddingLocked = auctionClosed || itemSold || itemNotActive || biddingEnded;
  // Fix #4: determine if current user is winning (only show when signed in)
  const showWinning = isSignedIn && isLoaded && isWinning && !biddingEnded;

  // Colour the current bid by YOUR standing: green when you're the top bidder, red
  // when someone's ahead of you, neutral brown otherwise (logged out, no bids yet,
  // or bidding closed). A signed-in bidder can tell at a glance whether they need to
  // act just from the price colour.
  const priceColor = showWinning
    ? "text-[#4a7c59]"
    : isSignedIn && isLoaded && !isWinning && !biddingLocked && item.currentBid > 0
    ? "text-[#a32d2d]"
    : "text-[#6c4d39]";

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Breadcrumb / back link. Uses history-back when we came FROM the auction so
          the bidder lands exactly where they were scrolled to (not the top). Falls
          back to a normal navigation on a deep-link / fresh load. */}
      <div className="max-w-6xl mx-auto px-6 sm:px-8 pt-4 flex items-center gap-2 text-sm min-w-0">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push(`/${orgSlug}/${auctionSlug}`);
          }}
          className="text-[#8a7559] hover:text-[#241a12] shrink-0 flex items-center gap-1 transition-colors text-sm font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
          Back to auction
        </button>
        {me && (me.isSuperAdmin || (!!item.org && me.orgId === item.org.id)) && (
          <Link
            href={`/admin/items/${item.id}`}
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-[#efe3d0] border border-[#cdbda3] text-[#6c4d39] font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" /></svg>
            Edit listing
          </Link>
        )}
      </div>

      {/* Small mobile gap so the title sits close under the photo; the big gap only
          applies on lg, where it's the horizontal gutter between the two columns. */}
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-3 sm:py-8 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-12">
        {/* Left: photos */}
        <div>
          {/* Main photo with swipe support. Capped to ~34vh on MOBILE so the price
              and bid controls surface with the product still in view — you shouldn't
              have to scroll past a full screen of photo to bid. Full square returns on
              desktop (lg) where the layout is two columns and height isn't the constraint. */}
          <div
            className="w-full h-[34vh] lg:h-auto lg:aspect-square bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden mb-2 flex items-center justify-center relative select-none shadow-[0_10px_30px_-18px_rgba(36,26,18,0.35)]"
            onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchStartXRef.current === null || item.photos.length < 2) return;
              const delta = e.changedTouches[0].clientX - touchStartXRef.current;
              if (Math.abs(delta) > 40) {
                setSelectedPhotoIdx(prev =>
                  delta < 0
                    ? (prev + 1) % item.photos.length
                    : (prev - 1 + item.photos.length) % item.photos.length
                );
              }
              touchStartXRef.current = null;
            }}
          >
            {item.photos.length > 0 ? (
              <Image
                src={item.photos[selectedPhotoIdx]?.url || item.photos[0].url}
                alt={item.title}
                fill
                priority
                sizes="(max-width:1024px) 100vw, 50vw"
                className="object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[#b3a085]">
                <IcoGavel className="w-8 h-8" />
                <span className="text-xs font-semibold uppercase tracking-wide">Photo coming</span>
              </div>
            )}

            {/* Corner tag: how far under retail the bidding sits right now. */}
            {item.retailValue && currentBid > 0 && item.retailValue > currentBid && (
              <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 bg-[#c47b3e] text-white text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">
                {Math.round((1 - currentBid / item.retailValue) * 100)}% off retail
              </span>
            )}
            {(item.packSize ?? 0) > 1 && (
              <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center bg-[#241a12]/85 text-[#f6ecda] text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                {item.packSize}-pack lot
              </span>
            )}

            {/* Prev / Next arrows */}
            {item.photos.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev - 1 + item.photos.length) % item.photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white border border-[#e3d6bf] rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Previous photo"
                >
                  <svg className="w-4 h-4 text-[#4a3a2b]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 4L6 8l4 4" />
                  </svg>
                </button>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev + 1) % item.photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white border border-[#e3d6bf] rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Next photo"
                >
                  <svg className="w-4 h-4 text-[#4a3a2b]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                {/* Dot indicators — pill grows on the active photo. */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#241a12]/55 backdrop-blur-sm px-2 py-1 rounded-full">
                  {item.photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhotoIdx(i)}
                      className={`h-1.5 rounded-full transition-all duration-200 ${i === selectedPhotoIdx ? "w-4 bg-[#f0a35a]" : "w-1.5 bg-[#f6ecda]/70 hover:bg-[#f6ecda]"}`}
                      aria-label={`Go to photo ${i + 1}`}
                    />
                  ))}
                </div>
                <span className="absolute bottom-2 right-2.5 text-[10px] font-bold tabular-nums text-[#f6ecda] bg-[#241a12]/55 backdrop-blur-sm px-2 py-1 rounded-full">
                  {selectedPhotoIdx + 1} / {item.photos.length}
                </span>
              </>
            )}
          </div>
          {/* Thumbnails — a flex strip, not a 5-column grid. With 2-4 photos (the
              usual case) the grid left 1-3 empty columns, so the thumbs sat in a row
              of visible holes; with 6 you got one orphan on a second row. Fixed-width
              items that scroll sideways handle any count with no gaps. */}
          {item.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {item.photos.map((photo, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPhotoIdx(i)}
                  className={`relative w-16 h-16 shrink-0 bg-white rounded-xl overflow-hidden border-2 transition-all ${
                    i === selectedPhotoIdx
                      ? "border-[#c47b3e] shadow-[0_0_0_2px_rgba(240,163,90,0.35)]"
                      : "border-[#e3d6bf] opacity-80 hover:opacity-100 hover:border-[#6c4d39]/40"
                  }`}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={i === selectedPhotoIdx ? "true" : undefined}
                >
                  <Image src={photo.url} alt={`Photo ${i + 1}`} fill sizes="64px" className="object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: bidding */}
        <div>
          {/* ── 1. What it is ──
              Title leads. The badge row used to sit ABOVE the title, so the first
              thing you read was "Good · Medium" rather than the product. Now the
              attributes sit under the name, as a supporting line. */}
          {/* Smaller + tighter line-height so a long title stays 1-2 lines instead of
              eating vertical space. font-sans (not display) is narrower per glyph. */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg sm:text-xl font-bold leading-snug min-w-0">{item.title}</h1>
            {/* Watch + Share — small, quiet, always in the same spot. */}
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              {isSignedIn ? (
                <button
                  onClick={toggleWatch}
                  disabled={watchBusy}
                  aria-pressed={watched}
                  aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                  title={watched ? "Watching" : "Watch this lot"}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                    watched
                      ? "bg-[#c47b3e] border-[#c47b3e] text-white"
                      : "bg-white border-[#cdbda3] text-[#6f5b46] hover:border-[#c47b3e] hover:text-[#c47b3e]"
                  }`}
                >
                  <IcoStar className="w-5 h-5" filled={watched} />
                </button>
              ) : (
                <SignInButton mode="modal">
                  <button aria-label="Sign in to watch this lot" title="Watch this lot" className="w-10 h-10 rounded-xl border bg-white border-[#cdbda3] text-[#6f5b46] flex items-center justify-center hover:border-[#c47b3e] hover:text-[#c47b3e]">
                    <IcoStar className="w-5 h-5" />
                  </button>
                </SignInButton>
              )}
              <div className="relative">
                <button
                  onClick={shareItem}
                  aria-label="Share this lot"
                  title="Share"
                  className="w-10 h-10 rounded-xl border bg-white border-[#cdbda3] text-[#6f5b46] flex items-center justify-center hover:border-[#6c4d39] hover:text-[#6c4d39] transition-colors"
                >
                  <IcoShare className="w-5 h-5" />
                </button>
                {shareNote && (
                  <span className="absolute right-0 top-full mt-1 whitespace-nowrap bg-[#241a12] text-[#f6ecda] text-xs font-bold px-2.5 py-1 rounded-lg">
                    {shareNote}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* One consistent chip family: size leads (a lone "M" gets lost otherwise),
              then pack, condition, category. The clock sits at the end of the row. */}
          <div className="flex items-start justify-between gap-2 mt-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {item.size && (
                <Chip tone="ink">
                  <span className="opacity-70 font-semibold">Size</span>
                  <span className="uppercase tracking-wide">{item.size}</span>
                </Chip>
              )}
              {(item.packSize ?? 0) > 1 && <Chip tone="leather">{item.packSize}-pack lot</Chip>}
              <Chip tone="cream">
                <span className="capitalize">{item.condition.replace("_", " ").toLowerCase()}</span>
              </Chip>
              {item.category && <Chip tone="cream">{item.category}</Chip>}
              {hasActiveProxy && (
                <Chip tone="moss">
                  <IcoBolt className="w-3 h-3" /> Max bid active
                </Chip>
              )}
            </div>
            {/* Countdown lives here — filling the dead space beside the condition
                instead of eating a whole row of its own. Just the clock, no label. */}
            {effectiveEndAt && !biddingLocked && (
              <span className="shrink-0 inline-flex items-center text-sm whitespace-nowrap pt-1">
                <Countdown endAt={effectiveEndAt} onExpire={handleExpire} />
              </span>
            )}
          </div>

          {/* ── 2. What it costs ──
              Price and retail side by side in one block. Retail used to live in a
              `grid-cols-2` containing a single child, which left a literal empty
              half-width hole beside it. */}
          <div className="mt-2.5 rounded-2xl border border-[#e3d6bf] bg-white overflow-hidden shadow-[0_10px_30px_-18px_rgba(36,26,18,0.3)]">
            {/* The current bid lives ONLY in the sticky bar at the bottom now — this
                row is just retail context + activity, so the number isn't shown twice. */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#fbf4e6]/70">
              {item.retailValue ? (
                <div className="min-w-0 flex items-baseline gap-2">
                  <span className="text-[#8a7559] text-[11px] font-black uppercase tracking-[0.14em]">Retail</span>
                  <span className="text-[#a32d2d] font-extrabold text-xl leading-none tabular-nums line-through decoration-2 decoration-[#a32d2d]/50">
                    ${item.retailValue.toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="text-[#8a7559] text-[11px] font-black uppercase tracking-[0.14em]">Bidding open</div>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {item.retailValue && currentBid > 0 && item.retailValue > currentBid ? (
                  <span className="font-extrabold text-sm leading-none text-[#3c6449] bg-[#4a7c59]/12 border border-[#4a7c59]/30 px-2 py-1 rounded-full">
                    {Math.round((1 - currentBid / item.retailValue) * 100)}% off
                  </span>
                ) : null}
                <span className="text-xs font-semibold text-[#8a7559] tabular-nums inline-flex items-center gap-1">
                  <IcoGavel className="w-3.5 h-3.5" />
                  {bidCount} bid{bidCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

          {/* ── 4. Bidding — SAME card, divided by a hairline. One unified surface
              (price → time → bid) instead of separate floating boxes, so it reads as
              one tool and both bid methods sit right under the price. ── */}
          <div className="border-t border-[#e3d6bf] p-2.5">

            {/* ── Persistent standing banner ──
                Always tells a signed-in bidder where they actually stand, so nobody
                assumes they're still winning after missing the outbid alert. Winning
                pops once when you take the lead; outbid pulses once when you lose it,
                then stays put (no fleeting toast to miss) until you're back in front. */}
            {isSignedIn && isLoaded && !biddingLocked && !isWinning && participated && (
              <div className={`mb-2 rounded-xl bg-[#fdecec] border-2 border-red-500/70 px-3.5 py-2.5 flex items-center gap-2.5 ${outbidFlash ? "nb-attention" : ""}`}>
                <span className="w-7 h-7 rounded-full bg-red-600 text-white grid place-items-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-red-700 leading-tight">You&apos;ve been outbid</div>
                  <div className="text-xs text-red-600 leading-tight mt-0.5">
                    Someone went higher — tap Bid at the bottom to get back in front.
                  </div>
                </div>
              </div>
            )}

            {biddingLocked ? (
              <div className="bg-[#efe3d0] border border-[#e3d6bf] rounded-xl px-4 py-3.5 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white border border-[#e3d6bf] grid place-items-center text-[#8a7559] shrink-0">
                  <IcoGavel className="w-4.5 h-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm text-[#241a12] leading-tight">
                    {itemSold ? "Sold. Hammer's down." : auctionClosed ? "This auction has closed." : itemNotActive ? "Not open for bidding right now." : "Bidding on this lot has ended."}
                  </div>
                  <div className="text-xs text-[#6f5b46] mt-0.5">
                    {itemSold ? "Plenty more on the block." : "Browse what else is open — most lots start at $2."}
                  </div>
                </div>
              </div>
            ) : !isLoaded ? null : !isSignedIn ? (
              <div className="bg-[#f6ecda] border border-[#e3d6bf] rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-2 text-sm text-[#4a3a2b] mb-3">
                  <IcoLock className="w-4 h-4 text-[#6c4d39] shrink-0" />
                  <span>Sign in to bid. Your card is only charged if you win.</span>
                </div>
                <SignInButton mode="modal">
                  <button className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold py-3 rounded-xl transition-colors">
                    Sign in to bid
                  </button>
                </SignInButton>
              </div>
            ) : (
              <>
                {/* Once you're winning, the bid tools aren't needed — hide the max-bid
                    box and quick-bid and just show a winning summary with your REAL total. */}
                {!showWinning && (
                <>
                {/* ═══════════════════════════════════════════════════════════
                    MAX BID — PRIMARY option
                ═══════════════════════════════════════════════════════════ */}
                <div className="relative bg-[#f6ecda] border-2 border-[#6c4d39]/30 rounded-2xl p-3 overflow-hidden">
                  <PineMark className="absolute -right-3 -bottom-3 w-16 h-16 opacity-[0.07] pointer-events-none" />
                  {/* One-line header — title, ? and the Recommended tag on a single row
                      instead of a title + subtitle + tag stack. */}
                  <div className="relative flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-display font-bold text-[15px] text-[#241a12] shrink-0">Set a max bid</h3>
                      <button
                        onClick={() => setShowMaxBidExplainer(true)}
                        aria-label="Learn how max bidding works"
                        className="w-4.5 h-4.5 rounded-full bg-[#6c4d39]/20 text-[#6c4d39] text-[10px] font-black flex items-center justify-center hover:bg-[#6c4d39]/35 transition-colors leading-none shrink-0"
                      >
                        ?
                      </button>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#8a4f1c] bg-[#f0a35a]/25 border border-[#c47b3e]/40 px-2 py-0.5 rounded-full shrink-0">
                      <IcoBolt className="w-2.5 h-2.5" /> Recommended
                    </span>
                  </div>

                  {/* Plain-English one-liner, always visible. The "?" still opens the
                      full walkthrough, but nobody should have to tap to grasp the gist. */}
                  <p className="relative text-xs text-[#6f5b46] leading-snug mb-2.5">
                    Name the most you&apos;d pay. We bid just enough to keep you on top — never a dollar past it.
                  </p>

                  {proxyMessage && (
                    <div className={`text-sm mb-2.5 px-3 py-2 rounded-lg ${
                      proxyMessage.type === "success" ? "bg-[#6c4d39]/20 text-[#6c4d39]" : "bg-red-500/20 text-red-600"
                    }`}>
                      {proxyMessage.text}
                    </div>
                  )}

                  {userProxy ? (
                    /* Active max bid display */
                    <div className="relative flex items-center justify-between gap-2 bg-white border border-[#e3d6bf] rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[#4a3a2b] text-sm font-medium">
                          Your ceiling:{" "}
                          <span className="text-[#6c4d39] font-extrabold text-base tabular-nums">${userProxy.maxAmount.toLocaleString()}</span>
                        </p>
                        <p className="text-[#8a7559] text-xs mt-0.5">We&apos;re holding the line for you up to this amount.</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => { setProxyAmount(String(userProxy.maxAmount)); setUserProxy(null); }}
                          className="text-xs text-[#6f5b46] hover:text-[#241a12] border border-[#cdbda3] hover:border-[#b3a085] px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Update
                        </button>
                        <button
                          onClick={handleCancelProxy}
                          disabled={cancellingProxy}
                          className="text-xs text-red-600 hover:text-red-400 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {cancellingProxy ? "Cancelling…" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Set max bid form */
                    <div>
                      {/* Quick-pick chips — no "Quick picks:" label; the chips are
                          self-explanatory and the label was a whole wasted line. */}
                      <div className="flex gap-1.5 mb-2 flex-wrap">
                        {proxySuggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => setProxyAmount(String(s))}
                            className={`text-sm px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                              proxyAmount === String(s)
                                ? "bg-[#6c4d39] border-[#6c4d39] text-white"
                                : "bg-white border-[#cdbda3] text-[#4a3a2b] hover:bg-[#efe3d0]"
                            }`}
                          >
                            ${s.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <input
                          type="number"
                          value={proxyAmount}
                          min={minProxy}
                          step="1"
                          onChange={e => setProxyAmount(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !proxyPlacing && handleSetProxy()}
                          placeholder={`$${minProxy.toLocaleString()} or more`}
                          className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]"
                        />
                        <button
                          onClick={handleSetProxy}
                          disabled={proxyPlacing}
                          className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(108,77,57,0.3)]"
                        >
                          {proxyPlacing ? "Setting…" : "Set Max Bid"}
                        </button>
                      </div>
                      {/* Worst-case commitment preview */}
                      {(() => {
                        const amt = parseFloat(proxyAmount);
                        if (!Number.isFinite(amt) || amt <= 0) return null;
                        const feePct = item.org?.platformFeePercent ?? 0;
                        const taxPct = item.org?.taxPercent ?? 0;
                        const feeC = Math.round(amt * feePct / 100 * 100);
                        const taxC = Math.round((amt * 100 + feeC) * taxPct / 100);
                        const totalCents = Math.round(amt * 100) + feeC + taxC;
                        return (
                          <p className="text-xs text-[#8a7559] mt-2">
                            Worst case if your max wins:{" "}
                            <span className="text-[#4a3a2b] font-semibold tabular-nums">
                              ${(totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {feePct > 0 ? ` (incl. ${feePct}% premium${taxPct > 0 ? ` + ${taxPct}% tax` : ""})` : ""}.
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
                </>
                )}

                {/* The quick "Bid $X" button lives in the sticky bar at the bottom of the
                    screen now (always in reach, one thumb). This card keeps the max bid,
                    any bid message, the winning summary, and the total preview. */}
                <div className={showWinning ? "" : "mt-2.5"}>
                  {message && (
                    <div className={`text-sm mb-2 px-3 py-2 rounded-lg ${
                      message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-500/20 text-red-600"
                    }`}>
                      {message.text}
                    </div>
                  )}

                  {showWinning && (
                    /* The single winning indicator. You can't outbid yourself, so no bid
                       controls — just confirm the lead and the amount, total shown below. */
                    <div className={`rounded-2xl bg-[#241a12] text-[#f6ecda] px-4 py-3.5 flex items-center justify-between gap-3 ${winFlash ? "nb-pop" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-[#f0a35a] opacity-75 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0a35a]" />
                          </span>
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f0a35a]">You&apos;re in the lead</p>
                        </div>
                        <p className="text-xs text-[#f6ecda]/70 leading-tight mt-1">
                          We&apos;ll text you the second anyone passes you.
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-extrabold text-2xl leading-none tabular-nums">${currentBid.toLocaleString()}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[#f6ecda]/60 mt-0.5">your bid</div>
                      </div>
                    </div>
                  )}

                  {/* Total-due preview */}
                  {(() => {
                    const feePct = item.org?.platformFeePercent ?? 0;
                    const taxPct = item.org?.taxPercent ?? 0;
                    // When you're winning, the total is on YOUR current bid — not the
                    // next increment you'd pay if you were still trying to take the lead.
                    const baseBid = showWinning ? currentBid : minBid;
                    const bidCents = Math.round(baseBid * 100);
                    const feeCents = Math.round(baseBid * feePct / 100 * 100);
                    const taxCents = Math.round((bidCents + feeCents) * taxPct / 100);
                    const totalCents = bidCents + feeCents + taxCents;
                    const fmt = (c: number) =>
                      (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    // Headline total stays visible; the fee/tax maths goes behind a
                    // disclosure. Four always-open rows of small print sat directly
                    // under the bid button competing with it — and when someone typed
                    // a max bid above, TWO different "total" figures were on screen at
                    // once. Now there's one number, and the breakdown is one tap away.
                    return (
                      <details className="group mt-3 bg-[#efe3d0]/60 border border-[#cdbda3]/60 rounded-xl overflow-hidden">
                        <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none">
                          <span className="text-xs text-[#6f5b46]">
                            Total if you win{" "}
                            <span className="font-bold text-[#241a12] tabular-nums">${fmt(totalCents)}</span>
                          </span>
                          <span className="text-[#8a7559] transition-transform group-open:rotate-180 shrink-0">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                          </span>
                        </summary>
                        <div className="px-4 pb-3 text-xs space-y-1 border-t border-[#cdbda3]/50 pt-2">
                          <div className="flex justify-between text-[#6f5b46]">
                            <span>Your bid</span>
                            <span className="tabular-nums">${fmt(bidCents)}</span>
                          </div>
                          {feePct > 0 && (
                            <div className="flex justify-between text-[#6f5b46]">
                              <span>Buyer&apos;s premium ({feePct}%)</span>
                              <span className="tabular-nums">${fmt(feeCents)}</span>
                            </div>
                          )}
                          {taxPct > 0 && (
                            <div className="flex justify-between text-[#6f5b46]">
                              <span>Tax ({taxPct}%)</span>
                              <span className="tabular-nums">${fmt(taxCents)}</span>
                            </div>
                          )}
                          <p className="text-[#8a7559] pt-1">
                            Charged automatically to your card on file when the auction closes.
                          </p>
                        </div>
                      </details>
                    );
                  })()}
                </div>

              </>
            )}
          </div>
          </div>{/* ── close unified price + bid card ── */}

          {/* Payment method line — barely-used reassurance, so it sits BELOW the card
              rather than adding height inside the bid area. Only the "no card" warning
              is loud, since that one blocks bidding. */}
          {item.org?.stripeChargesEnabled && hasCard !== null && (
            <div className={`flex items-center justify-between gap-3 mt-2 px-3 py-2 rounded-xl border ${
              hasCard ? "border-transparent" : "bg-[#f0a35a]/15 border-[#c47b3e]/40"
            }`}>
              <div className="flex items-center gap-1.5 text-xs text-[#8a7559] min-w-0">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
                  <rect x="2" y="5" width="16" height="12" rx="2" />
                  <path d="M2 9h16" />
                </svg>
                {hasCard
                  ? cardBrand
                    ? <span className="text-[#6f5b46] truncate">{cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} ···· {cardLast4} · charged only if you win</span>
                    : <span className="text-[#6f5b46] truncate">Card on file · charged only if you win</span>
                  : <span className="text-[#8a4f1c] font-semibold">No card on file yet — add one to bid</span>
                }
              </div>
              <button
                onClick={() => setShowCardModal(true)}
                className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-bold transition-colors shrink-0"
              >
                {hasCard ? "Update" : "Add card"}
              </button>
            </div>
          )}

          {/* ── 5. Details ──
              Everything you'd read AFTER deciding you're interested: the description
              and where you collect it. Deliberately below the bid box — it used to sit
              between the title and the price, pushing the actual price off screen on a
              phone. The pickup facts are one tidy list rather than pills and a loose
              sentence floating beside them. */}
          {(item.description || item.locationName || item.transferable !== undefined || item.taxDeductible) && (
            <div className="mt-5 bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-5">
              <SectionLabel>About this lot</SectionLabel>

              {item.description && <ExpandableDescription text={item.description} />}

              {/* Where it lives + how you collect it — chips, same family as the header row. */}
              <div className={`flex flex-wrap items-center gap-1.5 ${item.description ? "mt-4 pt-3.5 border-t border-[#efe3d0]" : ""}`}>
                {item.locationName && <LocationBadge name={item.locationName} size="sm" />}
                {item.transferable === false ? (
                  <Chip tone="amber">
                    <IcoLock className="w-3 h-3" /> Pickup here only
                  </Chip>
                ) : (
                  <Chip tone="moss">
                    <IcoTruck className="w-3 h-3" /> Free transfer to your spot
                  </Chip>
                )}
                {item.taxDeductible && <Chip tone="cream">Tax deductible</Chip>}
              </div>
              <p className="text-[11px] text-[#8a7559] mt-2.5 leading-snug">
                {item.transferable === false
                  ? "This one stays put. Plan to collect it at the location above."
                  : "Win it anywhere, collect it at Owosso or Gladwin. Transfers ride along free, usually within a week."}
              </p>
            </div>
          )}

          {/* Max Bid explainer modal */}
          {showMaxBidExplainer && (
            <MaxBidExplainerModal onClose={() => setShowMaxBidExplainer(false)} />
          )}

          {/* Bid ledger — last 5. Bidders are masked (no names on the wire); "auto"
              marks a bid our max-bid engine placed on someone's behalf. */}
          {liveBids.length > 0 && (
            <div className="mt-5 bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-5">
              <SectionLabel aside={<span className="text-[11px] font-semibold text-[#8a7559] tabular-nums">last {liveBids.length}</span>}>
                Bid ledger
              </SectionLabel>
              <ol className="divide-y divide-[#efe3d0] -mx-1">
                {liveBids.map((bid, i) => {
                  const masked = bid.user.startsWith("Bidder") ? bid.user.replace(/^Bidder\s*/, "") : "";
                  // Top of the ledger is the standing bid only if it matches the live price
                  // (a late-arriving event could briefly reorder things).
                  const leading = i === 0 && bid.amount >= item.currentBid;
                  return (
                    <li key={i} className={`flex items-center gap-3 px-1 py-2.5 ${leading ? "bg-[#fbf4e6]/70 rounded-xl" : ""}`}>
                      <span
                        className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-black shrink-0 border ${
                          leading ? "bg-[#241a12] border-[#241a12] text-[#f0a35a]" : "bg-[#efe3d0] border-[#e3d6bf] text-[#6f5b46]"
                        }`}
                        aria-hidden="true"
                      >
                        B
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#241a12]">
                            Bidder<span className="text-[#b3a085] tracking-widest ml-0.5">•••</span>
                            {masked && <span className="sr-only">{masked}</span>}
                          </span>
                          {bid.isProxy && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wide text-[#3c6449] bg-[#4a7c59]/12 border border-[#4a7c59]/30 px-1.5 py-0.5 rounded-full">
                              <IcoBolt className="w-2.5 h-2.5" /> auto
                            </span>
                          )}
                          {leading && !biddingLocked && (
                            <span className="text-[10px] font-black uppercase tracking-wide text-[#8a4f1c] bg-[#f0a35a]/20 border border-[#c47b3e]/40 px-1.5 py-0.5 rounded-full">
                              leading
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#8a7559] mt-0.5">
                          {bid.time === "just now" ? "just now" : relTime(bid.time, ledgerNow)}
                        </div>
                      </div>
                      <span className={`font-extrabold tabular-nums ${leading ? "text-[#241a12] text-base" : "text-[#6c4d39] text-sm"}`}>
                        ${bid.amount.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Clearance so the sticky bid bar never covers the last content. */}
      <div className="pb-28" />

      {/* ── Sticky bid bar ──
          Always in reach at the bottom of the screen: current bid on the left, the
          next bid as one big button on the right. Double-tap to place (first tap arms,
          second confirms) — same safety as before, just always a thumb away. */}
      {!biddingLocked && isLoaded && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto bg-white border border-[#e3d6bf] rounded-2xl shadow-[0_-8px_30px_-10px_rgba(36,26,18,0.35)] px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1 flex items-baseline gap-2">
              <span className={`font-extrabold text-3xl leading-none tabular-nums ${priceColor}`}>
                ${currentBid.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-[#8a7559] leading-tight">
                {item.currentBid > 0 ? "Current" : "Starting"}<br />bid
              </span>
            </div>

            {!isSignedIn ? (
              <SignInButton mode="modal">
                <button className="shrink-0 bg-[#6c4d39] hover:bg-[#563e2c] text-white font-extrabold px-6 py-3.5 rounded-xl text-base">
                  Sign in to bid
                </button>
              </SignInButton>
            ) : showWinning ? (
              <span className="shrink-0 inline-flex items-center gap-2 bg-[#241a12] text-[#f6ecda] font-extrabold px-5 py-3.5 rounded-xl text-base tracking-tight">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#f0a35a] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0a35a]" />
                </span>
                Winning
              </span>
            ) : (
              <button
                onClick={handleQuickBid}
                disabled={placing}
                className={`relative shrink-0 overflow-hidden rounded-xl font-extrabold text-white text-lg px-7 py-3.5 transition-all duration-150 disabled:opacity-60 select-none tabular-nums ${
                  quickArmed
                    ? "bg-[#c47b3e] scale-[0.97] shadow-inner"
                    : "bg-[#4a7c59] active:scale-[0.97] shadow-[0_4px_0_#3c6449]"
                }`}
                style={{ WebkitTapHighlightColor: "transparent", minWidth: 140 }}
              >
                {bidFlash && (
                  <span className="pointer-events-none absolute inset-0 bg-white/35 animate-[quickbid-sweep_600ms_ease-out]" />
                )}
                <span className="relative flex flex-col items-center leading-tight">
                  {placing ? (
                    <span>Placing…</span>
                  ) : quickArmed ? (
                    <>
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/90">Tap again</span>
                      <span>Bid ${minBid.toLocaleString()}</span>
                    </>
                  ) : (
                    <span>Bid ${minBid.toLocaleString()}</span>
                  )}
                </span>
                {quickArmed && (
                  <span className="pointer-events-none absolute bottom-0 left-0 h-1 bg-white/70 animate-[quickbid-drain_2600ms_linear_forwards]" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card setup modal — shown when user tries to bid without a card on file */}
      {showCardModal && (
        item.org?.stripeChargesEnabled ? (
          <CardSetupModal
            orgId={item.org.id}
            onSuccess={() => {
              setShowCardModal(false);
              setHasCard(true);
              refreshCardStatus();
              setMessage({
                text: "Card saved! Tap Bid at the bottom to place your bid.",
                type: "success",
              });
            }}
            onClose={() => setShowCardModal(false)}
          />
        ) : (
          <div className="fixed inset-0 z-50 bg-[#f1e7d5]/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-white border border-[#e3d6bf] rounded-2xl p-6 w-full max-w-sm text-center">
              <p className="text-[#4a3a2b] mb-2 font-semibold">Payments not yet enabled</p>
              <p className="text-[#8a7559] text-sm mb-5">This business hasn&apos;t finished setting up payments. Try again later.</p>
              <button onClick={() => setShowCardModal(false)} className="w-full bg-[#efe3d0] hover:bg-[#e7dcc6] text-[#241a12] py-3 rounded-xl text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        )
      )}
    </main>
  );
}
