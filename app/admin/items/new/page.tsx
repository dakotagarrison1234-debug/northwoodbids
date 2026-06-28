"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";

// ── Barcode scanner card ───────────────────────────────────────────────────────
interface BarcodeResult {
  title: string;
  description: string;
  brand: string;
  category: string;
  retailValue: number | null;
  images: string[];
}

/** Trim an imported description down to the first N sentences (default 3). */
function shortenDescription(text: string, maxSentences = 3): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) {
    // No sentence punctuation — hard-cap the length so it can't be a wall of text.
    return clean.length > 300 ? clean.slice(0, 300).trim() + "…" : clean;
  }
  return parts.slice(0, maxSentences).join(" ").replace(/\s+/g, " ").trim();
}

interface SearchResult {
  asin: string;
  title: string;
  image: string | null;
  price: number | null;
  brand: string;
}

function BarcodeScanner({
  onFill,
  collapsed = false,
  onCollapsedChange,
}: {
  onFill: (r: BarcodeResult) => void;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
}) {
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);          // ZXing scanner controls (fallback path)
  const streamRef = useRef<MediaStream | null>(null);
  const cancelScanRef = useRef<(() => void) | null>(null); // stops the native detect loop
  const detectedRef = useRef(false);
  const playingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop just the decode loop (keep the camera/stream alive).
  const stopLoop = () => {
    playingRef.current = false;
    try { cancelScanRef.current?.(); } catch { /* ignore */ }
    cancelScanRef.current = null;
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    controlsRef.current = null;
  };

  // Fully release the camera (light off). Next scan will re-request permission.
  const releaseCamera = () => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    stopLoop();
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
    try { if (videoRef.current) videoRef.current.srcObject = null; } catch { /* ignore */ }
    setScanning(false);
  };

  // Pause scanning but KEEP the permission warm, so listing the next item doesn't
  // re-prompt for the camera. Auto-releases after a stretch of inactivity.
  const pauseWarm = () => {
    stopLoop();
    try { streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false)); } catch { /* ignore */ }
    setScanning(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => releaseCamera(), 45000);
  };

  // Reuse the already-granted stream when it's still live; else request once.
  const acquireStream = async (): Promise<MediaStream> => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    const s = streamRef.current;
    if (s && s.getVideoTracks().some((t) => t.readyState === "live")) {
      s.getVideoTracks().forEach((t) => (t.enabled = true));
      return s;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    streamRef.current = stream;
    try {
      const track = stream.getVideoTracks()[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caps = (track.getCapabilities?.() ?? {}) as any;
      if (caps?.focusMode?.includes?.("continuous")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as any);
      }
    } catch { /* ignore */ }
    return stream;
  };

  // Fire once on the first good read — pause warm so the next item is instant.
  const handleDetected = (raw: string) => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    const code = raw.trim();
    pauseWarm();
    setBarcode(code);
    doLookup(code);
  };

  const startCamera = async () => {
    stopLoop();              // cancel any prior loop, but keep the warm stream
    setError(null);
    setResult(null);
    setBarcode("");
    setScanning(true);
    detectedRef.current = false;
    playingRef.current = true;
    try {
      const stream = await acquireStream();
      const video = videoRef.current!;
      if (video.srcObject !== stream) video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play().catch(() => {});

      // ── Fast path: native BarcodeDetector (hardware-accelerated) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      if (W.BarcodeDetector) {
        let formats = ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39"];
        try {
          const supported = await W.BarcodeDetector.getSupportedFormats?.();
          if (Array.isArray(supported) && supported.length) {
            const f = formats.filter((x) => supported.includes(x));
            if (f.length) formats = f;
          }
        } catch { /* ignore */ }
        const detector = new W.BarcodeDetector({ formats });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vid = video as any;
        const useRVFC = typeof vid.requestVideoFrameCallback === "function";
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        cancelScanRef.current = () => { stopped = true; if (timeoutId) clearTimeout(timeoutId); };
        const scan = async () => {
          if (stopped || detectedRef.current || !playingRef.current) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length && codes[0].rawValue) { handleDetected(codes[0].rawValue); return; }
          } catch { /* frame not ready */ }
          if (stopped) return;
          if (useRVFC) vid.requestVideoFrameCallback(() => scan());
          else timeoutId = setTimeout(scan, 60);
        };
        if (useRVFC) vid.requestVideoFrameCallback(() => scan());
        else timeoutId = setTimeout(scan, 60);
        return;
      }

      // ── Fallback: ZXing, but only the formats we use + scan ~12×/sec ──
      const [{ BrowserMultiFormatReader }, zlib] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { DecodeHintType, BarcodeFormat } = zlib as any;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,   // default is 500ms — far too slow
        delayBetweenScanSuccess: 250,
      });
      controlsRef.current = await reader.decodeFromStream(stream, video, (res: { getText: () => string } | undefined) => {
        if (res && !detectedRef.current) handleDetected(res.getText());
      });
    } catch {
      setError("Camera not available. Enter the barcode number manually.");
      releaseCamera();
    }
  };

  const doLookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) { setError("Enter a barcode, FNSKU, or ASIN."); return; }
    const upper = code.toUpperCase();
    const isFnsku = /^X\d{2}/i.test(upper);                              // Amazon warehouse label
    const isAsin = !isFnsku && /^[A-Z0-9]{10}$/.test(upper) && /[A-Z]/.test(upper); // 10-char alphanumeric

    setLoading(true);
    setError(null);
    setResult(null);
    setSearchResults(null);
    try {
      if (isFnsku || isAsin) {
        // FNSKU/ASIN → Amazon (F2A convert if needed → OpenWeb Ninja details)
        const res = await fetch(`/api/admin/asin-lookup?code=${encodeURIComponent(upper)}`);
        const data = await res.json();
        if (!res.ok || !data.found) {
          setError(data.message || data.error || "No product found. Try a name search below.");
          setShowSearch(true);
        } else {
          setResult(data.product);
        }
      } else {
        // Numeric UPC/EAN → UPCitemdb lookup first…
        const clean = code.replace(/\D/g, "");
        if (!clean || clean.length < 6) { setError("Enter a valid barcode (6+ digits), FNSKU, or ASIN."); return; }
        const res = await fetch(`/api/admin/barcode-lookup?upc=${clean}`);
        const data = await res.json();
        if (res.ok && data.found) {
          setResult(data.product);
        } else {
          // …UPCitemdb missed or is rate-limited — fall back to an Amazon search
          // on the barcode number so a normal barcode still pulls something up.
          setShowSearch(true);
          await doSearch(clean);
        }
      }
    } catch {
      setError("Lookup failed. Try a name search below or fill in manually.");
      setShowSearch(true);
    } finally { setLoading(false); }
  };

  // Text-search fallback: find the product by name on Amazon and show a pick list.
  const doSearch = async (q: string) => {
    const query = q.trim();
    if (!query) { setError("Type what the item is, then search."); return; }
    setSearching(true);
    setError(null);
    setSearchResults(null);
    try {
      const res = await fetch(`/api/admin/amazon-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed. Fill in manually.");
      } else if (!data.results || data.results.length === 0) {
        setError(data.message || "No matches found. Fill in manually.");
        setSearchResults([]);
      } else {
        setSearchResults(data.results as SearchResult[]);
      }
    } catch { setError("Search failed. Fill in manually."); }
    finally { setSearching(false); }
  };

  // Picking a search result pulls full details by ASIN, falling back to the row data.
  const pickSearchResult = async (r: SearchResult) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/asin-lookup?code=${encodeURIComponent(r.asin)}`);
      const data = await res.json();
      if (res.ok && data.found) {
        setResult(data.product);
      } else {
        setResult({ title: r.title, description: "", brand: r.brand || "", category: "", retailValue: r.price, images: r.image ? [r.image] : [] });
      }
    } catch {
      setResult({ title: r.title, description: "", brand: r.brand || "", category: "", retailValue: r.price, images: r.image ? [r.image] : [] });
    } finally {
      setSearchResults(null);
      setShowSearch(false);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doLookup(barcode);
  };
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doSearch(searchQuery);
  };

  // cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => releaseCamera(), []);

  // When the card is minimized, make sure the camera is fully off.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (collapsed) releaseCamera(); }, [collapsed]);

  const applyResult = (imgOverride?: string) => {
    if (!result) return;
    onFill({ ...result, images: imgOverride ? [imgOverride] : result.images });
    setResult(null);
    setBarcode("");
  };

  const BarcodeIcon = (
    <svg className="w-5 h-5 text-[#6c4d39] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M3 9V5a2 2 0 0 1 2-2h4M3 15v4a2 2 0 0 0 2 2h4M21 9V5a2 2 0 0 0-2-2h-4M21 15v4a2 2 0 0 1-2 2h-4"/>
      <line x1="7" y1="12" x2="7" y2="12.01"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="13" y1="12" x2="13" y2="12.01"/><line x1="16" y1="9" x2="16" y2="15"/>
    </svg>
  );

  // Minimized: a compact strip so the card isn't large after an item is saved.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        className="w-full flex items-center justify-between gap-2 bg-gradient-to-br from-[#6c4d39]/8 to-[#f6ecda] border border-[#6c4d39]/25 rounded-xl px-4 py-3 mb-6 hover:border-[#6c4d39]/50 transition-colors"
      >
        <span className="flex items-center gap-2 font-bold text-[#241a12] text-base">
          {BarcodeIcon} Barcode Auto-Fill
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-[#6c4d39]">
          Scan
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
        </span>
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-br from-[#6c4d39]/8 to-[#f6ecda] border border-[#6c4d39]/25 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        {BarcodeIcon}
        <span className="font-bold text-[#241a12] text-base">Barcode Auto-Fill</span>
        <span className="text-[10px] text-[#6c4d39] bg-[#6c4d39]/10 border border-[#6c4d39]/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ml-1">New</span>
        {onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            title="Minimize"
            className="ml-auto shrink-0 text-[#8a7559] hover:text-[#241a12] p-1 rounded-lg hover:bg-[#6c4d39]/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10L8 6l-4 4" /></svg>
          </button>
        )}
      </div>
      <p className="text-sm text-[#6f5b46] mb-3">Scan or type a barcode, Amazon <strong>FNSKU</strong>, or <strong>ASIN</strong> to auto-fill the item. No match? Search by name.</p>

      {/* Input row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={scanning ? releaseCamera : startCamera}
          className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-base font-semibold border shrink-0 transition-colors ${
            scanning
              ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
              : "bg-[#6c4d39]/10 text-[#6c4d39] border-[#6c4d39]/25 hover:bg-[#6c4d39]/20"
          }`}
        >
          {scanning ? (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/></svg> Stop</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="3" width="14" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="2.5"/><path d="M6 3V1.5M10 3V1.5"/></svg> Scan</>
          )}
        </button>
        <input
          type="text"
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Barcode, FNSKU, or ASIN…"
          className="flex-1 min-w-0 bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-base"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => doLookup(barcode)}
          disabled={loading || !barcode.trim()}
          className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 text-white px-4 py-3 rounded-xl text-base font-semibold shrink-0 transition-colors"
        >
          {loading ? "…" : "Look Up"}
        </button>
      </div>

      {/* Camera preview */}
      {scanning && (
        <div className="mt-3 rounded-xl overflow-hidden border-2 border-[#6c4d39]/30 relative bg-black">
          <video ref={videoRef} className="w-full max-h-48 object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-24 border-2 border-[#6c4d39] rounded-lg opacity-60" />
          </div>
          <div className="absolute bottom-2 left-0 right-0 text-center text-white/80 text-xs">Point at barcode</div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="mt-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Search-by-name toggle */}
      {!result && (
        <button
          type="button"
          onClick={() => setShowSearch(s => !s)}
          className="mt-2.5 text-sm font-semibold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2"
        >
          {showSearch ? "Hide name search" : "Can't scan it? Search by name"}
        </button>
      )}

      {/* Text-search fallback */}
      {showSearch && !result && (
        <div className="mt-3 bg-white border border-[#6c4d39]/25 rounded-xl p-4">
          <div className="text-xs text-[#8a7559] mb-1.5 font-medium">Search Amazon by name</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder='e.g. "Ninja air fryer 5.5qt"'
              className="flex-1 bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-base"
            />
            <button
              type="button"
              onClick={() => doSearch(searchQuery)}
              disabled={searching || !searchQuery.trim()}
              className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-40 text-white px-4 py-3 rounded-xl text-base font-semibold shrink-0 transition-colors"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>

          {/* Results pick list */}
          {searchResults && searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((r) => (
                <button
                  key={r.asin}
                  type="button"
                  onClick={() => pickSearchResult(r)}
                  className="w-full flex items-center gap-3 text-left bg-[#faf5ea] hover:bg-[#f1e7d5] border border-[#e3d6bf] hover:border-[#6c4d39] rounded-lg p-2.5 transition-colors"
                >
                  <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-[#efe3d0] flex items-center justify-center">
                    {r.image
                      ? <img src={r.image} alt="" className="w-full h-full object-contain" />
                      : <span className="text-[#b3a085] text-xs">No image</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#241a12] leading-snug line-clamp-2">{r.title}</div>
                    <div className="text-xs text-[#8a7559] mt-0.5 flex items-center gap-2">
                      {r.brand && <span>{r.brand}</span>}
                      {r.price != null && <span className="text-[#6c4d39] font-semibold">${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  <span className="text-[#6c4d39] text-sm font-semibold shrink-0 pr-1">Use</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result preview */}
      {result && (
        <div className="mt-3 bg-white border border-[#6c4d39]/25 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-xs text-[#6c4d39] font-semibold mb-0.5">Found product</div>
              <div className="font-bold text-[#241a12] text-sm leading-snug">{result.title}</div>
              {result.brand && <div className="text-xs text-[#8a7559] mt-0.5">{result.brand}</div>}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {result.category && <span className="text-[10px] bg-[#6c4d39]/10 text-[#6c4d39] px-2 py-0.5 rounded-full font-medium">{result.category}</span>}
              </div>
            </div>
          </div>

          {/* Image picker */}
          {result.images.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-[#8a7559] mb-1.5 font-medium">Pick a photo (optional)</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {result.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyResult(img)}
                    className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-[#6c4d39] transition-colors bg-[#efe3d0]"
                  >
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyResult()}
              className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-bold py-3 rounded-xl transition-colors"
            >
              Auto-fill form
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); setBarcode(""); }}
              className="text-[#8a7559] hover:text-[#4a3a2b] text-base px-4 py-3 border border-[#cdbda3] rounded-xl transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAuctionId = searchParams.get("auctionId") || "";

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [auctions, setAuctions] = useState<{ id: string; title: string }[]>([]);
  const [pickupLocations, setPickupLocations] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [banner, setBanner] = useState<string | null>(null);
  const [nextCode, setNextCode] = useState<string | null>(null);
  // Bumping this remounts the BarcodeScanner, clearing its internal state
  // (barcode, result, error, search results) — used by "Start fresh".
  const [scannerKey, setScannerKey] = useState(0);
  // Minimize the scan card after an item is saved so the form stays compact.
  const [scannerCollapsed, setScannerCollapsed] = useState(false);
  const [formData, setFormData] = useState({
    title: searchParams.get("title") || "",
    description: searchParams.get("description") || "",
    condition: searchParams.get("condition") || "GOOD",
    retailValue: searchParams.get("retailValue") || "",
    startingBid: searchParams.get("startingBid") || "2",
    reservePrice: searchParams.get("reservePrice") || "",
    taxDeductible: searchParams.get("taxDeductible") === "true",
    itemCode: "",
    storageLocation: searchParams.get("storageLocation") || "",
    locationId: searchParams.get("locationId") || "",
    auctionId: preselectedAuctionId,
  });

  // Auto-grow the title field so the WHOLE title is always visible (long titles
  // are where naming issues hide — never truncate them behind a scroll).
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [formData.title]);

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(d => { if (d.orgId) setOrgId(d.orgId); }).catch(() => {});
    fetch("/api/auctions").then(r => r.json()).then(d => {
      if (d.auctions) setAuctions(d.auctions.filter((a: { id: string; title: string; status: string }) =>
        ["DRAFT","OPEN","CLOSING"].includes(a.status)
      ));
    }).catch(() => {});
    fetch("/api/admin/pickup/locations").then(r => r.json()).then(d => {
      if (d.locations) setPickupLocations(
        d.locations.filter((l: { isActive: boolean }) => l.isActive)
          .map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))
      );
    }).catch(() => {});
  }, []);

  // Mint a random code so staff can tag the item before saving.
  const genCode = async () => {
    try {
      const d = await fetch("/api/admin/next-item-code").then((r) => r.json());
      if (d.code) {
        setNextCode(d.code);
        setFormData((prev) => ({ ...prev, itemCode: d.code }));
      }
    } catch { /* non-critical */ }
  };

  // Generate a code once on load.
  useEffect(() => { genCode(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  // Called when barcode scan succeeds — auto-fill form fields
  const handleBarcodeFill = (result: BarcodeResult) => {
    setFormData(prev => ({
      ...prev,
      title: result.title || prev.title,
      // Pulled-in descriptions can be paragraphs of marketing copy — keep it to
      // 2-3 sentences so the listing stays tight and scannable.
      description: result.description ? shortenDescription(result.description, 3) : prev.description,
      retailValue: result.retailValue != null ? String(result.retailValue) : prev.retailValue,
    }));
    // Import all images (up to 3)
    result.images.forEach(url => importImageFromUrl(url));
  };

  const importImageFromUrl = async (url: string) => {
    try {
      const res = await fetch(`/api/admin/import-image?url=${encodeURIComponent(url)}`);
      if (!res.ok) return;
      const { publicUrl } = await res.json();
      if (publicUrl) setPhotos(prev => prev.includes(publicUrl) ? prev : [...prev, publicUrl]);
    } catch { /* non-critical */ }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 10) { alert("Maximum 10 photos per item"); return; }
    setUploading(true);
    const failed: string[] = [];
    for (const file of files) {
      let fileType = file.type;
      if (!fileType) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const extMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif" };
        fileType = extMap[ext] ?? "image/jpeg";
      }
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, fileType }) });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const e = await res.json(); if (e?.error) detail = e.error; } catch {}
          throw new Error(`upload-link failed: ${detail}`);
        }
        const { signedUrl, publicUrl } = await res.json();
        const putRes = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": fileType } });
        if (!putRes.ok) throw new Error(`R2 rejected upload: HTTP ${putRes.status}`);
        setPhotos(prev => [...prev, publicUrl]);
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err);
        failed.push(`${file.name} — ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    e.target.value = "";
    setUploading(false);
    if (failed.length) alert(`Failed to upload: ${failed.join(", ")}`);
  };

  // Make the chosen photo the main one by moving it to the front (index 0 = primary).
  const setMainPhoto = (i: number) => {
    setPhotos((prev) => {
      if (i <= 0 || i >= prev.length) return prev;
      const next = [...prev];
      const [chosen] = next.splice(i, 1);
      next.unshift(chosen);
      return next;
    });
  };

  // "Start fresh" — wipe the whole form back to a blank new item without a full
  // page reload (there's no browser refresh in the installed standalone app).
  // Clears every field + photos, mints a new code, and remounts the scanner so
  // its barcode/result/error/search state is cleared too.
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      condition: "GOOD",
      retailValue: "",
      startingBid: "2",
      reservePrice: "",
      taxDeductible: false,
      itemCode: "",
      storageLocation: "",
      locationId: "",
      auctionId: preselectedAuctionId,
    });
    setPhotos([]);
    setBanner(null);
    setNextCode(null);
    genCode();
    setScannerKey((k) => k + 1);
    setScannerCollapsed(false); // fresh item — show the full scanner again
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // addAnother = true → after saving, reset only the per-item fields and stay on
  // the page so the owner can keep building the catalog quickly.
  const handleSave = async (addAnother = false) => {
    if (uploading) { alert("Please wait for photos to finish uploading."); return; }
    if (saving) return;
    if (!formData.title) { alert("Please enter an item title"); return; }
    if (!formData.locationId) { alert("Please choose a warehouse for this item."); return; }
    if (!orgId) { alert("Business not loaded. Please refresh."); return; }
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, photos, organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        if (addAnother) {
          // Keep auction, location, condition, and category for the next item.
          setFormData((prev) => ({
            ...prev,
            title: "",
            description: "",
            retailValue: "",
            startingBid: "2",
            reservePrice: "",
            taxDeductible: false,
            // preserved: condition, storageLocation (spot), locationId (warehouse), auctionId
          }));
          setPhotos([]);
          // Mint a fresh code for the next item.
          genCode();
          // Remount the scanner so its barcode/result/search state is cleared too,
          // and minimize it so the form stays compact for the next entry.
          setScannerKey((k) => k + 1);
          setScannerCollapsed(true);
          setBanner("Item saved. Ready for the next one.");
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          router.push(preselectedAuctionId ? `/admin/auctions/${preselectedAuctionId}` : "/admin/auctions");
        }
      } else {
        alert("Error saving item: " + data.error);
      }
    } catch { alert("Something went wrong."); }
    finally { setSaving(false); }
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex items-center gap-2 min-w-0">
        {preselectedAuctionId ? (
          <Link href={`/admin/auctions/${preselectedAuctionId}`} className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Auction</Link>
        ) : (
          <Link href="/admin/items" className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Items</Link>
        )}
        <span className="text-[#8a7559]">/</span>
        <h1 className="text-2xl sm:text-3xl font-semibold">Add New Item</h1>
        <button
          type="button"
          onClick={resetForm}
          title="Clear everything and start a fresh item"
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 min-h-[44px] text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-3.5 py-2 text-base font-semibold transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2v3h-3" />
          </svg>
          <span className="hidden sm:inline">Start fresh</span>
        </button>
      </header>

      <div className="flex-1 px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 overflow-auto">
        <div className="lg:col-span-2 space-y-6">

          {/* Success banner (Save & Add Another) */}
          {banner && (
            <div className="bg-[#5f7a45]/10 border border-[#5f7a45]/30 text-[#3f5430] rounded-xl px-4 py-3.5 text-base font-medium flex items-center gap-2">
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l4 4 8-8"/></svg>
              {banner}
            </div>
          )}

          {/* ── Barcode scanner ── (keyed so "Start fresh" / "Save & Add Another" remount it clean) */}
          <BarcodeScanner key={scannerKey} onFill={handleBarcodeFill} collapsed={scannerCollapsed} onCollapsedChange={setScannerCollapsed} />

          {/* ── Item details ── */}
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Item Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Item Title *</label>
                <textarea ref={titleRef} name="title" value={formData.title} onChange={handleChange} rows={1}
                  placeholder='e.g. Apple iPad Pro 12.9"'
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] resize-none overflow-hidden leading-snug" />
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                  placeholder="Describe the item..."
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] resize-none" />
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Condition *</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "NEW", label: "New" },
                    { value: "LIKE_NEW", label: "Like New" },
                    { value: "GOOD", label: "Good" },
                    { value: "FAIR", label: "Fair" },
                    { value: "POOR", label: "Poor" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, condition: c.value }))}
                      className={`px-4 py-2.5 rounded-xl text-base font-semibold border transition-colors ${
                        formData.condition === c.value
                          ? "bg-[#6c4d39] text-white border-[#6c4d39]"
                          : "bg-[#efe3d0] text-[#4a3a2b] border-[#cdbda3] hover:bg-[#e7dcc6]"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Pricing ── */}
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Pricing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Retail / Est. Value", name: "retailValue", placeholder: "0.00" },
                { label: "Starting Bid *", name: "startingBid", placeholder: "0.00" },
                { label: "Reserve Price", name: "reservePrice", placeholder: "Optional" },
              ].map((field) => (
                <div key={field.name}>
                  <label className="text-base text-[#6f5b46] mb-1.5 block">{field.label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-[#8a7559]">$</span>
                    <input name={field.name} value={formData[field.name as keyof typeof formData] as string}
                      onChange={handleChange} type="number" placeholder={field.placeholder}
                      className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl pl-7 pr-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Photos ── */}
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Photos <span className="text-[#8a7559] text-base font-normal">(up to 10)</span></h2>
            <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            <label htmlFor="photo-upload"
              className="border-2 border-dashed border-[#cdbda3] rounded-xl p-8 text-center hover:border-[#6c4d39] transition-colors cursor-pointer block">
              <div className="text-[#8a7559] mb-2 flex justify-center">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="15" rx="2"/><circle cx="12" cy="13.5" r="4"/><path d="M9 6l1.5-3h3L15 6"/>
                </svg>
              </div>
              <div className="text-[#6f5b46] text-base">{uploading ? "Uploading..." : "Click to upload photos"}</div>
              <div className="text-[#8a7559] text-sm mt-1">PNG, JPG up to 10MB each</div>
            </label>
            {photos.length > 0 && (
              <>
                <p className="text-[#8a7559] text-sm mt-4 mb-2">The <strong className="text-[#6c4d39]">Main photo</strong> is what bidders see first. Tap “Set as main” on any photo to change it.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((url, i) => (
                    <div key={i} className={`relative aspect-square bg-[#efe3d0] rounded-xl overflow-hidden border-2 ${i === 0 ? "border-[#6c4d39]" : "border-[#e3d6bf]"}`}>
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                      {i === 0 ? (
                        <span className="absolute top-2 left-2 bg-[#6c4d39] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow">Main photo</span>
                      ) : (
                        <button type="button" onClick={() => setMainPhoto(i)}
                          className="absolute bottom-2 left-2 bg-white/95 hover:bg-white text-[#6c4d39] text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#cdbda3] shadow-sm transition-colors">
                          Set as main
                        </button>
                      )}
                      <button type="button" onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white text-base rounded-full w-7 h-7 flex items-center justify-center shadow">×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">Item Location</h2>
            <p className="text-[#8a7559] text-sm mb-4">Where this item is stored. Its tag # is shown next to the Save buttons.</p>

            <div>
              <label className="text-base text-[#6f5b46] mb-1.5 block">Location</label>
              <input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                placeholder="e.g. Shelf 2 / Bin 4 / Row C"
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]" />
              <p className="text-[#8a7559] text-sm mt-2">Where it sits inside the warehouse</p>
            </div>

            <div className="mt-4">
              <label className="text-base text-[#6f5b46] mb-1.5 block">Warehouse *</label>
              {pickupLocations.length === 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-base text-amber-800">
                  You don&apos;t have any warehouses yet. Items need a warehouse before they can be saved.{" "}
                  <a href="/admin/pickup" className="font-semibold underline underline-offset-2">Set up a warehouse first →</a>
                </div>
              ) : (
                <>
                  <select name="locationId" value={formData.locationId} onChange={handleChange}
                    className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
                    <option value="">Choose a warehouse…</option>
                    {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <p className="text-[#8a7559] text-sm mt-2">Which warehouse this item is in (Owosso, Gladwin, …)</p>
                </>
              )}
            </div>
          </div>

          {/* Auction picker only when NOT created inside an auction (it's pre-assigned otherwise). */}
          {!preselectedAuctionId && (
            <div className="bg-white border border-[#e3d6bf] rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Assign to Auction</h2>
              <select name="auctionId" value={formData.auctionId} onChange={handleChange}
                className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]">
                <option value="">Save as draft</option>
                {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <footer className="bar-safe-bottom safe-x border-t border-[#e3d6bf] bg-[#faf5ea] px-6 sm:px-8 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Tag # right by the Save buttons — write it on the item before saving. */}
        {nextCode ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-[#6c4d39]/10 border border-[#6c4d39]/30 px-4 py-2.5">
            <span className="text-sm font-semibold text-[#6f5b46] leading-tight">Write on tag</span>
            <span className="font-mono text-2xl font-extrabold text-[#6c4d39] tracking-wider whitespace-nowrap">#{nextCode}</span>
          </div>
        ) : <span className="hidden sm:block" />}
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => handleSave(true)} disabled={saving || uploading}
            className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] disabled:opacity-50 text-[#241a12] text-base px-6 py-3.5 rounded-xl font-semibold transition-colors">
            {saving ? "Saving..." : "Save & Add Another"}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || uploading}
            className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base px-6 py-3.5 rounded-xl font-semibold transition-colors">
            {saving ? "Saving..." : uploading ? "Uploading..." : "Save Item"}
          </button>
        </div>
      </footer>
    </>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={
      <>
        <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex items-center gap-2">
          <Skeleton className="h-8 w-48" />
        </header>
        <div className="flex-1 px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-28 w-full rounded-xl" />
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
    }>
      <NewItemForm />
    </Suspense>
  );
}
