"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Segmented, SearchBox, Empty, Notice, Btn, Disclosure } from "../ui";

/**
 * "Make shippable" — the Ship board's setup tab.
 *
 * One warehouse at a time (no All). Lists only lots at that warehouse that are
 * NOT shippable yet and NOT live (auction still DRAFT), grouped by auction. One
 * tap on S / M / L flips the lot on at that preset and it drops off the list.
 * No custom size here — that stays on the lot's edit screen.
 */

type SetupItem = { id: string; title: string; code: string | null; thumb: string | null };
type SetupAuction = { id: string; title: string; startAt: string; items: SetupItem[] };
type Data = { locations: { id: string; name: string }[]; auctions: SetupAuction[] };

const SETUP_WAREHOUSE_KEY = "nb-ship-setup-warehouse";
const SIZES = [
  { key: "SMALL", label: "S", title: "Small — under 8 oz" },
  { key: "MEDIUM", label: "M", title: "Medium — about 1 lb" },
  { key: "LARGE", label: "L", title: "Large — 2 to 5 lb" },
] as const;
const SIZE_STYLE: Record<string, string> = {
  SMALL: "border-[#4a7c59] text-[#2f5d3a] hover:bg-[#eaf3ec]",
  MEDIUM: "border-[#c47b3e] text-[#8a4f1c] hover:bg-[#fbf0e4]",
  LARGE: "border-[#6c4d39] text-[#4a3a2b] hover:bg-[#f4ede1]",
};

