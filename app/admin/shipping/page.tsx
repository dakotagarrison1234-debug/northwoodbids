"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody, Btn, Segmented, Empty, Notice } from "../ui";
import BoxCard from "./BoxCard";
import SetupTab from "./SetupTab";
import { type Board, type Box, type BulkResult, type CardState, type PackInput, type RateView, fmtCents } from "./types";

/**
 * /admin/shipping — the Ship board (docs/shipping-research.md §9 P3/P4).
 *
 * To pack: boxes whose every lot is paid and at the box's warehouse — confirm
 * the box and weight, get a rate, buy the label, print it. Waiting: closed
 * boxes still missing a lot (on transfer / unpaid). Collecting: open boxes
 * still taking wins. Shipped: the last 14 days with tracking + charged vs actual.
 *
 * Every warehouse that's a shipping station packs its own boxes, so the header
 * carries the same warehouse scope the Pickup board has (All / Owosso /
 * Gladwin, remembered per device in localStorage `nb-ship-warehouse`).
 *
 * Bulk (To pack + Shipped): tick boxes, then Print pull lists / Rate all /
 * Buy all labels / Print all labels act on the ticked set. The selection is a
 * set of box ids held here, so it survives a reload and boxes moving between
 * tabs (a box bought on To pack stays ticked on Shipped for Print all labels).
 * The rate each card shows and its inline error also live here, so a bulk
 * run can fill them in for cards that were never opened.
 */

const WAREHOUSE_KEY = "nb-ship-warehouse";
// POST /api/admin/shipping/bulk takes up to 25 ids; smaller chunks so cards
// fill in as the run goes rather than all at the end.
const BULK_CHUNK = 5;

type BoxTab = "packing" | "closed" | "open" | "shipped";
type Tab = BoxTab | "setup";
const TAB_LABEL: Record<Tab, string> = { packing: "To pack", closed: "Waiting", open: "Collecting", shipped: "Shipped", setup: "Make shippable" };
const EMPTY: Record<BoxTab, string> = {
  packing: "Nothing to pack",
  closed: "No boxes waiting on lots",
  open: "No boxes collecting wins",
  shipped: "Nothing shipped in the last 14 days",
};

