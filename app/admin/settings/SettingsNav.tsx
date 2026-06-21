"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Payments", href: "/admin/settings/payments" },
];

export default function SettingsNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 mb-8 bg-white border border-[#e5e0d5] rounded-xl p-1 max-w-xs">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 text-center text-sm px-4 py-2 rounded-lg transition-colors ${
              active
                ? "bg-[#f2efe8] text-[#1a1916] font-semibold"
                : "text-[#6b6659] hover:text-[#1a1916] hover:bg-[#f2efe8]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
