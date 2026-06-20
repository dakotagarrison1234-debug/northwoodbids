"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import UserMenu from "@/app/components/UserMenu";
import Pusher from "pusher-js";
import Countdown from "@/app/components/Countdown";
import { getNextValidBid, getProxySuggestions } from "@/lib/bidIncrements";
import CardSetupModal from "@/app/components/CardSetupModal";
import MaxBidExplainerModal from "@/app/components/MaxBidExplainerModal";

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
      userId: string;
      isProxy?: boolean;
      hasActiveProxy?: boolean;
      newEndAt?: string;
    }) => {
      setItem(prev => prev ? { ...prev, currentBid: data.amount } : prev);
      // Fix #1: cap live bids at 5
      setLiveBids(prev => [
        {
          user: assignBidder(data.userId),
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
    const minBid = currentBid > 0 ? getNextValidBid(currentBid) : (item?.startingBid || 0);
    if (!bidAmount || amount < minBid) {
      setMessage({ text: `Minimum bid is $${minBid.toLocaleString()}`, type: "error" });
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
    const minProxy = currentBid > 0 ? getNextValidBid(currentBid) : (item?.startingBid || 1);
    if (!proxyAmount || isNaN(amount) || amount < minProxy) {
      setProxyMessage({ text: `Max bid must be at least $${minProxy.toLocaleString()}`, type: "error" });
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
        setUserProxy(null);
        setProxyWasBeaten(false);
        setProxyMessage({ text: "Max bid cancelled. Your existing bids remain active.", type: "success" });
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
      <main className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex items-center justify-center">
        <p className="text-[#6b6659]">Loading...</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex items-center justify-center px-5">
        <div className="text-center max-w-sm w-full">
          <h1 className="text-2xl font-bold mb-2">Item not found</h1>
          <p className="text-[#6b6659] text-sm mb-6">This item may have been removed or the link is incorrect.</p>
          <div className="flex flex-col gap-2.5">
            <Link href={`/${orgSlug}/${auctionSlug}`} className="w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors">
              Back to auction
            </Link>
            <Link href="/auctions" className="w-full border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-3 rounded-xl transition-colors">
              Browse all auctions
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currentBid = item.currentBid || item.startingBid;
  const minBid = item.currentBid > 0 ? getNextValidBid(item.currentBid) : item.startingBid;
  const minProxy = item.currentBid > 0 ? getNextValidBid(item.currentBid) : (item.startingBid > 0 ? item.startingBid : 1);
  // Fix #2: use getProxySuggestions — jumps are far apart so they can't accidentally reveal a competing proxy's max
  const proxySuggestions = getProxySuggestions(item.currentBid || 0, 4);
  const auctionClosed = item.auction?.status === "CLOSED" || item.auction?.status === "SETTLED";
  const itemSold = item.status === "SOLD" || item.status === "PENDING_PICKUP" || item.status === "PICKED_UP";
  const itemNotActive = item.status !== "ACTIVE";
  const biddingLocked = auctionClosed || itemSold || itemNotActive || biddingEnded;
  // Fix #4: determine if current user is winning (only show when signed in)
  const showWinning = isSignedIn && isLoaded && isWinning && !biddingEnded;

  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916]">
      <header className="border-b border-[#e5e0d5]/60 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 bg-[#faf8f4]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link href="/" className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#09a7ad] to-[#0bbcc2] bg-clip-text text-transparent shrink-0">Northwood Bids</Link>
          <span className="text-[#b0a99a] hidden sm:inline">/</span>
          <Link href={`/${orgSlug}`} className="text-[#8c8778] hover:text-[#1a1916] capitalize hidden sm:inline truncate max-w-[100px] transition-colors">
            {orgSlug.replace(/-/g, " ")}
          </Link>
          <span className="text-[#b0a99a] hidden sm:inline">/</span>
          <Link href={`/${orgSlug}/${auctionSlug}`} className="text-[#8c8778] hover:text-[#1a1916] capitalize hidden sm:inline truncate max-w-[100px] transition-colors">
            {auctionSlug.replace(/-/g, " ")}
          </Link>
          <Link href={`/${orgSlug}/${auctionSlug}`} className="text-[#8c8778] hover:text-[#1a1916] sm:hidden shrink-0 flex items-center gap-1 transition-colors text-xs font-medium">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M8 2L4 6l4 4" /></svg>
            Auction
          </Link>
          <span className="text-[#b0a99a] hidden sm:inline">/</span>
          <span className="text-[#4a4640] truncate hidden sm:inline">{item.title}</span>
        </div>
        <UserMenu />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
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
              <img
                src={item.photos[selectedPhotoIdx]?.url || item.photos[0].url}
                alt={item.title}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-[#8c8778] text-sm">No photo</div>
            )}
            {/* Prev / Next arrows */}
            {item.photos.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev - 1 + item.photos.length) % item.photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Previous photo"
                >
                  <svg className="w-4 h-4 text-[#4a4640]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M10 4L6 8l4 4" />
                  </svg>
                </button>
                <button
                  onClick={() => setSelectedPhotoIdx(prev => (prev + 1) % item.photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                  aria-label="Next photo"
                >
                  <svg className="w-4 h-4 text-[#4a4640]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                {/* Dot indicators */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {item.photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhotoIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === selectedPhotoIdx ? "bg-[#09a7ad]" : "bg-[#b0a99a]"}`}
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
                  className={`aspect-square bg-white rounded-lg overflow-hidden flex items-center justify-center border-2 transition-colors ${
                    i === selectedPhotoIdx ? "border-[#09a7ad]" : "border-transparent hover:border-[#09a7ad]/40"
                  }`}
                  aria-label={`Photo ${i + 1}`}
                >
                  <img src={photo.url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: bidding */}
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {item.category && (
              <span className="text-xs text-[#09a7ad] bg-[#09a7ad]/10 border border-[#09a7ad]/20 px-2.5 py-1 rounded-full font-medium">{item.category}</span>
            )}
            <span className="text-xs text-[#6b6659] bg-[#f2efe8] border border-[#e5e0d5] px-2.5 py-1 rounded-full capitalize font-medium">
              {item.condition.replace("_", " ").toLowerCase()}
            </span>
            {item.taxDeductible && (
              <span className="text-xs text-[#09a7ad] bg-[#09a7ad]/10 border border-[#09a7ad]/20 px-2.5 py-1 rounded-full font-medium">Tax Deductible</span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{item.title}</h1>
          {item.description && <p className="text-[#6b6659] mb-6">{item.description}</p>}

          {/* Countdown */}
          {effectiveEndAt && !auctionClosed && !itemSold && !itemNotActive && (
            <div className={`rounded-2xl px-4 py-3 mb-6 flex items-center justify-between border transition-all ${
              biddingEnded
                ? "bg-white border-[#e5e0d5]"
                : "bg-[#f0fafa] border-[#09a7ad]/25"
            }`}>
              <span className="text-[#8c8778] text-sm font-medium">
                {biddingEnded ? "Bidding ended" : "Time remaining"}
              </span>
              {!biddingEnded ? (
                <Countdown endAt={effectiveEndAt} onExpire={handleExpire} />
              ) : (
                <span className="text-[#8c8778] font-semibold text-sm">Refreshing results shortly…</span>
              )}
            </div>
          )}

          {/* Donor / retail value */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {item.retailValue && (
              <div className="bg-[#e8f8f8] border border-[#09a7ad]/25 rounded-xl p-4">
                <div className="text-[#09a7ad] text-xs font-semibold uppercase tracking-wide mb-1">Retail Value</div>
                <div className="text-[#0a7f84] font-extrabold text-xl">${item.retailValue.toLocaleString()}</div>
              </div>
            )}
            {item.donorName && (
              <div className="bg-[#f0fafa] border border-[#09a7ad]/20 rounded-xl p-4">
                <div className="text-[#09a7ad] text-xs font-semibold uppercase tracking-wide mb-1">Donated by</div>
                <div className="text-[#1a1916] font-bold text-sm leading-snug">{item.donorName}</div>
              </div>
            )}
          </div>

          {/* ── Unified bidding card: Max Bid (primary) + manual bid (secondary) ── */}
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4 sm:p-6 mb-6 shadow-[0_0_25px_rgba(9,167,173,0.04)]">

            {/* Current bid header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[#8c8778] text-sm">{item.currentBid > 0 ? "Current Bid" : "Starting Bid"}</div>
                <div className="text-[#09a7ad] font-bold text-3xl sm:text-4xl">${currentBid.toLocaleString()}</div>
                {showWinning && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs bg-[#09a7ad]/20 text-[#0bbcc2] border border-[#09a7ad]/30 px-2.5 py-0.5 rounded-full font-semibold">
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
                  <div className="text-[#8c8778] text-sm">Bids</div>
                  <div className="text-[#1a1916] font-bold text-xl">{liveBids.length}</div>
                </div>
                {hasActiveProxy && (
                  <span className="text-xs bg-[#09a7ad]/15 text-[#0a8a8f] px-2 py-0.5 rounded-full font-medium">
                    Max Bid Active
                  </span>
                )}
              </div>
            </div>

            {biddingLocked ? (
              <div className="bg-[#f2efe8] rounded-xl px-4 py-3 text-center text-[#6b6659]">
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
                <p className="text-[#6b6659] text-sm mb-3">You must be signed in to place a bid.</p>
                <SignInButton mode="modal">
                  <button className="w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl">
                    Sign In to Bid
                  </button>
                </SignInButton>
              </div>
            ) : (
              <>
                {/* ═══════════════════════════════════════════════════════════
                    MAX BID — PRIMARY option
                ═══════════════════════════════════════════════════════════ */}
                <div className="bg-[#f0fafa] border border-[#09a7ad]/25 rounded-xl p-3 mb-4">
                  {/* section header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <div>
                        <h3 className="font-bold text-sm text-[#1a1916]">Set a Max Bid</h3>
                        <p className="text-[10px] text-[#8c8778] leading-tight mt-0.5">We auto-bid for you up to your limit</p>
                      </div>
                      <button
                        onClick={() => setShowMaxBidExplainer(true)}
                        aria-label="Learn how max bidding works"
                        className="w-5 h-5 rounded-full bg-[#09a7ad]/20 text-[#09a7ad] text-xs font-bold flex items-center justify-center hover:bg-[#09a7ad]/35 transition-colors leading-none shrink-0"
                      >
                        ?
                      </button>
                    </div>
                    <span className="text-[11px] font-semibold text-[#09a7ad] bg-[#09a7ad]/10 px-2 py-0.5 rounded-full shrink-0">
                      Recommended
                    </span>
                  </div>

                  {proxyMessage && (
                    <div className={`text-sm mb-3 px-3 py-2 rounded-lg ${
                      proxyMessage.type === "success" ? "bg-[#09a7ad]/20 text-[#09a7ad]" : "bg-red-500/20 text-red-600"
                    }`}>
                      {proxyMessage.text}
                    </div>
                  )}

                  {userProxy ? (
                    /* Active max bid display */
                    <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
                      <div>
                        <p className="text-[#4a4640] text-sm font-medium">
                          Your max bid:{" "}
                          <span className="text-[#09a7ad] font-bold text-base">${userProxy.maxAmount.toLocaleString()}</span>
                        </p>
                        <p className="text-[#8c8778] text-xs mt-0.5">We&apos;re auto-bidding on your behalf up to this amount.</p>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <button
                          onClick={() => { setProxyAmount(String(userProxy.maxAmount)); setUserProxy(null); }}
                          className="text-xs text-[#6b6659] hover:text-[#1a1916] border border-[#d4cfc4] hover:border-[#b0a99a] px-3 py-1.5 rounded-lg transition-colors"
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
                      <p className="text-[#8c8778] text-xs mb-2">Quick picks:</p>
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {proxySuggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => setProxyAmount(String(s))}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                              proxyAmount === String(s)
                                ? "bg-[#09a7ad] border-[#09a7ad] text-white"
                                : "bg-white border-[#d4cfc4] text-[#4a4640] hover:bg-[#f2efe8]"
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
                          className="w-full bg-white border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                        />
                        <button
                          onClick={handleSetProxy}
                          disabled={proxyPlacing}
                          className="w-full bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(9,167,173,0.3)]"
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
                        const totalCents =
                          Math.round(amt * 100) +
                          Math.round(amt * feePct / 100 * 100) +
                          Math.round(amt * taxPct / 100 * 100);
                        return (
                          <p className="text-xs text-[#8c8778] mt-2">
                            Worst case if your max wins:{" "}
                            <span className="text-[#4a4640] font-semibold tabular-nums">
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
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-[#e5e0d5]" />
                  <span className="text-xs text-[#b0a99a]">or bid a specific amount</span>
                  <div className="flex-1 h-px bg-[#e5e0d5]" />
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    MANUAL BID — secondary option
                ═══════════════════════════════════════════════════════════ */}
                <div>
                  <div className="text-[#8c8778] text-xs mb-3">{item.currentBid > 0 ? `Minimum next bid: $${minBid.toLocaleString()}` : `Be the first bidder — start at $${minBid.toLocaleString()}`}</div>
                  {message && (
                    <div className={`text-sm mb-3 px-3 py-2 rounded-lg ${
                      message.type === "success" ? "bg-[#09a7ad]/20 text-[#09a7ad]" : "bg-red-500/20 text-red-600"
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
                      className="flex-1 bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
                    />
                    <button
                      onClick={handleBid}
                      disabled={placing}
                      className="bg-[#4a4640] hover:bg-[#1a1916] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-colors shrink-0"
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
                    const taxCents = Math.round(baseBid * taxPct / 100 * 100);
                    const totalCents = bidCents + feeCents + taxCents;
                    const fmt = (c: number) =>
                      (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="mt-3 bg-[#f2efe8]/60 border border-[#d4cfc4]/60 rounded-xl px-4 py-3 text-xs space-y-1">
                        <div className="flex justify-between text-[#6b6659]">
                          <span>{Number.isFinite(entered) && entered > 0 ? "Your bid" : "Minimum bid"}</span>
                          <span className="tabular-nums">${fmt(bidCents)}</span>
                        </div>
                        {feePct > 0 && (
                          <div className="flex justify-between text-[#6b6659]">
                            <span>Buyer premium ({feePct}%)</span>
                            <span className="tabular-nums">${fmt(feeCents)}</span>
                          </div>
                        )}
                        {taxPct > 0 && (
                          <div className="flex justify-between text-[#6b6659]">
                            <span>Tax ({taxPct}%)</span>
                            <span className="tabular-nums">${fmt(taxCents)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#1a1916] font-bold border-t border-[#d4cfc4]/60 pt-1.5 mt-1.5">
                          <span>Total if you win</span>
                          <span className="tabular-nums">${fmt(totalCents)}</span>
                        </div>
                        <p className="text-[#8c8778] pt-0.5">
                          Charged automatically to your card on file when the auction closes.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Payment method indicator (shared) */}
                {item.org?.stripeChargesEnabled && hasCard !== null && (
                  <div className="flex items-center justify-between mt-4 px-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#8c8778]">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                        <rect x="2" y="5" width="16" height="12" rx="2" />
                        <path d="M2 9h16" />
                      </svg>
                      {hasCard
                        ? cardBrand
                          ? <span className="text-[#6b6659]">{cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} ···· {cardLast4}</span>
                          : <span className="text-[#6b6659]">Card on file</span>
                        : <span className="text-amber-600 font-medium">No card on file — add one to bid</span>
                      }
                    </div>
                    <button
                      onClick={() => setShowCardModal(true)}
                      className="text-xs text-[#09a7ad] hover:text-[#0bbcc2] font-medium transition-colors"
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
                      <span className="text-[#6b6659]">{bid.user}</span>
                      {bid.isProxy && (
                        <span className="text-xs text-[#09a7ad] bg-[#09a7ad]/10 px-1.5 py-0.5 rounded">auto</span>
                      )}
                    </div>
                    <span className="text-[#09a7ad] font-semibold">${bid.amount.toLocaleString()}</span>
                    <span className="text-[#8c8778] text-sm">{bid.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Card setup modal — shown when user tries to bid without a card on file */}
      {showCardModal && (
        item.org?.stripeAccountId ? (
          <CardSetupModal
            orgId={item.org.id}
            stripeAccountId={item.org.stripeAccountId}
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
          <div className="fixed inset-0 z-50 bg-[#faf8f4]/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-white border border-[#e5e0d5] rounded-2xl p-6 w-full max-w-sm text-center">
              <p className="text-[#4a4640] mb-2 font-semibold">Payments not yet enabled</p>
              <p className="text-[#8c8778] text-sm mb-5">This organization hasn&apos;t finished setting up payments. Try again later.</p>
              <button onClick={() => setShowCardModal(false)} className="w-full bg-[#f2efe8] hover:bg-[#e8e4dc] text-[#1a1916] py-3 rounded-xl text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        )
      )}
    </main>
  );
}
