import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// 4x6 inches at 72pt/in. Emitting a real PDF at this exact page size means the
// label prints edge-to-edge at "actual size" — no browser fit-to-page scaling
// that used to leave a zoomed-out white frame on all four sides.
const W = 288;
const H = 432;
const PAD = 12;

export type LItem = { code?: string | null; title: string; shelf?: string | null; warehouse?: string | null; gathered?: boolean };
export type LabelState = "STAGED" | "GATHERED" | "TO GATHER";
export type Row = { label: string; value: string };

// pdf-lib's standard fonts use WinAnsi encoding and throw on characters they
// can't encode (emoji, smart quotes, arrows). Normalize to a safe set.
const san = (s: unknown) =>
  String(s ?? "")
    .replace(/…/g, "...")
    .replace(/[→➔➡]/g, "->")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-")
    // Keep printable ASCII + Latin-1 (0xA0-0xFF); drop anything else, including the
    // undefined 0x80-0x9F range pdf-lib refuses to encode, and emoji.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

const shortTitle = (t: string, n = 40) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "..." : t);

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = san(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
    if (cur) lines.push(cur);
    if (font.widthOfTextAtSize(w, size) > maxW) {
      let chunk = "";
      for (const ch of w) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch;
        else { if (chunk) lines.push(chunk); chunk = ch; }
      }
      cur = chunk;
    } else cur = w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function clip(text: string, font: PDFFont, size: number, maxW: number): string {
  const t = san(text);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  let s = t;
  while (s.length && font.widthOfTextAtSize(`${s}...`, size) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

export type LabelOpts = {
  type: "PICKUP" | "TRANSFER";
  state: LabelState;
  name: string;
  destination?: string | null;
  email?: string | null;
  rows: Row[];
  count: number;
  countSuffix?: string;
  items: LItem[];
};
type Fonts = { reg: PDFFont; bold: PDFFont; mono: PDFFont };

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  };
}

