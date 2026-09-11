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

/** Statuses that are "in motion" get a small live dot so they read at a glance. */
const LIVE = new Set(["OPEN", "ACTIVE", "CLOSING"]);
const NEEDS_ACTION = new Set(["PENDING_PICKUP", "PENDING", "FAILED", "OUTBID"]);

export default function StatusPill({ status, label, className = "" }: StatusPillProps) {
  const key = status.toUpperCase();
  const text = label ?? status.replace(/_/g, " ").toLowerCase();
  const dot = LIVE.has(key) ? "live" : NEEDS_ACTION.has(key) ? "action" : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold capitalize whitespace-nowrap ${statusStyle(status)} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full bg-current ${dot === "live" ? "animate-pulse" : "opacity-70"}`}
        />
      )}
      {text}
    </span>
  );
}
