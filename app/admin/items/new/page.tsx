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
  comboMode = false,
  onAddComboPhoto,
  autoStart = false,
}: {
  onFill: (r: BarcodeResult) => void;
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
  const acceptProduct = (product: BarcodeResult) => {
    if (comboRef.current) {
      setResult(product);
      return;
    }
    onFill(product);
    setResult(null);
    setBarcode("");
    setShowSearch(false);
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
          acceptProduct(data.product);
        }
      } else {
        // Numeric UPC/EAN → UPCitemdb lookup first…
        const clean = code.replace(/\D/g, "");
        if (!clean || clean.length < 6) { setError("Enter a valid barcode (6+ digits), FNSKU, or ASIN."); return; }
        const res = await fetch(`/api/admin/barcode-lookup?upc=${clean}`);
        const data = await res.json();
        if (res.ok && data.found) {
          acceptProduct(data.product);
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
  // The SEARCH path is the one place we show a confirm/apply step — a scan is exact,
  // a search is a guess, so you get to eyeball it (and pick the photo) first.
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
        className="w-full flex items-center justify-between gap-2 rounded-xl bg-white border border-[#e3d6bf] px-4 py-3 hover:border-[#6c4d39] transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-[#4a3a2b] text-base">
          <svg className="w-5 h-5 text-[#6c4d39]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="3" width="14" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="2.5"/><path d="M6 3V1.5M10 3V1.5"/></svg>
          Scan another barcode
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#8a7559]"><path d="M4 6l4 4 4-4" /></svg>
      </button>
    );
  }

  return (
    <div>
      {/* Input row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={scanning ? releaseCamera : startCamera}
          className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-base font-semibold border shrink-0 transition-colors ${
            scanning
              ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
              : "bg-[#6c4d39] text-white border-[#6c4d39] hover:bg-[#563e2c]"
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
          placeholder="or type barcode / FNSKU / ASIN"
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
          className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] disabled:opacity-40 text-[#241a12] px-4 py-3 rounded-xl text-base font-semibold shrink-0 transition-colors"
        >
          {loading ? "…" : "Go"}
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

      {loading && !scanning && (
        <p className="mt-2.5 text-sm font-semibold text-[#6c4d39]">Looking it up…</p>
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
        <div className="mt-3 bg-[#faf5ea] border border-[#e3d6bf] rounded-xl p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder='e.g. "Ninja air fryer 5.5qt"'
              className="flex-1 min-w-0 bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] text-base"
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
                  className="w-full flex items-center gap-3 text-left bg-white hover:bg-[#f1e7d5] border border-[#e3d6bf] hover:border-[#6c4d39] rounded-lg p-2.5 transition-colors"
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

      {/* Result preview — only for name-search picks and combo scans. */}
      {result && (
        <div className="mt-3 bg-white border-2 border-[#6c4d39] rounded-xl p-4">
          <div className="text-xs text-[#6c4d39] font-bold uppercase tracking-wide mb-1">
            {comboMode ? "Add to combo" : "Confirm this is it"}
          </div>
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
              <button
                type="button"
                onClick={() => applyResult()}
                className="flex-1 bg-[#6c4d39] hover:bg-[#563e2c] text-white text-base font-bold py-3 rounded-xl transition-colors"
              >
                Use this — fill the form
              </button>
            )}
            <button
              type="button"
              onClick={() => { setResult(null); setBarcode(""); }}
              className={`text-[#8a7559] hover:text-[#4a3a2b] text-base px-4 py-3 border border-[#cdbda3] rounded-xl transition-colors ${comboMode ? "flex-1" : ""}`}
            >
              {comboMode ? "Skip / scan next" : "Not it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────
// Every stage of the listing is the same shape: numbered chip, colored spine,
// title, an at-a-glance "done" tick, and the fields. Top to bottom, no hunting.
function Step({
  n, title, hint, color, done, children, right,
}: {
  n: number;
  title: string;
  hint?: string;
  color: string;
  done?: boolean;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section
      className="relative bg-white border border-[#e3d6bf] rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 2px rgba(36,26,18,.04)" }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="pl-6 pr-5 py-5">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-sm font-extrabold text-white"
            style={{ background: color }}
          >
            {done ? "✓" : n}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#241a12] leading-tight">{title}</h2>
            {hint && <p className="text-xs text-[#8a7559] leading-tight mt-0.5">{hint}</p>}
          </div>
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

// Step accent colors — each stage of the flow gets its own, so you can find the
// section you want by color without reading a word.
const C_SCAN = "#6c4d39";  // brown  — scan
const C_PHOTO = "#4a7c59"; // green  — photos
const C_DETAIL = "#c47b3e";// amber  — details
const C_PRICE = "#3f6f8f"; // blue   — price
const C_LOC = "#7b6a3f";   // olive  — location

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

  // A scan landed — fill the form, pull the photos, and get out of the way.
  const handleBarcodeFill = (result: BarcodeResult) => {
    setFormData(prev => ({
      ...prev,
      title: result.title || prev.title,
      // Pulled-in descriptions can be paragraphs of marketing copy — keep it to
      // 2-3 sentences so the listing stays tight and scannable.
      description: result.description ? shortenDescription(result.description, 3) : prev.description,
      retailValue: result.retailValue != null ? String(result.retailValue) : prev.retailValue,
    }));
    result.images.forEach(url => importImageFromUrl(url));
    setScannerCollapsed(true);
    setBanner("Filled from the scan — check the title, price and photos.");
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
    if (uploading) { alert("Please wait for photos to finish uploading."); return; }
    if (saving) return;
    if (!formData.title) { alert("Please enter an item title"); return; }
    if (!formData.locationId) { alert("Please choose a warehouse for this item."); return; }
    if (!orgId) { alert("Business not loaded. Please refresh."); return; }
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
          // Remount the scanner clean, open, and already scanning.
          setScannerKey((k) => k + 1);
          setScannerCollapsed(false);
          setScannerAutoStart(true);
          setBanner("Saved. Scan the next item.");
          scrollTop();
        } else {
          router.push(preselectedAuctionId ? `/admin/auctions/${preselectedAuctionId}` : "/admin/auctions");
        }
      } else {
        alert("Error saving item: " + data.error);
      }
    } catch { alert("Something went wrong."); }
    finally { setSaving(false); }
  };

  const inputCls =
    "w-full bg-[#faf5ea] border border-[#cdbda3] rounded-xl px-4 py-3 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39] focus:bg-white transition-colors";

  const hasPhotos = photos.length > 0;
  const hasDetails = formData.title.trim().length > 0;
  const hasLocation = !!formData.locationId;

  return (
    <>
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-4 flex items-center gap-2 min-w-0">
        {preselectedAuctionId ? (
          <Link href={`/admin/auctions/${preselectedAuctionId}`} className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Auction</Link>
        ) : (
          <Link href="/admin/items" className="text-[#6f5b46] hover:text-[#241a12] text-base font-semibold shrink-0">← Items</Link>
        )}
        <span className="text-[#8a7559]">/</span>
        <h1 className="text-2xl sm:text-3xl font-semibold">New item</h1>
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

      <div data-scroll-root className="flex-1 overflow-auto px-4 sm:px-8 py-6">
        <div className="mx-auto w-full max-w-2xl space-y-4">

          {/* Status banner (scan landed / item saved) */}
          {banner && (
            <div className="bg-[#5f7a45]/10 border border-[#5f7a45]/30 text-[#3f5430] rounded-xl px-4 py-3 text-base font-medium flex items-center gap-2">
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l4 4 8-8"/></svg>
              {banner}
            </div>
          )}

          {/* ── 1 · Scan ── */}
          <Step
            n={1}
            title="Scan the barcode"
            hint="A scan fills the form for you. Nothing to confirm."
            color={C_SCAN}
            done={hasDetails}
            right={
              <button
                type="button"
                onClick={toggleCombo}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                  combo ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#6c4d39] border-[#cdbda3] hover:bg-[#efe3d0]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="6" height="6" rx="1" /><rect x="8.5" y="1.5" width="6" height="6" rx="1" /><rect x="1.5" y="8.5" width="6" height="6" rx="1" /><rect x="8.5" y="8.5" width="6" height="6" rx="1" /></svg>
                {combo ? "Combo on" : "Combo lot"}
              </button>
            }
          >
            {combo && (
              <div className="mb-4 rounded-xl bg-[#f6ecda] border border-[#e3d6bf] p-4">
                <div className="text-sm font-semibold text-[#4a3a2b] mb-2">How many items in this lot?</div>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPackSize(n)}
                      className={`px-3.5 py-2 rounded-lg text-sm font-bold border transition-colors ${
                        formData.packSize === n ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                      }`}
                    >
                      {n}-Pack
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm text-[#6f5b46]">
                  <span className="font-bold text-[#6c4d39]">{photos.length} of {formData.packSize}</span> photos in the collage. Scan each item and tap <strong>one photo</strong> from it. Saves as one lot, one code.
                </p>
              </div>
            )}

            <BarcodeScanner
              key={scannerKey}
              onFill={handleBarcodeFill}
              collapsed={scannerCollapsed}
              onCollapsedChange={setScannerCollapsed}
              comboMode={combo}
              onAddComboPhoto={importImageFromUrl}
              autoStart={scannerAutoStart}
            />
          </Step>

          {/* ── 2 · Photos ── */}
          <Step
            n={2}
            title="Photos"
            hint={hasPhotos ? "First photo is what bidders see." : "Up to 10. Scanned items pull theirs in automatically."}
            color={C_PHOTO}
            done={hasPhotos}
            right={hasPhotos ? <span className="text-sm font-bold text-[#4a7c59]">{photos.length}</span> : undefined}
          >
            <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            {hasPhotos ? (
              /* 2-up on a phone with the controls in a bar UNDER the photo. At
                 3-across the badge, "Set main" and the 24px delete button all
                 collided inside one ~87px tile. */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {photos.map((url, i) => (
                  <div key={i} className={`rounded-xl overflow-hidden border-2 ${i === 0 ? "border-[#4a7c59]" : "border-[#e3d6bf]"}`}>
                    <div className="relative aspect-square bg-[#efe3d0]">
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-contain" />
                      {i === 0 && (
                        <span className="absolute top-2 left-2 bg-[#4a7c59] text-white text-[11px] font-bold px-2 py-1 rounded-full shadow">Main</span>
                      )}
                    </div>
                    <div className="flex border-t border-[#e3d6bf]">
                      {i === 0 ? (
                        <span className="flex-1 min-h-[44px] flex items-center justify-center text-sm font-bold text-[#4a7c59] bg-[#4a7c59]/10">
                          Shown first
                        </span>
                      ) : (
                        <button type="button" onClick={() => setMainPhoto(i)}
                          className="flex-1 min-h-[44px] text-sm font-bold text-[#6f5b46] bg-white active:bg-[#efe3d0]">
                          Make main
                        </button>
                      )}
                      <button type="button" aria-label="Delete photo"
                        onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                        className="w-[44px] min-h-[44px] flex items-center justify-center text-red-600 bg-white border-l border-[#e3d6bf] active:bg-red-50">
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 4h10M6.5 4V2.5h3V4M5 4v9.5h6V4M6.5 6.5v5M9.5 6.5v5" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <label htmlFor="photo-upload"
                  className="min-h-[120px] rounded-xl border-2 border-dashed border-[#cdbda3] hover:border-[#4a7c59] transition-colors cursor-pointer grid place-items-center text-[#8a7559] hover:text-[#4a7c59]">
                  <span className="text-3xl leading-none">＋</span>
                </label>
              </div>
            ) : (
              <label htmlFor="photo-upload"
                className="border-2 border-dashed border-[#cdbda3] rounded-xl py-6 text-center hover:border-[#4a7c59] transition-colors cursor-pointer block">
                <div className="text-[#8a7559] mb-1.5 flex justify-center">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="15" rx="2"/><circle cx="12" cy="13.5" r="4"/><path d="M9 6l1.5-3h3L15 6"/>
                  </svg>
                </div>
                <div className="text-[#6f5b46] text-base font-semibold">{uploading ? "Uploading…" : "Add photos"}</div>
              </label>
            )}
          </Step>

          {/* ── 3 · Details ── */}
          <Step n={3} title="Details" color={C_DETAIL} done={hasDetails}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Title *</label>
                <textarea ref={titleRef} name="title" value={formData.title} onChange={handleChange} rows={1}
                  placeholder='e.g. Apple iPad Pro 12.9"'
                  className={`${inputCls} resize-none overflow-hidden leading-snug`} />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                  placeholder="A couple of sentences."
                  className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Condition *</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { value: "NEW", label: "New" },
                    { value: "LIKE_NEW", label: "Like new" },
                    { value: "GOOD", label: "Good" },
                    { value: "FAIR", label: "Fair" },
                    { value: "POOR", label: "Poor" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, condition: c.value }))}
                      className={`px-1 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                        formData.condition === c.value
                          ? "bg-[#c47b3e] text-white border-[#c47b3e]"
                          : "bg-[#faf5ea] text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-base font-bold border-2 transition-colors ${
                  formData.isPremium
                    ? "bg-[#c47b3e] text-white border-[#c47b3e]"
                    : "bg-white text-[#8a7559] border-[#cdbda3] hover:bg-[#efe3d0]"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
                {formData.isPremium ? "Featured — pinned to the top" : "Feature this item"}
              </button>
            </div>
          </Step>

          {/* ── 4 · Price ── */}
          <Step n={4} title="Price" hint="Starts at $2 unless you change it." color={C_PRICE} done>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Retail", name: "retailValue", placeholder: "0.00" },
                { label: "Start *", name: "startingBid", placeholder: "2" },
                { label: "Reserve", name: "reservePrice", placeholder: "—" },
              ].map((field) => (
                <div key={field.name}>
                  <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">{field.label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-[#8a7559]">$</span>
                    <input name={field.name} value={formData[field.name as keyof typeof formData] as string}
                      onChange={handleChange} type="number" inputMode="decimal" placeholder={field.placeholder}
                      className={`${inputCls} pl-7 pr-2`} />
                  </div>
                </div>
              ))}
            </div>
          </Step>

          {/* ── 5 · Location ── */}
          <Step n={5} title="Where it lives" color={C_LOC} done={hasLocation}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Warehouse *</label>
                  {pickupLocations.length === 0 ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                      No warehouses yet.{" "}
                      <a href="/admin/pickup" className="font-semibold underline underline-offset-2">Set one up →</a>
                    </div>
                  ) : (
                    <select name="locationId" value={formData.locationId} onChange={handleChange}
                      className={`${inputCls} ${!formData.locationId ? "border-[#c47b3e]" : ""}`}>
                      <option value="">Choose…</option>
                      {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Shelf / spot</label>
                  <input name="storageLocation" value={formData.storageLocation} onChange={handleChange}
                    placeholder="Box 1"
                    className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))}
                  className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    formData.transferable ? "bg-[#7b6a3f] text-white border-[#7b6a3f]" : "bg-[#faf5ea] text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}>
                  Can transfer
                </button>
                <button type="button" onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))}
                  className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    !formData.transferable ? "bg-[#8a4f1c] text-white border-[#8a4f1c]" : "bg-[#faf5ea] text-[#4a3a2b] border-[#cdbda3] hover:bg-[#efe3d0]"
                  }`}>
                  Pickup here only
                </button>
              </div>

              {/* Auction picker only when NOT created inside an auction. */}
              {!preselectedAuctionId && (
                <div>
                  <label className="text-sm font-semibold text-[#6f5b46] mb-1.5 block">Auction</label>
                  <select name="auctionId" value={formData.auctionId} onChange={handleChange} className={inputCls}>
                    <option value="">Save as draft</option>
                    {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
              )}
            </div>
          </Step>

          {/* Last item's code — for when you save before writing the tag. */}
          {lastCode && (
            <div className="flex items-center gap-2 justify-center text-sm text-[#8a7559] pt-1">
              <span>Last saved:</span>
              <span className="font-mono font-bold text-[#6f5b46]">#{lastCode}</span>
              {lastTitle && <span className="truncate max-w-[45%] hidden sm:inline">· {lastTitle}</span>}
            </div>
          )}

          <div className="h-2" />
        </div>
      </div>

      {/* ── Sticky action bar ── */}
      <footer className="bar-safe-bottom safe-x border-t border-[#e3d6bf] bg-[#faf5ea] px-4 sm:px-8 pt-3 flex items-center gap-3">
        {/* Tag # right by the Save buttons — write it on the item before saving. */}
        {nextCode ? (
          <div className="flex flex-col leading-none shrink-0 rounded-xl bg-[#6c4d39]/10 border border-[#6c4d39]/30 px-3 py-2">
            <span className="text-[10px] font-bold text-[#8a7559] uppercase tracking-wide">Write on tag</span>
            <span className="font-mono text-xl font-extrabold text-[#6c4d39] tracking-wider whitespace-nowrap mt-0.5">#{nextCode}</span>
          </div>
        ) : <span />}
        <div className="flex gap-2 ml-auto min-w-0">
          <button onClick={() => handleSave(true)} disabled={saving || uploading}
            className="bg-[#efe3d0] hover:bg-[#e7dcc6] border border-[#cdbda3] disabled:opacity-50 text-[#241a12] text-base px-4 sm:px-6 py-3.5 rounded-xl font-bold transition-colors whitespace-nowrap">
            {saving ? "Saving…" : "Save + next"}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || uploading}
            className="bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base px-4 sm:px-6 py-3.5 rounded-xl font-bold transition-colors whitespace-nowrap">
            {saving ? "Saving…" : uploading ? "Uploading…" : "Save & done"}
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
        <div className="flex-1 px-4 sm:px-8 py-6">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-[#e3d6bf] rounded-2xl p-5 space-y-3">
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
