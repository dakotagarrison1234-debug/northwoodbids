"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "@/lib/format";

type OrgRole = "OWNER" | "ADMIN" | "STAFF";

interface Member { id: string; clerkUserId: string; role: OrgRole }
interface AuctionItem { id: string; title: string; status: string; currentBid: number }
interface Auction { id: string; title: string; status: string; startAt: Date | string; endAt: Date | string; items: AuctionItem[] }
interface Item {
  id: string; title: string; status: string; currentBid: number; startingBid: number;
  photos: { url: string }[];
  auction: { id: string; title: string } | null;
}
interface Org {
  id: string; name: string; slug: string; description: string | null;
  isActive: boolean; createdAt: Date | string;
  members: Member[];
  auctions: Auction[];
  items: Item[];
}

interface ProxyBidRow {
  id: string;
  clerkUserId: string;
  bidderName: string | null;
  bidderEmail: string | null;
  bidderPhone: string | null;
  maxAmount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  item: {
    id: string;
    title: string;
    currentBid: number;
    status: string;
    auctionTitle: string | null;
  };
}

const AUCTION_STATUSES = ["DRAFT", "OPEN", "CLOSING", "CLOSED", "SETTLED"];
const ITEM_STATUSES = ["DRAFT", "ACTIVE", "SOLD", "UNSOLD", "PENDING_PICKUP", "PICKED_UP"];
const ROLES: OrgRole[] = ["OWNER", "ADMIN", "STAFF"];

