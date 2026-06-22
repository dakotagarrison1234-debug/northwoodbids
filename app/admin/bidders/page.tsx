"use client";
import { useState, useEffect, useCallback } from "react";

interface Bidder {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export default function BiddersPage() {
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    fetch(`/api/admin/bidders${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setBidders(d.bidders ?? []))
      .catch(() => setBidders([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(""); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const toggleBlock = async (b: Bidder) => {
    const blocking = !b.blocked;
    const who = b.name || b.email || "this bidder";
    if (blocking) {
      if (!confirm(`Block ${who}?\n\nThey will not be able to place bids or sign in until you unblock them.`)) return;
    } else {
      if (!confirm(`Unblock ${who}? They'll be able to bid and sign in again.`)) return;
    }
    setBusyId(b.clerkUserId);
    try {
      const res = await fetch(`/api/admin/bidders/${b.clerkUserId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: blocking }),
      });
      const data = await res.json();
      if (data.success) {
        setBidders((prev) =>
          prev.map((x) => (x.clerkUserId === b.clerkUserId ? { ...x, blocked: blocking } : x))
        );
      } else {
        alert(data.error || "Could not update that bidder.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Bidders</h1>
        <p className="text-base text-[#6f5b46] mt-1">Find a bidder and block anyone causing problems — blocking stops their bidding and sign-in.</p>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-6 overflow-auto">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="w-full max-w-md bg-white border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] mb-6"
        />

        {loading ? (
          <p className="text-[#8a7559] text-base">Loading…</p>
        ) : bidders.length === 0 ? (
          <p className="text-[#8a7559] text-base">No bidders found.</p>
        ) : (
          <div className="space-y-3">
            {bidders.map((b) => (
              <div
                key={b.clerkUserId}
                className={`bg-white border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  b.blocked ? "border-red-300 bg-red-50/40" : "border-[#e3d6bf]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-[#241a12]">{b.name || "Unnamed bidder"}</span>
                    {b.blocked && (
                      <span className="text-xs font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">Blocked</span>
                    )}
                  </div>
                  <div className="text-sm text-[#6f5b46] mt-0.5 flex flex-wrap gap-x-3">
                    {b.email && <span>{b.email}</span>}
                    {b.phone && <span>{b.phone}</span>}
                  </div>
                </div>
                <button
                  onClick={() => toggleBlock(b)}
                  disabled={busyId === b.clerkUserId}
                  className={`shrink-0 w-full sm:w-auto text-base font-semibold px-5 py-3 rounded-xl transition-colors disabled:opacity-50 ${
                    b.blocked
                      ? "bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12]"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {busyId === b.clerkUserId ? "Working…" : b.blocked ? "Unblock" : "Block"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
