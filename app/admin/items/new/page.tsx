"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";
import { PageHeader, PageBody, Panel, Btn, Input, Notice, Eyebrow } from "../../ui";

// Select / textarea share the kit Input look (the kit only ships a text input).
const fieldCls =
  "w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";

/** Chip button — the kit's Segmented look as a standalone toggle (44px tall). */
function Chip({
  on, children, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-bold border transition-colors ${
        on ? "bg-[#241a12] text-[#f6ecda] border-[#241a12] shadow-sm" : "bg-white text-[#6f5b46] border-[#e6dac6] hover:bg-[#f4ede1]"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

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
  onFillingChange,
  collapsed = false,
  onCollapsedChange,
  comboMode = false,
  onAddComboPhoto,
  autoStart = false,
}: {
  onFill: (r: BarcodeResult) => void;
  // Toggles the parent's full-screen "filling…" overlay. Fired TRUE the instant a
  // scan/lookup or a "Use" tap begins (before the network call) so it's obvious work
  // started, and FALSE if that path dead-ends (no match, error, or a combo pick) —
  // when it hands off to onFill, the parent owns the overlay from there.
  onFillingChange?: (v: boolean) => void;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
  // Combo mode: picking a result photo just adds it to the collage (no title/price
  // fill), and the scanner resets so the next item can be scanned right away.
  comboMode?: boolean;
  onAddComboPhoto?: (url: string) => void;
  // Fire the camera up the moment we mount (used right after "Save & add another"
  // so the next item is ready to scan with zero taps).
  autoStart?: boolean;
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
  const comboRef = useRef(comboMode);
  comboRef.current = comboMode;

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

  // A scan/lookup hit. Outside of combo mode this goes STRAIGHT into the form —
  // no "apply" step. (Combo mode still shows the picker so one photo can be chosen.)
  // Returns true when it handed the product to onFill (parent then owns the overlay),
  // false for a combo pick (which shows the photo picker instead).
  const acceptProduct = (product: BarcodeResult): boolean => {
    if (comboRef.current) {
      setResult(product);
      return false;
    }
    onFill(product);
    setResult(null);
    setBarcode("");
    setShowSearch(false);
    return true;
  };

  const doLookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) { setError("Enter a barcode, FNSKU, or ASIN."); return; }
    const upper = code.toUpperCase();
    const isFnsku = /^X\d{2}/i.test(upper);                              // Amazon warehouse label
    const isAsin = !isFnsku && /^[A-Z0-9]{10}$/.test(upper) && /[A-Z]/.test(upper); // 10-char alphanumeric

    // Show the "filling…" overlay the instant a lookup starts (before the network
    // call). Cleared in `finally` UNLESS the product handed off to onFill, in which
    // case the parent's fill owns the overlay through the photo import.
    onFillingChange?.(true);
    let handedOff = false;
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
          handedOff = acceptProduct(data.product);
        }
      } else {
        // Numeric UPC/EAN → UPCitemdb lookup first…
        const clean = code.replace(/\D/g, "");
        if (!clean || clean.length < 6) { setError("Enter a valid barcode (6+ digits), FNSKU, or ASIN."); return; }
        const res = await fetch(`/api/admin/barcode-lookup?upc=${clean}`);
        const data = await res.json();
        if (res.ok && data.found) {
          handedOff = acceptProduct(data.product);
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
    } finally {
      setLoading(false);
      if (!handedOff) onFillingChange?.(false);
    }
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
  // Tapping a result IS the confirmation — it fills the form immediately (one tap).
  // Combo mode is the exception: it still shows the card so you can tap the ONE photo
  // to drop into the collage.
  const pickSearchResult = async (r: SearchResult) => {
    onFillingChange?.(true); // overlay the instant "Use" is tapped
    setLoading(true);
    setError(null);
    try {
      let product: BarcodeResult;
      try {
        const res = await fetch(`/api/admin/asin-lookup?code=${encodeURIComponent(r.asin)}`);
        const data = await res.json();
        product = res.ok && data.found
          ? data.product
          : { title: r.title, description: "", brand: r.brand || "", category: "", retailValue: r.price, images: r.image ? [r.image] : [] };
      } catch {
        product = { title: r.title, description: "", brand: r.brand || "", category: "", retailValue: r.price, images: r.image ? [r.image] : [] };
      }

      if (comboMode) {
        setResult(product);        // keep the card so a single photo can be picked
        onFillingChange?.(false);  // no full fill in combo — drop the overlay
      } else {
        // One tap: fill the form now. onFill (parent) owns the overlay from here.
        onFill(product);
        setResult(null);
        setBarcode("");
        setShowSearch(false);
      }
    } finally {
      setSearchResults(null);
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

  // Straight into scan mode after a save — no tap needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoStart && !collapsed) startCamera(); }, []);

  // When the card is minimized, make sure the camera is fully off.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (collapsed) releaseCamera(); }, [collapsed]);

  const applyResult = (imgOverride?: string) => {
    if (!result) return;
    onFill({ ...result, images: imgOverride ? [imgOverride] : result.images });
    setResult(null);
    setBarcode("");
    setShowSearch(false);
  };

  // Minimized: a compact strip so the card isn't large after a scan lands.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        className="w-full min-h-[56px] flex items-center justify-between gap-3 rounded-2xl bg-white border border-[#e6dac6] px-4 py-3 hover:bg-[#faf5ea] hover:border-[#c47b3e]/50 transition-colors nb-lift-sm"
      >
        <span className="flex items-center gap-2.5 font-bold text-[#241a12] text-base">
          <svg className="w-5 h-5 text-[#6c4d39]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="3" width="14" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="2.5"/><path d="M6 3V1.5M10 3V1.5"/></svg>
          Scan another barcode
        </span>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdbda3]"><path d="M4 6l4 4 4-4" /></svg>
      </button>
    );
  }

  return (
    <Panel>
      <div className="p-3 sm:p-4">
      {/* Input row */}
      <div className="flex gap-2">
        <Btn
          type="button"
          onClick={scanning ? releaseCamera : startCamera}
          tone={scanning ? "red" : "leather"}
          variant={scanning ? "outline" : "solid"}
          className="shrink-0 !px-4"
        >
          {scanning ? (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/></svg> Stop</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="3" width="14" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="2.5"/><path d="M6 3V1.5M10 3V1.5"/></svg> Scan</>
          )}
        </Btn>
        <Input
          type="text"
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="or type barcode / FNSKU / ASIN"
          className="flex-1 min-w-0 text-base"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <Btn
          type="button"
          onClick={() => doLookup(barcode)}
          disabled={loading || !barcode.trim()}
          tone="slate"
          variant="outline"
          className="shrink-0 !px-4"
        >
          {loading ? "…" : "Go"}
        </Btn>
      </div>

      {/* Camera preview */}
      {scanning && (
        <div className="mt-3 rounded-xl overflow-hidden border-2 border-[#6c4d39]/30 relative bg-black">
          <video ref={videoRef} className="w-full max-h-48 object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-24 border-2 border-[#f0a35a] rounded-lg opacity-70" />
          </div>
          <div className="absolute bottom-2 left-0 right-0 text-center text-white/80 text-xs">Point at barcode</div>
        </div>
      )}

      {loading && !scanning && (
        <p className="mt-2.5 text-sm font-semibold text-[#6c4d39]">Looking it up…</p>
      )}

      {/* Error */}
      {error && !loading && (
        <Notice tone="amber" className="mt-2.5">{error}</Notice>
      )}

      {/* Search-by-name toggle */}
      {!result && (
        <button
          type="button"
          onClick={() => setShowSearch(s => !s)}
          className="mt-1 min-h-[44px] text-sm font-bold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2"
        >
          {showSearch ? "Hide name search" : "Can't scan it? Search by name"}
        </button>
      )}

      {/* Text-search fallback */}
      {showSearch && !result && (
        <div className="mt-2 bg-[#faf5ea] border border-[#e6dac6] rounded-xl p-3 sm:p-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder='e.g. "Ninja air fryer 5.5qt"'
              className="flex-1 min-w-0 text-base"
            />
            <Btn
              type="button"
              onClick={() => doSearch(searchQuery)}
              disabled={searching || !searchQuery.trim()}
              className="shrink-0 !px-4"
            >
              {searching ? "…" : "Search"}
            </Btn>
          </div>

          {/* Results pick list */}
          {searchResults && searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((r) => (
                <button
                  key={r.asin}
                  type="button"
                  onClick={() => pickSearchResult(r)}
                  className="w-full min-h-[56px] flex items-center gap-3 text-left bg-white hover:bg-[#faf5ea] border border-[#e6dac6] hover:border-[#c47b3e]/50 rounded-xl p-2.5 transition-colors"
                >
                  <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#efe3d0] flex items-center justify-center">
                    {r.image
                      ? <img src={r.image} alt="" className="w-full h-full object-contain" />
                      : <span className="text-[#b3a085] text-xs">No image</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#241a12] leading-snug line-clamp-2">{r.title}</div>
                    <div className="text-xs text-[#8a7559] mt-0.5 flex items-center gap-2">
                      {r.brand && <span>{r.brand}</span>}
                      {r.price != null && <span className="text-[#6c4d39] font-bold">${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  <span className="text-[#6c4d39] text-sm font-bold shrink-0 pr-1">Use</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result preview — only for name-search picks and combo scans. */}
      {result && (
        <div className="mt-3 bg-white border-2 border-[#6c4d39] rounded-xl p-4">
          <Eyebrow className="!text-[#6c4d39] mb-1">
            {comboMode ? "Add to combo" : "Confirm this is it"}
          </Eyebrow>
          <div className="font-bold text-[#241a12] text-sm leading-snug">{result.title}</div>
          {result.brand && <div className="text-xs text-[#8a7559] mt-0.5">{result.brand}</div>}

          {/* Image picker */}
          {result.images.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-[#8a7559] mb-1.5 font-medium">
                {comboMode ? "Tap ONE photo to add it to the collage" : "Tap a photo to use it as the main photo"}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {result.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (comboMode) {
                        onAddComboPhoto?.(img);
                        setResult(null);
                        setBarcode("");
                      } else {
                        applyResult(img);
                      }
                    }}
                    className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-[#6c4d39] transition-colors bg-[#efe3d0]"
                  >
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            {!comboMode && (
              <Btn type="button" onClick={() => applyResult()} className="flex-1">
                Use this — fill the form
              </Btn>
            )}
            <Btn
              type="button"
              onClick={() => { setResult(null); setBarcode(""); }}
              tone="slate"
              variant="outline"
              className={comboMode ? "flex-1" : ""}
            >
              {comboMode ? "Skip / scan next" : "Not it"}
            </Btn>
          </div>
        </div>
      )}
      </div>
    </Panel>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────
// Every stage of the listing is the same shape: numbered chip, colored spine,
// title, an at-a-glance "done" tick, and the fields. Top to bottom, no hunting.

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
  // Shelf/spot names already used for the chosen auction + warehouse — powers the
  // storage-location autocomplete so a run of items lands in consistent spots.
  const [spotOptions, setSpotOptions] = useState<string[]>([]);
  // Covers the form with a spinner while a scan/search auto-fills it, so the fields
  // and photos don't visibly pop in one at a time — then reveals the filled form.
  const [filling, setFilling] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [banner, setBanner] = useState<string | null>(null);
  const [nextCode, setNextCode] = useState<string | null>(null);
  // The code on the item you JUST saved — in case you save before writing the tag.
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastTitle, setLastTitle] = useState<string | null>(null);
  // Bumping this remounts the BarcodeScanner, clearing its internal state.
  const [scannerKey, setScannerKey] = useState(0);
  // Collapse the scan card once a scan has landed in the form.
  const [scannerCollapsed, setScannerCollapsed] = useState(false);
  // After "Save & add another" the scanner reopens AND fires the camera itself.
  const [scannerAutoStart, setScannerAutoStart] = useState(false);
  const [formData, setFormData] = useState({
    title: searchParams.get("title") || "",
    description: searchParams.get("description") || "",
    condition: searchParams.get("condition") || "NEW",
    size: searchParams.get("size") || "",
    retailValue: searchParams.get("retailValue") || "",
    startingBid: searchParams.get("startingBid") || "2",
    reservePrice: searchParams.get("reservePrice") || "",
    taxDeductible: searchParams.get("taxDeductible") === "true",
    itemCode: "",
    storageLocation: searchParams.get("storageLocation") || "",
    locationId: searchParams.get("locationId") || "",
    auctionId: preselectedAuctionId,
    isPremium: false,
    packSize: 0,
    transferable: true,
  });
  // Combo lot builder: sell several items as ONE lot with a photo collage.
  const [combo, setCombo] = useState(false);
  const toggleCombo = () => {
    setCombo((on) => {
      const next = !on;
      setFormData((prev) => ({ ...prev, packSize: next ? (prev.packSize > 1 ? prev.packSize : 2) : 0 }));
      if (next) setScannerCollapsed(false);
      return next;
    });
  };
  const setPackSize = (n: number) => setFormData((prev) => ({ ...prev, packSize: n }));

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

  // Load the spot names already used for this auction + warehouse whenever either
  // changes, so the shelf/spot field can suggest them.
  useEffect(() => {
    if (!formData.locationId) { setSpotOptions([]); return; }
    const params = new URLSearchParams({ locationId: formData.locationId });
    if (formData.auctionId) params.set("auctionId", formData.auctionId);
    let live = true;
    fetch(`/api/admin/items/spots?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (live && Array.isArray(d.spots)) setSpotOptions(d.spots); })
      .catch(() => {});
    return () => { live = false; };
  }, [formData.locationId, formData.auctionId]);

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

  // A scan/search landed — fill the form behind a spinner so nothing visibly pops
  // in. We set the text fields, import ALL photos in parallel, add them in one batch,
  // then lift the overlay to reveal the finished form. A short minimum keeps the
  // spinner from flickering when everything's already cached.
  const handleBarcodeFill = async (result: BarcodeResult) => {
    setFilling(true);
    setScannerCollapsed(true);
    setFormData(prev => ({
      ...prev,
      title: result.title || prev.title,
      // Pulled-in descriptions can be paragraphs of marketing copy — keep it to
      // 2-3 sentences so the listing stays tight and scannable.
      description: result.description ? shortenDescription(result.description, 3) : prev.description,
      retailValue: result.retailValue != null ? String(result.retailValue) : prev.retailValue,
    }));

    try {
      const urls = await Promise.all((result.images ?? []).map(fetchImageUrl));
      const good = urls.filter((u): u is string => !!u);
      if (good.length) {
        setPhotos(prev => {
          const merged = [...prev];
          for (const u of good) if (!merged.includes(u)) merged.push(u);
          return merged.slice(0, 10);
        });
      }
    } catch { /* non-critical — text fields still filled */ }

    setBanner("");        // no "filled from scan" notice — the ready form is the signal
    setFilling(false);
  };

  // Import one remote image, returning the hosted URL (or null). Used by the batch
  // fill above so we can await them all and add photos in one go.
  const fetchImageUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/import-image?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const { publicUrl } = await res.json();
      return publicUrl || null;
    } catch { return null; }
  };

  // Single-image import that adds straight to the grid — used by combo mode, which
  // adds photos one tap at a time (no bulk fill).
  const importImageFromUrl = async (url: string) => {
    const publicUrl = await fetchImageUrl(url);
    if (publicUrl) setPhotos(prev => prev.includes(publicUrl) ? prev : [...prev, publicUrl]);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 10) { setBanner("Maximum 10 photos per item."); return; }
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
    if (failed.length) setBanner(`Couldn't upload: ${failed.join(", ")}`);
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

  const scrollTop = () => {
    if (typeof window === "undefined") return;
    // The admin shell scrolls an inner container, not the window — nudge both.
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll<HTMLElement>("[data-scroll-root]").forEach((el) =>
      el.scrollTo({ top: 0, behavior: "smooth" })
    );
  };

  // "Start fresh" — wipe the whole form back to a blank new item without a full
  // page reload (there's no browser refresh in the installed standalone app).
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      condition: "NEW",
      size: "",
      retailValue: "",
      startingBid: "2",
      reservePrice: "",
      taxDeductible: false,
      itemCode: "",
      storageLocation: "",
      locationId: "",
      auctionId: preselectedAuctionId,
      isPremium: false,
      packSize: 0,
      transferable: true,
    });
    setCombo(false);
    setPhotos([]);
    setBanner(null);
    setNextCode(null);
    genCode();
    setScannerKey((k) => k + 1);
    setScannerAutoStart(false);
    setScannerCollapsed(false);
    scrollTop();
  };

  // addAnother = true → keep the auction/warehouse/spot/condition, clear the rest,
  // jump back to the top, and re-arm the scanner for the next item.
  const handleSave = async (addAnother = false) => {
    if (uploading) { setBanner("Hang on — photos are still uploading."); return; }
    if (saving) return;
    if (!formData.title) { setBanner("Give the item a title first."); scrollTop(); return; }
    if (!formData.locationId) { setBanner("Pick a warehouse — step 5."); return; }
    if (!orgId) { setBanner("Business not loaded — pull down to refresh."); return; }
    setSaving(true);
    setBanner(null);
    const savedCode = formData.itemCode;
    const savedTitle = formData.title;
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, photos, organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        if (addAnother) {
          setFormData((prev) => ({
            ...prev,
            title: "",
            description: "",
            size: "",
            retailValue: "",
            startingBid: "2",
            reservePrice: "",
            taxDeductible: false,
            isPremium: false,
            packSize: 0,
            transferable: true,
            // preserved: condition, storageLocation (spot), locationId (warehouse), auctionId
          }));
          setCombo(false);
          setPhotos([]);
          setLastCode(savedCode || null);
          setLastTitle(savedTitle);
          genCode();
          // Remount the scanner clean and ready — but DON'T auto-open the camera.
          // The next item might be entered manually; let the user tap Scan to start.
          setScannerKey((k) => k + 1);
          setScannerCollapsed(false);
          setScannerAutoStart(false);
          setBanner("Saved. Scan the next item or enter it manually.");
          scrollTop();
        } else {
          router.push(preselectedAuctionId ? `/admin/auctions/${preselectedAuctionId}` : "/admin/auctions");
        }
      } else {
        setBanner("Couldn't save: " + data.error);
      }
    } catch { setBanner("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  const labelCls = "text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559] mb-1 block";

  return (
    <>
      {/* Auto-fill overlay — spinner while a scan/search fills the form. Shows the
          item's tag # front-and-centre so staff can write it on the item while they
          wait, instead of hunting for it after the form loads. */}
      {filling && (
        <div className="fixed inset-0 z-[60] bg-[#f4ede1]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-14 h-14 rounded-full border-4 border-[#e6dac6] border-t-[#6c4d39] animate-spin" />
          {formData.itemCode && (
            <div className="flex flex-col items-center gap-1">
              <Eyebrow>Write this on the item</Eyebrow>
              <div className="font-display text-5xl sm:text-6xl font-black tracking-tight text-[#241a12] tabular-nums leading-none">
                #{formData.itemCode}
              </div>
            </div>
          )}
          <div className="font-display text-lg font-black text-[#6c4d39]">Filling the form…</div>
          <div className="text-sm text-[#8a7559]">Pulling in the title, price &amp; photos</div>
        </div>
      )}

      <PageHeader
        title="Add a lot"
        sub={preselectedAuctionId ? "Goes straight into this auction." : "Scan it, tag it, save it. Next."}
        back={preselectedAuctionId ? { href: `/admin/auctions/${preselectedAuctionId}`, label: "Auction" } : { href: "/admin/auctions", label: "Auctions" }}
        tabs={!preselectedAuctionId}
        actions={
          <Btn
            type="button"
            onClick={resetForm}
            title="Clear everything and start a fresh item"
            variant="outline"
            size="sm"
            className="min-h-[44px]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2v3h-3" />
            </svg>
            Start fresh
          </Btn>
        }
      />

      <div data-scroll-root className="flex-1 overflow-auto">
        <PageBody>
        <div className="space-y-3">

          {/* Status banner (scan landed / item saved). */}
          {banner && (() => {
            const good = /saved|filled|ready/i.test(banner);
            return (
              <Notice tone={good ? "green" : "red"} className="flex items-center gap-2 text-base">
                <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  {good ? <path d="M4 10l4 4 8-8" /> : <><circle cx="10" cy="10" r="8" /><path d="M10 6v5M10 13.5v.5" /></>}
                </svg>
                {banner}
              </Notice>
            );
          })()}

          {/* ── Big tag # + combo ── */}
          <div className="rounded-2xl bg-[#241a12] text-[#fbf4e6] px-4 py-3.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Eyebrow className="!text-[#b9a688]">Write this # on the item</Eyebrow>
              <div className="font-mono font-black tracking-wider leading-none text-5xl sm:text-6xl mt-1">#{nextCode || "…"}</div>
              {lastCode && <div className="text-[11px] text-[#b9a688] mt-1.5 truncate">Last saved #{lastCode}{lastTitle ? ` · ${lastTitle}` : ""}</div>}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Btn
                type="button"
                onClick={toggleCombo}
                tone={combo ? "amber" : "leather"}
                variant={combo ? "solid" : "outline"}
                size="sm"
                className="min-h-[44px]"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="6" height="6" rx="1" /><rect x="8.5" y="1.5" width="6" height="6" rx="1" /><rect x="1.5" y="8.5" width="6" height="6" rx="1" /><rect x="8.5" y="8.5" width="6" height="6" rx="1" /></svg>
                {combo ? "Combo on" : "Combo"}
              </Btn>
            </div>
          </div>

          {/* Combo size picker (only when on). */}
          {combo && (
            <div className="rounded-2xl bg-[#fbeed8] border border-[#eed3ab] px-3 py-2.5 flex items-center gap-2 flex-wrap">
              <Eyebrow className="!text-[#8a4f1c]">Lot size</Eyebrow>
              {[2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} on={formData.packSize === n} onClick={() => setPackSize(n)} className="min-w-[44px]">{n}</Chip>
              ))}
              <span className="text-xs font-semibold text-[#8a4f1c] ml-auto">{photos.length}/{formData.packSize} photos · one code</span>
            </div>
          )}

          {/* Scanner (collapsed until you tap it — fills the fields below). */}
          <BarcodeScanner
            key={scannerKey}
            onFill={handleBarcodeFill}
            onFillingChange={setFilling}
            collapsed={scannerCollapsed}
            onCollapsedChange={setScannerCollapsed}
            comboMode={combo}
            onAddComboPhoto={importImageFromUrl}
            autoStart={scannerAutoStart}
          />

          <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />

          {/* ── Details ── */}
          <Panel title="Details">
            <div className="p-3 sm:p-4 space-y-3">
              {/* Title */}
              <textarea ref={titleRef} name="title" value={formData.title} onChange={handleChange} rows={1}
                placeholder='Title * — e.g. Apple iPad Pro 12.9"'
                className={`${fieldCls} resize-none overflow-hidden leading-snug py-2.5 text-base font-semibold`} />

              {/* Condition chips */}
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
                      className="!px-1 text-xs sm:text-sm">{c.label}</Chip>
                  ))}
                </div>
              </div>

              {/* Size + Feature */}
              <div className="grid grid-cols-2 gap-2">
                <Input name="size" value={formData.size} onChange={handleChange} placeholder="Size (optional)" className="text-base" />
                <Chip on={formData.isPremium} onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
                  {formData.isPremium ? "Featured" : "Feature"}
                </Chip>
              </div>

              {/* Description — compact, optional. */}
              <textarea name="description" value={formData.description} onChange={handleChange} rows={2}
                placeholder="Description (optional)"
                className={`${fieldCls} resize-none py-2.5 text-base`} />
            </div>
          </Panel>

          {/* ── Pricing ── */}
          <Panel title="Pricing">
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Retail", name: "retailValue", placeholder: "0" },
                  { label: "Start *", name: "startingBid", placeholder: "2" },
                  { label: "Reserve", name: "reservePrice", placeholder: "—" },
                ].map((field) => (
                  <div key={field.name}>
                    <label className={labelCls}>{field.label}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                      <Input name={field.name} value={formData[field.name as keyof typeof formData] as string}
                        onChange={handleChange} type="number" inputMode="decimal" placeholder={field.placeholder}
                        className="!pl-7 !pr-2 text-base tabular-nums" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* ── Location ── */}
          <Panel title="Location">
            <div className="p-3 sm:p-4 space-y-3">
              {/* Warehouse + spot */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Warehouse *</label>
                  {pickupLocations.length === 0 ? (
                    <Link href="/admin/pickup" className="flex items-center min-h-[46px] rounded-xl border border-[#eed3ab] bg-[#fbeed8] px-3 text-sm text-[#8a4f1c] font-bold">Set one up</Link>
                  ) : (
                    <select name="locationId" value={formData.locationId} onChange={handleChange}
                      className={`${fieldCls} text-base ${!formData.locationId ? "!border-[#c47b3e]" : ""}`}>
                      <option value="">Choose…</option>
                      {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Shelf / spot</label>
                  <Input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                    placeholder="Type a new spot" autoComplete="off" className="text-base" />
                </div>
              </div>
              {/* Spots already used for this auction + warehouse — tap to reuse.
                  (A tappable chip row, not a native <datalist>, which doesn't render
                  reliably on mobile.) */}
              {spotOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {spotOptions.slice(0, 12).map((s) => (
                    <Chip key={s} on={formData.storageLocation === s}
                      onClick={() => setFormData((prev) => ({ ...prev, storageLocation: s }))}
                      className="text-xs">
                      {s}
                    </Chip>
                  ))}
                </div>
              )}

              {/* Transfer + auction */}
              <div className={`grid gap-2 ${preselectedAuctionId ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
                <Chip on={formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))}>Can transfer</Chip>
                <Chip on={!formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))}>Pickup only</Chip>
                {!preselectedAuctionId && (
                  <select name="auctionId" value={formData.auctionId} onChange={handleChange} className={`${fieldCls} text-sm col-span-2 sm:col-span-1`}>
                    <option value="">Save as draft</option>
                    {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                )}
              </div>
            </div>
          </Panel>

          {/* ── Photos ── horizontal strip (no vertical growth). Tap a thumb to make it
              the main photo; the corner button removes it. Scanned items pull their photo in. */}
          <Panel title="Photos" sub={photos.length ? `${photos.length} of 10 · first one is the main photo` : "Up to 10 · first one is the main photo"}>
            <div className="p-3 sm:p-4">
              <div className="flex gap-2 overflow-x-auto pt-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {photos.map((url, i) => (
                  <button type="button" key={i} onClick={() => i !== 0 && setMainPhoto(i)}
                    className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 ${i === 0 ? "border-[#4a7c59]" : "border-[#e6dac6]"}`}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-[#4a7c59] text-white text-[9px] font-black uppercase tracking-wide text-center leading-tight py-0.5">Main</span>}
                    <span onClick={(e) => { e.stopPropagation(); setPhotos(photos.filter((_, idx) => idx !== i)); }}
                      className="absolute top-0 right-0 w-6 h-6 grid place-items-center bg-black/55 text-white rounded-bl-lg">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                    </span>
                  </button>
                ))}
                <label htmlFor="photo-upload"
                  className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-[#d9c7ab] grid place-items-center text-[#8a7559] hover:border-[#6c4d39] hover:text-[#6c4d39] cursor-pointer transition-colors">
                  {uploading ? (
                    <span className="text-2xl leading-none">…</span>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  )}
                </label>
              </div>
            </div>
          </Panel>
        </div>
        </PageBody>
      </div>

      {/* ── Sticky action bar ── */}
      <footer className="bar-safe-bottom safe-x border-t border-[#e6dac6] bg-white/85 backdrop-blur px-3 sm:px-8 pt-2.5 flex items-center gap-2">
        <Btn onClick={() => handleSave(true)} disabled={saving || uploading} variant="outline" className="flex-1">
          {saving ? "Saving…" : "Save + next"}
        </Btn>
        <Btn onClick={() => handleSave(false)} disabled={saving || uploading} className="flex-1">
          {saving ? "Saving…" : uploading ? "Uploading…" : "Save & done"}
        </Btn>
      </footer>
    </>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={
      <>
        <header className="bg-white/70 border-b border-[#e6dac6] px-4 sm:px-8 py-4 flex items-center gap-2">
          <Skeleton className="h-8 w-48" />
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
    }>
      <NewItemForm />
    </Suspense>
  );
}
