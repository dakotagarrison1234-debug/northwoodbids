"use client";
import { useState, useEffect } from "react";

interface Org {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export default function AdminSettingsPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        if (d.org) {
          setOrg(d.org);
          setName(d.org.name);
          setDescription(d.org.description || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveDetails = async () => {
    if (!org || !name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, name, description }),
      });
      const d = await res.json();
      if (d.success) {
        setOrg(o => o ? { ...o, name: d.org.name, description: d.org.description } : o);
        setMsg({ text: "Settings saved.", ok: true });
      } else {
        setMsg({ text: d.error || "Failed to save.", ok: false });
      }
    } catch {
      setMsg({ text: "Something went wrong.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !org) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#8c8778]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      {/* Details section */}
      <div className="bg-white border border-[#e5e0d5] rounded-2xl p-6 mb-5">
        <h2 className="text-sm font-semibold text-[#6b6659] uppercase tracking-wider mb-4">Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#6b6659] mb-1.5 block">Business Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad]"
            />
          </div>
          <div>
            <label className="text-sm text-[#6b6659] mb-1.5 block">Description <span className="text-[#8c8778]">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Tell bidders about your business…"
              className="w-full bg-[#f2efe8] border border-[#d4cfc4] rounded-xl px-4 py-3 text-[#1a1916] placeholder-[#b0a99a] focus:outline-none focus:border-[#09a7ad] resize-none"
            />
          </div>
        </div>
      </div>

      {msg && (
        <p className={`text-sm px-4 py-3 rounded-xl mb-4 ${msg.ok ? "bg-[#09a7ad]/10 text-[#09a7ad] border border-[#09a7ad]/20" : "bg-red-50 text-red-600 border border-red-500/20"}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={saveDetails}
        disabled={saving || !name.trim()}
        className="bg-[#09a7ad] hover:bg-[#0898a0] disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl w-full sm:w-auto"
      >
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
