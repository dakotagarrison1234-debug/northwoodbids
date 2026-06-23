"use client";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { money as fmtMoney } from "@/lib/format";

const LOGO_URL =
  "https://assets.cdn.filesafe.space/TwuL7EwKfW8oGIV0Zo5q/media/6a373b261c5d711b35bf4e56.png";

interface Line {
  title: string;
  itemCode: string | null;
  photo: string | null;
  bid: number;
  premium: number;
  tax: number;
  total: number;
}
interface Totals {
  subtotal: number;
  premium: number;
  tax: number;
  credit?: number;
  grandTotal: number;
}
interface Invoice {
  business: { name: string };
  auction: { title: string };
  feePercent?: number;
  taxPercent?: number;
  buyer: { name: string | null; email: string | null };
  date: string;
  lines: Line[];
  totals: Totals;
  empty?: boolean;
  error?: string;
}

const money = (n: number) => fmtMoney(n, { decimals: 2 });

function InvoiceInner() {
  const params = useParams<{ auctionId: string }>();
  const searchParams = useSearchParams();
  const auctionId = params.auctionId;
  const user = searchParams.get("user");

  const [data, setData] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!auctionId) return;
    const qs = user ? `?user=${encodeURIComponent(user)}` : "";
    fetch(`/api/invoice/${auctionId}${qs}`)
      .then((r) => r.json())
      .then((d: Invoice) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Could not load receipt."))
      .finally(() => setLoading(false));
  }, [auctionId, user]);

  // User-triggered retry: reset state, then re-run the fetch.
  const retryLoad = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="invoice-root min-h-screen bg-[#f1e7d5] text-[#241a12] py-8 px-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          header { display: none !important; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .invoice-root { background: white !important; padding: 0 !important; }
          .invoice-thumb { display: none !important; }
          /* Always print the wide table layout, never the mobile cards. */
          .invoice-cards { display: none !important; }
          .invoice-table { display: block !important; }
        }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="mx-auto" style={{ maxWidth: "7.5in" }}>
        {/* Print / actions bar */}
        <div className="no-print flex items-center justify-between mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3 5 8l5 5" />
            </svg>
            Back to My Bids
          </Link>
          {data && !error && (
            <button
              onClick={() => window.print()}
              className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Print / Save PDF
            </button>
          )}
        </div>

        <div className="bg-white border border-[#e3d6bf] rounded-2xl shadow-sm print:border-0 print:shadow-none print:rounded-none p-5 sm:p-10 text-black">
          {loading ? (
            <p className="text-[#8a7559] text-sm py-12 text-center">Loading receipt…</p>
          ) : error ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
              </div>
              <p className="text-base font-semibold text-[#241a12]">We couldn&apos;t load this receipt</p>
              <p className="text-sm text-[#8a7559] mt-1.5">{error}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                <button
                  onClick={retryLoad}
                  className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Try again
                </button>
                <Link
                  href="/dashboard"
                  className="text-sm text-[#6c4d39] hover:text-[#563e2c] font-semibold transition-colors"
                >
                  Back to My Bids
                </Link>
              </div>
            </div>
          ) : data?.empty ? (
            <p className="text-[#6f5b46] text-base py-12 text-center">
              No paid items for this auction yet.
            </p>
          ) : data ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[#e3d6bf] pb-5 mb-5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={LOGO_URL} alt={data.business.name} className="w-10 h-10 sm:w-12 sm:h-12 object-contain shrink-0" />
                  <div className="font-display text-base sm:text-xl font-bold leading-tight truncate">{data.business.name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-xl sm:text-2xl font-bold leading-none">Receipt</div>
                  <div className="text-xs sm:text-sm text-[#6f5b46] mt-1">
                    {new Date(data.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 text-sm">
                <div className="min-w-0">
                  <div className="text-[#8a7559] uppercase tracking-wide text-xs font-semibold mb-1">
                    Auction
                  </div>
                  <div className="font-semibold break-words">{data.auction.title}</div>
                </div>
                <div className="min-w-0 sm:text-left">
                  <div className="text-[#8a7559] uppercase tracking-wide text-xs font-semibold mb-1">
                    Buyer
                  </div>
                  <div className="font-semibold break-words">{data.buyer.name || "Bidder"}</div>
                  {data.buyer.email && (
                    <div className="text-[#6f5b46] break-words">{data.buyer.email}</div>
                  )}
                </div>
              </div>

              {/* Line items — stacked cards on mobile, table on larger screens/print */}
              <div className="invoice-cards sm:hidden space-y-3">
                {data.lines.map((l, i) => (
                  <div key={i} className="border border-[#e3d6bf] rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      {l.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.photo} alt="" className="invoice-thumb w-12 h-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="invoice-thumb w-12 h-12 rounded-lg bg-[#efe3d0] shrink-0" />
                      )}
                      <div className="min-w-0 text-sm font-medium break-words">
                        {l.itemCode && (
                          <span className="font-mono font-bold text-[#6c4d39] mr-1.5">#{l.itemCode}</span>
                        )}
                        {l.title}
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#efe3d0] grid grid-cols-2 gap-y-1.5 text-sm">
                      <span className="text-[#6f5b46]">Bid</span>
                      <span className="text-right">{money(l.bid)}</span>
                      <span className="text-[#6f5b46]">Premium ({data.feePercent ?? 15}%)</span>
                      <span className="text-right">{money(l.premium)}</span>
                      <span className="text-[#6f5b46]">Tax</span>
                      <span className="text-right">{money(l.tax)}</span>
                      <span className="font-semibold text-[#241a12] pt-1.5 border-t border-[#efe3d0]">Line total</span>
                      <span className="text-right font-semibold pt-1.5 border-t border-[#efe3d0]">{money(l.total)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="invoice-table hidden sm:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#e3d6bf] text-[#8a7559]">
                      <th className="text-left py-2 font-semibold">Item</th>
                      <th className="text-right py-2 font-semibold whitespace-nowrap">Bid</th>
                      <th className="text-right py-2 font-semibold whitespace-nowrap">Premium ({data.feePercent ?? 15}%)</th>
                      <th className="text-right py-2 font-semibold whitespace-nowrap">Tax</th>
                      <th className="text-right py-2 font-semibold whitespace-nowrap">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i} className="border-b border-[#e3d6bf]">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            {l.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={l.photo}
                                alt=""
                                className="invoice-thumb w-9 h-9 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="invoice-thumb w-9 h-9 rounded bg-[#efe3d0] shrink-0" />
                            )}
                            <span className="font-medium">
                              {l.itemCode && (
                                <span className="font-mono font-bold text-[#6c4d39] mr-1.5">#{l.itemCode}</span>
                              )}
                              {l.title}
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-2.5 whitespace-nowrap">{money(l.bid)}</td>
                        <td className="text-right py-2.5 whitespace-nowrap">{money(l.premium)}</td>
                        <td className="text-right py-2.5 whitespace-nowrap">{money(l.tax)}</td>
                        <td className="text-right py-2.5 whitespace-nowrap font-semibold">
                          {money(l.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end mt-6">
                <div className="w-full sm:w-72 text-sm">
                  <div className="flex justify-between py-1.5">
                    <span className="text-[#6f5b46]">Subtotal (winning bids)</span>
                    <span>{money(data.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-[#6f5b46]">Buyer&apos;s premium ({data.feePercent ?? 15}%)</span>
                    <span>{money(data.totals.premium)}</span>
                  </div>
                  <div className={`flex justify-between py-1.5 ${data.totals.credit ? "" : "border-b border-[#e3d6bf]"}`}>
                    <span className="text-[#6f5b46]">Sales tax ({data.taxPercent ?? 6}%)</span>
                    <span>{money(data.totals.tax)}</span>
                  </div>
                  {!!data.totals.credit && data.totals.credit > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-[#e3d6bf] text-green-700">
                      <span>Bid Bucks credit</span>
                      <span>−{money(data.totals.credit)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 font-bold text-base">
                    <span>Grand total</span>
                    <span>{money(data.totals.grandTotal)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#8a7559] mt-8 pt-4 border-t border-[#e3d6bf]">
                Thank you for your purchase. This receipt reflects items paid in full for this auction.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f1e7d5] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#6c4d39]/30 border-t-[#6c4d39] animate-spin" />
        </div>
      }
    >
      <InvoiceInner />
    </Suspense>
  );
}
