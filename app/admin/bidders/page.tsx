"use client";
import { useState, useEffect, useCallback } from "react";
import { Pill, PageHeader, PageBody, SearchBox, Segmented, Panel, Row, Initials, Btn, Empty, Notice, Eyebrow } from "../ui";
import MessageSheet, { type MessageTarget } from "../MessageSheet";

interface Bidder {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  preferredPickupLocationId: string | null;
  createdAt: string;
  role: "OWNER" | "ADMIN" | "STAFF" | null;
}

type Filter = "all" | "blocked" | "staff";

export default function BiddersPage() {
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";

  const load = useCallback((query: string) => {
    setLoading(true);
    fetch(`/api/admin/bidders${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setBidders(d.bidders ?? []); setLocations(d.locations ?? []); })
      .catch(() => setBidders([]))
      .finally(() => setLoading(false));
  }, []);

  // Admin override of a bidder's pickup location (they normally set it themselves).
  const setBidderLocation = async (clerkUserId: string, locationId: string) => {
    if (!locationId) return;
    setBusyLoc(clerkUserId);
    try {
      const res = await fetch("/api/admin/pickup/set-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId, locationId }),
      });
      const d = await res.json();
      if (d.success) {
        setBidders((prev) => prev.map((b) => (b.clerkUserId === clerkUserId ? { ...b, preferredPickupLocationId: locationId } : b)));
      }
    } catch {
      /* non-critical */
    } finally {
      setBusyLoc(null);
    }
  };

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
    // Same mapping as the Team page so a role reads the same everywhere.
    return <Pill tone={role === "OWNER" ? "blue" : role === "ADMIN" ? "green" : "slate"}>{label}</Pill>;
  };

  // Filter by what you actually came here to do. Scanning 200 cards to find the
  // blocked people was the only way to answer "who's blocked?" before.
  const shown = bidders.filter((b) =>
    filter === "blocked" ? b.blocked : filter === "staff" ? b.role != null : true
  );
  const blockedCount = bidders.filter((b) => b.blocked).length;
  const staffCount = bidders.filter((b) => b.role != null).length;
  const atCap = bidders.length >= 200;

  const FILTERS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Everyone", count: bidders.length },
    { value: "blocked", label: "Blocked", count: blockedCount },
    { value: "staff", label: "Staff", count: staffCount },
  ];

  return (
    <>
      <PageHeader title="Bidders" sub="Block someone, or make them staff." />

      <PageBody>
        <SearchBox
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or phone…"
        />

        <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />

        {/* The API caps at 200. Silently dropping records is worse than saying so. */}
        {atCap && !q && (
          <Notice tone="amber">Showing the 200 most recent bidders. Use search to find anyone else.</Notice>
        )}

        <Panel>
          {loading ? (
            <p className="px-4 py-8 text-center text-[#8a7559]">Loading…</p>
          ) : shown.length === 0 ? (
            <Empty
              text={filter === "blocked" ? "Nobody is blocked." : filter === "staff" ? "No staff yet." : "No bidders found."}
              sub={filter === "blocked" ? "Blocked bidders show up here." : filter === "staff" ? "Make someone staff from the Everyone list." : q ? "Try a different name, email or phone." : "Bidders appear once they sign up."}
            />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {shown.map((b) => {
                const busy = busyId === b.clerkUserId;
                const isMember = b.role != null;
                const contact = [b.email, b.phone].filter(Boolean).join(" · ");
                return (
                  <li key={b.clerkUserId} className={b.blocked ? "bg-[#fbeae6]" : ""}>
                    <Row
                      tone={b.blocked ? "red" : undefined}
                      leading={<Initials name={b.name || b.email} />}
                      title={b.name || "Unnamed bidder"}
                      sub={contact || "No contact details"}
                      trailing={
                        (b.role || b.blocked) ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {roleBadge(b.role)}
                            {b.blocked && <Pill tone="red" dot>Blocked</Pill>}
                          </div>
                        ) : undefined
                      }
                    />
                    {b.blocked && b.blockedReason && (
                      <p className="px-4 pb-3 -mt-1 text-sm text-[#a1321f]">{b.blockedReason}</p>
                    )}

                    {/* Pickup location — the bidder normally sets this, but the owner can
                        override it here (it sticks until they or a customer change it). */}
                    {canManage && locations.length > 0 && (
                      <div className="px-4 pb-3 flex items-center gap-3">
                        <Eyebrow className="shrink-0">Pickup</Eyebrow>
                        <select
                          value={b.preferredPickupLocationId ?? ""}
                          disabled={busyLoc === b.clerkUserId}
                          onChange={(e) => setBidderLocation(b.clerkUserId, e.target.value)}
                          className="min-w-0 flex-1 max-w-[240px] min-h-[44px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-3 text-[#241a12] outline-none transition disabled:opacity-50"
                        >
                          <option value="" disabled>Not set — choose…</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                      {/* Text this customer directly. Owner/admin only, and only if
                          we have a number to text. */}
                      {canManage && b.phone && (
                        <Btn
                          tone="blue"
                          variant="outline"
                          size="sm"
                          onClick={() => setMsgTarget({ clerkUserId: b.clerkUserId, name: b.name, phone: b.phone })}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h12v8H5l-3 3V3z" /></svg>
                          Text
                        </Btn>
                      )}
                      {/* Role management (owner/admin only). Never for the owner row. */}
                      {b.role !== "OWNER" && canManage && (
                        <>
                          {!isMember && (
                            <Btn size="sm" onClick={() => askRole(b, "STAFF")} disabled={busy}>
                              Make staff
                            </Btn>
                          )}
                          {!isMember && isOwner && (
                            <Btn size="sm" variant="outline" onClick={() => askRole(b, "ADMIN")} disabled={busy}>
                              Make admin
                            </Btn>
                          )}
                          {isMember && isOwner && (
                            <Btn size="sm" tone="slate" variant="outline" onClick={() => askRole(b, null)} disabled={busy}>
                              Remove staff
                            </Btn>
                          )}
                        </>
                      )}

                      {/* Block only applies to plain bidders (not staff/owner). */}
                      {!isMember && (
                        <Btn
                          size="sm"
                          tone={b.blocked ? "slate" : "red"}
                          variant="outline"
                          onClick={() => toggleBlock(b)}
                          disabled={busy}
                        >
                          {busy ? "Working…" : b.blocked ? "Unblock" : "Block"}
                        </Btn>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </PageBody>

      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn tone="slate" variant="outline" full onClick={() => setConfirmDialog(null)}>
                Back
              </Btn>
              <Btn
                tone={confirmDialog.danger ? "red" : "leather"}
                full
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
              >
                {confirmDialog.confirmLabel}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
