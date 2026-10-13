"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody, Btn, Segmented, Empty, Notice } from "../ui";
import BoxCard from "./BoxCard";
import type { Board, Box } from "./types";

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
 */

const WAREHOUSE_KEY = "nb-ship-warehouse";

type Tab = "packing" | "closed" | "open" | "shipped";
const TAB_LABEL: Record<Tab, string> = { packing: "To pack", closed: "Waiting", open: "Collecting", shipped: "Shipped" };
const EMPTY: Record<Tab, string> = {
  packing: "Nothing to pack",
  closed: "No boxes waiting on lots",
  open: "No boxes collecting wins",
  shipped: "Nothing shipped in the last 14 days",
};

export default function AdminShippingPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("packing");
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);
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
  };

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
  const list: Box[] = board ? scoped(board[tab]) : [];

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
          options={(["packing", "closed", "open", "shipped"] as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t], count: board ? scoped(board[t]).length : undefined }))}
        />

        {loading && !board ? (
          <div className="text-center py-20 text-[#8a7559]">Loading…</div>
        ) : list.length === 0 ? (
          <Empty text={scope === "all" ? EMPTY[tab] : `${EMPTY[tab]} at ${stationList.find((s) => s.id === scope)?.name ?? "this warehouse"}`} />
        ) : (
          <div className="space-y-3">
            {list.map((b) => (
              <BoxCard
                key={b.id}
                box={b}
                boxes={board?.boxes ?? []}
                configured={!!board?.configured && !board?.configMessage}
                open={openId === b.id}
                onToggle={() => setOpenId((cur) => (cur === b.id ? null : b.id))}
                onChange={replaceBox}
                onRemove={removeBox}
                flash={flash}
                askConfirm={askConfirm}
              />
            ))}
          </div>
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
