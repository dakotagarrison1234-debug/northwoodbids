"use client";
// Status colors live in lib/statusStyles (a plain module) so SERVER components
// can call statusStyle() directly. Re-exported here for existing imports.
import { statusStyle, STATUS_STYLES } from "@/lib/statusStyles";
export { statusStyle, STATUS_STYLES };

interface StatusPillProps {
  status: string;
  /** Override the displayed text (defaults to a humanized status). */
  label?: string;
  className?: string;
}

export default function StatusPill({ status, label, className = "" }: StatusPillProps) {
  const text = label ?? status.replace(/_/g, " ").toLowerCase();
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle(status)} ${className}`}
    >
      {text}
    </span>
  );
}
