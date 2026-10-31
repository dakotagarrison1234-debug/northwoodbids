"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * /print/labels — 2x1 in thermal item tags (ported from PureBid MI).
 *
 *   ?queue=AUCTIONID | all          every tag *I* still owe (New item "Print · n"),
 *                                   in the order I listed them, then stamped printed
 *   ?ids=a,b,c                      those items (reprint from an item)
 *   ?auctionId=X&filter=unprinted   every tag still owed in that auction (anyone's)
 *   ?auctionId=X&filter=all         the whole auction again
 *
 * Builds a real PDF with one exact 2in x 1in page per tag, so it prints at true
 * size on a label roll whatever the browser's paper setting is. Desktop: the
 * print dialog opens by itself. Phones: Print / Share hands the PDF to the share
 * sheet (AirPrint / the label printer's app). Every tag that was built is
 * stamped printed server-side, so the counters drop and nothing is ever lost on
 * a refresh; a reprint just stamps again.
 */

type Label = { id: string; itemCode: string | null; title: string; storageLocation: string | null };

// pdf-lib's standard fonts are WinAnsi only: normalize quotes/dashes and drop
// anything they can't draw (emoji etc.) instead of throwing.
const san = (s: unknown) =>
  String(s ?? "")
    .replace(/…/g, "...")
    .replace(/[‘’]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

async function buildPdf(labels: Label[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, PDFName, PDFString, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const courier = await doc.embedFont(StandardFonts.CourierBold);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 144, H = 72, PAD = 7.2, MAXW = W - PAD * 2; // 2in x 1in at 72pt/in
  const black = rgb(0, 0, 0);

  const wrap = (text: string, size: number, maxW: number): string[] => {
    const words = san(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (helv.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
      if (cur) lines.push(cur);
      cur = w;
      while (helv.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) {
        let cut = cur.length - 1;
        while (cut > 1 && helv.widthOfTextAtSize(cur.slice(0, cut), size) > maxW) cut--;
        lines.push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  for (const l of labels) {
    const page = doc.addPage([W, H]);

    // Big item code: THE tag. The lister is already in the code (48-DAK), so
    // no name on the label. Shrinks so 10000-DAK still fits.
    const code = san(l.itemCode || "-");
    let fs = 40;
    while (courier.widthOfTextAtSize(code, fs) > MAXW && fs > 10) fs -= 1;
    page.drawText(code, { x: (W - courier.widthOfTextAtSize(code, fs)) / 2, y: H - 0.47 * 72, size: fs, font: courier, color: black });

    // Title: up to 2 lines.
    const lines = wrap(l.title || "", 8, MAXW).slice(0, 2);
    lines.forEach((line, i) => {
      page.drawText(line, { x: PAD, y: H - 0.66 * 72 - i * 8 * 1.15, size: 8, font: helv, color: black });
    });

    // Shelf / spot: bold, bottom-left.
    const shelf = san(l.storageLocation ?? "").trim();
    if (shelf) {
      let s = shelf;
      while (helvBold.widthOfTextAtSize(s, 8.5) > MAXW * 0.62 && s.length > 1) s = s.slice(0, -1);
      page.drawText(s, { x: PAD, y: H - 0.93 * 72, size: 8.5, font: helvBold, color: black });
    }
  }

  // Open the print dialog as soon as a desktop PDF viewer loads it.
  const action = doc.context.obj({
    Type: "Action",
    S: "JavaScript",
    JS: PDFString.of("print({bUI: true, bSilent: false, bShrinkToFit: false});"),
  });
  doc.catalog.set(PDFName.of("OpenAction"), action);

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function LabelsInner() {
  const params = useSearchParams();
  const ids = params.get("ids") || "";
  const queueAuction = params.get("queue") || "";
  const auctionId = params.get("auctionId") || "";
  const auctionFilter = params.get("filter") === "all" ? "all" : "unprinted";
  const nothingToPrint = !ids && !queueAuction && !auctionId;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(nothingToPrint ? "error" : "loading");
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [msg, setMsg] = useState(nothingToPrint ? "No items selected." : "Preparing tags…");

  useEffect(() => {
    if (nothingToPrint) return;
    let revoked: string | null = null;
    let cancelled = false;

    const source = queueAuction
      ? fetch(`/api/admin/intake/tags${queueAuction === "all" ? "" : `?auctionId=${encodeURIComponent(queueAuction)}`}`)
      : auctionId
        ? fetch(`/api/admin/items/labels?auctionId=${encodeURIComponent(auctionId)}&filter=${auctionFilter}`)
        : fetch(`/api/admin/items/labels?ids=${encodeURIComponent(ids)}`);

    source
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (d) => {
        const labels: Label[] = Array.isArray(d.items) ? d.items : [];
        if (labels.length === 0) {
          if (!cancelled) {
            setStatus("error");
            setMsg(queueAuction || (auctionId && auctionFilter === "unprinted") ? "All caught up. Every tag is printed." : "No tags found.");
          }
          return;
        }
        const blob = await buildPdf(labels);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setCount(labels.length);
        setCapped(!!d.capped);
        setPdfBlob(blob);
        setPdfUrl(url);
        setStatus("ready");
        // A tag that's been built is a tag that's been printed: stamp it so the
        // "Print · n" counter drops. A reprint re-stamping is harmless.
        fetch(queueAuction ? "/api/admin/intake/tags" : "/api/admin/items/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: labels.map((l) => l.id) }),
        }).catch(() => {});
      })
      .catch(() => { if (!cancelled) { setStatus("error"); setMsg("Couldn't build the tags."); } });
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [nothingToPrint, ids, queueAuction, auctionId, auctionFilter]);

  // Phones don't run a PDF's auto-print: hand the file to the share sheet
  // (AirPrint / the label printer's app). Desktop just opens it.
  const printOrShare = async () => {
    if (!pdfBlob || !pdfUrl) return;
    const file = new File([pdfBlob], "tags.pdf", { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string }) => Promise<void> };
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: "Tags" }); return; } catch { /* fall through */ }
    }
    window.open(pdfUrl, "_blank", "noopener");
  };

  if (status !== "ready") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", fontSize: 17, fontWeight: 600, color: status === "error" ? "#a1321f" : "#6f5b46", background: "#f4ede1" }}>
        {msg}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", fontFamily: "system-ui, sans-serif", background: "#f4ede1" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e6dac6", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: "#241a12" }}>
          {count} tag{count !== 1 ? "s" : ""} · 2×1 in
          {capped && <span style={{ fontWeight: 600, color: "#8a4f1c" }}> · first 500, print again for the rest</span>}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={printOrShare}
            style={{ background: "#6c4d39", color: "#fff", fontWeight: 700, fontSize: 15, border: 0, borderRadius: 12, padding: "0 18px", minHeight: 44, cursor: "pointer" }}>
            Print / Share
          </button>
          <a href={pdfUrl!} download="tags.pdf"
            style={{ background: "#fff", color: "#563e2c", fontWeight: 700, fontSize: 15, border: "2px solid #d9c7ab", borderRadius: 12, padding: "0 16px", minHeight: 44, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Download PDF
          </a>
        </div>
      </div>
      <p style={{ margin: 0, padding: "10px 16px", background: "#fbeed8", borderBottom: "1px solid #eed3ab", color: "#8a4f1c", fontSize: 14, lineHeight: 1.4 }}>
        <strong>Computer:</strong> the print dialog opens by itself. Pick the label printer and <strong>Actual size</strong>. <strong>Phone:</strong> tap <strong>Print / Share</strong>, then Print (AirPrint) or the label printer&apos;s app. Pages are already exactly 2×1 in.
      </p>
      <iframe title="Tags" src={pdfUrl!} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
    </div>
  );
}

export default function LabelsPrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>}>
      <LabelsInner />
    </Suspense>
  );
}
