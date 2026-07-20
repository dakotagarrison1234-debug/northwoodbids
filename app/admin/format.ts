/**
 * Pure formatting helpers — deliberately NOT in ui.tsx.
 *
 * ui.tsx is a "use client" module, and Next.js turns every export of a client
 * module into a client *reference*. Importing a plain function from it into a
 * server component gives you a proxy, not a function, and calling it blows up at
 * request time with "Attempted to call X() from the server". Formatting is needed
 * on both sides, so it lives in its own server-safe module.
 */

/** $1,234.50 — always absolute; show the sign yourself so it's explicit. */
export const fmtMoney = (n: number) =>
  "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,235 — rounded, for headline numbers where cents are noise. */
export const fmtMoney0 = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString();
