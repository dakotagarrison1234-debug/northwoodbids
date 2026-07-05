"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Pusher from "pusher-js";
import Countdown from "@/app/components/Countdown";
import { getNextValidBid, getProxySuggestions } from "@/lib/bidIncrements";
import CardSetupModal from "@/app/components/CardSetupModal";
import MaxBidExplainerModal from "@/app/components/MaxBidExplainerModal";
import ExpandableDescription from "@/app/components/ExpandableDescription";
import { BranchDivider } from "@/app/components/Illustrations";
import Skeleton from "@/app/components/Skeleton";

interface Item {
  id: string;
  title: string;
  description: string | null;
  condition: string;
  category: string | null;
  retailValue: number | null;
  startingBid: number;
  currentBid: number;
  donorName: string | null;
  taxDeductible: boolean;
  storageLocation: string | null;
  status: string;
  itemEndAt: string | null;
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

  // Manual bid
  const [bidAmount, setBidAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Proxy bid
  const [proxyAmount, setProxyAmount] = useState("");
  const [proxyPlacing, setProxyPlacing] = useState(false);
  const [proxyMessage, setProxyMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [userProxy, setUserProxy] = useState<{ maxAmount: number } | null>(null);
  const [hasActiveProxy, setHasActiveProxy] = useState(false);
  const [cancellingProxy, setCancellingProxy] = useState(false);
  const [proxyWasBeaten, setProxyWasBeaten] = useState(false);

  // Winning state
  const [isWinning, setIsWinning] = useState(false);

  const [liveBids, setLiveBids] = useState<LiveBid[]>([]);

  // Card-on-file gate
  // null = not yet checked, true = has card, false = no card
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showMaxBidExplainer, setShowMaxBidExplainer] = useState(false);

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

  // Staff/admin viewing get an inline "Edit listing" link.
  const [me, setMe] = useState<{ orgId: string | null; isSuperAdmin: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(d => setMe({ orgId: d.orgId ?? null, isSuperAdmin: !!d.isSuperAdmin })).catch(() => {});
  }, []);

  // Photo carousel
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

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
          const sorted = [...d.item.bids].sort(
            (a: Item["bids"][0], b: Item["bids"][0]) =>
              new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
          );
          // Fix #1: only show last 5 bids
          setLiveBids(sorted.reverse().slice(0, 5).map((b: Item["bids"][0]) => ({
            user: assignBidder(b.bidder ?? b.clerkUserId ?? ""),
            amount: b.amount,
            time: new Date(b.placedAt).toLocaleTimeString(),
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
        // Fix #5: detect beaten proxy and auto-reset to set form
        if (hadProxy && !d.userProxy) {
          setProxyWasBeaten(true);
        }
        // Transient "you've been outbid" flash — fires when the user's max bid was
        // just beaten, OR they were the leader and just lost the lead.
        const lostLead = wasWinningRef.current && d.isWinning === false;
        if ((hadProxy && !d.userProxy) || lostLead) {
          setOutbidFlash(true);
          setTimeout(() => setOutbidFlash(false), 3000);
        }
        wasWinningRef.current = !!d.isWinning;
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
      setItem(prev => prev ? { ...prev, currentBid: data.amount } : prev);
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
      // Fix #4 + #5: re-fetch proxy status on every bid to detect beaten proxy + winning state
      refreshProxyStatus();
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

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`item-${itemId}`);
      pusher.disconnect();
    };
  }, [itemId, refreshProxyStatus]);

  // Fix #7: auto-refresh 75s after bidding ends (to pick up cron job results)
  const handleExpire = useCallback(() => {
    setBiddingEnded(true);
    setTimeout(() => window.location.reload(), 75_000);
  }, []);

