"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";
import { Pill, fmtMoney } from "../../ui";

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.itemId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [auctions, setAuctions] = useState<{ id: string; title: string }[]>([]);
  const [pickupLocations, setPickupLocations] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    title: "", description: "", condition: "GOOD", category: "",
    retailValue: "", startingBid: "", reservePrice: "", donorName: "",
    taxDeductible: false, itemCode: "", storageLocation: "", locationId: "", notes: "", auctionId: "",
    isPremium: false, packSize: 0, transferable: true,
  });
  // Meta used by the danger zone (delete / remove-from-auction gating).
  const [meta, setMeta] = useState<{
    status: string; inAuction: boolean; hasBids: boolean; sold: boolean;
    currentBid: number; bidCount: number;
  } | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; onConfirm: () => void } | null
  >(null);

  useEffect(() => {
    fetch(`/api/items/${itemId}`).then(r => r.json()).then(d => {
      if (d.item) {
        const item = d.item;
        setFormData({
          title: item.title || "", description: item.description || "",
          condition: item.condition || "GOOD", category: item.category || "",
          retailValue: item.retailValue?.toString() || "",
          startingBid: item.startingBid?.toString() || "",
          reservePrice: item.reservePrice?.toString() || "",
          donorName: item.donorName || "", taxDeductible: item.taxDeductible || false,
          itemCode: item.itemCode || "",
          storageLocation: item.storageLocation || "", locationId: item.locationId || "",
          notes: item.notes || "",
          auctionId: item.auctionId || "",
          isPremium: item.isPremium || false,
          packSize: item.packSize || 0,
          transferable: item.transferable !== false,
        });
        if (item.photos) {
          // Show the current main photo first so it's displayed as main and preserved.
          const sorted = [...item.photos].sort(
            (a: { isPrimary?: boolean }, b: { isPrimary?: boolean }) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
          );
          setPhotos(sorted.map((p: { url: string }) => p.url));
        }
        const sold = ["SOLD", "PENDING_PICKUP", "PICKED_UP"].includes(item.status);
        setMeta({
          status: item.status,
          inAuction: !!item.auctionId,
          hasBids: Array.isArray(item.bids) && item.bids.length > 0,
          sold,
          currentBid: Number(item.currentBid ?? 0),
          bidCount: Array.isArray(item.bids) ? item.bids.length : 0,
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/auctions").then(r => r.json()).then(d => {
      if (d.auctions) {
        // Only show auctions that can accept items (not closed/settled)
        setAuctions(d.auctions.filter((a: { id: string; title: string; status: string }) =>
          ["DRAFT", "OPEN", "CLOSING"].includes(a.status)
        ));
      }
    });
    fetch("/api/admin/pickup/locations").then(r => r.json()).then(d => {
      if (d.locations) setPickupLocations(
        d.locations.filter((l: { isActive: boolean }) => l.isActive)
          .map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))
      );
    }).catch(() => {});
  }, [itemId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 10) { alert("Maximum 10 photos"); return; }
    setUploading(true);
    const failed: string[] = [];
    for (const file of files) {
      // Derive MIME type from extension when browser doesn't populate file.type (common on mobile)
      let fileType = file.type;
      if (!fileType) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const extMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          webp: "image/webp", gif: "image/gif", heic: "image/heic",
          heif: "image/heif", avif: "image/avif",
        };
        fileType = extMap[ext] ?? "image/jpeg";
      }
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const { signedUrl, publicUrl } = await res.json();
        const putRes = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": fileType } });
        if (!putRes.ok) throw new Error(`Storage error ${putRes.status}`);
        setPhotos(prev => [...prev, publicUrl]);
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err);
        failed.push(file.name);
      }
    }
    e.target.value = "";
    setUploading(false);
    if (failed.length) alert(`Failed to upload: ${failed.join(", ")}\n\nCheck that files are under 10MB and a supported format (JPG, PNG, WebP, HEIC).`);
  };

  // Make the chosen photo the main one by moving it to the front (index 0 = primary
  // on save). Bidders see index 0 first.
  const setMainPhoto = (i: number) => {
    setPhotos((prev) => {
      if (i <= 0 || i >= prev.length) return prev;
      const next = [...prev];
      const [chosen] = next.splice(i, 1);
      next.unshift(chosen);
      return next;
    });
  };

  const handleSave = async () => {
    if (uploading || saving) return;
    if (!formData.locationId) { alert("Please choose a warehouse for this item."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, photos }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(formData.auctionId ? `/admin/auctions/${formData.auctionId}` : "/admin/auctions");
      } else {
        alert("Error: " + data.error);
      }
    } catch { alert("Something went wrong."); }
    finally { setSaving(false); }
  };

  const removeFromAuction = async () => {
    setDangerBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}/remove-from-auction`, { method: "POST" });
      const data = await res.json();
      if (data.success) router.push("/admin/items");
      else alert("Error: " + (data.error || "Could not remove."));
    } catch { alert("Something went wrong."); }
    finally { setDangerBusy(false); }
  };

  const deleteItem = async () => {
    setDangerBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) router.push("/admin/items");
      else alert("Error: " + (data.error || "Could not delete."));
    } catch { alert("Something went wrong."); }
    finally { setDangerBusy(false); }
  };

  if (loading) {
    return (
      <>
        <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-32 rounded-xl" />
        </header>
        <div className="flex-1 px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white border border-[#e3d6bf] rounded-xl p-6 space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="bg-white border border-[#e3d6bf] rounded-xl p-6 space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={formData.auctionId ? `/admin/auctions/${formData.auctionId}` : "/admin/auctions"}
            className="text-slate-500 text-base font-semibold shrink-0 py-2 pr-1"
          >
            ← {loading ? "Back" : formData.auctionId ? "Auction" : "Auctions"}
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Edit item</h1>
        </div>
        {/* An admin editing an item needs to know whether it's live, what it's bid to,
            and whether it's already sold — none of that was on screen before, so it was
            possible to edit a live item with bids on it without realising. */}
        {meta && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Pill tone={meta.sold ? "green" : meta.status === "ACTIVE" ? "amber" : "slate"}>
              {meta.sold ? "Sold" : meta.status === "ACTIVE" ? "Live now" : meta.status.toLowerCase()}
            </Pill>
            {meta.bidCount > 0 && (
              <span className="text-base text-slate-600">
                <strong className="text-slate-900">{fmtMoney(meta.currentBid)}</strong>
                {" · "}{meta.bidCount} bid{meta.bidCount !== 1 ? "s" : ""}
              </span>
            )}
            {meta.status === "ACTIVE" && meta.bidCount > 0 && (
              <span className="text-sm text-amber-700 font-semibold">Careful — people are bidding on this</span>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 overflow-auto">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Photos <span className="text-[#8a7559] text-base font-normal">(up to 10)</span></h2>
            {photos.length > 0 && (
              <>
                <p className="text-[#8a7559] text-sm mb-2">The <strong className="text-[#6c4d39]">Main photo</strong> is what bidders see first. Tap &ldquo;Set as main&rdquo; on any photo to change it.</p>
                {/* 2-up on a phone, and the controls live in a BAR UNDER the photo
                    rather than floating on top of it. At 3-across the badge, the
                    delete button and "Set as main" physically overlapped each other
                    inside an ~87px tile. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {photos.map((url, i) => (
                    <div key={i} className={`rounded-xl overflow-hidden border-2 ${i === 0 ? "border-green-500" : "border-slate-200"}`}>
                      <div className="relative aspect-square bg-slate-100">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                        {i === 0 && (
                          <span className="absolute top-2 left-2 bg-green-600 text-white text-[11px] font-bold px-2 py-1 rounded-full shadow">
                            Main
                          </span>
                        )}
                      </div>
                      <div className="flex border-t border-slate-200">
                        {i === 0 ? (
                          <span className="flex-1 min-h-[44px] flex items-center justify-center text-sm font-bold text-green-700 bg-green-50">
                            Shown first
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMainPhoto(i)}
                            className="flex-1 min-h-[44px] text-sm font-bold text-slate-600 bg-white active:bg-slate-100"
                          >
                            Make main
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Delete photo"
                          onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                          className="w-[44px] min-h-[44px] flex items-center justify-center text-red-600 bg-white border-l border-slate-200 active:bg-red-50"
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 4h10M6.5 4V2.5h3V4M5 4v9.5h6V4M6.5 6.5v5M9.5 6.5v5" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            <label htmlFor="photo-upload"
              className="border-2 border-dashed border-[#cdbda3] rounded-xl p-6 text-center hover:border-[#6c4d39] transition-colors cursor-pointer block">
              <div className="text-[#8a7559] mb-1 flex justify-center"><svg width="22" height="22" fill="none" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="18" height="14" rx="2"/><circle cx="11" cy="12" r="3.5"/><path d="M8 5l1.5-2.5h3L14 5"/></svg></div>
              <div className="text-[#6f5b46] text-base">{uploading ? "Uploading..." : "Click to add photos"}</div>
            </label>
          </div>

          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Item Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Item Title *</label>
                <input name="title" value={formData.title} onChange={handleChange}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]" />
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39] resize-none" />
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Condition</label>
                <select name="condition" value={formData.condition} onChange={handleChange}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
                  <option value="NEW">New</option>
                  <option value="LIKE_NEW">Like New</option>
                  <option value="GOOD">Good</option>
                  <option value="FAIR">Fair</option>
                  <option value="POOR">Poor</option>
                </select>
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Featured</label>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-semibold border-2 transition-colors ${
                    formData.isPremium
                      ? "bg-[#c47b3e] text-white border-[#c47b3e]"
                      : "bg-white text-[#6c4d39] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
                  {formData.isPremium ? "Premium item" : "Mark as Premium"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Pricing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Retail Value", name: "retailValue" },
                { label: "Starting Bid", name: "startingBid" },
                { label: "Reserve Price", name: "reservePrice" },
              ].map((field) => (
                <div key={field.name}>
                  <label className="text-base text-[#6f5b46] mb-1.5 block">{field.label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-[#8a7559]">$</span>
                    <input name={field.name} value={formData[field.name as keyof typeof formData] as string}
                      onChange={handleChange} type="number"
                      className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-7 pr-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="space-y-6">
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Item Location</h2>

            <label className="text-base text-[#6f5b46] mb-1.5 block">Item Code</label>
            <div className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base font-mono font-semibold text-[#241a12] flex items-center justify-between">
              <span>{formData.itemCode || "—"}</span>
              <span className="text-xs font-sans font-normal text-[#8a7559]">auto-assigned</span>
            </div>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Shelf / spot</label>
              <input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                placeholder="e.g. Shelf 2 / Bin 4 / Row C"
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]" />
            </div>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Warehouse *</label>
              <select name="locationId" value={formData.locationId} onChange={handleChange}
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
                <option value="">Choose a warehouse…</option>
                {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Transfer</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))}
                  className={`px-4 py-2.5 rounded-xl text-base font-semibold border transition-colors ${
                    formData.transferable ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}>
                  Transferable
                </button>
                <button type="button" onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))}
                  className={`px-4 py-2.5 rounded-xl text-base font-semibold border transition-colors ${
                    !formData.transferable ? "bg-[#8a4f1c] text-white border-[#8a4f1c]" : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}>
                  Pickup at warehouse only
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Assign to Auction</h2>
            <select name="auctionId" value={formData.auctionId} onChange={handleChange}
              className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
              <option value="">Save as draft</option>
              {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>

          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Staff Notes</h2>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
              className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39] resize-none" />
          </div>

          {/* Danger zone — remove from auction / delete */}
          {meta && (
            <div className="bg-white border border-red-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-600 mb-3">Danger zone</h2>
              {meta.sold ? (
                <p className="text-base text-[#6f5b46]">This item has been sold. To reverse it, refund it from Winners &amp; Payments.</p>
              ) : (
                <div className="space-y-4">
                  {meta.inAuction && (
                    <div>
                      <button
                        type="button"
                        disabled={dangerBusy}
                        onClick={() => setConfirmDialog({
                          text: "Remove this item from its auction? It goes back to Drafts and any bids on it are cancelled — nothing is deleted.",
                          confirmLabel: "Remove from auction",
                          onConfirm: removeFromAuction,
                        })}
                        className="bg-white border-2 border-[#c47b3e]/50 text-[#8a4f1c] hover:bg-[#efe0c9] font-semibold text-base px-5 py-3 rounded-xl transition-colors disabled:opacity-50"
                      >
                        Remove from auction
                      </button>
                      <p className="text-sm text-[#8a7559] mt-1.5">Pulls it out of the auction and back to Drafts. Bids are cancelled. Nothing is deleted.</p>
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      disabled={dangerBusy || meta.hasBids}
                      onClick={() => setConfirmDialog({
                        text: "Permanently delete this item? This can't be undone.",
                        confirmLabel: "Delete item",
                        onConfirm: deleteItem,
                      })}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold text-base px-5 py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Delete item permanently
                    </button>
                    <p className="text-sm text-[#8a7559] mt-1.5">
                      {meta.hasBids
                        ? "This item has bids, so it can't be deleted — use “Remove from auction” instead."
                        : "Only possible when the item has no bids and isn't sold."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {/* Sticky save. The form is ~6 cards tall on a phone; with Save in the header
          you had to scroll all the way back up after every edit. */}
      <div className="sticky bottom-0 bar-safe-bottom safe-x border-t border-slate-200 bg-white px-4 sm:px-8 pt-3 pb-3">
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="w-full min-h-[52px] bg-slate-900 active:bg-slate-800 disabled:opacity-50 text-white text-base font-bold rounded-xl transition-colors"
        >
          {saving ? "Saving…" : uploading ? "Uploading photos…" : "Save changes"}
        </button>
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">Back</button>
              <button onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-base py-3 rounded-xl">{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
