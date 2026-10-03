"use client";
import { useState, useEffect } from "react";
import { Pill, PageHeader, PageBody, Panel, Row, Initials, Btn, BtnLink, Input, Notice, Empty, Eyebrow, type Tone } from "../ui";
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

  const roleTone = (role: string): Tone => (role === "OWNER" ? "blue" : role === "ADMIN" ? "green" : "slate");

  if (loading) {
    return (
      <>
        <PageHeader title="Team" sub="Who can get into the Workshop." />
        <PageBody>
          <p className="text-[#8a7559] py-8 text-center">Loading…</p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        sub="Who can get into the Workshop."
        actions={
          canInvite ? (
            /* The reason people open this page is to add someone — it was previously
               the LAST thing on the page, below every member and every invite. */
            <BtnLink href="#invite" size="sm">Invite someone</BtnLink>
          ) : undefined
        }
      />

      <PageBody>
        {/* Errors surface HERE, at the top, not buried inside the invite form where
            a failed "Remove" would render off-screen (or not at all for non-admins). */}
        {error && <Notice tone="red">{error}</Notice>}

        {/* Current Members */}
        <Panel title="Members" sub={`${members.length} on the team`}>
          {members.length === 0 ? (
            <Empty text="No members yet." sub="Invite someone to get started." />
          ) : (
            <ul className="divide-y divide-[#f0e6d6]">
              {members.map((member) => {
                const isSelf = member.clerkUserId === user?.id;
                const isOwner = member.role === "OWNER";
                const canRemoveMember = canRemove && !isSelf && !isOwner;
                const showEmail = member.email && member.email !== member.displayName;
                return (
                  <li key={member.id}>
                    <Row
                      leading={<Initials name={member.displayName || member.email} />}
                      title={
                        <>
                          {member.displayName || "New team member"}
                          {isSelf && <span className="ml-1.5 text-sm font-normal text-[#a3927b]">(you)</span>}
                        </>
                      }
                      sub={showEmail ? member.email : !member.displayName ? "Hasn't signed in yet." : undefined}
                      trailing={
                        <div className="flex flex-col items-end gap-1">
                          {/* Role as a coloured pill — three muted browns at 14px were
                              effectively unreadable, and role is the whole point of the row. */}
                          <Pill tone={roleTone(member.role)}>{roleLabel(member.role)}</Pill>
                          {canRemoveMember && (
                            <Btn
                              tone="red"
                              variant="ghost"
                              size="sm"
                              className="-mr-2"
                              onClick={() => removeMember(member.id, member.displayName || "this team member")}
                            >
                              Remove
                            </Btn>
                          )}
                        </div>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <Panel title="Pending invites" sub={`${invites.length} waiting`}>
            <ul className="divide-y divide-[#f0e6d6]">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <Row
                    leading={<Initials name={invite.email} />}
                    title={invite.email}
                    sub={<>Expires <span suppressHydrationWarning>{new Date(invite.expiresAt).toLocaleDateString()}</span></>}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <Pill tone="amber">{roleLabel(invite.role)}</Pill>
                        {canInvite && (
                          <Btn tone="red" variant="ghost" size="sm" className="-mr-2" onClick={() => revokeInvite(invite.id, invite.email)}>
                            Revoke
                          </Btn>
                        )}
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Invite Form — OWNER/ADMIN only */}
        {canInvite && (
          <div id="invite" className="scroll-mt-4">
            <Panel title="Invite someone" sub="They get a one-time link that expires in 7 days.">
              <div className="p-4 sm:p-5 space-y-4">
                <div>
                  <Eyebrow className="mb-1.5">Email address</Eyebrow>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@email.com"
                  />
                </div>
                <div>
                  <Eyebrow className="mb-1.5">Role</Eyebrow>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "STAFF" | "ADMIN")}
                    className="w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] outline-none transition"
                  >
                    <option value="STAFF">Staff — can manage items and auctions</option>
                    <option value="ADMIN">Admin — can manage everything including team</option>
                  </select>
                </div>

                {error && <p className="text-sm font-semibold text-[#a1321f]">{error}</p>}

                <Btn full onClick={handleInvite} disabled={sending}>
                  {sending ? "Generating Invite..." : "Generate Invite Link"}
                </Btn>

                {inviteUrl && (
                  <div className="bg-[#f1e7d5] border border-[#d9c7ab] rounded-xl p-4">
                    <p className="text-[#563e2c] text-base font-bold mb-2">Invite link created. Share this:</p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={inviteUrl} className="font-mono text-sm" />
                      <Btn tone="slate" variant="outline" onClick={() => navigator.clipboard.writeText(inviteUrl)}>
                        Copy
                      </Btn>
                    </div>
                    <p className="text-[#8a7559] text-sm mt-2">Expires in 7 days. One-time use.</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        )}
      </PageBody>

      {/* In-app confirmation (native confirm() is blocked in some installed/PWA webviews) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white rounded-2xl border border-[#e6dac6] max-w-sm w-full p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-[#241a12]">{confirmDialog.text}</p>
            <div className="mt-5 flex gap-3">
              <Btn tone="slate" variant="outline" full onClick={() => setConfirmDialog(null)}>
                Back
              </Btn>
              <Btn
                tone={confirmDialog.danger ? "red" : "leather"}
                full
                onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}
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