  // Manual bid handler
  const handleBid = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const amount = parseFloat(bidAmount);
    const currentBid = item?.currentBid || 0;
    const minBid = currentBid > 0 ? getNextValidBid(currentBid) : Math.ceil(item?.startingBid || 0);
    if (!bidAmount || amount < minBid) {
      setMessage({ text: `Minimum bid is $${minBid.toLocaleString()}`, type: "error" });
      return;
    }
    if (!Number.isInteger(amount)) {
      setMessage({ text: "Whole dollars only — no cents.", type: "error" });
      return;
    }

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
        setBidAmount("");
        if (data.proxyFired) {
          setMessage({ text: `Bid of $${amount.toLocaleString()} placed — instantly outbid by an active max bid.`, type: "error" });
        } else {
          setMessage({ text: `Bid of $${amount.toLocaleString()} placed!`, type: "success" });
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
        setProxyWasBeaten(false);
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
        setProxyWasBeaten(false);
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
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
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
          <h1 className="text-2xl font-bold mb-2">Item not found</h1>
          <p className="text-[#6f5b46] text-sm mb-6">This item may have been removed or the link is incorrect.</p>
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
  // Fix #2: use getProxySuggestions — jumps are far apart so they can't accidentally reveal a competing proxy's max
  const proxySuggestions = getProxySuggestions(item.currentBid || 0, 4);
  const auctionClosed = item.auction?.status === "CLOSED" || item.auction?.status === "SETTLED";
  const itemSold = item.status === "SOLD" || item.status === "PENDING_PICKUP" || item.status === "PICKED_UP";
  const itemNotActive = item.status !== "ACTIVE";
  const biddingLocked = auctionClosed || itemSold || itemNotActive || biddingEnded;
  // Fix #4: determine if current user is winning (only show when signed in)
  const showWinning = isSignedIn && isLoaded && isWinning && !biddingEnded;

  return (
    <main className="min-h-screen bg-[#f1e7d5] text-[#241a12]">
      {/* Transient "you've been outbid" flash */}
      {outbidFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] nb-toast">
          <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
            You&apos;ve been outbid by a higher max bid
          </div>
        </div>
      )}

