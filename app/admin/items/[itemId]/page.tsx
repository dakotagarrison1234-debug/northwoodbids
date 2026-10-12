"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";
import { Pill, PageHeader, PageBody, Panel, Btn, Input, Notice, Eyebrow, Disclosure } from "../../ui";
import { fmtMoney } from "../../format";

// Select / textarea share the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[50px] text-[17px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
const labelCls = "text-[13px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";

/** Chip button — the kit's Segmented look as a standalone toggle (44px tall). */
function Chip({
  on, children, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-[15px] font-bold border transition-colors ${
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
  // "Uploading 2 of 5" — shown in the Photos panel while files go up.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [auctions, setAuctions] = useState<{ id: string; title: string }[]>([]);
  const [pickupLocations, setPickupLocations] = useState<{ id: string; name: string }[]>([]);
  // Spot names already used for this auction + warehouse — tap to reuse.
  const [spotOptions, setSpotOptions] = useState<string[]>([]);
  // Inline errors (native dialogs are blocked in the installed app).
  const [error, setError] = useState<string | null>(null);        // top of page: save / validation
  const [photoError, setPhotoError] = useState<string | null>(null); // inside Photos
  const [dangerError, setDangerError] = useState<string | null>(null); // next to the danger buttons
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

  // Spot chips for the chosen auction + warehouse (same source as Add a lot).
  useEffect(() => {
    if (!formData.locationId) return;
    const p = new URLSearchParams({ locationId: formData.locationId });
    if (formData.auctionId) p.set("auctionId", formData.auctionId);
    let live = true;
    fetch(`/api/admin/items/spots?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (live && Array.isArray(d.spots)) setSpotOptions(d.spots); })
      .catch(() => {});
    return () => { live = false; };
  }, [formData.locationId, formData.auctionId]);
  // No warehouse → no spot chips (don't show another warehouse's spots).
  const visibleSpots = formData.locationId ? spotOptions : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const name = e.target.name;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 10) { setPhotoError("Maximum 10 photos per lot."); e.target.value = ""; return; }
    setPhotoError(null);
    setUploading(true);
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ done: i + 1, total: files.length });
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
    setUploadProgress(null);
    if (failed.length) setPhotoError(`Couldn't upload ${failed.join(", ")}. Files must be under 10MB (JPG, PNG, WebP, HEIC).`);
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

  const scrollTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll<HTMLElement>("[data-scroll-root]").forEach((el) =>
      el.scrollTo({ top: 0, behavior: "smooth" })
    );
  };

  const handleSave = async () => {
    if (uploading || saving) return;
    if (!formData.title.trim()) { setError("Give the lot a title first."); scrollTop(); return; }
    if (!formData.locationId) { setError("Pick a warehouse."); scrollTop(); return; }
    setSaving(true);
    setError(null);
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
        setError("Couldn't save: " + (data.error || "unknown error"));
        scrollTop();
      }
    } catch { setError("Something went wrong. Try again."); scrollTop(); }
    finally { setSaving(false); }
  };

  const removeFromAuction = async () => {
    setDangerBusy(true);
    setDangerError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/remove-from-auction`, { method: "POST" });
      const data = await res.json();
      if (data.success) router.push("/admin/items");
      else setDangerError(data.error || "Couldn't remove it from the auction.");
    } catch { setDangerError("Something went wrong. Try again."); }
    finally { setDangerBusy(false); }
  };

  const deleteItem = async () => {
    setDangerBusy(true);
    setDangerError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) router.push("/admin/items");
      else setDangerError(data.error || "Couldn't delete it.");
    } catch { setDangerError("Something went wrong. Try again."); }
    finally { setDangerBusy(false); }
  };

  if (loading) {
    return (
      <>
        <header className="bg-white/70 border-b border-[#e6dac6] px-4 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </header>
        <div className="flex-1 px-4 sm:px-8 py-6">
          <div className="w-full max-w-3xl space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-[#e6dac6] rounded-2xl p-5 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const photosSub = uploadProgress
    ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}`
    : photos.length
      ? `${photos.length} of 10`
      : undefined;

  return (
    <>
      <PageHeader
        title="Edit lot"
        tabs={false}
        back={{
          href: formData.auctionId ? `/admin/auctions/${formData.auctionId}` : "/admin/auctions",
          label: formData.auctionId ? "Auction" : "Auctions",
        }}
        /* Live status + current bid so nobody edits a lot with bids on it without noticing. */
        sub={meta ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Pill tone={meta.sold ? "green" : meta.status === "ACTIVE" ? "amber" : "slate"} dot>
              {meta.sold ? "Sold" : meta.status === "ACTIVE" ? "Live now" : meta.status.toLowerCase()}
            </Pill>
            {meta.bidCount > 0 && (
              <span className="text-[#6f5b46]">
                <strong className="text-[#241a12]">{fmtMoney(meta.currentBid)}</strong>
                {" · "}{meta.bidCount} bid{meta.bidCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        ) : undefined}
      />

      <div data-scroll-root className="flex-1 overflow-auto">
        <PageBody>
        <div className="space-y-3">

          {error && (
            <Notice tone="red" className="flex items-center gap-2">
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="10" cy="10" r="8" /><path d="M10 6v5M10 13.5v.5" /></svg>
              {error}
            </Notice>
          )}

          {/* ── Big tag # ── */}
          <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] px-4 py-3.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Eyebrow className="!text-[#b9a688]">Tag # on the item</Eyebrow>
              <div className="font-mono font-black tracking-wider leading-none text-5xl sm:text-6xl mt-1">#{formData.itemCode || "—"}</div>
            </div>
            {formData.packSize > 1 && <Pill tone="amber">Combo of {formData.packSize}</Pill>}
          </div>

          <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />

          {/* ── Photos ── */}
          <Panel title="Photos" sub={photosSub}>
            <div className="p-3 sm:p-4 space-y-3">
              {photoError && <Notice tone="red">{photoError}</Notice>}
              {photos.length > 0 && (
                /* 2-up on a phone; controls live in a bar UNDER the photo so the badge,
                   delete and "Make main" never overlap inside a small tile. */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                          <span className="flex-1 min-h-[44px] flex items-center justify-center text-[15px] font-bold text-[#2f5d3a] bg-[#e6f1e8]">
                            Shown first
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMainPhoto(i)}
                            className="flex-1 min-h-[44px] text-[15px] font-bold text-[#6f5b46] bg-white hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors"
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
              )}
              <label htmlFor="photo-upload"
                className="min-h-[50px] border-2 border-dashed border-[#d9c7ab] rounded-xl px-4 flex items-center justify-center gap-2 hover:border-[#6c4d39] hover:bg-[#faf5ea] transition-colors cursor-pointer text-[#6f5b46] font-bold">
                {uploading ? (
                  <span className="w-5 h-5 rounded-full border-[3px] border-[#e6dac6] border-t-[#6c4d39] animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                )}
                {uploading ? "Uploading…" : "Add photos"}
              </label>
            </div>
          </Panel>

          {/* ── Details ── */}
          <Panel title="Details">
            <div className="p-3 sm:p-4 space-y-3">
              <div>
                <label htmlFor="lot-title" className={labelCls}>Title</label>
                <Input id="lot-title" name="title" value={formData.title} onChange={handleChange} className="font-semibold" />
              </div>
              <div>
                <span className={labelCls}>Condition</span>
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
                      className="!px-1">{c.label}</Chip>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* ── Pricing ── */}
          <Panel title="Pricing">
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Retail", name: "retailValue", placeholder: "0" },
                  { label: "Start", name: "startingBid", placeholder: "2" },
                ].map((field) => (
                  <div key={field.name}>
                    <label htmlFor={`lot-${field.name}`} className={labelCls}>{field.label}</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                      <Input id={`lot-${field.name}`} name={field.name} value={formData[field.name as keyof typeof formData] as string}
                        onChange={handleChange} type="number" inputMode="decimal" placeholder={field.placeholder}
                        className="!pl-8 !pr-2 tabular-nums" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* ── Location ── */}
          <Panel title="Location">
            <div className="p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="lot-warehouse" className={labelCls}>Warehouse</label>
                  <select id="lot-warehouse" name="locationId" value={formData.locationId} onChange={handleChange}
                    className={`${fieldCls} ${!formData.locationId ? "!border-[#c47b3e]" : ""}`}>
                    <option value="">Choose…</option>
                    {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="lot-spot" className={labelCls}>Spot</label>
                  <Input id="lot-spot" name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                    placeholder="Shelf 2" autoComplete="off" />
                </div>
              </div>
              {visibleSpots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visibleSpots.slice(0, 12).map((s) => (
                    <Chip key={s} on={formData.storageLocation === s}
                      onClick={() => setFormData((prev) => ({ ...prev, storageLocation: s }))}>
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              <div>
                <label htmlFor="lot-auction" className={labelCls}>Auction</label>
                <select id="lot-auction" name="auctionId" value={formData.auctionId} onChange={handleChange} className={fieldCls}>
                  <option value="">Save as draft</option>
                  {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            </div>
          </Panel>

          {/* ── More — rarely-touched fields, staff notes, danger zone ── */}
          <Disclosure label="More">
            <div className="p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="lot-size" className={labelCls}>Size</label>
                  <Input id="lot-size" name="size" value={formData.size} onChange={handleChange} placeholder="Medium, 8, 12x10" />
                </div>
                <div>
                  <label htmlFor="lot-reservePrice" className={labelCls}>Reserve</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                    <Input id="lot-reservePrice" name="reservePrice" value={formData.reservePrice} onChange={handleChange}
                      type="number" inputMode="decimal" placeholder="0" className="!pl-8 !pr-2 tabular-nums" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={labelCls}>Featured</span>
                  <Chip on={formData.isPremium} onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))} className="w-full">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
                    {formData.isPremium ? "Featured" : "Not featured"}
                  </Chip>
                </div>
                <div>
                  <span className={labelCls}>Combo</span>
                  <select name="packSize" value={formData.packSize} onChange={(e) => setFormData((prev) => ({ ...prev, packSize: Number(e.target.value) }))} className={fieldCls}>
                    <option value={0}>Combo off</option>
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Combo of {n}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <span className={labelCls}>Transfer</span>
                <div className="grid grid-cols-2 gap-2">
                  <Chip on={formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))}>Can transfer</Chip>
                  <Chip on={!formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))}>Pickup only</Chip>
                </div>
              </div>

              <div>
                <label htmlFor="lot-description" className={labelCls}>Description</label>
                <textarea id="lot-description" name="description" value={formData.description} onChange={handleChange} rows={3}
                  className={`${fieldCls} resize-none py-2.5`} />
              </div>

              <div>
                <label htmlFor="lot-notes" className={labelCls}>Staff notes</label>
                <textarea id="lot-notes" name="notes" value={formData.notes} onChange={handleChange} rows={3}
                  placeholder="Bidders never see these" className={`${fieldCls} resize-none py-2.5`} />
              </div>

              {/* Danger zone — remove from auction / delete */}
              {meta && (
                <div className="rounded-xl border border-[#f0c4ba] bg-[#fbeae6]/40 p-3 sm:p-4 space-y-3">
                  <Eyebrow className="!text-[#a1321f]">Danger zone</Eyebrow>
                  {dangerError && <Notice tone="red">{dangerError}</Notice>}
                  {meta.sold ? (
                    <p className="text-[#6f5b46]">This lot is sold. To reverse it, forfeit it from the auction results.</p>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      {meta.inAuction && (
                        <Btn
                          type="button"
                          tone="amber"
                          variant="outline"
                          disabled={dangerBusy}
                          className="flex-1"
                          onClick={() => setConfirmDialog({
                            text: "Remove this lot from its auction? It goes back to drafts and any bids on it are cancelled. Nothing is deleted.",
                            confirmLabel: "Remove from auction",
                            onConfirm: removeFromAuction,
                          })}
                        >
                          Remove from auction
                        </Btn>
                      )}
                      <Btn
                        type="button"
                        tone="red"
                        variant="outline"
                        disabled={dangerBusy || meta.hasBids}
                        className="flex-1"
                        onClick={() => setConfirmDialog({
                          text: "Permanently delete this lot? This can't be undone.",
                          confirmLabel: "Delete lot",
                          onConfirm: deleteItem,
                        })}
                      >
                        Delete lot
                      </Btn>
                    </div>
                  )}
                  {!meta.sold && meta.hasBids && (
                    <p className="text-[15px] text-[#8a7559]">Has bids, so it can&apos;t be deleted. Remove it from the auction instead.</p>
                  )}
                </div>
              )}
            </div>
          </Disclosure>
        </div>
        </PageBody>
      </div>

      {/* Sticky save — the form is several cards tall on a phone. bottom-[68px] on
          mobile keeps this clear of the fixed tab bar. */}
      <div className="sticky bottom-[68px] md:bottom-0 bar-safe-bottom safe-x border-t border-[#e6dac6] bg-white/85 backdrop-blur px-4 sm:px-8 pt-3 pb-3">
        <Btn onClick={handleSave} disabled={saving || uploading} full className="min-h-[52px]">
          {saving ? "Saving…" : uploading ? "Uploading…" : "Save changes"}
        </Btn>
      </div>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[#241a12]">{confirmDialog.text}</p>
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
