"use client";

interface Org { id: string; name: string }

export default function OrgSwitcher({ orgs, currentOrgId }: { orgs: Org[]; currentOrgId: string }) {
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (orgId === currentOrgId) return;
    await fetch("/api/superadmin/act-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    // Full reload ensures the new sa_org_id cookie is sent with the next request
    window.location.href = "/admin/dashboard";
  };

  return (
    <div className="mb-2">
      <label className="text-xs text-orange-400 uppercase tracking-wider mb-1 block">Viewing Org</label>
      <select
        value={currentOrgId}
        onChange={handleChange}
        className="w-full bg-[#f2efe8] border border-orange-500/30 rounded-lg px-2 py-1.5 text-sm text-[#1a1916] focus:outline-none focus:border-orange-500"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>{org.name}</option>
        ))}
      </select>
    </div>
  );
}
