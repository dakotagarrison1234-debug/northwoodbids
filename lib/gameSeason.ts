// The Auction Arcade leaderboard runs in rolling 30-day seasons. Scores "reset"
// every 30 days: each season has its own best-per-player, and only the current
// season is shown. Seasons are aligned to a fixed epoch so the boundary is
// deterministic for everyone (and predictable for running timed challenges).

const EPOCH = Date.UTC(2025, 0, 1); // Jan 1, 2025 UTC — season alignment anchor
const PERIOD = 30 * 24 * 60 * 60 * 1000; // 30 days

export function seasonBounds(now: number = Date.now()): { start: Date; end: Date } {
  const idx = Math.floor((now - EPOCH) / PERIOD);
  return { start: new Date(EPOCH + idx * PERIOD), end: new Date(EPOCH + (idx + 1) * PERIOD) };
}

export function currentSeasonStart(now: number = Date.now()): Date {
  return seasonBounds(now).start;
}