const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function SetupTab() {
  const [data, setData] = useState<Data | null>(null);
  const [warehouse, setWarehouse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<{ item: SetupItem; auction: SetupAuction; preset: string } | null>(null);
  // Auctions start collapsed; tap a header to reveal its lots. A search opens
  // every auction with a match so results aren't hidden.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggleAuction = (id: string) => setOpenIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const load = useCallback((locId: string) => {
    setLoading(true);
    setError(null);
    return fetch(`/api/admin/shipping/setup?locationId=${encodeURIComponent(locId)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Couldn't load lots.");
        setData(j);
        // First visit: fall back to the remembered warehouse, else the first one.
        if (!locId) {
          let remembered = "";
          try { remembered = localStorage.getItem(SETUP_WAREHOUSE_KEY) || ""; } catch { /* ignore */ }
          const locs: { id: string }[] = j.locations ?? [];
          const pick = locs.some((l) => l.id === remembered) ? remembered : locs[0]?.id ?? "";
          if (pick) setWarehouse(pick);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load lots."))
      .finally(() => setLoading(false));
  }, []);

  // Load the warehouse list once, then the lots whenever the warehouse changes
  // (deferred a tick so the fetch's setState stays off the render path).
  useEffect(() => {
    const t = setTimeout(() => load(warehouse), 0);
    return () => clearTimeout(t);
  }, [warehouse, load]);

  const pickWarehouse = (id: string) => {
    setWarehouse(id);
    setLast(null);
    setOpenIds(new Set());
    try { localStorage.setItem(SETUP_WAREHOUSE_KEY, id); } catch { /* ignore */ }
  };

  const setPreset = async (item: SetupItem, auction: SetupAuction, preset: string) => {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/shipping/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, preset }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't update that lot.");
      if (preset === "OFF" || preset === "UNSKIP") {
        // Undo: put it back where it was.
        setData((d) => d && ({
          ...d,
          auctions: d.auctions.some((a) => a.id === auction.id)
            ? d.auctions.map((a) => (a.id === auction.id ? { ...a, items: [item, ...a.items] } : a))
            : [...d.auctions, { ...auction, items: [item] }].sort((a, b) => a.startAt.localeCompare(b.startAt)),
        }));
        setLast(null);
      } else {
        setData((d) => d && ({
          ...d,
          auctions: d.auctions
            .map((a) => (a.id === auction.id ? { ...a, items: a.items.filter((i) => i.id !== item.id) } : a))
            .filter((a) => a.items.length > 0),
        }));
        setLast({ item, auction, preset });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't update that lot.");
    } finally {
      setBusy(null);
    }
  };

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const auctions = data?.auctions ?? [];
    if (!term) return auctions;
    return auctions
      .map((a) => ({ ...a, items: a.items.filter((i) => i.title.toLowerCase().includes(term) || (i.code ?? "").toLowerCase().includes(term)) }))
      .filter((a) => a.items.length > 0);
  }, [data, term]);
  const total = (data?.auctions ?? []).reduce((n, a) => n + a.items.length, 0);
  const locName = data?.locations.find((l) => l.id === warehouse)?.name ?? "";

  return (
    <div className="space-y-3">
      {data && data.locations.length > 0 && (
        <Segmented
          value={warehouse}
          onChange={pickWarehouse}
          options={data.locations.map((l) => ({ value: l.id, label: l.name }))}
          className="max-w-[calc(100vw-2rem)]"
        />
      )}

      {error && <Notice tone="red">{error}</Notice>}
      {last && (
        <Notice tone="green">
          <span className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="font-bold">{last.item.title}</strong>
              {last.preset === "SKIP" ? " is pickup only." : ` is now shippable (${last.preset === "SMALL" ? "Small" : last.preset === "MEDIUM" ? "Medium" : "Large"}).`}
            </span>
            <Btn size="sm" variant="outline" onClick={() => setPreset(last.item, last.auction, last.preset === "SKIP" ? "UNSKIP" : "OFF")} disabled={!!busy}>Undo</Btn>
          </span>
        </Notice>
      )}

      {total > 0 && (
        <SearchBox value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or tag #" className="w-full" />
      )}

      {loading && !data ? (
        <div className="text-center py-20 text-[#8a7559]">Loading…</div>
      ) : !warehouse ? (
        <Empty text="No warehouses yet" sub="Add one under Settings → Locations." />
      ) : total === 0 ? (
        <Empty text={`Nothing to set up at ${locName}`} sub="Every upcoming lot here is already shippable, or there are none yet. Lots in live or closed auctions aren't listed — change those from the lot's edit screen." />
      ) : shown.length === 0 ? (
        <Empty text="No lots match" sub="Try another word or clear the search." />
      ) : (
        shown.map((a) => (
          <Disclosure
            key={a.id}
            open={term ? true : openIds.has(a.id)}
            onToggle={() => toggleAuction(a.id)}
            label={
              <span className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[#241a12]">{a.title}</span>
                <span className="text-[15px] font-semibold text-[#8a7559]">Opens {dateShort(a.startAt)} · {a.items.length} lot{a.items.length !== 1 ? "s" : ""}</span>
              </span>
            }
          >
            <ul className="divide-y divide-[#f0e6d6]">
              {a.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                  {it.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb} alt="" className="w-12 h-12 rounded-lg object-cover bg-[#f4ede1] shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#f4ede1] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-[#241a12] leading-tight line-clamp-2">{it.title}</div>
                    {it.code && <div className="text-[13px] text-[#8a7559] tabular-nums mt-0.5">#{it.code}</div>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {SIZES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        title={s.title}
                        disabled={busy === it.id}
                        onClick={() => setPreset(it, a, s.key)}
                        className={`w-11 h-11 rounded-xl border-2 bg-white font-black text-[17px] transition-colors disabled:opacity-50 ${SIZE_STYLE[s.key]}`}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      title="Pickup only — take it off this list"
                      aria-label="Pickup only"
                      disabled={busy === it.id}
                      onClick={() => setPreset(it, a, "SKIP")}
                      className="w-11 h-11 rounded-xl border-2 border-[#e6dac6] bg-white text-[#a1321f] hover:bg-[#fbeeec] hover:border-[#a1321f] transition-colors disabled:opacity-50 inline-flex items-center justify-center"
                    >
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Disclosure>
        ))
      )}
    </div>
  );
}
