/**
 * Which home-hero backdrop to show. Winter runs Dec 1 – Jan 31 (inclusive),
 * judged by the calendar date in Michigan so it flips at local midnight.
 */
export type HeroSeason = "summer" | "winter";

export function heroSeason(now: Date = new Date()): HeroSeason {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    month: "numeric",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const winter = month === 12 || month === 1;
  return winter ? "winter" : "summer";
}
