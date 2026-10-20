"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

type Filter = "all" | "blocked";

export default function BiddersPage() {
  return (
    <Suspense fallback={null}>
      <BiddersPageInner />
    </Suspense>
  );
}

function BiddersPageInner() {
  const searchParams = useSearchParams();
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  // ?q= lets the report (and anything else) deep-link straight to one bidder.
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";

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

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setMyRole(d.role ?? null)).catch(() => {});
  }, []);

  // Debounced search. Also does the first load (q is "" on mount), so there's no
  // separate mount fetch — the old version fetched twice on open.
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
    setNotice(null);
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
        setNotice(data.error || "Could not update that bidder.");
      }
    } catch {
      setNotice("Something went wrong. Please try again.");
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

  const shown = bidders.filter((b) => (filter === "blocked" ? b.blocked : true));
  const blockedCount = bidders.filter((b) => b.blocked).length;

  const FILTERS: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Everyone", count: bidders.length },
    { value: "blocked", label: "Blocked", count: blockedCount },
  ];

  return (
    <>
      <PageHeader title="Bidders" />

      <PageBody>
        <SearchBox
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone or email"
        />

        <Segmented<Filter> value={filter} onChange={setFilter} options={FILTERS} />

        {notice && <Notice tone="red">{notice}</Notice>}

        <Panel>
          {loading ? (
            <p className="px-4 py-8 text-center text-[#8a7559]">Loading…</p>
          ) : shown.length === 0 ? (
            <Empty text={filter === "blocked" ? "Nobody is blocked." : "No bidders found."} />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {shown.map((b) => {
                const busy = busyId === b.clerkUserId;
                const isMember = b.role != null;
                const open = openId === b.clerkUserId;
                const contact = [b.phone, b.email].filter(Boolean).join(" · ");
                return (
                  <li key={b.clerkUserId} className={b.blocked ? "bg-[#fbeae6]" : ""}>
                    <Row
                      tone={b.blocked ? "red" : undefined}
                      onClick={() => setOpenId(open ? null : b.clerkUserId)}
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

                    {open && (
                      <div className="px-4 pb-4 space-y-3">
                        {b.blocked && b.blockedReason && (
                          <p className="text-[15px] text-[#a1321f]">{b.blockedReason}</p>
                        )}

                        {/* Pickup location — the bidder normally sets this, but the owner can
                            override it here (it sticks until they or a customer change it). */}
                        {canManage && locations.length > 0 && (
                          <div className="flex items-center gap-3">
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

                        <div className="flex flex-wrap gap-2">
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

                          {/* Block only applies to plain bidders (not staff/owner). Roles are managed on Team. */}
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
                      </div>
                    )}
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
            <p className="text-[#241a12]">{confirmDialog.text}</p>
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
