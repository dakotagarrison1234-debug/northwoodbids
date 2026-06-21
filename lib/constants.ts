// Anti-snipe ("popcorn") bidding window: if a bid lands within the last 2:00
// (2 minutes) of an item's effective end time, the end time is extended.
export const POPCORN_WINDOW_MS = 2 * 60 * 1000;
// Extension applied when a bid lands inside the window: 2:00 (2 minutes).
export const POPCORN_EXTENSION_MS = 2 * 60 * 1000;
