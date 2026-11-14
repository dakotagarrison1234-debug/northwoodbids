"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Pill, PageHeader, PageBody, SearchBox, Segmented, Panel, Row, Initials, Btn, Empty, Notice, Eyebrow, Input } from "../ui";
import { fmtMoney } from "../format";
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

  // ── Bid Bucks: balance of the open bidder + the "Give Bid Bucks" sheet ──
  const [bucks, setBucks] = useState<Record<string, number>>({});
  const [giving, setGiving] = useState<Bidder | null>(null);
  const [giveAmt, setGiveAmt] = useState("10");
  const [giveNote, setGiveNote] = useState("");
  const [giveText, setGiveText] = useState(true);
  const [giveBusy, setGiveBusy] = useState(false);
  const [giveErr, setGiveErr] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  const loadBucks = useCallback((clerkUserId: string) => {
    fetch(`/api/admin/referrals/adjust?clerkUserId=${encodeURIComponent(clerkUserId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.balance === "number") setBucks((m) => ({ ...m, [clerkUserId]: d.balance })); })
      .catch(() => {});
  }, []);

  const openGive = (b: Bidder) => {
    setGiving(b); setGiveAmt("10"); setGiveNote(""); setGiveText(!!b.phone); setGiveErr(null);
  };
  const submitGive = async () => {
    if (!giving) return;
    const amount = Number(giveAmt);
    if (!Number.isFinite(amount) || amount <= 0) { setGiveErr("Enter an amount over $0."); return; }
    if (amount % 5 !== 0) { setGiveErr("Bid Bucks come in $5s. Try $5, $10, $15…"); return; }
    if (amount > 1000) { setGiveErr("That's over the $1,000 limit."); return; }
    setGiveBusy(true); setGiveErr(null);
    try {
      const res = await fetch("/api/admin/referrals/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: giving.clerkUserId, amount, reason: `gift${giveNote.trim() ? `: ${giveNote.trim()}` : ""}`, notify: giveText }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setGiveErr(d.error || "Couldn't add Bid Bucks."); setGiveBusy(false); return; }
      setBucks((m) => ({ ...m, [giving.clerkUserId]: d.balance }));
      const who = giving.name || giving.email || "them";
      setOkNote(`Gave ${who} ${fmtMoney(amount)} in Bid Bucks. New balance ${fmtMoney(d.balance)}.${giveText ? (d.texted ? " Texted them." : " The text didn't go out.") : ""}`);
      setTimeout(() => setOkNote(null), 6000);
      setGiving(null);
    } catch {
      setGiveErr("Something went wrong.");
    }
    setGiveBusy(false);
  };

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
        {okNote && <Notice tone="green">{okNote}</Notice>}

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
                      onClick={() => {
                        setOpenId(open ? null : b.clerkUserId);
                        if (!open && canManage) loadBucks(b.clerkUserId);
                      }}
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

                        {/* Bid Bucks — their balance, and a way to give them some. */}
                        {canManage && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <Eyebrow className="shrink-0">Bid Bucks</Eyebrow>
                            <span className="font-bold text-[#2f5d3a] tabular-nums">
                              {bucks[b.clerkUserId] === undefined ? "…" : fmtMoney(bucks[b.clerkUserId])}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {canManage && (
                            <Btn tone="green" variant="outline" size="sm" onClick={() => openGive(b)}>
                              Give Bid Bucks
                            </Btn>
                          )}
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

      {/* Give Bid Bucks — bottom sheet on phones, centered card on desktop. */}
      {giving && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => !giveBusy && setGiving(null)}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#e6dac6] shadow-xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-2xl font-black text-[#241a12]">Give Bid Bucks</div>
            <p className="text-[15px] text-[#8a7559] mt-0.5 truncate">
              {giving.name || giving.email || "This bidder"}
              {bucks[giving.clerkUserId] !== undefined && ` · has ${fmtMoney(bucks[giving.clerkUserId])}`}
            </p>

            <div className="grid grid-cols-4 gap-2 mt-4">
              {[5, 10, 20, 25].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGiveAmt(String(n))}
                  className={`min-h-[48px] rounded-xl border-2 font-black text-lg transition-colors ${
                    Number(giveAmt) === n ? "border-[#4a7c59] bg-[#e6f1e8] text-[#2f5d3a]" : "border-[#e6dac6] bg-white text-[#241a12]"
                  }`}
                >
                  ${n}
                </button>
              ))}
            </div>

            <label className="block text-[13px] font-bold uppercase tracking-wide text-[#8a7559] mt-4 mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
              <Input type="number" inputMode="numeric" min={5} step="5" value={giveAmt} onChange={(e) => setGiveAmt(e.target.value)} className="pl-8 font-bold" />
            </div>
            {Number(giveAmt) >= 5 && Number(giveAmt) % 5 === 0 && (
              <p className="text-[15px] text-[#2f5d3a] font-semibold mt-1.5">
                {Number(giveAmt) / 5} × $5 Bid Bucks · $5 off each of their next {Number(giveAmt) / 5 === 1 ? "order" : `${Number(giveAmt) / 5} orders`}
              </p>
            )}

            <label className="block text-[13px] font-bold uppercase tracking-wide text-[#8a7559] mt-4 mb-1.5">Note (just for you)</label>
            <Input value={giveNote} onChange={(e) => setGiveNote(e.target.value)} placeholder="Sorry about the late pickup" maxLength={120} />

            {giving.phone && (
              <button
                type="button"
                role="switch"
                aria-checked={giveText}
                onClick={() => setGiveText((v) => !v)}
                className="mt-4 w-full min-h-[50px] flex items-center justify-between gap-3 rounded-xl bg-[#faf5ea] border border-[#e6dac6] px-4 text-left"
              >
                <span>
                  <span className="block font-bold text-[#241a12]">Text them about it</span>
                  <span className="block text-[13px] text-[#8a7559]">&ldquo;We added ${Number(giveAmt) > 0 ? Number(giveAmt) : 0} in Bid Bucks to your account. $5 comes off each order…&rdquo;</span>
                </span>
                <span className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${giveText ? "bg-[#4a7c59]" : "bg-[#d9c7ab]"}`}>
                  <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${giveText ? "translate-x-5" : ""}`} />
                </span>
              </button>
            )}

            {giveErr && <p className="text-[15px] font-semibold text-[#a1321f] mt-3">{giveErr}</p>}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Btn tone="slate" variant="outline" full onClick={() => setGiving(null)} disabled={giveBusy}>Cancel</Btn>
              <Btn tone="green" full onClick={submitGive} disabled={giveBusy}>
                {giveBusy ? "Adding…" : `Give ${Number(giveAmt) > 0 ? fmtMoney(Number(giveAmt)) : ""}`}
              </Btn>
            </div>
          </div>
        </div>
      )}

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