// PrintLabelButton-style anchor (PDF viewer in a new tab), kit outline look.
const printLinkCls =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap min-h-[44px] px-4 text-[15px] bg-white border-2 border-[#d9c7ab] text-[#563e2c] hover:bg-[#faf5ea]";

const isShipped = (b: Box) => b.status === "SHIPPED" || b.status === "DELIVERED";

export default function AdminShippingPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("packing");
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);
  // Bulk selection + per-card state (see the header comment).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [packInputs, setPackInputs] = useState<Record<string, PackInput>>({});
  const [bulk, setBulk] = useState<{ action: "rate" | "buy"; done: number; total: number } | null>(null);
  // Which warehouse's boxes to show ("all" = every station). You pack one
  // building at a time, so it's remembered per device. The server render says
  // "all"; the saved choice is restored once on the client, off the render path.
  const [warehouse, setWarehouseRaw] = useState<string>("all");
  const [scopeHydrated, setScopeHydrated] = useState(false);
  const setWarehouse = useCallback((v: string) => {
    setWarehouseRaw(v);
    try { localStorage.setItem(WAREHOUSE_KEY, v); } catch {}
  }, []);
  useEffect(() => {
    if (scopeHydrated) return;
    const t = setTimeout(() => {
      try { const s = localStorage.getItem(WAREHOUSE_KEY); if (s) setWarehouseRaw(s); } catch {}
      setScopeHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [scopeHydrated]);

  const load = useCallback(() => {
    return fetch("/api/admin/shipping", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const d = (await res.json()) as Board;
        setBoard(d);
        setLoadError(null);
      })
      .catch(() => setLoadError("Couldn't load the Ship board."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Coming back to the tab after a walk to the printer: refresh.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };
  const askConfirm = (text: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }) =>
    setConfirmDialog({ text, onConfirm, confirmLabel: opts?.confirmLabel ?? "Confirm", danger: opts?.danger });

  // A box changed (rated / bought / refunded / notes): put it in the right list.
  const replaceBox = (b: Box) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const strip = (list: Box[]) => list.filter((x) => x.id !== b.id);
      const next: Board = { ...prev, packing: strip(prev.packing), closed: strip(prev.closed), open: strip(prev.open), shipped: strip(prev.shipped) };
      if (b.status === "PACKING") next.packing = [...next.packing, b];
      else if (b.status === "CLOSED") next.closed = [...next.closed, b];
      else if (b.status === "OPEN") next.open = [...next.open, b];
      else if (b.status === "SHIPPED" || b.status === "DELIVERED") next.shipped = [b, ...next.shipped];
      return next;
    });
  };
  const removeBox = (id: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const strip = (list: Box[]) => list.filter((x) => x.id !== id);
      return { ...prev, packing: strip(prev.packing), closed: strip(prev.closed), open: strip(prev.open), shipped: strip(prev.shipped) };
    });
    setSelected((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
  };

  // Per-card rate / error, keyed by box id.
  const cardOf = (id: string): CardState => cards[id] ?? { rate: null, err: null };
  const setCard = (id: string, patch: Partial<CardState>) => setCards((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { rate: null, err: null }), ...patch } }));

  // Scope chips: every station, plus any warehouse a box on the board still
  // points at (a station that was toggled off keeps its boxes visible).
  const stationList = (() => {
    const seen = new Map<string, string>();
    for (const st of board?.stations ?? []) seen.set(st.id, st.name);
    for (const b of board ? [...board.packing, ...board.closed, ...board.open, ...board.shipped] : []) {
      if (b.location && !seen.has(b.location.id)) seen.set(b.location.id, b.location.name);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  })();
  const inScope = (b: Box) => warehouse === "all" || b.location?.id === warehouse;
  // A remembered warehouse that no longer exists falls back to All.
  const scope = warehouse === "all" || stationList.some((s) => s.id === warehouse) ? warehouse : "all";
  const scoped = (list: Box[]) => (scope === "all" ? list : list.filter(inScope));
  // Chip counts come from To pack — the actual work — unfiltered by tab.
  const countFor = (locId: string) =>
    locId === "all" ? (board?.packing.length ?? 0) : (board?.packing ?? []).filter((b) => b.location?.id === locId).length;

  const toPack = scoped(board?.packing ?? []).length;
  const boxTab: BoxTab = tab === "setup" ? "packing" : tab;
  const list: Box[] = board ? scoped(board[boxTab]) : [];
  const configured = !!board?.configured && !board?.configMessage;

  // ── Bulk ────────────────────────────────────────────────────────────────
  // The selection resolves against every list, so a ticked box that just
  // moved to Shipped still counts (and ids that vanished on reload drop out).
  const allBoxes = board ? [...board.packing, ...board.closed, ...board.open, ...board.shipped] : [];
  const selectedBoxes = allBoxes.filter((b) => selected.has(b.id));
  const selectedPacking = selectedBoxes.filter((b) => b.status === "PACKING");
  const selectedRated = selectedPacking.filter((b) => b.hasShipment);
  const allSelectedShipped = selectedBoxes.length > 0 && selectedBoxes.every((b) => isShipped(b) && !!b.labelUrl);
  const allVisibleSelected = list.length > 0 && list.every((b) => selected.has(b.id));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllVisible = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allVisibleSelected) list.forEach((b) => n.delete(b.id));
    else list.forEach((b) => n.add(b.id));
    return n;
  });
  const clearSelection = () => setSelected(new Set());
  const idsParam = (boxes: Box[]) => boxes.map((b) => b.id).join(",");

  /** POST /bulk in chunks, applying each chunk's results as it lands. */
  const runBulk = async (action: "rate" | "buy", boxes: Box[]) => {
    const ids = boxes.map((b) => b.id);
    setBulk({ action, done: 0, total: ids.length });
    const results: BulkResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        const chunk = ids.slice(i, i + BULK_CHUNK);
        let got: BulkResult[];
        try {
          const pack = action === "rate" ? Object.fromEntries(chunk.filter((id) => packInputs[id]).map((id) => [id, packInputs[id]])) : undefined;
          const res = await fetch("/api/admin/shipping/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids: chunk, pack }) });
          const data = (await res.json().catch(() => ({}))) as { results?: BulkResult[]; error?: string };
          got = res.ok && data.results ? data.results : chunk.map((id) => ({ id, ok: false, error: data.error || "Something went wrong." }));
        } catch {
          got = chunk.map((id) => ({ id, ok: false, error: "Something went wrong." }));
        }
        for (const r of got) {
          const box = boxes.find((b) => b.id === r.id);
          if (!r.ok) { setCard(r.id, { err: r.error || "Something went wrong." }); continue; }
          if (action === "rate" && r.rate && box) {
            const rate: RateView = { ...r.rate, chargedCents: r.chargedCents ?? box.chargedCents, spreadCents: r.spreadCents ?? box.chargedCents - r.rate.cents };
            setCard(r.id, { rate, err: null });
            replaceBox({ ...box, packedBoxCode: r.packedBoxCode ?? box.packedBoxCode, packedWeightOz: r.packedWeightOz ?? box.packedWeightOz, hasShipment: true });
          } else if (action === "buy") {
            setCard(r.id, { rate: null, err: null });
            if (r.bundle) replaceBox(r.bundle);
          }
        }
        results.push(...got);
        setBulk({ action, done: Math.min(ids.length, i + chunk.length), total: ids.length });
      }
    } finally {
      setBulk(null);
    }
    const okCount = results.filter((r) => r.ok).length;
    const n = ids.length;
    if (action === "rate") flash(`Rated ${okCount} of ${n} box${n !== 1 ? "es" : ""}.${okCount < n ? " Problems are on the cards." : ""}`, okCount === n);
    else flash(`Bought ${okCount} of ${n} label${n !== 1 ? "s" : ""}.${okCount < n ? " Problems are on the cards." : ""}`, okCount === n);
  };

  const rateAll = () => { if (selectedPacking.length) runBulk("rate", selectedPacking); };
  const buyAll = () => {
    const boxes = selectedRated;
    if (boxes.length === 0) return;
    const known = boxes.map((b) => cardOf(b.id).rate).filter((r): r is RateView => !!r);
    const total = known.reduce((s, r) => s + r.cents, 0);
    const n = boxes.length;
    const about = known.length === n ? ` for about ${fmtCents(total)} total` : known.length > 0 ? ` for about ${fmtCents(total)} plus ${n - known.length} without a rate shown` : "";
    askConfirm(
      `Buy ${n} label${n !== 1 ? "s" : ""}${about}? Boxes without a scale weight use the estimated weight.`,
      () => runBulk("buy", boxes),
      { confirmLabel: "Buy labels" },
    );
  };

  // Stays up while something is still ticked even if the tab emptied (every
  // box just bought → Print all labels from To pack).
  const bulkBar = (tab === "packing" || tab === "shipped") && (list.length > 0 || selectedBoxes.length > 0) && (
    <div className="bg-white border border-[#e6dac6] rounded-2xl px-3 py-2 flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-2 min-h-[44px] px-2 cursor-pointer select-none">
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={list.length === 0} aria-label="Select all" className="w-6 h-6 accent-[#6c4d39] cursor-pointer" />
        <span className="font-bold text-[15px] text-[#563e2c]">Select all</span>
      </label>
      <span className="text-[15px] text-[#8a7559] tabular-nums">{selectedBoxes.length} selected</span>
      {selectedBoxes.length > 0 && (
        <Btn onClick={clearSelection} tone="slate" variant="ghost" size="sm" disabled={!!bulk}>Clear</Btn>
      )}
      <span className="flex-1" />
      {tab === "packing" && (
        <>
          {selectedBoxes.length > 0 ? (
            <a href={`/api/admin/shipping/pull-list.pdf?ids=${idsParam(selectedBoxes)}`} target="_blank" rel="noopener noreferrer" className={printLinkCls}>Print pull lists</a>
          ) : (
            <Btn tone="slate" variant="outline" size="sm" disabled>Print pull lists</Btn>
          )}
          <Btn onClick={rateAll} tone="leather" size="sm" disabled={!configured || !!bulk || selectedPacking.length === 0}>
            {bulk?.action === "rate" ? `Rating ${bulk.done} of ${bulk.total}…` : `Rate all${selectedPacking.length ? ` (${selectedPacking.length})` : ""}`}
          </Btn>
          <Btn onClick={buyAll} tone="green" size="sm" disabled={!configured || !!bulk || selectedRated.length === 0}>
            {bulk?.action === "buy" ? `Buying ${bulk.done} of ${bulk.total}…` : `Buy all labels${selectedRated.length ? ` (${selectedRated.length})` : ""}`}
          </Btn>
        </>
      )}
      {allSelectedShipped ? (
        <a href={`/api/admin/shipping/labels.pdf?ids=${idsParam(selectedBoxes)}`} target="_blank" rel="noopener noreferrer" className={`${printLinkCls} border-[#4a7c59] text-[#2f5d3a]`}>
          Print all labels ({selectedBoxes.length})
        </a>
      ) : (
        <Btn tone="green" variant="outline" size="sm" disabled>Print all labels</Btn>
      )}
    </div>
  );

  const warehouseScope = stationList.length > 1 ? (
    <Segmented
      value={scope}
      onChange={(id) => { setWarehouse(id); setOpenId(null); }}
      options={[{ id: "all", name: "All" }, ...stationList].map((l) => ({ value: l.id, label: l.name, count: countFor(l.id) }))}
      className="max-w-[calc(100vw-2rem)]"
    />
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Ship"
        sub={toPack > 0 ? `${toPack} box${toPack !== 1 ? "es" : ""} to pack` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {warehouseScope}
            <Btn onClick={load} tone="slate" variant="outline" size="sm" disabled={loading}>Refresh</Btn>
          </div>
        }
      />
      <PageBody wide>
        {msg && <Notice tone={msg.ok ? "green" : "red"}>{msg.text}</Notice>}
        {loadError && <Notice tone="red">{loadError}</Notice>}
        {board && !board.configured && <Notice tone="amber">{board.configMessage ?? "Labels need EASYPOST_API_KEY — see docs/shipping.md"}</Notice>}
        {board && board.configured && board.configMessage && <Notice tone="amber">{board.configMessage}</Notice>}

        <Segmented<Tab>
          value={tab}
          onChange={(t) => { setTab(t); setOpenId(null); }}
          options={(["packing", "closed", "open", "shipped", "setup"] as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t], count: t !== "setup" && board ? scoped(board[t]).length : undefined }))}
        />

        {tab === "setup" ? (
          <SetupTab />
        ) : (
        <>
        {bulkBar}

        {loading && !board ? (
          <div className="text-center py-20 text-[#8a7559]">Loading…</div>
        ) : list.length === 0 ? (
          <Empty text={scope === "all" ? EMPTY[boxTab] : `${EMPTY[boxTab]} at ${stationList.find((s) => s.id === scope)?.name ?? "this warehouse"}`} />
        ) : (
          <div className="space-y-3">
            {list.map((b) => (
              <BoxCard
                key={b.id}
                box={b}
                boxes={board?.boxes ?? []}
                configured={configured}
                open={openId === b.id}
                onToggle={() => setOpenId((cur) => (cur === b.id ? null : b.id))}
                onChange={replaceBox}
                onRemove={removeBox}
                flash={flash}
                askConfirm={askConfirm}
                rate={cardOf(b.id).rate}
                setRate={(r) => setCard(b.id, { rate: r })}
                err={cardOf(b.id).err}
                setErr={(e) => setCard(b.id, { err: e })}
                pack={packInputs[b.id]}
                onPackChange={(p) => setPackInputs((prev) => ({ ...prev, [b.id]: p }))}
                selected={tab === "packing" || tab === "shipped" ? selected.has(b.id) : undefined}
                onSelect={tab === "packing" || tab === "shipped" ? () => toggleOne(b.id) : undefined}
              />
            ))}
          </div>
        )}
        </>
        )}
      </PageBody>

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn onClick={() => setConfirmDialog(null)} tone="slate" variant="outline" className="flex-1">Back</Btn>
              <Btn
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                tone={confirmDialog.danger ? "red" : "leather"}
                className="flex-1"
              >
                {confirmDialog.confirmLabel}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
