"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/Skeleton";
import { Btn, Input, Notice, Eyebrow } from "../../ui";
import ShipControl, { SHIP_OFF, shipPayload, shipProblem, type ShipFormValue } from "../ShipControl";

// The warehouse picked last time on this device — preselected on the next lot.
const WAREHOUSE_KEY = "nb_admin_warehouse";
// The spot (shelf/box) last saved on this device, per warehouse — so a run of
// lots keeps landing in the same spot even across a reload or a fresh visit.
const SPOT_KEY = "nb_admin_spot";
function readSpot(): { locationId: string; spot: string } | null {
  try {
    const raw = localStorage.getItem(SPOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.locationId === "string" && typeof v.spot === "string" ? v : null;
  } catch { return null; }
}
// Spot chips deleted from the suggestion row on this device (press-and-hold a
// chip). Lots already tagged with that spot keep it.
const HIDDEN_SPOTS_KEY = "nb_admin_hidden_spots";
function readHiddenSpots(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_SPOTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function writeHiddenSpots(list: string[]) {
  try { localStorage.setItem(HIDDEN_SPOTS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** A chip that also fires `onHold` after a press-and-hold (600ms), for hiding. */
function HoldChip({ onHold, onClick, ...rest }: React.ComponentProps<typeof Chip> & { onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    timer.current = setTimeout(() => { held.current = true; onHold(); }, 600);
  };
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return (
    <Chip
      {...rest}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (held.current) { held.current = false; return; } onClick?.(e); }}
      style={{ WebkitTouchCallout: "none", userSelect: "none" }}
    />
  );
}

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

/**
 * Tidy a scanned/searched product title. Amazon titles run 100+ chars with marketing
 * suffixes; cut at the first natural break after char 40 when the title is long, and
 * hard-cap at 90 on a word boundary. Only ever applied to auto-fill — never to what
 * the user typed.
 */
function cleanTitle(raw: string): string {
  let t = (raw || "").replace(/\s+/g, " ").trim();
  if (t.length > 60) {
    let cut = -1;
    for (const sep of [" - ", " | ", " (", ", "]) {
      const i = t.indexOf(sep, 40);
      if (i !== -1 && (cut === -1 || i < cut)) cut = i;
    }
    if (cut !== -1) t = t.slice(0, cut);
  }
  if (t.length > 90) {
    const head = t.slice(0, 90);
    const sp = head.lastIndexOf(" ");
    t = sp > 40 ? head.slice(0, sp) : head;
  }
  return t.replace(/[\s,;:|-]+$/, "").trim();
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
  // The scan loop's callbacks are created once, so they read combo mode via a ref.
  const comboRef = useRef(comboMode);
  useEffect(() => { comboRef.current = comboMode; }, [comboMode]);

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

  // Hardware scanner gun (keyboard wedge): the page turns a fast key burst
  // ending in Enter into a "wedge-scan" event — look it up like a camera scan.
  useEffect(() => {
    const onWedge = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      if (code) { setBarcode(code); doLookup(code); }
    };
    window.addEventListener("wedge-scan", onWedge);
    return () => window.removeEventListener("wedge-scan", onWedge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Straight into scan mode after a save — no tap needed. Deferred a tick so the
  // camera (an external system) starts after mount rather than mid-render.
  useEffect(() => {
    if (!autoStart || collapsed) return;
    const t = setTimeout(() => startCamera(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the card is minimized, make sure the camera is fully off.
  useEffect(() => {
    if (!collapsed) return;
    const t = setTimeout(() => releaseCamera(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

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
        <span className="flex items-center gap-2.5 font-bold text-[#241a12]">
          <svg className="w-5 h-5 text-[#6c4d39]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="1" y="3" width="14" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="2.5"/><path d="M6 3V1.5M10 3V1.5"/></svg>
          Scan another barcode
        </span>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdbda3]"><path d="M4 6l4 4 4-4" /></svg>
      </button>
    );
  }

  return (
    <div>
      <div>
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
          className="flex-1 min-w-0"
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
          <div className="absolute bottom-2 left-0 right-0 text-center text-white/80 text-[13px] font-semibold">Point at barcode</div>
        </div>
      )}

      {loading && !scanning && (
        <p className="mt-2.5 text-[15px] font-semibold text-[#6c4d39]">Looking it up…</p>
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
          className="mt-1 min-h-[44px] text-[15px] font-bold text-[#6c4d39] hover:text-[#563e2c] underline underline-offset-2"
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
              className="flex-1 min-w-0"
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
                      : <span className="text-[#b3a085] text-[13px]">No image</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-[#241a12] leading-snug line-clamp-2">{r.title}</div>
                    <div className="text-[13px] text-[#8a7559] mt-0.5 flex items-center gap-2">
                      {r.brand && <span>{r.brand}</span>}
                      {r.price != null && <span className="text-[#6c4d39] font-bold">${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  <span className="text-[#6c4d39] text-[15px] font-bold shrink-0 pr-1">Use</span>
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
          <div className="font-bold text-[#241a12] text-[15px] leading-snug">{result.title}</div>
          {result.brand && <div className="text-[13px] text-[#8a7559] mt-0.5">{result.brand}</div>}

          {/* Image picker */}
          {result.images.length > 0 && (
            <div className="mt-3">
              <div className="text-[15px] text-[#8a7559] mb-1.5">
                {comboMode ? "Tap one photo to add it to the combo" : "Tap a photo to make it the main photo"}
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
                Use this
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
    </div>
  );
}

type AuctionOpt = { id: string; title: string; status: string; startAt: string; archived?: boolean };

/** The auction a new lot should land in when none was chosen: the soonest draft/upcoming. */
function soonestUpcoming(list: AuctionOpt[]): AuctionOpt | null {
  const now = Date.now();
  const candidates = list.filter((a) => a.status === "DRAFT" || new Date(a.startAt).getTime() > now);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
}

// ── Step card ─────────────────────────────────────────────────────────────────
// Every stage of the listing is the same shape (PureBid's lister): numbered
// chip, coloured spine, title, a tick when it's done, then the fields.
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
    <section className="relative min-w-0 max-w-full bg-white border border-[#e6dac6] rounded-2xl shadow-[0_6px_18px_-14px_rgba(60,40,25,0.35)] overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="pl-5 pr-4 py-4 min-w-0">
        <div className="flex items-center gap-2.5 mb-3 min-w-0">
          <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-[13px] font-black text-white" style={{ background: color }}>
            {done ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
            ) : n}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-black text-[#241a12] leading-tight">{title}</h2>
            {hint && <p className="text-[13px] text-[#8a7559] leading-tight mt-0.5">{hint}</p>}
          </div>
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

// Step colours: find the section you want by colour without reading a word.
const C_SCAN = "#6c4d39";   // leather — scan
const C_PHOTO = "#4a7c59";  // moss    — photos
const C_DETAIL = "#c47b3e"; // amber   — details

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Like new" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
];

// Bidders scroll, they don't study: a scan brings in up to 3 product photos,
// and a lot holds 6 at most. The first one is the main photo.
const MAX_SCAN_PHOTOS = 3;
const MAX_PHOTOS = 6;

type ShelfHolder = { name: string; count: number; minutesAgo: number; sections: string[]; auctionTitle: string | null };
type ShelfCheck = { shelf: string; shelfNumber: string; holders: ShelfHolder[]; mine: { count: number; minutesAgo: number } | null };
const ago = (m: number) => (m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : m < 2880 ? "yesterday" : `${Math.round(m / 1440)} days ago`);
// Confirming shelf 101 once covers 101A, 101B, 101C in that auction.
const shelfKey = (shelf: string, auctionId: string) => `${auctionId}|${shelf.trim().toUpperCase().match(/\d+/)?.[0] ?? shelf.trim().toUpperCase()}`;

/** Shrink phone photos before upload (bidders see ~400px cards). Null = use the original. */
async function compressPhoto(file: File): Promise<{ blob: Blob; name: string; type: string } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size === 0) return null;
    return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
  } catch {
    return null;
  }
}

const EMPTY_ITEM = {
  title: "",
  description: "",
  condition: "",
  size: "",
  retailValue: "",
  startingBid: "2",
  reservePrice: "",
  taxDeductible: false,
  itemCode: "",
  isPremium: false,
  packSize: 0,
  transferable: true,
};

// ── Main form (PureBid MI's lister, Northwood colours) ─────────────────────────
function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAuctionId = searchParams.get("auctionId") || "";

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [auctions, setAuctions] = useState<AuctionOpt[]>([]);
  const [pickupLocations, setPickupLocations] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [banner, setBanner] = useState<string | null>(null);
  // Covers the form while a scan fills it, so fields and photos don't pop in
  // one at a time; shows the tag # big so it can be written on the item.
  const [filling, setFilling] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Codes: the footer previews this lister's next code (48-DAK); the save's
  // response is the code that actually landed.
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastTitle, setLastTitle] = useState<string | null>(null);
  // Tags I still owe (server-side, survives refresh) and the auction's lot count.
  const [unprinted, setUnprinted] = useState(0);
  const [auctionCount, setAuctionCount] = useState<number | null>(null);

  // Scanner: remount to clear it, collapse once a scan lands.
  const [scannerKey, setScannerKey] = useState(0);
  const [scannerCollapsed, setScannerCollapsed] = useState(false);

  // Spot chips (this auction + warehouse), press-and-hold to delete for good.
  const [spotOptions, setSpotOptions] = useState<string[]>([]);
  const [hiddenSpots, setHiddenSpots] = useState<string[]>([]);
  const [spotToHide, setSpotToHide] = useState<string | null>(null);

  // Shelf ownership (PureBid rule): live status under the box, a confirm card
  // when someone else has the shelf number, asked once per shelf per session.
  const [shelfStatus, setShelfStatus] = useState<ShelfCheck | null>(null);
  const [shelfConflict, setShelfConflict] = useState<{ check: ShelfCheck; addAnother: boolean } | null>(null);
  const confirmedShelves = useRef<Set<string>>(new Set());
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    ...EMPTY_ITEM,
    title: searchParams.get("title") || "",
    description: searchParams.get("description") || "",
    condition: searchParams.get("condition") || "",
    size: searchParams.get("size") || "",
    retailValue: searchParams.get("retailValue") || "",
    startingBid: searchParams.get("startingBid") || "2",
    storageLocation: (searchParams.get("storageLocation") || "").toUpperCase(),
    locationId: searchParams.get("locationId") || "",
    auctionId: preselectedAuctionId,
  });
  const [ship, setShip] = useState<ShipFormValue>(SHIP_OFF);
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

  // Auto-grow the title so the WHOLE title is visible (that's where naming problems hide).
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [formData.title]);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => { if (d.orgId) setOrgId(d.orgId); }).catch(() => {});
    fetch("/api/auctions").then((r) => r.json()).then((d) => {
      if (!d.auctions) return;
      const open = (d.auctions as AuctionOpt[]).filter((a) => ["DRAFT", "OPEN", "CLOSING"].includes(a.status) && !a.archived);
      setAuctions(open);
      // No ?auctionId → start on the soonest draft/upcoming auction.
      if (!preselectedAuctionId) {
        const pick = soonestUpcoming(open);
        if (pick) setFormData((prev) => (prev.auctionId ? prev : { ...prev, auctionId: pick.id }));
      }
    }).catch(() => {});
    fetch("/api/admin/pickup/locations").then((r) => r.json()).then((d) => {
      if (!d.locations) return;
      const active = d.locations
        .filter((l: { isActive: boolean }) => l.isActive)
        .map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })) as { id: string; name: string }[];
      setPickupLocations(active);
      setHiddenSpots(readHiddenSpots());
      // One warehouse = it's a given. Otherwise the one used last on this device.
      let remembered = "";
      try { remembered = localStorage.getItem(WAREHOUSE_KEY) || ""; } catch { /* ignore */ }
      const loc = active.length === 1 ? active[0].id : active.some((l) => l.id === remembered) ? remembered : "";
      setFormData((prev) => {
        const locationId = prev.locationId || loc;
        // The shelf last saved at that warehouse comes back (the URL or typing wins).
        const last = readSpot();
        const storageLocation = prev.storageLocation || (last && last.spot && locationId && last.locationId === locationId ? last.spot.toUpperCase() : "");
        return { ...prev, locationId, storageLocation };
      });
    }).catch(() => {});
  }, [preselectedAuctionId]);

  useEffect(() => {
    if (!formData.locationId) return;
    try { localStorage.setItem(WAREHOUSE_KEY, formData.locationId); } catch { /* ignore */ }
  }, [formData.locationId]);

  // Spot chips for this auction + warehouse.
  useEffect(() => {
    if (!formData.locationId) return;
    const params = new URLSearchParams({ locationId: formData.locationId });
    if (formData.auctionId) params.set("auctionId", formData.auctionId);
    let live = true;
    fetch(`/api/admin/items/spots?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (live && Array.isArray(d.spots)) setSpotOptions(d.spots); })
      .catch(() => {});
    return () => { live = false; };
  }, [formData.locationId, formData.auctionId]);
  const visibleSpots = formData.locationId ? spotOptions.filter((s) => !hiddenSpots.includes(s)) : [];
  const hideSpot = (spot: string) => {
    setHiddenSpots((prev) => { const next = prev.includes(spot) ? prev : [...prev, spot]; writeHiddenSpots(next); return next; });
    setSpotToHide(null);
    fetch("/api/admin/items/spots", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: formData.locationId, spot }),
    }).catch(() => { /* device copy still hides it */ });
  };

  // This lister's next code (a peek; the save allocates).
  const genCode = () =>
    fetch("/api/admin/next-item-code").then((r) => r.json()).then((d) => {
      if (d?.code) { setNextCode(d.code); setFormData((prev) => ({ ...prev, itemCode: d.code })); }
    }).catch(() => { /* non-critical */ });
  useEffect(() => {
    const t = setTimeout(() => { void genCode(); }, 0);
    return () => clearTimeout(t);
  }, []);

  // Tags owed + the auction's lot count: on auction change, when the window
  // regains focus (back from the print tab), and every 30s for coworkers' lots.
  useEffect(() => {
    const aid = formData.auctionId;
    let live = true;
    const sync = () => fetch(`/api/admin/intake/tags${aid ? `?auctionId=${encodeURIComponent(aid)}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setUnprinted((d.items ?? []).length);
        setAuctionCount(typeof d.auctionTotal === "number" ? d.auctionTotal : null);
      })
      .catch(() => {});
    const t = setTimeout(sync, 0);
    const iv = setInterval(() => { if (!document.hidden) sync(); }, 30_000);
    window.addEventListener("focus", sync);
    return () => { live = false; clearTimeout(t); clearInterval(iv); window.removeEventListener("focus", sync); };
  }, [formData.auctionId]);

  // Hardware scanner guns (keyboard wedge): a fast key burst ending in Enter
  // anywhere on the page, no field focused, goes straight to the lookup.
  useEffect(() => {
    let buf = "";
    let lastKey = 0;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const now = Date.now();
      if (now - lastKey > 80) buf = "";
      lastKey = now;
      if (e.key === "Enter") {
        if (buf.length >= 6) {
          setScannerCollapsed(false);
          window.dispatchEvent(new CustomEvent("wedge-scan", { detail: buf }));
        }
        buf = "";
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Live shelf status (debounced).
  useEffect(() => {
    const shelf = formData.storageLocation.trim();
    const ctrl = new AbortController();
    if (!shelf || !formData.auctionId) {
      const t0 = setTimeout(() => setShelfStatus(null), 0);
      return () => clearTimeout(t0);
    }
    const t = setTimeout(() => {
      const q = new URLSearchParams({ shelf, auctionId: formData.auctionId });
      if (formData.locationId) q.set("locationId", formData.locationId);
      fetch(`/api/admin/intake/shelf-check?${q}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setShelfStatus(d); })
        .catch(() => {});
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [formData.storageLocation, formData.auctionId, formData.locationId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const name = e.target.name;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Import one remote product image → hosted URL (or why not).
  const fetchImageUrl = async (url: string): Promise<{ url: string | null; error?: string }> => {
    try {
      const res = await fetch(`/api/admin/import-image?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { url: null, error: data.error || `HTTP ${res.status}` };
      return { url: data.publicUrl || null, error: data.publicUrl ? undefined : "no URL returned" };
    } catch (e) { return { url: null, error: e instanceof Error ? e.message : "network error" }; }
  };

  // A scan landed: fill the fields, bring in up to 3 product photos (they
  // REPLACE an earlier scan's photos; your own photos stay), reveal the form.
  const handleBarcodeFill = async (result: BarcodeResult) => {
    setFilling(true);
    setScannerCollapsed(true);
    setFormData((prev) => ({
      ...prev,
      title: result.title ? cleanTitle(result.title) || prev.title : prev.title,
      description: result.description ? shortenDescription(result.description, 3) : prev.description,
      retailValue: result.retailValue != null ? String(result.retailValue) : prev.retailValue,
    }));
    let note: string | null = null;
    try {
      const wanted = (result.images ?? []).slice(0, MAX_SCAN_PHOTOS);
      const results = await Promise.all(wanted.map(fetchImageUrl));
      const good = results.map((r) => r.url).filter((u): u is string => !!u);
      if (good.length) {
        setPhotos((prev) => {
          const mine = prev.filter((u) => !/-barcode-import\./.test(u));
          return [...good, ...mine.filter((u) => !good.includes(u))].slice(0, MAX_PHOTOS);
        });
      } else if (wanted.length > 0) {
        note = `Filled, but the photos didn't import (${results.find((r) => r.error)?.error ?? "unknown error"}). Take your own.`;
      }
    } catch { /* text fields are still filled */ }
    setBanner(note);
    setFilling(false);
  };

  // Combo lots: one product photo per item, one tap at a time.
  const importImageFromUrl = async (url: string) => {
    const { url: publicUrl, error } = await fetchImageUrl(url);
    if (publicUrl) setPhotos((prev) => (prev.includes(publicUrl) || prev.length >= MAX_PHOTOS ? prev : [...prev, publicUrl]));
    else if (error) setBanner(`Photo didn't import (${error}).`);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files || []);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { setBanner(`Maximum ${MAX_PHOTOS} photos per lot.`); e.target.value = ""; return; }
    if (files.length > room) { files = files.slice(0, room); setBanner(`Only ${MAX_PHOTOS} photos per lot. Took the first ${room}.`); }
    setUploading(true);
    const failed: string[] = [];
    for (const file of files) {
      let fileType = file.type;
      if (!fileType) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const extMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif" };
        fileType = extMap[ext] ?? "image/jpeg";
      }
      const squeezed = await compressPhoto(file);
      const body: Blob = squeezed?.blob ?? file;
      if (squeezed) fileType = squeezed.type;
      try {
        const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: squeezed?.name ?? file.name, fileType }) });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.error) detail = j.error; } catch { /* ignore */ }
          throw new Error(`upload-link failed: ${detail}`);
        }
        const { signedUrl, publicUrl } = await res.json();
        const putRes = await fetch(signedUrl, { method: "PUT", body, headers: { "Content-Type": fileType } });
        if (!putRes.ok) throw new Error(`upload rejected: HTTP ${putRes.status}`);
        setPhotos((prev) => [...prev, publicUrl]);
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err);
        failed.push(`${file.name} (${err instanceof Error ? err.message : "unknown error"})`);
      }
    }
    e.target.value = "";
    setUploading(false);
    if (failed.length) setBanner(`Couldn't upload: ${failed.join(", ")}`);
  };

  const setMainPhoto = (url: string) => setPhotos((prev) => [url, ...prev.filter((u) => u !== url)]);
  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((u) => u !== url));

  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll<HTMLElement>("[data-scroll-root]").forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const openPrintQueue = () =>
    window.open(`/print/labels?queue=${encodeURIComponent(formData.auctionId || "all")}`, "_blank", "noopener");

  // An untouched form: "Done" just leaves (printing anything still owed).
  const formEmpty = !formData.title.trim() && photos.length === 0 && !formData.description.trim();
  const finish = (justSaved = false) => {
    if (justSaved || unprinted > 0) openPrintQueue();
    router.push(preselectedAuctionId ? `/admin/auctions/${preselectedAuctionId}` : "/admin/auctions");
  };

  // Save + next keeps the auction, warehouse and shelf, clears the rest, jumps
  // to the top and gets the scanner ready. Save & done prints and leaves.
  const handleSave = async (addAnother = false) => {
    if (!addAnother && formEmpty) { finish(); return; }
    if (uploading) { setBanner("Hang on, photos are still uploading."); return; }
    if (saving) return;
    if (!formData.title.trim()) { setBanner("Give the lot a title first."); return; }
    if (!formData.auctionId) { setBanner("Pick the auction this lot goes in."); return; }
    let locationId = formData.locationId;
    if (!locationId && pickupLocations.length > 0) {
      locationId = pickupLocations[0].id;
      setFormData((prev) => ({ ...prev, locationId }));
    }
    if (!locationId) { setBanner("Set up your warehouse first (Settings → Locations)."); return; }
    if (!formData.storageLocation.trim()) { setBanner("Type the shelf (e.g. A1) before saving."); return; }
    if (!formData.condition) { setBanner("Pick a condition."); return; }
    const shipErr = shipProblem(ship);
    if (shipErr) { setBanner(shipErr); return; }
    if (!orgId) { setBanner("Business not loaded. Pull down to refresh."); return; }

    setSaving(true);
    setBanner(null);
    const sentCode = formData.itemCode;
    const savedTitle = formData.title;
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          locationId,
          ...shipPayload(ship),
          photos,
          organizationId: orgId,
          shelfConfirmed: confirmedShelves.current.has(shelfKey(formData.storageLocation, formData.auctionId)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.shelfConflict) {
        setShelfConflict({ check: data.shelfConflict, addAnother });
        return;
      }
      if (!data.success) { setBanner("Couldn't save: " + (data.error || "unknown error")); return; }

      // The code that actually landed is the one on the tag.
      const code: string | null = data.item?.itemCode ?? sentCode ?? null;
      const m = code?.match(/^(\d+)-(.+)$/);
      if (m) setNextCode(`${Number(m[1]) + 1}-${m[2]}`);
      setUnprinted((n) => n + 1);
      setAuctionCount((n) => (n === null ? n : n + 1));

      // The shelf just used is the default next time on this device, and a chip.
      const spot = formData.storageLocation.trim().toUpperCase();
      try { localStorage.setItem(SPOT_KEY, JSON.stringify({ locationId, spot })); } catch { /* ignore */ }
      setSpotOptions((prev) => (prev.includes(spot) ? prev : [spot, ...prev]));
      setHiddenSpots((prev) => {
        const next = prev.filter((h) => h.toLowerCase() !== spot.toLowerCase());
        if (next.length !== prev.length) writeHiddenSpots(next);
        return next;
      });

      if (addAnother) {
        setFormData((prev) => ({ ...prev, ...EMPTY_ITEM }));
        setShip(SHIP_OFF);
        setCombo(false);
        setPhotos([]);
        setShowDesc(false);
        setLastCode(code);
        setLastTitle(savedTitle);
        void genCode();
        setScannerKey((k) => k + 1);
        setScannerCollapsed(false);
        setBanner(code ? `Saved as ${code}. Next item: scan it or enter it manually.` : "Saved. Scan the next item or enter it manually.");
        scrollTop();
      } else {
        finish(true);
      }
    } catch {
      setBanner("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const startFresh = () => {
    setFormData((prev) => ({ ...prev, ...EMPTY_ITEM, auctionId: preselectedAuctionId || prev.auctionId }));
    setShip(SHIP_OFF);
    setCombo(false);
    setPhotos([]);
    setShowDesc(false);
    setBanner(null);
    void genCode();
    setScannerKey((k) => k + 1);
    setScannerCollapsed(false);
    scrollTop();
  };

  const titleDone = formData.title.trim().length > 0;
  const auctionTitle = auctions.find((a) => a.id === formData.auctionId)?.title ?? "";
  const showCode = formData.itemCode || nextCode;
  const okBanner = banner && /^(saved|matched)/i.test(banner);
  const inputCls = "w-full min-h-[50px] text-[17px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition";
  const lbl = "text-[13px] font-black uppercase tracking-[0.12em] text-[#8a7559] mb-1 block";

  return (
    <>
      {filling && (
        <div className="fixed inset-0 z-[60] bg-[#f4ede1]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-14 h-14 rounded-full border-4 border-[#e6dac6] border-t-[#6c4d39] animate-spin" />
          {showCode && (
            <div className="font-mono text-5xl sm:text-6xl font-black tracking-wider text-[#241a12] leading-none">{showCode}</div>
          )}
          <div className="font-display text-xl font-black text-[#6c4d39]">Filling in…</div>
        </div>
      )}

      {/* Someone else's shelf: use another, or confirm you talked. */}
      {shelfConflict && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl">
            <div className="font-display text-xl font-black text-[#241a12]">Shelf {shelfConflict.check.shelfNumber} is someone else&apos;s right now</div>
            <ul className="mt-2 space-y-1.5 text-[15px] text-[#4a3a2b]">
              {shelfConflict.check.holders.map((h) => (
                <li key={h.name + h.minutesAgo} className="bg-[#fbeed8] border border-[#eed3ab] rounded-xl px-3 py-2">
                  <span className="font-bold">{h.name}</span> listed {h.count} item{h.count !== 1 ? "s" : ""} on {h.sections.join(", ")} {ago(h.minutesAgo)}{h.auctionTitle ? ` (${h.auctionTitle})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[15px] text-[#8a7559] leading-snug">A shelf number stays with whoever listed on it for 7 days. The letter doesn&apos;t matter. Use a different number unless you&apos;ve checked with them.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Btn full onClick={() => {
                setShelfConflict(null);
                setFormData((prev) => ({ ...prev, storageLocation: "" }));
                setTimeout(() => document.querySelector<HTMLInputElement>('input[name="storageLocation"]')?.focus(), 50);
              }}>Use a different shelf</Btn>
              <Btn full tone="amber" variant="outline" onClick={() => {
                const k = shelfKey(formData.storageLocation, formData.auctionId);
                confirmedShelves.current.add(k);
                setConfirmedKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
                const again = shelfConflict.addAnother;
                setShelfConflict(null);
                void handleSave(again);
              }}>We talked. Use shelf {shelfConflict.check.shelfNumber} anyway</Btn>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white/70 backdrop-blur border-b border-[#e6dac6] px-4 sm:px-8 py-3 flex items-center gap-2 min-w-0">
        <Link href={preselectedAuctionId ? `/admin/auctions/${preselectedAuctionId}` : "/admin/items"} className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#8a7559] hover:text-[#241a12] shrink-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
          {preselectedAuctionId ? "Auction" : "Items"}
        </Link>
        <span className="text-[#cdbda3]">/</span>
        <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-[#241a12] truncate min-w-0">New item</h1>
        <button type="button" onClick={startFresh} title="Clear everything and start a fresh item"
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 min-h-[44px] text-[#563e2c] hover:bg-[#f4ede1] border border-[#d9c7ab] rounded-xl px-3.5 text-[15px] font-bold transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2v3h-3" /></svg>
          <span className="hidden sm:inline">Start fresh</span>
        </button>
      </header>

      <div data-scroll-root className="flex-1 min-w-0 overflow-x-hidden px-3 sm:px-8 py-3 sm:py-6">
        <div className="mx-auto w-full min-w-0 max-w-5xl space-y-3 sm:space-y-4">
          {okBanner && (
            <Notice tone="green" className="flex items-center gap-2">
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 10l4 4 8-8" /></svg>
              {banner}
            </Notice>
          )}
          {lastCode && (
            <div className="rounded-xl bg-[#f1e7d5] border-2 border-[#d9c7ab] px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-black uppercase tracking-wide text-[#8a7559]">Previous item saved as</span>
              <span className="font-mono font-black text-[#6c4d39] text-lg leading-none">{lastCode}</span>
              {lastTitle && <span className="text-[15px] text-[#6f5b46] truncate max-w-[55%]">· {lastTitle}</span>}
              <span className="ml-auto text-[13px] text-[#8a7559] font-semibold">tag queued to print</span>
            </div>
          )}

          {/* Auction (+ warehouse when there's more than one). */}
          {(!preselectedAuctionId || pickupLocations.length !== 1) && (
            <div className="flex flex-wrap gap-2">
              {!preselectedAuctionId && (
                <select name="auctionId" value={formData.auctionId} onChange={handleChange} aria-label="Auction"
                  className={`${inputCls} flex-1 min-w-0 font-bold ${!formData.auctionId ? "!border-[#c47b3e] text-[#8a4f1c]" : ""}`}>
                  <option value="">Which auction? (required)</option>
                  {auctions.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              )}
              {!preselectedAuctionId && auctions.length === 0 && (
                <Link href="/admin/auctions/new" className="shrink-0 inline-flex items-center min-h-[50px] rounded-xl border border-[#eed3ab] bg-[#fbeed8] px-3 text-[15px] font-bold text-[#8a4f1c]">Create an auction first</Link>
              )}
              {pickupLocations.length === 0 && (
                <Link href="/admin/settings/locations" className="shrink-0 inline-flex items-center min-h-[50px] rounded-xl border border-[#eed3ab] bg-[#fbeed8] px-3 text-[15px] font-bold text-[#8a4f1c]">Set up a warehouse</Link>
              )}
              {pickupLocations.length > 1 && (
                <select name="locationId" value={formData.locationId} onChange={handleChange} aria-label="Warehouse"
                  className={`${inputCls} w-40 shrink-0 ${!formData.locationId ? "!border-[#c47b3e]" : ""}`}>
                  <option value="">Warehouse…</option>
                  {pickupLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 sm:gap-4 items-start">
            <div className="min-w-0 space-y-3 sm:space-y-4">
              {/* 1 · Scan (collapses to one line once a scan lands) */}
              {scannerCollapsed && !combo ? (
                <BarcodeScanner key={scannerKey} onFill={handleBarcodeFill} onFillingChange={setFilling}
                  collapsed onCollapsedChange={setScannerCollapsed} comboMode={combo} onAddComboPhoto={importImageFromUrl} />
              ) : (
                <Step n={1} title="Scan" color={C_SCAN} done={titleDone}
                  right={
                    <button type="button" onClick={toggleCombo} aria-pressed={combo}
                      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-[15px] font-bold border-2 transition-colors ${combo ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#563e2c] border-[#e6dac6] hover:bg-[#f4ede1]"}`}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="6" height="6" rx="1" /><rect x="8.5" y="1.5" width="6" height="6" rx="1" /><rect x="1.5" y="8.5" width="6" height="6" rx="1" /><rect x="8.5" y="8.5" width="6" height="6" rx="1" /></svg>
                      {combo ? "Combo on" : "Combo lot"}
                    </button>
                  }>
                  {combo && (
                    <div className="mb-4 rounded-xl bg-[#fbeed8] border border-[#eed3ab] p-4">
                      <div className="text-[15px] font-bold text-[#4a3a2b] mb-2">How many items in this lot?</div>
                      <div className="flex flex-wrap gap-2">
                        {[2, 3, 4, 5, 6].map((n) => (
                          <button key={n} type="button" onClick={() => setPackSize(n)}
                            className={`min-h-[44px] px-3.5 rounded-xl text-[15px] font-bold border transition-colors ${formData.packSize === n ? "bg-[#6c4d39] text-white border-[#6c4d39]" : "bg-white text-[#4a3a2b] border-[#e6dac6] hover:bg-[#f4ede1]"}`}>
                            {n}-Pack
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-[15px] text-[#6f5b46]">
                        <span className="font-bold text-[#6c4d39]">{photos.length} of {formData.packSize}</span> photos in the collage. Scan each item and tap <strong>one photo</strong> from it. Saves as one lot, one code.
                      </p>
                    </div>
                  )}
                  <BarcodeScanner key={scannerKey} onFill={handleBarcodeFill} onFillingChange={setFilling}
                    collapsed={false} onCollapsedChange={setScannerCollapsed} comboMode={combo} onAddComboPhoto={importImageFromUrl} />
                </Step>
              )}

              {/* 2 · Photos (main photo big, the rest as thumbs; tap a thumb to make it main) */}
              <Step n={2} title="Photos" color={C_PHOTO} done={photos.length > 0}
                hint={photos.length > 1 ? "Tap a photo to make it the main one." : undefined}
                right={photos.length > 0 ? <span className="text-[15px] font-black text-[#2f5d3a] tabular-nums">{photos.length} of {MAX_PHOTOS}</span> : undefined}>
                <input type="file" accept="image/*" capture="environment" id="photo-camera" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                <input type="file" accept="image/*" multiple id="photo-upload" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                {photos[0] ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-[#4a7c59] bg-white aspect-[4/3] mb-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photos[0]} alt="Main photo" className="w-full h-full object-contain" />
                    <span className="absolute bottom-2 left-2 bg-[#4a7c59] text-white text-[13px] font-black px-2.5 py-0.5 rounded-full">Main photo</span>
                    <button type="button" aria-label="Delete photo" onClick={() => removePhoto(photos[0])}
                      className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-black/60 text-white grid place-items-center">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
                    </button>
                  </div>
                ) : (
                  <label htmlFor="photo-camera" className="mb-2.5 h-36 rounded-2xl border-2 border-dashed border-[#4a7c59]/60 bg-[#4a7c59]/[0.06] text-[#2f5d3a] grid place-items-center cursor-pointer">
                    <span className="flex items-center gap-2 text-[17px] font-bold">
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="15" rx="2" /><circle cx="12" cy="13.5" r="4" /><path d="M9 6l1.5-3h3L15 6" /></svg>
                      {uploading ? "Uploading…" : "Take photo"}
                    </span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2 pb-1">
                  {photos.slice(1).map((url) => (
                    <div key={url} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-[#e6dac6] bg-white">
                      <button type="button" onClick={() => setMainPhoto(url)} aria-label="Make this the main photo" className="block w-full h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-contain" />
                      </button>
                      <button type="button" aria-label="Delete photo" onClick={() => removePhoto(url)}
                        className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
                      </button>
                    </div>
                  ))}
                  {photos[0] && photos.length < MAX_PHOTOS && (
                    <label htmlFor="photo-camera" title="Take a photo"
                      className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-[#d9c7ab] text-[#6f5b46] grid place-items-center cursor-pointer hover:border-[#6c4d39]">
                      <span className="flex flex-col items-center gap-0.5 text-[13px] font-bold">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="15" rx="2" /><circle cx="12" cy="13.5" r="4" /><path d="M9 6l1.5-3h3L15 6" /></svg>
                        Photo
                      </span>
                    </label>
                  )}
                  {photos.length < MAX_PHOTOS && (
                    <label htmlFor="photo-upload" title="Upload photos"
                      className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-[#d9c7ab] text-[#6f5b46] grid place-items-center cursor-pointer hover:border-[#6c4d39]">
                      {uploading ? (
                        <span className="w-6 h-6 rounded-full border-[3px] border-[#e6dac6] border-t-[#6c4d39] animate-spin" />
                      ) : (
                        <span className="flex flex-col items-center gap-0.5 text-[13px] font-bold">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                          Upload
                        </span>
                      )}
                    </label>
                  )}
                </div>
              </Step>
            </div>

            {/* 3 · Details */}
            <div className="min-w-0 space-y-3 sm:space-y-4">
              <Step n={3} title="Details" color={C_DETAIL} done={titleDone}>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="lot-title" className={lbl}>Title *</label>
                    <textarea id="lot-title" ref={titleRef} name="title" value={formData.title} onChange={handleChange} rows={1}
                      placeholder='e.g. Apple iPad Pro 12.9"' className={`${inputCls} resize-none overflow-hidden leading-snug py-2.5 font-semibold`} />
                  </div>
                  <div>
                    <span className={lbl}>Condition *</span>
                    <div className="grid grid-cols-5 gap-1">
                      {CONDITIONS.map((c) => (
                        <button key={c.value} type="button" onClick={() => setFormData((prev) => ({ ...prev, condition: c.value }))}
                          className={`min-h-[44px] px-0.5 rounded-xl text-[13px] sm:text-[15px] font-bold tracking-tight whitespace-nowrap border transition-colors ${formData.condition === c.value ? "bg-[#241a12] text-[#f6ecda] border-[#241a12]" : "bg-white text-[#4a3a2b] border-[#e6dac6] hover:bg-[#f4ede1]"}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5 items-end">
                    <div>
                      <label htmlFor="lot-size" className={lbl}>Size <span className="normal-case tracking-normal font-semibold text-[#b3a085]">(opt.)</span></label>
                      <input id="lot-size" name="size" value={formData.size} onChange={handleChange} placeholder="M, 8, OSFA…" className={inputCls} />
                    </div>
                    {!showDesc && !formData.description ? (
                      <button type="button" onClick={() => setShowDesc(true)} className="min-h-[50px] text-left text-[15px] font-bold text-[#6c4d39] hover:underline">
                        + Add a description
                      </button>
                    ) : <span />}
                  </div>
                  {(showDesc || formData.description) && (
                    <div>
                      <label htmlFor="lot-description" className={lbl}>Description</label>
                      <textarea id="lot-description" name="description" value={formData.description} onChange={handleChange} rows={2}
                        placeholder="A couple of sentences." className={`${inputCls} resize-none py-2.5`} />
                    </div>
                  )}
                </div>

                {/* Price + shelf on one line, like the tag reads. */}
                <div className="flex gap-2 pt-3 mt-3 border-t border-[#f0e6d6]">
                  {[{ label: "Retail", name: "retailValue", placeholder: "0.00" }, { label: "Start *", name: "startingBid", placeholder: "2" }].map((f) => (
                    <div key={f.name} className="flex-1 min-w-0">
                      <label htmlFor={`lot-${f.name}`} className={lbl}>{f.label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                        <input id={`lot-${f.name}`} name={f.name} value={formData[f.name as "retailValue" | "startingBid"]} onChange={handleChange}
                          type="number" inputMode="decimal" placeholder={f.placeholder} className={`${inputCls} !pl-7 !pr-2 tabular-nums`} />
                      </div>
                    </div>
                  ))}
                  <div className="w-[6.5rem] shrink-0">
                    <label htmlFor="lot-shelf" className={lbl}>Shelf *</label>
                    <input id="lot-shelf" name="storageLocation" value={formData.storageLocation}
                      onChange={(e) => setFormData((prev) => ({ ...prev, storageLocation: e.target.value.toUpperCase() }))}
                      maxLength={12} autoCapitalize="characters" autoComplete="off" placeholder="A1"
                      className={`${inputCls} !px-2 text-center font-mono font-black uppercase`} />
                  </div>
                </div>

                {/* Whose shelf is this? (7-day rule) */}
                {formData.storageLocation.trim() && shelfStatus && shelfStatus.shelf === formData.storageLocation.trim().toUpperCase() && shelfStatus.shelfNumber && (
                  shelfStatus.holders.length > 0 ? (
                    <p className="mt-2 text-[13px] font-semibold text-[#8a4f1c] bg-[#fbeed8] border border-[#eed3ab] rounded-lg px-3 py-2">
                      Shelf {shelfStatus.shelfNumber} is {shelfStatus.holders[0].name}&apos;s · listed on {shelfStatus.holders[0].sections.join(", ")} {ago(shelfStatus.holders[0].minutesAgo)}
                      {shelfStatus.holders.length > 1 ? ` (+${shelfStatus.holders.length - 1} more)` : ""}
                      {confirmedKeys.includes(shelfKey(formData.storageLocation, formData.auctionId)) ? " · you confirmed" : ""}
                    </p>
                  ) : shelfStatus.mine ? (
                    <p className="mt-2 text-[13px] text-[#8a7559]">Shelf {shelfStatus.shelfNumber} is yours · {shelfStatus.mine.count} item{shelfStatus.mine.count !== 1 ? "s" : ""} in the last 7 days</p>
                  ) : (
                    <p className="mt-2 text-[13px] text-[#2f5d3a]">Shelf {shelfStatus.shelfNumber} is free. Nobody has listed on it in 7 days.</p>
                  )
                )}

                {/* Shelves already used in this auction + warehouse. Hold one to delete it. */}
                {visibleSpots.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {spotToHide && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#faf5ea] border border-[#e6dac6] px-3 py-2">
                        <span className="text-[15px] text-[#4a3a2b]">Delete <strong className="font-bold">{spotToHide}</strong>?</span>
                        <Btn size="sm" tone="red" onClick={() => hideSpot(spotToHide)}>Delete</Btn>
                        <Btn size="sm" variant="outline" onClick={() => setSpotToHide(null)}>Keep</Btn>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {visibleSpots.slice(0, 12).map((sp) => (
                        <HoldChip key={sp} on={formData.storageLocation === sp} onHold={() => setSpotToHide(sp)}
                          onClick={() => setFormData((prev) => ({ ...prev, storageLocation: sp }))} className="font-mono !min-h-[40px]">
                          {sp}
                        </HoldChip>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ships? (S / M / L / Custom) */}
                <div className="pt-3 mt-3 border-t border-[#f0e6d6]">
                  <ShipControl value={ship} onChange={setShip} />
                </div>

                {/* Rarely touched: reserve + transfer. */}
                <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}
                  className="mt-3 inline-flex items-center gap-1 text-[15px] font-bold text-[#8a7559] hover:text-[#241a12] min-h-[44px]">
                  More
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showMore ? "rotate-180" : ""}`}><path d="M3 6l5 5 5-5" /></svg>
                </button>
                {showMore && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <label htmlFor="lot-reservePrice" className={lbl}>Reserve</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7559] font-bold">$</span>
                        <input id="lot-reservePrice" name="reservePrice" value={formData.reservePrice} onChange={handleChange}
                          type="number" inputMode="decimal" placeholder="0" className={`${inputCls} !pl-7 !pr-2 tabular-nums`} />
                      </div>
                    </div>
                    <div>
                      <span className={lbl}>Transfer</span>
                      <div className="grid grid-cols-2 gap-1">
                        <Chip on={formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: true }))} className="!px-1 !text-[13px]">Can move</Chip>
                        <Chip on={!formData.transferable} onClick={() => setFormData((prev) => ({ ...prev, transferable: false }))} className="!px-1 !text-[13px]">Pickup here</Chip>
                      </div>
                    </div>
                  </div>
                )}
              </Step>
            </div>
          </div>
          <div className="h-2" />
        </div>
      </div>

      {/* ── Sticky footer: this item's code, the auction count, the print queue, save ── */}
      <footer className="sticky bottom-[68px] md:bottom-0 z-30 min-w-0 max-w-full bar-safe-bottom safe-x border-t border-[#e6dac6] bg-[#faf5ea] px-3 sm:px-8 pt-2.5 pb-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        {banner && !okBanner && (
          <div className="w-full sm:basis-full rounded-xl px-4 py-2.5 text-[15px] font-semibold flex items-center gap-2 border-2 bg-[#fbeae6] border-[#f0c4ba] text-[#a1321f]">
            <svg width="18" height="18" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="10" cy="10" r="8" /><path d="M10 6v5M10 13.5v.5" /></svg>
            <span className="flex-1">{banner}</span>
            <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss" className="w-8 h-8 grid place-items-center text-[#a1321f]/70">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
          </div>
        )}
        {(showCode || auctionCount !== null || unprinted > 0) && (
          <div className="flex items-center gap-2 min-w-0 sm:shrink-0">
            {showCode && (
              <div className="flex items-baseline gap-1.5 shrink-0 rounded-xl bg-[#241a12] px-3 py-1.5">
                <span className="text-[13px] font-black text-[#b9a688] uppercase tracking-wide">This item</span>
                <span className="font-mono text-xl font-black text-[#fbf4e6] tracking-wider whitespace-nowrap">{showCode}</span>
              </div>
            )}
            {formData.auctionId && (
              <div className="flex items-baseline gap-1.5 min-w-0 flex-1 sm:flex-none sm:max-w-xs rounded-xl bg-white border border-[#e6dac6] px-3 py-1.5" title="Lots in this auction (everyone's)">
                <span className="hidden sm:block text-[15px] font-bold text-[#241a12] truncate">{auctionTitle || "Auction"}</span>
                {auctionCount !== null && (
                  <span className="text-lg font-black text-[#6c4d39] tabular-nums shrink-0 whitespace-nowrap">
                    <span className="sm:hidden">{auctionCount.toLocaleString()} <span className="text-[13px] font-bold text-[#8a7559]">lots</span></span>
                    <span className="hidden sm:inline">· {auctionCount.toLocaleString()}</span>
                  </span>
                )}
              </div>
            )}
            {unprinted > 0 && (
              <button type="button" onClick={() => { openPrintQueue(); setUnprinted(0); }}
                className="shrink-0 inline-flex items-center gap-1.5 bg-[#fbeed8] border border-[#eed3ab] text-[#8a4f1c] text-[15px] font-black px-3 rounded-xl whitespace-nowrap min-h-[40px]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6V2h8v4" /><rect x="2" y="6" width="12" height="6" rx="1.5" /><path d="M4.5 10h7v4h-7z" /></svg>
                Print · {unprinted}
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2 sm:ml-auto min-w-0">
          <button type="button" onClick={() => setFormData((prev) => ({ ...prev, isPremium: !prev.isPremium }))}
            aria-pressed={formData.isPremium} aria-label={formData.isPremium ? "Featured, tap to unfeature" : "Feature this item"}
            className={`shrink-0 inline-flex items-center justify-center gap-1.5 w-12 sm:w-auto sm:px-3 min-h-[50px] rounded-xl text-[15px] font-bold border transition-colors ${formData.isPremium ? "bg-[#f0a35a] text-white border-[#f0a35a]" : "bg-white text-[#8a7559] border-[#d9c7ab] hover:bg-[#f4ede1]"}`}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill={formData.isPremium ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13l.8-4.2L2 5.9l4.2-.5L8 1.5z" /></svg>
            <span className="hidden sm:inline">{formData.isPremium ? "Featured" : "Feature"}</span>
          </button>
          <Btn onClick={() => handleSave(true)} disabled={saving || uploading} variant="outline" className="flex-1 min-w-0 sm:flex-none !px-3 sm:!px-6">
            {saving ? "Saving…" : "Save + next"}
          </Btn>
          <Btn onClick={() => handleSave(false)} disabled={saving || uploading} className="flex-1 min-w-0 sm:flex-none !px-3 sm:!px-6">
            {saving ? "Saving…" : uploading ? "Uploading…" : formEmpty ? (unprinted > 0 ? `Done · print ${unprinted}` : "Done") : "Save & done"}
          </Btn>
        </div>
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
          <div className="mx-auto w-full max-w-5xl space-y-4">
            {[0, 1, 2].map((i) => (
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
