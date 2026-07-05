"use client";
import { useState, useEffect } from "react";
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

  const revokeInvite = async (inviteId: string, email: string) => {
    if (!confirm(`Revoke invite for ${email}?`)) return;
    const res = await fetch(`/api/orgs/invite/${inviteId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      load();
    } else {
      alert("Error: " + (data.error || "Failed to revoke invite"));
    }
  };

  const removeMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from the team? They will lose access immediately.`)) return;
    const res = await fetch(`/api/orgs/members/${memberId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      load();
    } else {
      alert("Error: " + (data.error || "Failed to remove member"));
    }
  };

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
      <header className="border-b border-[#e3d6bf] px-6 sm:px-8 py-5">
        <h1 className="text-2xl sm:text-3xl font-semibold">Team Members</h1>
      </header>

      <div className="px-6 sm:px-8 py-6 max-w-2xl space-y-8">
        {/* Current Members */}
        <section>
          <h2 className="text-sm font-semibold text-[#8a7559] uppercase tracking-wider mb-4">
            Current Members ({members.length})
          </h2>
          <div className="bg-white border border-[#e3d6bf] rounded-xl divide-y divide-[#e3d6bf]">
            {members.map((member) => {
              const isSelf = member.clerkUserId === user?.id;
              const isOwner = member.role === "OWNER";
              const canRemoveMember = canRemove && !isSelf && !isOwner;
              return (
                <div key={member.id} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium text-[#241a12] flex items-center gap-2">
                      <span className="truncate">
                        {member.displayName || "New team member"}
                      </span>
                      {isSelf && <span className="text-sm text-[#8a7559]">(you)</span>}
                    </div>
                    {member.email && member.email !== member.displayName && (
                      <div className="text-sm text-[#8a7559] mt-0.5 truncate">{member.email}</div>
                    )}
                    {!member.displayName && (
                      <div className="text-sm text-[#8a7559] mt-0.5">Hasn&apos;t signed in yet — name will appear here once they do.</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-semibold ${roleColor(member.role)}`}>
                      {roleLabel(member.role)}
                    </span>
                    {canRemoveMember && (
                      <button
                        onClick={() => removeMember(member.id, member.displayName || "this team member")}
                        className="text-base font-semibold text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl border border-red-300 hover:border-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
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
            <div className="bg-white border border-[#e3d6bf] rounded-xl divide-y divide-[#e3d6bf]">
              {invites.map((invite) => (
                <div key={invite.id} className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base">{invite.email}</div>
                    <div className="text-sm text-[#8a7559] mt-0.5">
                      Expires <span suppressHydrationWarning>{new Date(invite.expiresAt).toLocaleDateString()}</span>
                      {" · "}{roleLabel(invite.role)}
                    </div>
                  </div>
                  {canInvite && (
                    <button
                      onClick={() => revokeInvite(invite.id, invite.email)}
                      className="text-base font-semibold text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl border border-red-300 hover:border-red-400 transition-colors shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Invite Form — OWNER/ADMIN only */}
        {canInvite && (
          <section>
            <h2 className="text-sm font-semibold text-[#8a7559] uppercase tracking-wider mb-4">
              Invite Someone
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
    </>
  );
}
