"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody, Panel, Pill, Btn, Input, Eyebrow, Empty, Notice } from "../../ui";
import { IcoLock, IcoBolt, IcoCheck } from "@/app/components/BidIcons";

type Lock = {
  id: string;
  name: string;
  active: boolean;
  seamDeviceId: string;
  locationId: string | null;
  locationName: string | null;
  online: boolean | null;
  locked: boolean | null;
  battery: number | null;
  model: string | null;
  codeLength: number | null;
  canProgram: boolean | null;
  issues: string[];
  seen: boolean;
};

type Data = {
  configured: boolean;
  seamError: string | null;
  codesOut: number;
  locations: { id: string; name: string }[];
  locks: Lock[];
};

/**
 * Settings → Doors. Link the Schlage account once, pull the locks in, put each
 * one on a pickup location. From then on every pickup booked at that location
 * gets a one-day door code automatically.
 */
export default function DoorsSettingsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/doors").then((r) => r.json()).then(setData).catch(() => setData({ configured: false, seamError: "Couldn't load.", codesOut: 0, locations: [], locks: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy("connect"); setMsg(null);
    try {
      const r = await fetch("/api/admin/doors/connect", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setMsg({ tone: "red", text: d.error || "Couldn't start the Schlage link." }); }
      else window.location.href = d.url;
    } catch { setMsg({ tone: "red", text: "Something went wrong." }); }
    setBusy(null);
  };

  const sync = async () => {
    setBusy("sync"); setMsg(null);
    try {
      const r = await fetch("/api/admin/doors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      const d = await r.json();
      if (!r.ok) setMsg({ tone: "red", text: d.error || "Couldn't reach Seam." });
      else setMsg({ tone: d.total ? "green" : "amber", text: d.total ? `${d.total} lock${d.total !== 1 ? "s" : ""} found, ${d.added} new.` : "No locks yet. Finish the Schlage link, then try again." });
      load();
    } catch { setMsg({ tone: "red", text: "Something went wrong." }); }
    setBusy(null);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/doors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) setMsg({ tone: "red", text: (await r.json()).error || "Couldn't save." });
    } catch { setMsg({ tone: "red", text: "Something went wrong." }); }
    setBusy(null);
    load();
  };

  const act = async (id: string, action: "unlock" | "lock") => {
    setBusy(`${id}:${action}`); setMsg(null);
    try {
      const r = await fetch(`/api/admin/doors/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json();
      setMsg(r.ok ? { tone: "green", text: action === "unlock" ? "Unlock sent. Give it a few seconds; auto-lock will close it again." : "Lock sent." } : { tone: "red", text: d.error || "The lock didn't respond." });
    } catch { setMsg({ tone: "red", text: "Something went wrong." }); }
    setBusy(null);
    setTimeout(load, 2500);
  };

  const unassigned = data?.locks.filter((l) => !l.locationId) ?? [];

  return (
    <>
      <PageHeader
        title="Settings"
        sub="Doors: customers let themselves in with a one-day code."
        actions={data?.configured ? <Btn size="sm" variant="outline" onClick={sync} disabled={busy === "sync"}>{busy === "sync" ? "Looking…" : "Find my locks"}</Btn> : undefined}
      />
      <PageBody>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {data === null ? (
          <div className="text-[#8a7559] py-10 text-center">Loading…</div>
        ) : !data.configured ? (
          <Panel title="Doors aren't turned on yet" tone="amber">
            <div className="p-4 sm:p-5 text-sm text-[#4a3a2b] space-y-2">
              <p>Add <span className="font-mono font-bold">SEAM_API_KEY</span> to the site&apos;s environment and redeploy. The full checklist is in <span className="font-mono">docs/door-locks.md</span>.</p>
            </div>
          </Panel>
        ) : (
          <>
            {data.seamError && <Notice tone="red">Seam: {data.seamError}</Notice>}

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border border-[#e6dac6] p-4"><Eyebrow>Locks</Eyebrow><div className="font-display text-3xl font-black text-[#241a12] tabular-nums">{data.locks.length}</div></div>
              <div className="rounded-2xl bg-white border border-[#e6dac6] p-4"><Eyebrow>Online</Eyebrow><div className="font-display text-3xl font-black text-[#4a7c59] tabular-nums">{data.locks.filter((l) => l.online).length}</div></div>
              <div className="rounded-2xl bg-white border border-[#e6dac6] p-4"><Eyebrow>Codes out</Eyebrow><div className="font-display text-3xl font-black text-[#241a12] tabular-nums">{data.codesOut}</div></div>
            </div>

            {data.locks.length === 0 && (
              <Panel>
                <Empty
                  icon={<IcoLock className="w-8 h-8" />}
                  text="No locks linked yet."
                  sub="Step 1: link the Schlage Home account the locks live in. Step 2: tap Find my locks."
                  action={<Btn onClick={connect} disabled={busy === "connect"}>{busy === "connect" ? "Opening…" : "Link Schlage account"}</Btn>}
                />
              </Panel>
            )}

            {unassigned.length > 0 && (
              <Notice tone="amber">{unassigned.length} lock{unassigned.length !== 1 ? "s" : ""} not on a location yet — pick one below or no codes will be made for it.</Notice>
            )}

            <div className="space-y-3">
              {data.locks.map((l) => {
                const health: { tone: "green" | "red" | "amber" | "slate"; label: string } =
                  !l.seen ? { tone: "slate", label: "Not in Seam" }
                  : l.online === false ? { tone: "red", label: "Offline" }
                  : l.issues.length ? { tone: "amber", label: "Needs attention" }
                  : { tone: "green", label: "Online" };
                return (
                  <Panel key={l.id} className={!l.active ? "opacity-70" : ""}>
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {renaming?.id === l.id ? (
                            <div className="flex gap-2 max-w-sm">
                              <Input value={renaming.name} onChange={(e) => setRenaming({ id: l.id, name: e.target.value })} autoFocus />
                              <Btn size="sm" onClick={() => { patch(l.id, { name: renaming.name }); setRenaming(null); }}>Save</Btn>
                              <Btn size="sm" variant="ghost" tone="slate" onClick={() => setRenaming(null)}>Cancel</Btn>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <IcoLock className="w-5 h-5 text-[#6c4d39]" />
                              <button type="button" onClick={() => setRenaming({ id: l.id, name: l.name })} className="font-display font-black text-xl text-[#241a12] underline-offset-4 hover:underline text-left">{l.name}</button>
                              <Pill tone={health.tone} dot={health.tone === "green"}>{health.label}</Pill>
                              {!l.active && <Pill tone="slate">Paused</Pill>}
                              {l.locked != null && <Pill tone={l.locked ? "ink" : "amber"}>{l.locked ? "Locked" : "Unlocked"}</Pill>}
                            </div>
                          )}
                          <div className="text-sm text-[#6f5b46] mt-1">
                            {l.model ?? "Schlage"}{l.battery != null ? ` · battery ${l.battery}%` : ""}{l.codeLength ? ` · ${l.codeLength}-digit codes` : ""}
                            {l.canProgram === false ? " · can't program codes" : ""}
                          </div>
                          {l.issues.length > 0 && <div className="text-xs text-[#a84a2f] mt-1">{l.issues.join(" · ")}</div>}
                          {l.battery != null && l.battery < 25 && <div className="text-xs text-[#a84a2f] mt-1">Battery low — swap the 4 AA batteries.</div>}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Btn size="sm" variant="outline" tone="green" onClick={() => act(l.id, "unlock")} disabled={busy === `${l.id}:unlock` || l.online === false}><IcoBolt className="w-4 h-4" /> Unlock</Btn>
                          <Btn size="sm" variant="outline" tone="slate" onClick={() => act(l.id, "lock")} disabled={busy === `${l.id}:lock` || l.online === false}>Lock</Btn>
                        </div>
                      </div>

                      <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                        <div>
                          <Eyebrow className="mb-1">Which pickup location is this door at?</Eyebrow>
                          <select
                            value={l.locationId ?? ""}
                            onChange={(e) => patch(l.id, { locationId: e.target.value || null })}
                            className="w-full min-h-[46px] bg-white border border-[#d9c7ab] rounded-xl px-3 text-[#241a12] font-semibold"
                          >
                            <option value="">Not assigned</option>
                            {data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                          </select>
                        </div>
                        <Btn size="sm" variant="outline" tone={l.active ? "slate" : "green"} onClick={() => patch(l.id, { active: !l.active })} disabled={busy === l.id}>
                          {l.active ? "Pause codes" : <><IcoCheck className="w-4 h-4" /> Resume codes</>}
                        </Btn>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>

            {data.locks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Btn variant="outline" onClick={connect} disabled={busy === "connect"}>Link another Schlage account</Btn>
              </div>
            )}

            <Panel title="How it works" tone="leather">
              <ol className="p-4 sm:p-5 text-sm text-[#4a3a2b] space-y-1.5 list-decimal list-inside">
                <li>A customer books a pickup at a location that has a lock assigned. The site makes a one-day code on every active lock there and texts it to them right away.</li>
                <li>The code works from 6am to midnight on their pickup date, on every door. The text tells them which doors and how the keypad works.</li>
                <li>Reschedule: the code moves with the appointment. Cancel or mark collected: the code is pulled off the locks on the spot.</li>
                <li>On the Pickup board each appointment shows its code, with Resend, New code and Unlock buttons for when someone is standing at the door.</li>
                <li>Staff and family codes you set in the Schlage Home app stay as they are — the site only touches the codes it made.</li>
              </ol>
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}