      {/* Breadcrumb / back link */}
      <div className="max-w-6xl mx-auto px-6 sm:px-8 pt-4 flex items-center gap-2 text-sm min-w-0">
        <Link href={`/${orgSlug}/${auctionSlug}`} className="text-[#8a7559] hover:text-[#241a12] shrink-0 flex items-center gap-1 transition-colors text-sm font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
          Back to auction
        </Link>
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

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
        {/* Left: photos */}
        <div>
          {/* Main photo with swipe support */}
          <div
            className="w-full aspect-square bg-white rounded-2xl overflow-hidden mb-3 flex items-center justify-center relative select-none"
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
              <div className="text-[#8a7559] text-sm">No photo</div>
            )}
            {/* Prev / Next arrows */}
            {item.photos.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev - 1 + item.photos.length) % item.photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Previous photo"
                >
                  <svg className="w-4 h-4 text-[#4a3a2b]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M10 4L6 8l4 4" />
                  </svg>
                </button>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev + 1) % item.photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Next photo"
                >
                  <svg className="w-4 h-4 text-[#4a3a2b]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                {/* Dot indicators */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {item.photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhotoIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === selectedPhotoIdx ? "bg-[#6c4d39]" : "bg-[#b3a085]"}`}
                      aria-label={`Go to photo ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Thumbnails */}
          {item.photos.length > 1 && (
            <div className="grid grid-cols-5 gap-1.5">
              {item.photos.map((photo, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPhotoIdx(i)}
                  className={`relative aspect-square bg-white rounded-lg overflow-hidden flex items-center justify-center border-2 transition-colors ${
                    i === selectedPhotoIdx ? "border-[#6c4d39]" : "border-transparent hover:border-[#6c4d39]/40"
                  }`}
                  aria-label={`Photo ${i + 1}`}
                >
                  <Image src={photo.url} alt={`Photo ${i + 1}`} fill sizes="64px" className="object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: bidding */}
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {item.category && (
              <span className="text-xs text-[#6c4d39] bg-[#6c4d39]/10 border border-[#6c4d39]/20 px-2.5 py-1 rounded-full font-medium">{item.category}</span>
            )}
            <span className="text-xs text-[#6f5b46] bg-[#efe3d0] border border-[#e3d6bf] px-2.5 py-1 rounded-full capitalize font-medium">
              {item.condition.replace("_", " ").toLowerCase()}
            </span>
            {item.taxDeductible && (
              <span className="text-xs text-[#6c4d39] bg-[#6c4d39]/10 border border-[#6c4d39]/20 px-2.5 py-1 rounded-full font-medium">Tax Deductible</span>
            )}
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">{item.title}</h1>
          {item.description && <ExpandableDescription text={item.description} />}

          {/* Countdown */}
          {effectiveEndAt && !auctionClosed && !itemSold && !itemNotActive && (
            <div className={`rounded-2xl px-4 py-3 mb-6 flex items-center justify-between border transition-all ${
              biddingEnded
                ? "bg-white border-[#e3d6bf]"
                : "bg-[#f6ecda] border-[#6c4d39]/25"
            }`}>
              <span className="text-[#8a7559] text-sm font-medium">
                {biddingEnded ? "Bidding ended" : "Time remaining"}
              </span>
              {!biddingEnded ? (
                <Countdown endAt={effectiveEndAt} onExpire={handleExpire} />
              ) : (
                <span className="text-[#8a7559] font-semibold text-sm">Refreshing results shortly…</span>
              )}
            </div>
          )}

          {/* Retail value */}
          {item.retailValue && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#f6ecda] border border-[#6c4d39]/25 rounded-xl p-4">
                <div className="text-[#6c4d39] text-xs font-semibold uppercase tracking-wide mb-1">Retail Value</div>
                <div className="text-[#563e2c] font-extrabold text-xl">${item.retailValue.toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* ── Unified bidding card: Max Bid (primary) + manual bid (secondary) ── */}
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-4 sm:p-6 mb-6 shadow-[0_0_25px_rgba(108,77,57,0.04)]">

            {/* Current bid header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[#8a7559] text-sm">{item.currentBid > 0 ? "Current Bid" : "Starting Bid"}</div>
                <div className="text-[#6c4d39] font-extrabold text-3xl sm:text-4xl">${currentBid.toLocaleString()}</div>
                {showWinning && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs bg-[#6c4d39]/20 text-[#c47b3e] border border-[#6c4d39]/30 px-2.5 py-0.5 rounded-full font-semibold">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 5H1V3h2M9 5h2V3h-2M3 5h6v3a3 3 0 0 1-6 0V5zM4 11h4M6 8v3" />
                      </svg>
                      You&apos;re Winning
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <div>
                  <div className="text-[#8a7559] text-sm">Bids</div>
                  <div className="text-[#241a12] font-bold text-xl">{item.bids?.length ?? liveBids.length}</div>
                </div>
                {hasActiveProxy && (
                  <span className="text-xs bg-[#6c4d39]/15 text-[#563e2c] px-2 py-0.5 rounded-full font-medium">
                    Max Bid Active
                  </span>
                )}
              </div>
            </div>

            {biddingLocked ? (
              <div className="bg-[#efe3d0] rounded-xl px-4 py-3 text-center text-[#6f5b46]">
                {itemSold
                  ? "This item has been sold."
                  : auctionClosed
                  ? "Bidding has closed for this auction."
                  : itemNotActive
                  ? "This item is not currently available for bidding."
                  : "Bidding for this item has ended."}
              </div>
            ) : !isLoaded ? null : !isSignedIn ? (
              <div className="text-center">
                <p className="text-[#6f5b46] text-sm mb-3">You must be signed in to place a bid.</p>
                <SignInButton mode="modal">
                  <button className="w-full bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold py-3 rounded-xl">
                    Sign In to Bid
                  </button>
                </SignInButton>
              </div>
            ) : (
              <>
                {/* ═══════════════════════════════════════════════════════════
                    MAX BID — PRIMARY option
                ═══════════════════════════════════════════════════════════ */}
                <div className="bg-[#f6ecda] border-2 border-[#6c4d39]/30 rounded-2xl p-4 mb-5">
                  {/* section header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <div>
                        <h3 className="font-bold text-sm text-[#241a12]">Set a Max Bid</h3>
                        <p className="text-[10px] text-[#8a7559] leading-tight mt-0.5">We auto-bid for you up to your limit</p>
                      </div>
                      <button
                        onClick={() => setShowMaxBidExplainer(true)}
                        aria-label="Learn how max bidding works"
                        className="w-5 h-5 rounded-full bg-[#6c4d39]/20 text-[#6c4d39] text-xs font-bold flex items-center justify-center hover:bg-[#6c4d39]/35 transition-colors leading-none shrink-0"
                      >
                        ?
                      </button>
                    </div>
                    <span className="text-[11px] font-semibold text-[#6c4d39] bg-[#6c4d39]/10 px-2 py-0.5 rounded-full shrink-0">
                      Recommended
                    </span>
                  </div>

                  {proxyMessage && (
                    <div className={`text-sm mb-3 px-3 py-2 rounded-lg ${
                      proxyMessage.type === "success" ? "bg-[#6c4d39]/20 text-[#6c4d39]" : "bg-red-500/20 text-red-600"
                    }`}>
                      {proxyMessage.text}
                    </div>
                  )}

                  {userProxy ? (
                    /* Active max bid display */
                    <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
                      <div>
                        <p className="text-[#4a3a2b] text-sm font-medium">
                          Your max bid:{" "}
                          <span className="text-[#6c4d39] font-bold text-base">${userProxy.maxAmount.toLocaleString()}</span>
                        </p>
                        <p className="text-[#8a7559] text-xs mt-0.5">We&apos;re auto-bidding on your behalf up to this amount.</p>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
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
                      {proxyWasBeaten && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-600">
                          Your max bid was outbid. Set a new maximum to get back in the lead.
                        </div>
                      )}
                      <p className="text-[#8a7559] text-xs mb-2">Quick picks:</p>
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {proxySuggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => setProxyAmount(String(s))}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
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

                {/* ═══════════════════════════════════════════════════════════
                    Divider
                ═══════════════════════════════════════════════════════════ */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-[#e3d6bf]" />
                  <span className="text-xs text-[#b3a085]">or bid a specific amount</span>
                  <div className="flex-1 h-px bg-[#e3d6bf]" />
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    MANUAL BID — secondary option (its own card for separation)
                ═══════════════════════════════════════════════════════════ */}
                <div className="bg-white border border-[#e3d6bf] rounded-2xl p-4">
                  <h3 className="font-bold text-sm text-[#241a12] mb-1">Bid a specific amount</h3>
                  <div className="text-[#8a7559] text-xs mb-3">{item.currentBid > 0 ? `Minimum next bid: $${minBid.toLocaleString()}` : `Be the first bidder — start at $${minBid.toLocaleString()}`}</div>
                  {message && (
                    <div className={`text-sm mb-3 px-3 py-2 rounded-lg ${
                      message.type === "success" ? "bg-[#6c4d39]/20 text-[#6c4d39]" : "bg-red-500/20 text-red-600"
                    }`}>
                      {message.text}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={bidAmount}
                      min={minBid}
                      step="1"
                      onChange={e => setBidAmount(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !placing && handleBid()}
                      placeholder={`Enter $${minBid.toLocaleString()} or more`}
                      className="flex-1 bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]"
                    />
                    <button
                      onClick={handleBid}
                      disabled={placing}
                      className="bg-[#4a3a2b] hover:bg-[#241a12] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-colors shrink-0"
                    >
                      {placing ? "Placing…" : "Place Bid"}
                    </button>
                  </div>
                  {/* Total-due preview */}
                  {(() => {
                    const feePct = item.org?.platformFeePercent ?? 0;
                    const taxPct = item.org?.taxPercent ?? 0;
                    const entered = parseFloat(bidAmount);
                    const baseBid = Number.isFinite(entered) && entered > 0 ? entered : minBid;
                    const bidCents = Math.round(baseBid * 100);
                    const feeCents = Math.round(baseBid * feePct / 100 * 100);
                    const taxCents = Math.round((bidCents + feeCents) * taxPct / 100);
                    const totalCents = bidCents + feeCents + taxCents;
                    const fmt = (c: number) =>
                      (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="mt-3 bg-[#efe3d0]/60 border border-[#cdbda3]/60 rounded-xl px-4 py-3 text-xs space-y-1">
                        <div className="flex justify-between text-[#6f5b46]">
                          <span>{Number.isFinite(entered) && entered > 0 ? "Your bid" : "Minimum bid"}</span>
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
                        <div className="flex justify-between text-[#241a12] font-bold border-t border-[#cdbda3]/60 pt-1.5 mt-1.5">
                          <span>Total if you win</span>
                          <span className="tabular-nums">${fmt(totalCents)}</span>
                        </div>
                        <p className="text-[#8a7559] pt-0.5">
                          Charged automatically to your card on file when the auction closes.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Payment method indicator (shared) */}
                {item.org?.stripeChargesEnabled && hasCard !== null && (
                  <div className="flex items-center justify-between mt-4 px-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#8a7559]">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                        <rect x="2" y="5" width="16" height="12" rx="2" />
                        <path d="M2 9h16" />
                      </svg>
                      {hasCard
                        ? cardBrand
                          ? <span className="text-[#6f5b46]">{cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} ···· {cardLast4}</span>
                          : <span className="text-[#6f5b46]">Card on file</span>
                        : <span className="text-amber-600 font-medium">No card on file — add one to bid</span>
                      }
                    </div>
                    <button
                      onClick={() => setShowCardModal(true)}
                      className="text-xs text-[#6c4d39] hover:text-[#c47b3e] font-medium transition-colors"
                    >
                      {hasCard ? "Update card" : "Add card"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Max Bid explainer modal */}
          {showMaxBidExplainer && (
            <MaxBidExplainerModal onClose={() => setShowMaxBidExplainer(false)} />
          )}

          {/* Bid history — Fix #1: capped at 5 via state */}
          {liveBids.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Recent Bids</h3>
              <div className="space-y-2">
                {liveBids.map((bid, i) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[#6f5b46]">Bid {liveBids.length - i}</span>
                      {bid.isProxy && (
                        <span className="text-xs text-[#6c4d39] bg-[#6c4d39]/10 px-1.5 py-0.5 rounded">auto</span>
                      )}
                    </div>
                    <span className="text-[#6c4d39] font-semibold">${bid.amount.toLocaleString()}</span>
                    <span className="text-[#8a7559] text-sm">{bid.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer flourish */}
      <div className="flex justify-center pb-10">
        <BranchDivider className="w-40 h-5 opacity-80" />
      </div>

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
                text: "Card saved! Click Place Bid to confirm your bid.",
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
