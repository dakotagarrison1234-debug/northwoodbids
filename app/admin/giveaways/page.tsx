"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Requirement = "NONE" | "INFO" | "ANSWER";
type GiveawayRow = {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "DRAWN";
  requirement: Requirement;
  prizeCount: number;
  winnersDrawn: number;
  endsAt: string | null;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#efe6d4] text-[#8a7559]",
  ACTIVE: "bg-[#dff0e4] text-[#2f7a48]",
  DRAWN: "bg-[#e6dcff] text-[#5b46a8]",
};

export default function GiveawaysPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GiveawayRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState<Requirement>("NONE");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    fetch("/api/admin/giveaways")
      .then((r) => r.json())
      .then((d) => setRows(d.giveaways ?? []))
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  const create = async () => {
    setErr("");
    if (!title.trim()) { setErr("Give it a title."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/giveaways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, requirement, requirementPrompt: prompt, requirementAnswer: answer }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Couldn't create."); setBusy(false); return; }
      router.push(`/admin/giveaways/${d.id}`);
    } catch { setErr("Something went wrong."); setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#241a12]">Giveaways</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-4 py-2.5 rounded-xl text-sm"
          >
            + New giveaway
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-6 rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] p-5">
          <h2 className="font-bold text-lg text-[#241a12] mb-3">New giveaway</h2>
          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fall Kickoff Giveaway"
            className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 mb-4 text-[#241a12]"
          />

          <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Who gets in the wheel?</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            {([
              ["NONE", "Everyone", "All bidders auto-entered"],
              ["INFO", "Collect info", "Must answer to enter (any answer)"],
              ["ANSWER", "Correct answer", "Must answer correctly to enter"],
            ] as const).map(([val, label, sub]) => (
              <button
                key={val}
                onClick={() => setRequirement(val)}
                className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${
                  requirement === val ? "border-[#6c4d39] bg-white" : "border-[#e3d6bf] bg-white/60"
                }`}
              >
                <div className="font-bold text-sm text-[#241a12]">{label}</div>
                <div className="text-[11px] text-[#8a7559] leading-tight mt-0.5">{sub}</div>
              </button>
            ))}
          </div>

          {requirement !== "NONE" && (
            <div className="mb-3">
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Question entrants see</label>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={requirement === "INFO" ? "What state do you live in?" : "What year did we open?"}
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12]"
              />
            </div>
          )}
          {requirement === "ANSWER" && (
            <div className="mb-3">
              <label className="block text-sm font-semibold text-[#6f5b46] mb-1">Correct answer</label>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Accepted answer (not case-sensitive)"
                className="w-full bg-white border border-[#cdbda3] rounded-xl px-4 py-3 text-[#241a12]"
              />
            </div>
          )}

          {err && <div className="text-sm text-red-600 font-semibold mb-3">{err}</div>}
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy}
              className="bg-[#6c4d39] hover:bg-[#563e2c] text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create & add prizes"}
            </button>
            <button
              onClick={() => { setCreating(false); setErr(""); }}
              className="text-[#6f5b46] font-semibold px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <div className="text-[#8a7559] py-10 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[#8a7559] py-10 text-center">No giveaways yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((g) => (
            <Link
              key={g.id}
              href={`/admin/giveaways/${g.id}`}
              className="flex items-center justify-between rounded-2xl border border-[#e3d6bf] bg-[#fbf4e6] px-4 py-3.5 hover:bg-[#f6ecda] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-[#241a12] truncate">{g.title}</div>
                <div className="text-xs text-[#8a7559] mt-0.5">
                  {g.prizeCount} prize{g.prizeCount !== 1 ? "s" : ""} · {g.winnersDrawn} drawn
                </div>
              </div>
              <span className={`shrink-0 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLE[g.status]}`}>
                {g.status === "DRAWN" ? "Complete" : g.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
