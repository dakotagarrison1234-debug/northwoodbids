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
  role: "OWNER" | "ADMIN" | "STAFF" | null;
}

export default function BiddersPage() {
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";

  const load = useCallback((query: string) => {
    setLoading(true);
    fetch(`/api/admin/bidders${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setBidders(d.bidders ?? []))
      .catch(() => setBidders([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(""); }, [load]);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setMyRole(d.role ?? null)).catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const toggleBlock = (b: Bidder) => {
    const blocking = !b.blocked;
    const who = b.name || b.email || "this bidder";
    setConfirmDialog({
      text: blocking
        ? `Block ${who}? They won't be able to place bids or sign in until you unblock them.`
        : `Unblock ${who}? They'll be able to bid and sign in again.`,
      confirmLabel: blocking ? "Block" : "Unblock",
      danger: blocking,
      onConfirm: () => doBlock(b, blocking),
    });
  };

  const doBlock = async (b: Bidder, blocking: boolean) => {
    setBusyId(b.clerkUserId);
    try {
      const res = await fetch(`/api/admin/bidders/${b.clerkUserId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: blocking }),
      });
      const data = await res.json();
      if (data.success) {
        setBidders((prev) => prev.map((x) => (x.clerkUserId === b.clerkUserId ? { ...x, blocked: blocking } : x)));
      } else {
        alert(data.error || "Could not update that bidder.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const askRole = (b: Bidder, role: "STAFF" | "ADMIN" | null) => {
    const who = b.name || b.email || "this bidder";
    setConfirmDialog({
      text:
        role === null
          ? `Remove staff access from ${who}? They'll go back to being a regular bidder.`
          : role === "ADMIN"
          ? `Make ${who} an Admin? They'll be able to manage everything, including the team.`
          : `Make ${who} a Staff member? They'll be able to manage items and auctions.`,
      confirmLabel: role === null ? "Remove access" : role === "ADMIN" ? "Make Admin" : "Make Staff",
      danger: role === null,
      onConfirm: () => doRole(b, role),
    });
  };

  const doRole = async (b: Bidder, role: "STAFF" | "ADMIN" | null) => {
    setBusyId(b.clerkUserId);
    try {
      const res = await fetch(`/api/admin/bidders/${b.clerkUserId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success) {
        setBidders((prev) => prev.map((x) => (x.clerkUserId === b.clerkUserId ? { ...x, role: data.role ?? null } : x)));
      } else {
        alert(data.error || "Could not update that bidder's role.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const roleBadge = (role: Bidder["role"]) => {
    if (!role) return null;
    const label = role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "Staff";
    const cls =
      role === "OWNER"
        ? "bg-[#c47b3e]/15 text-[#8a4f1c] border-[#c47b3e]/30"
        : "bg-[#6c4d39]/12 text-[#6c4d39] border-[#6c4d39]/25";
    return <span className={`text-xs font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Bidders</h1>
        <p className="text-base text-[#6f5b46] mt-1">Search bidders, block troublemakers, or promote someone to staff with one tap.</p>
      </header>

      <div className="flex-1 px-6 sm:px-8 py-6 overflow-auto">
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
            {bidders.map((b) => {
              const busy = busyId === b.clerkUserId;
              const isMember = b.role != null;
              return (
                <div
                  key={b.clerkUserId}
                  className={`bg-white border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 ${
                    b.blocked ? "border-red-300 bg-red-50/40" : "border-[#e3d6bf]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold text-[#241a12]">{b.name || "Unnamed bidder"}</span>
                      {roleBadge(b.role)}
                      {b.blocked && (
                        <span className="text-xs font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">Blocked</span>
                      )}
                    </div>
                    <div className="text-sm text-[#6f5b46] mt-0.5 flex flex-wrap gap-x-3">
                      {b.email && <span>{b.email}</span>}
                      {b.phone && <span>{b.phone}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-wrap gap-2 sm:justify-end">
                    {/* Role management (owner/admin only). Never for the owner row. */}
                    {b.role !== "OWNER" && canManage && (
                      <>
                        {!isMember && (
                          <button
                            onClick={() => askRole(b, "STAFF")}
                            disabled={busy}
                            className="text-base font-semibold px-4 py-3 rounded-xl bg-[#6c4d39] hover:bg-[#563e2c] text-white transition-colors disabled:opacity-50"
                          >
                            Make staff
                          </button>
                        )}
                        {!isMember && isOwner && (
                          <button
                            onClick={() => askRole(b, "ADMIN")}
                            disabled={busy}
                            className="text-base font-semibold px-4 py-3 rounded-xl bg-white border border-[#cdbda3] hover:bg-[#efe3d0] text-[#4a3a2b] transition-colors disabled:opacity-50"
                          >
                            Make admin
                          </button>
                        )}
                        {isMember && isOwner && (
                          <button
                            onClick={() => askRole(b, null)}
                            disabled={busy}
                            className="text-base font-semibold px-4 py-3 rounded-xl bg-white border border-[#cdbda3] hover:bg-[#efe3d0] text-[#6f5b46] transition-colors disabled:opacity-50"
                          >
                            Remove staff
                          </button>
                        )}
                      </>
                    )}

                    {/* Block only applies to plain bidders (not staff/owner). */}
                    {!isMember && (
                      <button
                        onClick={() => toggleBlock(b)}
                        disabled={busy}
                        className={`text-base font-semibold px-5 py-3 rounded-xl transition-colors disabled:opacity-50 ${
                          b.blocked
                            ? "bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] text-[#241a12]"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {busy ? "Working…" : b.blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className={`flex-1 text-white font-semibold text-base py-3 rounded-xl ${confirmDialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#6c4d39] hover:bg-[#563e2c]"}`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
