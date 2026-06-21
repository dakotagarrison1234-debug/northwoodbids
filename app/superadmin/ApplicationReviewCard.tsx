"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Application {
  id: string;
  orgName: string;
  slug: string;
  description: string | null;
  website: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  clerkUserId: string;
  createdAt: Date;
}

export default function ApplicationReviewCard({ application }: { application: Application }) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [taxExempt, setTaxExempt] = useState(true);
  const [taxPercent, setTaxPercent] = useState("0");

  const handleAction = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      const body: Record<string, unknown> = { action, reviewNote };
      if (action === "approve") {
        body.taxExempt = taxExempt;
        if (!taxExempt) body.taxPercent = parseFloat(taxPercent);
      }
      const res = await fetch(`/api/superadmin/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert(data.error || "Something went wrong");
      }
    } catch {
      alert("Request failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white border border-orange-500/25 rounded-2xl p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-base truncate">{application.orgName}</div>
          <div className="text-[#6f5b46] text-sm mt-0.5">{application.contactName}</div>
          <div className="text-[#8a7559] text-sm truncate">{application.contactEmail}</div>
          {application.contactPhone && (
            <div className="text-[#8a7559] text-xs mt-0.5">{application.contactPhone}</div>
          )}
          <div className="text-[#b3a085] text-xs mt-1">
            Submitted {new Date(application.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#8a7559] hover:text-[#241a12] border border-[#cdbda3] hover:border-[#b3a085] px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          {expanded ? "Less" : "Details"}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mb-4 p-3 bg-[#efe3d0]/60 rounded-xl space-y-2 text-sm">
          {application.description && (
            <div>
              <span className="text-[#8a7559] text-xs font-medium uppercase tracking-wide">Description</span>
              <p className="text-[#4a3a2b] mt-0.5 text-sm leading-relaxed">{application.description}</p>
            </div>
          )}
          {application.website && (
            <div>
              <span className="text-[#8a7559] text-xs font-medium uppercase tracking-wide">Website</span>
              <div className="mt-0.5">
                <a href={application.website} target="_blank" rel="noopener noreferrer" className="text-[#a4592a] hover:underline text-sm break-all">
                  {application.website}
                </a>
              </div>
            </div>
          )}
          <div>
            <span className="text-[#8a7559] text-xs font-medium uppercase tracking-wide">Proposed slug</span>
            <p className="text-[#4a3a2b] font-mono text-sm mt-0.5">/{application.slug}</p>
          </div>
        </div>
      )}

      {/* Review note + actions */}
      <div className="border-t border-[#e3d6bf]/60 pt-3 space-y-3">
        <input
          type="text"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Optional note (shown on rejection)"
          className="w-full bg-[#efe3d0] border border-[#cdbda3]/80 rounded-xl px-3 py-2.5 text-sm text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#a4592a]/60 transition-colors"
        />

        {/* Tax status — set at approval by Northwood Bids */}
        <div className="bg-[#efe3d0]/60 border border-[#cdbda3]/60 rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold text-[#6f5b46] uppercase tracking-wide">Tax Status</div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={taxExempt}
              onChange={(e) => { setTaxExempt(e.target.checked); if (e.target.checked) setTaxPercent("0"); }}
              className="w-4 h-4 accent-[#a4592a]"
            />
            <span className="text-sm text-[#2c2317]">Tax exempt (most nonprofits)</span>
          </label>
          {!taxExempt && (
            <div className="flex items-center gap-2 pt-1">
              <div className="relative w-28">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="w-full bg-[#efe3d0] border border-[#b9a98c] rounded-lg px-3 py-1.5 text-sm text-[#241a12] focus:outline-none focus:border-[#a4592a]/60 pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8a7559] text-xs">%</span>
              </div>
              <span className="text-xs text-[#8a7559]">Michigan is 6%</span>
            </div>
          )}
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={() => handleAction("approve")}
            disabled={loading !== null}
            className="flex-1 bg-[#a4592a] hover:bg-[#843f1c] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            {loading === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading !== null}
            className="flex-1 bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-600 border border-red-500/25 font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            {loading === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
