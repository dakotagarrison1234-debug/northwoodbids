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

  // Promote an existing bidder straight to staff — no invite link needed when
  // they already have an account. Search the bidder list, tap Make staff.
  const [pickQ, setPickQ] = useState("");
  const [picks, setPicks] = useState<{ clerkUserId: string; name: string | null; phone: string | null; email: string | null; role: string | null }[]>([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    const q = pickQ.trim();
    const t = setTimeout(() => {
      if (q.length < 2) { setPicks([]); return; }
      setPicking(true);
      fetch(`/api/admin/bidders?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setPicks((d.bidders ?? []).slice(0, 6)))
        .catch(() => setPicks([]))
        .finally(() => setPicking(false));
    }, 200);
    return () => clearTimeout(t);
  }, [pickQ]);

  const setMemberRole = async (clerkUserId: string, nextRole: "STAFF" | "ADMIN" | null) => {
    setError("");
    const res = await fetch(`/api/admin/bidders/${clerkUserId}/role`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: nextRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) { setError(data.error || "Couldn't change that role."); return; }
    setPickQ(""); setPicks([]);
    load();
  };

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
        <PageHeader title="Settings" />
        <PageBody>
          <p className="text-[#8a7559] py-8 text-center">Loading…</p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        actions={canInvite ? <BtnLink href="#invite" size="sm">Invite someone</BtnLink> : undefined}
      />

      <PageBody>
        {/* Errors surface at the top, not buried inside the invite form where a
            failed "Remove" would render off-screen (or not at all for non-admins). */}
        {error && <Notice tone="red">{error}</Notice>}

        <Panel title="Team">
          {members.length === 0 ? (
            <Empty text="No members yet." />
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
                          {isSelf && <span className="ml-1.5 text-[15px] font-normal text-[#a3927b]">(you)</span>}
                        </>
                      }
                      sub={showEmail ? member.email : !member.displayName ? "Hasn't signed in yet." : undefined}
                      trailing={
                        <div className="flex flex-col items-end gap-1">
                          <Pill tone={roleTone(member.role)}>{roleLabel(member.role)}</Pill>
                          {!isOwner && !isSelf && (
                            <div className="flex gap-1 -mr-2">
                              {myRole === "OWNER" && (
                                <Btn tone="slate" variant="ghost" size="sm" onClick={() => setMemberRole(member.clerkUserId, member.role === "ADMIN" ? "STAFF" : "ADMIN")}>
                                  {member.role === "ADMIN" ? "Make staff" : "Make admin"}
                                </Btn>
                              )}
                              {canRemoveMember && (
                                <Btn tone="red" variant="ghost" size="sm" onClick={() => removeMember(member.id, member.displayName || "this team member")}>
                                  Remove
                                </Btn>
                              )}
                            </div>
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

        {invites.length > 0 && (
          <Panel title="Pending invites">
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

        {/* Already a bidder? Promote them without an invite link. */}
        {canInvite && (
          <Panel title="Add a bidder to the team">
            <div className="p-4 sm:p-5 space-y-3">
              <Input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Search a bidder by name or phone" />
              {picking && <p className="text-[15px] text-[#8a7559]">Searching…</p>}
              {picks.length > 0 && (
                <ul className="divide-y divide-[#f0e6d6] rounded-xl border border-[#e6dac6] overflow-hidden">
                  {picks.map((b) => (
                    <li key={b.clerkUserId}>
                      <Row
                        leading={<Initials name={b.name || b.email} />}
                        title={b.name || b.email || "Unnamed bidder"}
                        sub={[b.phone, b.email].filter(Boolean).join(" · ")}
                        trailing={
                          b.role ? (
                            <Pill tone={roleTone(b.role)}>{roleLabel(b.role)}</Pill>
                          ) : (
                            <Btn size="sm" onClick={() => setMemberRole(b.clerkUserId, "STAFF")}>Make staff</Btn>
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        )}

        {/* Invite form — OWNER/ADMIN only */}
        {canInvite && (
          <div id="invite" className="scroll-mt-4">
            <Panel title="Invite someone">
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
                    className="w-full min-h-[50px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] outline-none transition"
                  >
                    <option value="STAFF">Staff — lots, auctions and pickup</option>
                    <option value="ADMIN">Admin — everything, including the team</option>
                  </select>
                </div>

                <Btn full onClick={handleInvite} disabled={sending}>
                  {sending ? "Creating…" : "Create invite link"}
                </Btn>

                {inviteUrl && (
                  <div className="bg-[#f1e7d5] border border-[#d9c7ab] rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <Input readOnly value={inviteUrl} className="font-mono text-[15px]" />
                      <Btn tone="slate" variant="outline" onClick={() => navigator.clipboard.writeText(inviteUrl)}>
                        Copy
                      </Btn>
                    </div>
                    <p className="text-[#8a7559] text-[15px] mt-2">One-time link · expires in 7 days.</p>
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
            <p className="text-[#241a12]">{confirmDialog.text}</p>
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
