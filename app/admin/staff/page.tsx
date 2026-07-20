"use client";
import { useState, useEffect } from "react";
import { Pill } from "../ui";
import { useUser } from "@clerk/nextjs";

interface Member {
  id: string;
  clerkUserId: string;
  role: string;
  displayName?: string | null;
  email?: string | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
}

export default function StaffPage() {
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"STAFF" | "ADMIN">("STAFF");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<
    { text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null
  >(null);

  const load = () => {
    Promise.all([
      fetch("/api/orgs/invite").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()),
    ]).then(([inviteData, meData]) => {
      setMembers(inviteData.members || []);
      setInvites(inviteData.invites || []);
      setMyRole(meData.role || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const canInvite = myRole === "OWNER" || myRole === "ADMIN";
  const canRemove = myRole === "OWNER";

  // In-app confirm — native confirm() is silently blocked in the installed/PWA
  // webview, so these buttons did nothing at all there.
  const doRevokeInvite = async (inviteId: string) => {
    const res = await fetch(`/api/orgs/invite/${inviteId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) load();
    else setError(data.error || "Failed to revoke invite.");
  };
  const revokeInvite = (inviteId: string, email: string) =>
    setConfirmDialog({
      text: `Revoke the invite for ${email}? Their link will stop working.`,
      confirmLabel: "Revoke invite",
      danger: true,
      onConfirm: () => doRevokeInvite(inviteId),
    });

  const doRemoveMember = async (memberId: string) => {
    const res = await fetch(`/api/orgs/members/${memberId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) load();
    else setError(data.error || "Failed to remove member.");
  };
  const removeMember = (memberId: string, name: string) =>
    setConfirmDialog({
      text: `Remove ${name} from the team? They lose access immediately.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => doRemoveMember(memberId),
    });

  const handleInvite = async () => {
    if (!email.trim()) { setError("Email is required."); return; }
    setSending(true);
    setError("");
    setInviteUrl("");
    try {
      const res = await fetch("/api/orgs/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteUrl(data.inviteUrl);
        setEmail("");
        load();
      } else {
        setError(data.error || "Failed to create invite.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const roleLabel = (role: string) => {
    if (role === "OWNER") return "Owner";
    if (role === "ADMIN") return "Admin";
    return "Staff";
  };

  const roleColor = (role: string) => {
    if (role === "OWNER") return "text-[#c47b3e]";
    if (role === "ADMIN") return "text-[#6c4d39]";
    return "text-[#6f5b46]";
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-[#8a7559]">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Team</h1>
        {canInvite && (
          /* The reason people open this page is to add someone — it was previously
             the LAST thing on the page, below every member and every invite. */
          <a
            href="#invite"
            className="shrink-0 inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-slate-900 text-white font-bold text-base"
          >
            + Invite
          </a>
        )}
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-2xl space-y-6">
        {/* Errors surface HERE, at the top, not buried inside the invite form where
            a failed "Remove" would render off-screen (or not at all for non-admins). */}
        {error && (
          <p className="text-base text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Current Members */}
        <section>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
            Members ({members.length})
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {members.map((member) => {
              const isSelf = member.clerkUserId === user?.id;
              const isOwner = member.role === "OWNER";
              const canRemoveMember = canRemove && !isSelf && !isOwner;
              return (
                <div key={member.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                        <span className="break-words">{member.displayName || "New team member"}</span>
                        {isSelf && <span className="text-sm font-normal text-slate-400">(you)</span>}
                      </div>
                      {member.email && member.email !== member.displayName && (
                        <div className="text-sm text-slate-500 mt-0.5 break-all">{member.email}</div>
                      )}
                      {!member.displayName && (
                        <div className="text-sm text-slate-400 mt-0.5">Hasn&apos;t signed in yet.</div>
                      )}
                    </div>
                    {/* Role as a coloured pill — three muted browns at 14px were
                        effectively unreadable, and role is the whole point of the row. */}
                    <Pill tone={member.role === "OWNER" ? "blue" : member.role === "ADMIN" ? "green" : "slate"}>
                      {roleLabel(member.role)}
                    </Pill>
                  </div>
                  {canRemoveMember && (
                    <button
                      onClick={() => removeMember(member.id, member.displayName || "this team member")}
                      className="mt-2.5 w-full min-h-[44px] text-base font-bold text-red-600 bg-white rounded-xl border-2 border-red-200 active:bg-red-50 transition-colors"
                    >
                      Remove from team
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[#8a7559] uppercase tracking-wider mb-4">
              Pending Invites ({invites.length})
            </h2>
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
              {invites.map((invite) => (
                <div key={invite.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* break-all — a long invite email used to spill over the button. */}
                      <div className="text-base font-semibold text-slate-900 break-all">{invite.email}</div>
                      <div className="text-sm text-slate-500 mt-0.5">
                        Expires <span suppressHydrationWarning>{new Date(invite.expiresAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Pill tone="amber">{roleLabel(invite.role)}</Pill>
                  </div>
                  {canInvite && (
                    <button
                      onClick={() => revokeInvite(invite.id, invite.email)}
                      className="mt-2.5 w-full min-h-[44px] text-base font-bold text-red-600 bg-white rounded-xl border-2 border-red-200 active:bg-red-50 transition-colors"
                    >
                      Revoke invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Invite Form — OWNER/ADMIN only */}
        {canInvite && (
          <section id="invite" className="scroll-mt-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              Invite someone
            </h2>
            <div className="bg-white border border-[#e3d6bf] rounded-xl p-6 sm:p-7 space-y-4">
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@email.com"
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#6c4d39]"
                />
              </div>
              <div>
                <label className="text-base text-[#6f5b46] mb-1.5 block">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "STAFF" | "ADMIN")}
                  className="w-full bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-3.5 text-base text-[#241a12] focus:outline-none focus:border-[#6c4d39]"
                >
                  <option value="STAFF">Staff — can manage items and auctions</option>
                  <option value="ADMIN">Admin — can manage everything including team</option>
                </select>
              </div>

              {error && <p className="text-red-600 text-base">{error}</p>}

              <button
                onClick={handleInvite}
                disabled={sending}
                className="w-full bg-[#6c4d39] hover:bg-[#563e2c] disabled:opacity-50 text-white text-base font-semibold py-3.5 rounded-xl transition-colors"
              >
                {sending ? "Generating Invite..." : "Generate Invite Link"}
              </button>

              {inviteUrl && (
                <div className="bg-[#6c4d39]/10 border border-[#6c4d39]/30 rounded-xl p-4">
                  <p className="text-[#6c4d39] text-base font-semibold mb-2">Invite link created! Share this:</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 bg-[#efe3d0] border border-[#cdbda3] rounded-lg px-3 py-2.5 text-sm text-[#4a3a2b] font-mono"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(inviteUrl)}
                      className="bg-[#e7dcc6] hover:bg-[#cdbda3] text-[#241a12] text-base font-semibold px-5 py-2.5 rounded-xl transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[#8a7559] text-sm mt-2">Expires in 7 days. One-time use.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#cdbda3] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-white border border-[#cdbda3] text-[#6f5b46] hover:bg-[#efe3d0] font-semibold text-base py-3 rounded-xl">
                Back
              </button>
              <button
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
                className={`flex-1 text-white font-semibold text-base py-3 rounded-xl ${
                  confirmDialog.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#6c4d39] hover:bg-[#563e2c]"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
