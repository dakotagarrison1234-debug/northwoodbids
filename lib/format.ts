/* ───────────────────────────────────────────────────────────
   Northwood Bids — shared formatting primitives
   Pure functions, no React. Consolidates the money + date/time
   patterns that were copy-pasted across pages.
   ─────────────────────────────────────────────────────────── */

/** The app's business timezone. */
export const BUSINESS_TZ = "America/Detroit";

export interface MoneyOptions {
  /** Treat the input as integer cents (e.g. 3000 → $30.00). */
  cents?: boolean;
  /** Force 2 decimal places (e.g. $1,234.00). Defaults to whole dollars. */
  decimals?: 0 | 2;
}

/**
 * Format a number as USD.
 *  - default: whole-dollar `$1,234`
 *  - { decimals: 2 }: `$1,234.00`
 *  - { cents: true }: input is integer cents → `$1,234.00`
 */
export function money(n: number, opts: MoneyOptions = {}): string {
  const value = opts.cents ? n / 100 : n;
  // When the input is cents, default to 2 decimals unless overridden.
  const decimals = opts.decimals ?? (opts.cents ? 2 : 0);
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

type DateInput = Date | string | number;

function toDate(date: DateInput): Date {
  return date instanceof Date ? date : new Date(date);
}

/** e.g. "Jun 21, 2026, 3:45 PM" in the business timezone. */
export function formatDateTime(date: DateInput, tz: string = BUSINESS_TZ): string {
  return toDate(date).toLocaleString("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "Jun 21, 2026" in the business timezone. */
export function formatDate(date: DateInput, tz: string = BUSINESS_TZ): string {
  return toDate(date).toLocaleDateString("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
