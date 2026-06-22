"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

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
  });

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
        });
        if (item.photos) setPhotos(item.photos.map((p: { url: string }) => p.url));
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

  const handleSave = async () => {
    if (uploading || saving) return;
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

  if (loading) {
    return <div className="flex items-center justify-center flex-1"><p className="text-[#6f5b46]">Loading...</p></div>;
  }

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-4 sm:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={formData.auctionId ? `/admin/auctions/${formData.auctionId}` : "/admin/auctions"}
            className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0"
          >
            ← {loading ? "Back" : formData.auctionId ? "Auction" : "Auctions"}
          </Link>
          <span className="text-[#8a7559]">/</span>
          <h1 className="text-2xl sm:text-3xl font-semibold">Edit Item</h1>
        </div>
        <button onClick={handleSave} disabled={saving || uploading}
          className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base px-6 py-3.5 rounded-xl font-semibold shrink-0 transition-colors">
          {saving ? "Saving..." : uploading ? "Uploading..." : "Save Changes"}
        </button>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 overflow-auto">
        <div className="lg:col-span-2 space-y-6">
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

          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Photos <span className="text-[#8a7559] text-base font-normal">(up to 10)</span></h2>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square bg-[#efe3d0] rounded-lg overflow-hidden">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                    <button onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            <label htmlFor="photo-upload"
              className="border-2 border-dashed border-[#cdbda3] rounded-xl p-6 text-center hover:border-[#6c4d39] transition-colors cursor-pointer block">
              <div className="text-[#8a7559] mb-1 flex justify-center"><svg width="22" height="22" fill="none" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="18" height="14" rx="2"/><circle cx="11" cy="12" r="3.5"/><path d="M8 5l1.5-2.5h3L14 5"/></svg></div>
              <div className="text-[#6f5b46] text-base">{uploading ? "Uploading..." : "Click to add photos"}</div>
            </label>
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
            <p className="text-[#8a7559] text-sm mt-2">Unique code, assigned automatically</p>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Location</label>
              <input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                placeholder="e.g. Shelf 2 / Bin 4 / Row C"
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]" />
              <p className="text-[#8a7559] text-sm mt-2">Where it sits inside the warehouse</p>
            </div>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Warehouse *</label>
              <select name="locationId" value={formData.locationId} onChange={handleChange}
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
                <option value="">Choose a warehouse…</option>
                {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <p className="text-[#8a7559] text-sm mt-2">Which warehouse this item is in (Owosso, Gladwin, …)</p>
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
        </div>
      </div>
    </>
  );
}
