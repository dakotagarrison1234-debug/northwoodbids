"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";
import { Pill, PageHeader, PageBody, Panel, Btn, Input } from "../../ui";
import { fmtMoney } from "../../format";

// Select / textarea share the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
const labelCls = "text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1.5 block";

/** Chip button — the kit's Segmented look as a standalone toggle (44px tall). */
function Chip({
  on, children, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-xl text-sm font-bold border transition-colors ${
        on ? "bg-[#241a12] text-[#f6ecda] border-[#241a12] shadow-sm" : "bg-white text-[#6f5b46] border-[#e6dac6] hover:bg-[#f4ede1]"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

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
    title: "", description: "", condition: "GOOD", size: "", category: "",
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
          condition: item.condition || "GOOD", size: item.size || "", category: item.category || "",
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
        <header className="bg-white/70 border-b border-[#e6dac6] px-4 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </header>
        <div className="flex-1 px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white border border-[#e6dac6] rounded-2xl p-5 space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="space-y-5">
            {[0, 1].map((i) => (
              <div key={i} className="bg-white border border-[#e6dac6] rounded-2xl p-5 space-y-4">
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
      <PageHeader
        title="Edit item"
        tabs={false}
        back={{
          href: formData.auctionId ? `/admin/auctions/${formData.auctionId}` : "/admin/auctions",
          label: loading ? "Back" : formData.auctionId ? "Auction" : "Auctions",
        }}
        /* An admin editing an item needs to know whether it's live, what it's bid to,
           and whether it's already sold — none of that was on screen before, so it was
           possible to edit a live item with bids on it without realising. */
        sub={meta ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Pill tone={meta.sold ? "green" : meta.status === "ACTIVE" ? "amber" : "slate"} dot>
              {meta.sold ? "Sold" : meta.status === "ACTIVE" ? "Live now" : meta.status.toLowerCase()}
            </Pill>
            {meta.bidCount > 0 && (
              <span className="text-base text-[#6f5b46]">
                <strong className="text-[#241a12]">{fmtMoney(meta.currentBid)}</strong>
                {" · "}{meta.bidCount} bid{meta.bidCount !== 1 ? "s" : ""}
              </span>
            )}
            {meta.status === "ACTIVE" && meta.bidCount > 0 && (
              <span className="text-sm text-[#8a4f1c] font-bold">Careful — people are bidding on this</span>
            )}
          </span>
        ) : undefined}
      />

      <div className="flex-1 overflow-auto">
        <PageBody wide>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Panel title="Photos" sub={photos.length > 0 ? "The main photo is what bidders see first. Tap Make main on any photo to change it." : "Up to 10"}>
            <div className="p-4 sm:p-5">
            {photos.length > 0 && (
              <>
                {/* 2-up on a phone, and the controls live in a BAR UNDER the photo
                    rather than floating on top of it. At 3-across the badge, the
                    delete button and "Set as main" physically overlapped each other
                    inside an ~87px tile. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {photos.map((url, i) => (
                    <div key={i} className={`rounded-xl overflow-hidden border-2 ${i === 0 ? "border-[#4a7c59]" : "border-[#e6dac6]"}`}>
                      <div className="relative aspect-square bg-[#f4ede1]">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                        {i === 0 && (
                          <span className="absolute top-2 left-2"><Pill tone="green">Main</Pill></span>
                        )}
                      </div>
                      <div className="flex border-t border-[#e6dac6]">
                        {i === 0 ? (
                          <span className="flex-1 min-h-[44px] flex items-center justify-center text-sm font-bold text-[#2f5d3a] bg-[#e6f1e8]">
                            Shown first
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMainPhoto(i)}
                            className="flex-1 min-h-[44px] text-sm font-bold text-[#6f5b46] bg-white hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors"
                          >
                            Make main
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Delete photo"
                          onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                          className="w-[44px] min-h-[44px] flex items-center justify-center text-[#a1321f] bg-white border-l border-[#e6dac6] hover:bg-[#fbeae6] active:bg-[#f6d6cf] transition-colors"
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
              className="border-2 border-dashed border-[#d9c7ab] rounded-xl p-6 text-center hover:border-[#6c4d39] hover:bg-[#faf5ea] transition-colors cursor-pointer block">
              <div className="text-[#8a7559] mb-1 flex justify-center"><svg width="22" height="22" fill="none" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="18" height="14" rx="2"/><circle cx="11" cy="12" r="3.5"/><path d="M8 5l1.5-2.5h3L14 5"/></svg></div>
              <div className="text-[#6f5b46] text-base font-semibold">{uploading ? "Uploading..." : "Tap to add photos"}</div>
            </label>
            </div>
          </Panel>

          <Panel title="Details">
            <div className="p-4 sm:p-5 space-y-4">
              <div>
                <label className={labelCls}>Item title *</label>
                <Input name="title" value={formData.title} onChange={handleChange} className="text-base font-semibold" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                  className={`${fieldCls} py-3 text-base resize-none`} />
              </div>
              <div>
                <label className={labelCls}>Condition</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { value: "NEW", label: "New" },
                    { value: "LIKE_NEW", label: "Like new" },
                    { value: "GOOD", label: "Good" },
                    { value: "FAIR", label: "Fair" },
                    { value: "POOR", label: "Poor" },
                  ].map((c) => (
                    <Chip key={c.value} on={formData.condition === c.value}
                      onClick={() => setFormData((prev) => ({ ...prev, condition: c.value }))}
                      className="!px-1 text-xs sm:text-sm">{c.label}</Chip>
                  ))}
                </div>
              </div>
              {/* Size lives with Condition — same kind of "what is this" attribute,
                  and both appear on the bidder's card. */}
              <div>
                <label className={labelCls}>
                  Size <span className="font-semibold normal-case tracking-normal">(optional)</span>
                </label>
                <Input name="size" value={formData.size} onChange={handleChange}
                  placeholder="Medium, Size 8, One Size Fits All…" className="text-base" />
              </div>

              <div>
                <label className={labelCls}>Featured</label>
                <Chip on={formData.isPremium} onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
                  {formData.isPremium ? "Premium item" : "Mark as Premium"}
                </Chip>
              </div>
            </div>
          </Panel>

          <Panel title="Pricing">
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Retail value", name: "retailValue" },
                  { label: "Starting bid", name: "startingBid" },
                  { label: "Reserve price", name: "reservePrice" },
                ].map((field) => (
                  <div key={field.name}>
                    <label className={labelCls}>{field.label}</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                      <Input name={field.name} value={formData[field.name as keyof typeof formData] as string}
                        onChange={handleChange} type="number" className="!pl-8 text-base tabular-nums" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

        </div>

        <div className="space-y-5">
          <Panel title="Location">
            <div className="p-4 sm:p-5 space-y-4">
              <div>
                <label className={labelCls}>Item code</label>
                <div className="w-full min-h-[46px] bg-[#f4ede1] border border-[#e6dac6] rounded-xl px-4 text-base font-mono font-bold text-[#241a12] flex items-center justify-between">
                  <span>{formData.itemCode || "—"}</span>
                  <span className="text-xs font-sans font-semibold text-[#8a7559]">auto-assigned</span>
                </div>
              </div>

              <div>
                <label className={labelCls}>Shelf / spot</label>
                <Input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                  placeholder="e.g. Shelf 2 / Bin 4 / Row C" className="text-base" />
              </div>

              <div>
                <label className={labelCls}>Warehouse *</label>
                <select name="locationId" value={formData.locationId} onChange={handleChange} className={`${fieldCls} text-base`}>
                  <option value="">Choose a warehouse…</option>
                  {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Transfer</label>
                <div className="grid grid-cols-2 gap-2">
                  <Chip on={formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))}>
                    Transferable
                  </Chip>
                  <Chip on={!formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))} className="!px-2 text-center leading-tight">
                    Pickup at warehouse only
                  </Chip>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Auction">
            <div className="p-4 sm:p-5">
              <select name="auctionId" value={formData.auctionId} onChange={handleChange} className={`${fieldCls} text-base`}>
                <option value="">Save as draft</option>
                {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          </Panel>

          <Panel title="Staff notes" sub="Bidders never see these.">
            <div className="p-4 sm:p-5">
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
                className={`${fieldCls} py-3 text-base resize-none`} />
            </div>
          </Panel>

          {/* Danger zone — remove from auction / delete */}
          {meta && (
            <Panel title={<span className="text-[#a1321f]">Danger zone</span>} tone="red">
              <div className="p-4 sm:p-5">
              {meta.sold ? (
                <p className="text-base text-[#6f5b46]">This item has been sold. To reverse it, refund it from Winners &amp; Payments.</p>
              ) : (
                <div className="space-y-4">
                  {meta.inAuction && (
                    <div>
                      <Btn
                        type="button"
                        tone="amber"
                        variant="outline"
                        disabled={dangerBusy}
                        onClick={() => setConfirmDialog({
                          text: "Remove this item from its auction? It goes back to Drafts and any bids on it are cancelled — nothing is deleted.",
                          confirmLabel: "Remove from auction",
                          onConfirm: removeFromAuction,
                        })}
                      >
                        Remove from auction
                      </Btn>
                      <p className="text-sm text-[#8a7559] mt-1.5">Pulls it out of the auction and back to Drafts. Bids are cancelled. Nothing is deleted.</p>
                    </div>
                  )}
                  <div>
                    <Btn
                      type="button"
                      tone="red"
                      variant="outline"
                      disabled={dangerBusy || meta.hasBids}
                      onClick={() => setConfirmDialog({
                        text: "Permanently delete this item? This can't be undone.",
                        confirmLabel: "Delete item",
                        onConfirm: deleteItem,
                      })}
                    >
                      Delete item permanently
                    </Btn>
                    <p className="text-sm text-[#8a7559] mt-1.5">
                      {meta.hasBids
                        ? "This item has bids, so it can't be deleted — use “Remove from auction” instead."
                        : "Only possible when the item has no bids and isn't sold."}
                    </p>
                  </div>
                </div>
              )}
              </div>
            </Panel>
          )}
        </div>
        </div>
        </PageBody>
      </div>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {/* Sticky save. The form is ~6 cards tall on a phone; with Save in the header
          you had to scroll all the way back up after every edit. */}
      {/* bottom-[68px] on mobile keeps this clear of the fixed tab bar. */}
      <div className="sticky bottom-[68px] md:bottom-0 bar-safe-bottom safe-x border-t border-[#e6dac6] bg-white/85 backdrop-blur px-4 sm:px-8 pt-3 pb-3">
        <Btn onClick={handleSave} disabled={saving || uploading} full className="min-h-[52px]">
          {saving ? "Saving…" : uploading ? "Uploading photos…" : "Save changes"}
        </Btn>
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn onClick={() => setConfirmDialog(null)} tone="slate" variant="outline" className="flex-1">Back</Btn>
              <Btn onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }} tone="red" className="flex-1">{confirmDialog.confirmLabel}</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
