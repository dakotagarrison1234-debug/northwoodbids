"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Payments", href: "/admin/settings/payments" },
];

export default function SettingsNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 mb-8 bg-white border border-[#e3d6bf] rounded-xl p-1 max-w-xs">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 text-center text-base font-semibold px-6 py-3.5 rounded-xl transition-colors ${
              active
                ? "bg-[#efe3d0] text-[#241a12] font-semibold"
                : "text-[#6f5b46] hover:text-[#241a12] hover:bg-[#efe3d0]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