// Draws one 4x6 label onto a fresh page of the given document. Shared by the
// single-label and multi-page batch builders.
function drawLabelPage(pdf: PDFDocument, fonts: Fonts, opts: LabelOpts) {
  const page: PDFPage = pdf.addPage([W, H]);
  const { reg, bold, mono } = fonts;

  // Thermal printers are black-only — any color/gray just dithers into muddy
  // halftone. Everything is solid black on white; the state (STAGED/GATHERED/TO
  // GATHER) is conveyed by the banner text, not color.
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const gray = black;   // labels stay crisp black, not dithered gray
  const hair = black;   // separators print as a clean thin black rule
  const banner = black;

  const innerW = W - PAD * 2;
  let cur = H - PAD; // y of the TOP of the next thing we draw

  const textTop = (x: number, s: string, font: PDFFont, size: number, color = black) => {
    page.drawText(san(s), { x, y: cur - size, size, font, color });
  };
  const rightText = (s: string, font: PDFFont, size: number, color = black, right = W - PAD) => {
    const t = san(s);
    page.drawText(t, { x: right - font.widthOfTextAtSize(t, size), y: cur - size, size, font, color });
  };
  const rule = (gapBefore = 5, gapAfter = 6) => {
    cur -= gapBefore;
    page.drawRectangle({ x: PAD, y: cur, width: innerW, height: 1.4, color: black });
    cur -= gapAfter;
  };

  // ── Banner ──
  {
    const size = 13;
    const lines = wrapText(`${opts.type} · ${opts.state}`, bold, size, innerW - 12);
    const lh = 15;
    const bh = lines.length * lh + 10;
    page.drawRectangle({ x: PAD, y: cur - bh, width: innerW, height: bh, color: banner });
    lines.forEach((ln, i) => {
      const w = bold.widthOfTextAtSize(ln, size);
      page.drawText(ln, { x: PAD + (innerW - w) / 2, y: cur - 7 - size - i * lh, size, font: bold, color: white });
    });
    cur -= bh + 10;
  }

  // ── Name ──
  for (const ln of wrapText(opts.name || "Bidder", bold, 20, innerW)) {
    textTop(PAD, ln, bold, 20);
    cur -= 23;
  }
  // ── Destination (transfers) ──
  if (opts.destination) { textTop(PAD, opts.destination, bold, 13); cur -= 16; }
  // ── Email ──
  if (opts.email) {
    for (const ln of wrapText(opts.email, bold, 10.5, innerW)) { textTop(PAD, ln, bold, 10.5); cur -= 13; }
  }

  rule();

  // ── Header rows (label left, value right) ──
  for (const r of opts.rows) {
    textTop(PAD, r.label, reg, 10.5, gray);
    rightText(r.value, bold, 10.5);
    cur -= 15;
  }

  rule();

  // ── Count ──
  textTop(PAD, `${opts.count} item${opts.count !== 1 ? "s" : ""}${opts.countSuffix ?? ""}`, bold, 11);
  cur -= 16;

  const drawItemRow = (it: LItem, showShelf: boolean) => {
    const size = 8.5;
    let x = PAD;
    if (it.code) {
      const c = san(it.code);
      page.drawText(c, { x, y: cur - size, size, font: mono, color: black });
      x += mono.widthOfTextAtSize(c, size) + 5;
    }
    const shelf = showShelf && it.shelf ? san(it.shelf) : "";
    const shelfW = shelf ? bold.widthOfTextAtSize(shelf, 8) : 0;
    const titleMaxW = W - PAD - x - (shelfW ? shelfW + 6 : 0);
    page.drawText(clip(shortTitle(it.title), reg, size, titleMaxW), { x, y: cur - size, size, font: reg, color: black });
    if (shelf) page.drawText(shelf, { x: W - PAD - shelfW, y: cur - 8, size: 8, font: bold, color: black });
    cur -= 12;
    page.drawRectangle({ x: PAD, y: cur + 3, width: innerW, height: 0.4, color: hair });
  };

  // Once an order is GATHERED or STAGED it's off the shelf and consolidated into
  // its pickup/staged spot, so the original shelf + warehouse no longer matter —
  // show a flat list of what's in the bundle. Only a TO-GATHER label needs the
  // warehouse groups + shelves (so staff know where to pull each item from).
  if (opts.state !== "TO GATHER") {
    for (const it of opts.items) {
      if (cur < PAD + 12) { textTop(PAD, "...more", bold, 8, gray); break; }
      drawItemRow(it, false);
    }
  } else {
    const groups = new Map<string, LItem[]>();
    for (const it of opts.items) {
      const key = it.warehouse || "Unassigned";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    outer:
    for (const [wh, its] of sortedGroups) {
      if (cur < PAD + 26) break;
      const gh = 14;
      page.drawRectangle({ x: PAD, y: cur - gh, width: innerW, height: gh, color: black });
      page.drawText(san(`${wh} · ${its.length}`), { x: PAD + 4, y: cur - gh + 4, size: 8, font: bold, color: white });
      cur -= gh + 3;

      const rows = its.slice().sort((a, b) => (a.shelf || "").localeCompare(b.shelf || ""));
      for (const it of rows) {
        if (cur < PAD + 12) { textTop(PAD, "...more", bold, 8, gray); break outer; }
        // Even on a to-gather label, an item that's already been grabbed is off the
        // shelf — hide just that item's shelf, keep it for the ones still to pull.
        drawItemRow(it, !it.gathered);
      }
    }
  }
}

export async function buildLabel(opts: LabelOpts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  drawLabelPage(pdf, fonts, opts);
  return pdf.save();
}

// Multi-page: one label per page, e.g. every transfer to pull from a warehouse.
export async function buildBatch(list: LabelOpts[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  if (list.length === 0) {
    drawLabelPage(pdf, fonts, { type: "TRANSFER", state: "TO GATHER", name: "Nothing to pull", rows: [], count: 0, items: [] });
  } else {
    for (const o of list) drawLabelPage(pdf, fonts, o);
  }
  return pdf.save();
}
