"use client";
import { useState, useEffect, useCallback } from "react";
import { Pill } from "../ui";
import MessageSheet, { type MessageTarget } from "../MessageSheet";

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
  const [filter, setFilter] = useState<"all" | "blocked" | "staff">("all");
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);

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
    return <Pill tone={role === "OWNER" ? "blue" : "slate"}>{label}</Pill>;
  };

  // Filter by what you actually came here to do. Scanning 200 cards to find the
  // blocked people was the only way to answer "who's blocked?" before.
  const shown = bidders.filter((b) =>
    filter === "blocked" ? b.blocked : filter === "staff" ? b.role != null : true
  );
  const blockedCount = bidders.filter((b) => b.blocked).length;
  const staffCount = bidders.filter((b) => b.role != null).length;
  const atCap = bidders.length >= 200;

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "Everyone", count: bidders.length },
    { key: "blocked", label: "Blocked", count: blockedCount },
    { key: "staff", label: "Staff", count: staffCount },
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Bidders</h1>
        <p className="text-base text-slate-500 mt-0.5">Block someone, or make them staff.</p>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-5 overflow-auto max-w-2xl w-full">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 min-h-[48px] text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400"
        />

        <div className="flex gap-2 mt-3 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 min-h-[44px] rounded-xl border-2 font-bold text-base transition-colors ${
                filter === f.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {f.label}
              <span className={filter === f.key ? "text-slate-400 ml-1.5" : "text-slate-400 ml-1.5"}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* The API caps at 200. Silently dropping records is worse than saying so. */}
        {atCap && !q && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            Showing the 200 most recent bidders. Use search to find anyone else.
          </p>
        )}

        {loading ? (
          <p className="text-slate-500 text-base">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-slate-500 text-base">
            {filter === "blocked" ? "Nobody is blocked." : filter === "staff" ? "No staff yet." : "No bidders found."}
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((b) => {
              const busy = busyId === b.clerkUserId;
              const isMember = b.role != null;
              return (
                <div
                  key={b.clerkUserId}
                  className={`bg-white border-2 rounded-2xl p-4 ${
                    b.blocked ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-900 break-words">{b.name || "Unnamed bidder"}</span>
                      {roleBadge(b.role)}
                      {b.blocked && <Pill tone="red">Blocked</Pill>}
                    </div>
                    {/* break-all: a long email used to run straight out of the card. */}
                    <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                      {b.email && <div className="break-all">{b.email}</div>}
                      {b.phone && <div>{b.phone}</div>}
                    </div>
                    {b.blocked && b.blockedReason && (
                      <p className="text-sm text-red-700 mt-1.5">{b.blockedReason}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* Text this customer directly. Owner/admin only, and only if
                        we have a number to text. */}
                    {canManage && b.phone && (
                      <button
                        onClick={() => setMsgTarget({ clerkUserId: b.clerkUserId, name: b.name, phone: b.phone })}
                        className="inline-flex items-center gap-1.5 text-base font-bold px-4 min-h-[44px] rounded-xl bg-sky-600 active:bg-sky-700 text-white"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h12v8H5l-3 3V3z" /></svg>
                        Text
                      </button>
                    )}
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

      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />

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
