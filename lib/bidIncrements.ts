/**
 * Bid increment table — slow growth matching live auction conventions:
 *   $0    – $11    → $1  increment
 *   $12   – $99    → $2  increment
 *   $100  – $499   → $5  increment
 *   $500  – $999   → $10 increment
 *   $1000 – $4999  → $25 increment
 *   $5000+         → $50 increment
 */
export function getIncrement(currentBid: number): number {
  if (currentBid < 12) return 1;
  if (currentBid < 100) return 2;
  if (currentBid < 500) return 5;
  if (currentBid < 1000) return 10;
  if (currentBid < 5000) return 25;
  return 50;
}

/**
 * Returns the minimum valid next bid given the current bid level.
 * Whole dollars only — the base is floored so a stray cent can't carry through.
 * Only call this when currentBid > 0 (for the first bid, use item.startingBid).
 */
export function getNextValidBid(currentBid: number): number {
  return Math.floor(currentBid) + getIncrement(currentBid);
}

/**
 * Returns an array of `count` valid bid amounts starting from the next
 * valid bid above `currentBid`. Used for regular bid suggestion chips in the UI.
 */
export function getValidBidSuggestions(currentBid: number, count = 5): number[] {
  const suggestions: number[] = [];
  let level = currentBid;
  for (let i = 0; i < count; i++) {
    level = level > 0 ? getNextValidBid(level) : level + getIncrement(level);
    suggestions.push(level);
  }
  return suggestions;
}

/**
 * Proxy max-bid suggestions: simple $5 rungs above the current bid — e.g. a $7 bid
 * suggests $10, $15, $20, $25. Capped at retail, since there's no reason to suggest
 * a max above what the item's worth: we stop at the first $5 rung that reaches retail
 * (retail $19.99 → stop at $20). Pass `retail` (0/undefined = no cap).
 */
export function getProxySuggestions(currentBid: number, count = 4, retail?: number | null): number[] {
  const STEP = 5;
  // First $5 rung STRICTLY above the current bid ($7 → $10, $10 → $15).
  const start = Math.floor((currentBid > 0 ? currentBid : 0) / STEP) * STEP + STEP;
  // Cap at the first $5 rung that reaches/exceeds retail; no cap when retail unknown.
  const cap = retail && retail > 0 ? Math.ceil(retail / STEP) * STEP : Infinity;

  const result: number[] = [];
  for (let v = start; result.length < count; v += STEP) {
    result.push(v);
    if (v >= cap) break; // include the rung that hits retail, then stop
  }
  return result;
}
