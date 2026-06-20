"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ActAsExitButton() {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const exit = async () => {
    setExiting(true);
    await fetch("/api/superadmin/act-as", { method: "DELETE" });
    router.push("/superadmin/orgs");
    router.refresh();
  };

  return (
    <button
      onClick={exit}
      disabled={exiting}
      className="bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors border border-amber-300 hover:border-amber-400"
    >
      {exiting ? "Exiting..." : "Exit Org View"}
    </button>
  );
}
