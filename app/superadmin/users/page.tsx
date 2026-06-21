"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface User {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  bidCount: number;
  paidTotal: number;
  unpaidTotal: number;
  failedPayments: number;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/superadmin/users?search=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { setUsers(d.users || []); setLoading(false); });
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
  };

  return (
    <>
      <header className="border-b border-[#e3d6bf]/60 px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">Users</h1>
          <p className="text-[#8a7559] text-sm mt-0.5">{users.length} {query ? "results" : "total"}</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="bg-[#efe3d0] border border-[#cdbda3] rounded-xl px-4 py-2 text-sm text-[#241a12] placeholder-[#b3a085] focus:outline-none focus:border-[#a4592a] w-56"
          />
          <button type="submit" className="bg-[#07878d] hover:bg-[#843f1c] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Search
          </button>
          {query && (
            <button type="button" onClick={() => { setSearch(""); setQuery(""); }} className="text-[#6f5b46] hover:text-[#241a12] text-sm px-3 py-2 rounded-xl transition-colors">
              Clear
            </button>
          )}
        </form>
      </header>

      <div className="px-4 sm:px-8 py-5 max-w-5xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-[#a4592a]/30 border-t-[#a4592a] animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl p-8 text-center text-[#8a7559] text-sm">
            {query ? "No users found matching that search." : "No registered users yet."}
          </div>
        ) : (
          <div className="bg-white border border-[#e3d6bf] rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e3d6bf] text-[#8a7559] text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3">User</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Phone</th>
                  <th className="text-right px-4 py-3">Bids</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Paid</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Unpaid</th>
                  <th className="text-right px-4 py-3">Failed</th>
                  <th className="text-right px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e3d6bf]/60">
                {users.map((u) => (
                  <tr key={u.clerkUserId} className="hover:bg-[#efe3d0]/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/superadmin/users/${u.clerkUserId}`}
                        className="hover:text-[#a4592a] transition-colors"
                      >
                        <div className="font-medium text-[#241a12]">{u.name || <span className="text-[#8a7559] italic">No name</span>}</div>
                        <div className="text-[#8a7559] text-xs mt-0.5">{u.email || <span className="italic">No email</span>}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#6f5b46] hidden sm:table-cell">{u.phone || "—"}</td>
                    <td className="px-4 py-3 text-right text-[#4a3a2b]">{u.bidCount}</td>
                    <td className="px-4 py-3 text-right text-[#a4592a] font-medium hidden sm:table-cell">
                      {u.paidTotal > 0 ? `$${u.paidTotal.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {u.unpaidTotal > 0 ? (
                        <span className="text-orange-400 font-semibold">${u.unpaidTotal.toLocaleString()}</span>
                      ) : (
                        <span className="text-[#8a7559]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.failedPayments > 0 ? (
                        <span className="text-red-600 font-semibold">{u.failedPayments}</span>
                      ) : (
                        <span className="text-[#8a7559]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-[#8a7559] text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