export default function OrgCommandCenter({ org: initial }: { org: Org }) {
  const router = useRouter();
  const [org, setOrg] = useState(initial);
  const [tab, setTab] = useState<"overview" | "auctions" | "items" | "members" | "maxbids">("overview");

  // Overview edit state
  const [editName, setEditName] = useState(org.name);
  const [editDesc, setEditDesc] = useState(org.description || "");
  const [editActive, setEditActive] = useState(org.isActive);
  const [savingOrg, setSavingOrg] = useState(false);

  // Act-as
  const [enteringOrg, setEnteringOrg] = useState(false);

  // Delete org
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const base = `/api/superadmin/orgs/${org.id}`;

  const saveOrg = async () => {
    setSavingOrg(true);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc, isActive: editActive }),
    });
    const data = await res.json();
    if (data.success) setOrg((o) => ({ ...o, name: data.org.name, slug: data.org.slug, description: data.org.description, isActive: data.org.isActive }));
    setSavingOrg(false);
  };

  const deleteOrg = async () => {
    setDeleting(true);
    const res = await fetch(base, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete organization. Please try again.");
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }
    router.push("/superadmin/orgs");
  };

  const enterAsOrg = async () => {
    setEnteringOrg(true);
    await fetch("/api/superadmin/act-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id }),
    });
    router.push("/admin/dashboard");
  };

  // Auction actions
  const updateAuction = async (auctionId: string, data: Record<string, string>) => {
    const res = await fetch(`${base}/auctions/${auctionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d.success) {
      setOrg((o) => ({
        ...o,
        auctions: o.auctions.map((a) => a.id === auctionId ? { ...a, ...d.auction } : a),
      }));
    }
  };

  const deleteAuction = async (auctionId: string) => {
    if (!confirm("Delete this auction? Items will be unlinked.")) return;
    const res = await fetch(`${base}/auctions/${auctionId}`, { method: "DELETE" });
    if (!res.ok) { alert("Failed to delete auction."); return; }
    setOrg((o) => ({ ...o, auctions: o.auctions.filter((a) => a.id !== auctionId) }));
  };

  // Item actions
  const updateItem = async (itemId: string, data: Record<string, string>) => {
    const res = await fetch(`${base}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d.success) {
      setOrg((o) => ({
        ...o,
        items: o.items.map((i) => i.id === itemId ? { ...i, ...d.item } : i),
      }));
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm("Permanently delete this item and all its bids?")) return;
    const res = await fetch(`${base}/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) { alert("Failed to delete item."); return; }
    setOrg((o) => ({ ...o, items: o.items.filter((i) => i.id !== itemId) }));
  };

  // Member actions
  const removeMember = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    await fetch(`${base}/members?memberId=${memberId}`, { method: "DELETE" });
    setOrg((o) => ({ ...o, members: o.members.filter((m) => m.id !== memberId) }));
  };

  const changeRole = async (memberId: string, role: OrgRole) => {
    const res = await fetch(`${base}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role }),
    });
    const d = await res.json();
    if (d.success) {
      setOrg((o) => ({
        ...o,
        members: o.members.map((m) => m.id === memberId ? { ...m, role: d.member.role } : m),
      }));
    }
  };

  // ── Max Bids state ────────────────────────────────────────────────────────
  const [proxyBids, setProxyBids] = useState<ProxyBidRow[] | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);

  useEffect(() => {
    if (tab !== "maxbids" || proxyBids !== null) return;
    setProxyLoading(true);
    fetch(`${base}/proxy-bids`)
      .then((r) => r.json())
      .then((d) => setProxyBids(d.proxyBids ?? []))
      .catch(() => setProxyBids([]))
      .finally(() => setProxyLoading(false));
  }, [tab, proxyBids, base]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "auctions", label: `Auctions (${org.auctions.length})` },
    { id: "items", label: `Items (${org.items.length})` },
    { id: "members", label: `Members (${org.members.length})` },
    { id: "maxbids", label: "Max Bids 🔒" },
  ] as const;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="border-b border-[#e3d6bf] px-8 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/superadmin/orgs" className="text-[#8a7559] hover:text-[#241a12] text-sm">← Orgs</Link>
            <span className="text-[#b3a085]">/</span>
            <h1 className="text-xl font-semibold">{org.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${org.isActive ? "bg-[#6c4d39]/20 text-[#6c4d39]" : "bg-[#e7dcc6] text-[#8a7559]"}`}>
              {org.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-[#8a7559] text-sm mt-0.5">/{org.slug}</p>
        </div>
        <button
          onClick={enterAsOrg}
          disabled={enteringOrg}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm"
        >
          {enteringOrg ? "Entering..." : "Enter as Org"}
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-[#e3d6bf] px-8">
        <div className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? "border-[#6c4d39] text-[#241a12]" : "border-transparent text-[#8a7559] hover:text-[#4a3a2b]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="max-w-lg space-y-5">
            <div>
              <label className="text-sm text-[#6f5b46] mb-1 block">Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] focus:outline-none focus:border-[#6c4d39]" />
            </div>
            <div>
              <label className="text-sm text-[#6f5b46] mb-1 block">Description</label>
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] focus:outline-none focus:border-[#6c4d39] resize-none" />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="active" checked={editActive} onChange={(e) => setEditActive(e.target.checked)}
                className="w-4 h-4 accent-[#6c4d39]" />
              <label htmlFor="active" className="text-sm text-[#4a3a2b]">Organization is active</label>
            </div>
            <button onClick={saveOrg} disabled={savingOrg}
              className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">
              {savingOrg ? "Saving..." : "Save Changes"}
            </button>

            {/* Danger Zone */}
            <div className="border border-red-200 rounded-xl p-5 mt-8">
              <h3 className="text-red-600 font-semibold mb-2">Danger Zone</h3>
              <p className="text-[#8a7559] text-sm mb-4">
                Permanently delete this organization, all its auctions, items, bids, and members. This cannot be undone.
              </p>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-200 text-sm px-4 py-2 rounded-lg">
                  Delete Organization
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-red-600 text-sm font-semibold">Are you absolutely sure?</p>
                  <div className="flex gap-3">
                    <button onClick={deleteOrg} disabled={deleting}
                      className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-semibold">
                      {deleting ? "Deleting..." : "Yes, Delete Everything"}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-[#6f5b46] hover:text-[#241a12] text-sm px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Auctions ── */}
        {tab === "auctions" && (
          <div className="space-y-3 max-w-3xl">
            {org.auctions.length === 0 && (
              <p className="text-[#8a7559] py-8 text-center">No auctions yet.</p>
            )}
            {org.auctions.map((auction) => (
              <div key={auction.id} className="bg-white border border-[#e3d6bf] rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-lg">{auction.title}</div>
                    <div className="text-[#8a7559] text-sm">
                      {auction.items.length} items · Ends {new Date(auction.endAt as string).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={auction.status}
                      onChange={(e) => updateAuction(auction.id, { status: e.target.value })}
                      className="bg-[#efe3d0] border border-[#cdbda3] rounded-lg px-2 py-1.5 text-sm text-[#241a12] focus:outline-none"
                    >
                      {AUCTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => deleteAuction(auction.id)}
                      className="text-red-600 hover:text-red-300 text-sm px-2 py-1.5 bg-red-50 hover:bg-red-500/20 rounded-lg border border-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {auction.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#e3d6bf] flex items-center gap-4 text-xs text-[#8a7559]">
                    {(() => {
                      const active = auction.items.filter(i => i.status === "ACTIVE").length;
                      const sold = auction.items.filter(i => i.status === "SOLD").length;
                      const draft = auction.items.filter(i => i.status === "DRAFT").length;
                      const totalBid = auction.items.reduce((s, i) => s + Number(i.currentBid), 0);
                      return <>
                        <span>{auction.items.length} items</span>
                        {active > 0 && <span className="text-[#6c4d39]">{active} active</span>}
                        {sold > 0 && <span className="text-[#6f5b46]">{sold} sold</span>}
                        {draft > 0 && <span className="text-yellow-600">{draft} draft</span>}
                        <span className="text-[#6c4d39] ml-auto">{money(totalBid)} total</span>
                      </>;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Items ── */}
        {tab === "items" && (
          <div className="space-y-3 max-w-3xl">
            {org.items.length === 0 && (
              <p className="text-[#8a7559] py-8 text-center">No items yet.</p>
            )}
            {org.items.map((item) => (
              <div key={item.id} className="bg-white border border-[#e3d6bf] rounded-xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-lg bg-[#efe3d0] shrink-0 overflow-hidden">
                  {item.photos[0] ? (
                    <img src={item.photos[0].url} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#8a7559] text-xs">—</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.title}</div>
                  <div className="text-[#8a7559] text-xs mt-0.5">
                    {money(Number(item.currentBid))} current bid · {money(Number(item.startingBid))} start
                    {item.auction && <span> · {item.auction.title}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => updateItem(item.id, { status: e.target.value })}
                    className="bg-[#efe3d0] border border-[#cdbda3] rounded-lg px-2 py-1.5 text-xs text-[#241a12] focus:outline-none"
                  >
                    {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-red-600 hover:text-red-300 text-xs px-2 py-1.5 bg-red-50 hover:bg-red-500/20 rounded-lg border border-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Members ── */}
        {tab === "members" && (
          <div className="max-w-2xl space-y-2">
            {org.members.length === 0 && (
              <p className="text-[#8a7559] py-8 text-center">No members.</p>
            )}
            {org.members.map((member) => (
              <div key={member.id} className="bg-white border border-[#e3d6bf] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div className="text-sm font-mono text-[#6f5b46] truncate flex-1">{member.clerkUserId}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={member.role}
                    onChange={(e) => changeRole(member.id, e.target.value as OrgRole)}
                    className="bg-[#efe3d0] border border-[#cdbda3] rounded-lg px-2 py-1.5 text-sm text-[#241a12] focus:outline-none"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="text-red-600 hover:text-red-300 text-sm px-2 py-1.5 bg-red-50 hover:bg-red-500/20 rounded-lg border border-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Max Bids (super admin only) ── */}
        {tab === "maxbids" && (
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-orange-500/10 border border-orange-400/30 text-orange-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                🔒 Super Admin Only — Not visible to org staff
              </span>
            </div>

            {proxyLoading && (
              <p className="text-[#8a7559] py-8 text-center text-sm">Loading max bids...</p>
            )}

            {!proxyLoading && proxyBids?.length === 0 && (
              <p className="text-[#8a7559] py-8 text-center text-sm">No max bids placed on this org&apos;s items yet.</p>
            )}

            {!proxyLoading && proxyBids && proxyBids.length > 0 && (
              <div className="bg-white border border-[#e3d6bf] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#efe3d0] border-b border-[#e3d6bf]">
                      <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Bidder</th>
                      <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Item</th>
                      <th className="text-right px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#8a7559]">Current Bid</th>
                      <th className="text-right px-5 py-3 text-xs font-bold uppercase tracking-wider text-orange-600">Max Bid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e3d6bf]">
                    {proxyBids.map((pb) => (
                      <tr key={pb.id} className="hover:bg-[#f6efe1] transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-[#241a12]">{pb.bidderName ?? "—"}</div>
                          <div className="text-xs text-[#8a7559]">{pb.bidderEmail ?? pb.clerkUserId}</div>
                          {pb.bidderPhone && <div className="text-xs text-[#8a7559]">{pb.bidderPhone}</div>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-[#241a12] max-w-[200px] truncate">{pb.item.title}</div>
                          {pb.item.auctionTitle && (
                            <div className="text-xs text-[#8a7559]">{pb.item.auctionTitle}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-[#4a3a2b]">
                          {money(pb.item.currentBid)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="font-bold font-mono text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
                            {money(pb.maxAmount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
