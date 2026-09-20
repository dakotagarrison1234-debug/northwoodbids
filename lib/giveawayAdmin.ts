import type { GiveawayRequirementType, GiveawayEntryMode, GiveawayDrawStyle } from "@prisma/client";

/** Shared field parsing for create + edit. Returns validated data or an error string. */
export function parseGiveawayFields(body: Record<string, unknown>, partial = false) {
  const out: {
    title?: string;
    description?: string | null;
    entryMode?: GiveawayEntryMode;
    drawStyle?: GiveawayDrawStyle;
    requirement?: GiveawayRequirementType;
    requirementPrompt?: string | null;
    requirementAnswer?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    minBidAmount?: number | null;
    maxTicketsPerUser?: number | null;
    requireCard?: boolean;
  } = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t && !partial) return { error: "Give your giveaway a title." };
    if (t) out.title = t.slice(0, 120);
  } else if (!partial) return { error: "Give your giveaway a title." };

  if (body.description !== undefined)
    out.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;

  if (body.entryMode !== undefined) {
    if (!["AUTO", "CLICK", "BID"].includes(String(body.entryMode))) return { error: "Pick how people enter." };
    out.entryMode = body.entryMode as GiveawayEntryMode;
  }
  if (body.drawStyle !== undefined) {
    if (!["WHEEL", "MACHINE"].includes(String(body.drawStyle))) return { error: "Pick a draw style." };
    out.drawStyle = body.drawStyle as GiveawayDrawStyle;
  }
  if (body.requirement !== undefined) {
    if (!["NONE", "INFO", "ANSWER"].includes(String(body.requirement))) return { error: "Bad question type." };
    out.requirement = body.requirement as GiveawayRequirementType;
  }
  if (body.requirementPrompt !== undefined)
    out.requirementPrompt =
      typeof body.requirementPrompt === "string" && body.requirementPrompt.trim() ? body.requirementPrompt.trim().slice(0, 200) : null;
  if (body.requirementAnswer !== undefined)
    out.requirementAnswer =
      typeof body.requirementAnswer === "string" && body.requirementAnswer.trim() ? body.requirementAnswer.trim().slice(0, 200) : null;

  if (body.startsAt !== undefined) {
    if (!body.startsAt) out.startsAt = null;
    else {
      const d = new Date(String(body.startsAt));
      if (isNaN(d.getTime())) return { error: "Start time isn't valid." };
      out.startsAt = d;
    }
  }
  if (body.endsAt !== undefined) {
    if (!body.endsAt) out.endsAt = null;
    else {
      const d = new Date(String(body.endsAt));
      if (isNaN(d.getTime())) return { error: "End time isn't valid." };
      out.endsAt = d;
    }
  }
  if (body.minBidAmount !== undefined) {
    const n = body.minBidAmount === "" || body.minBidAmount == null ? null : Number(body.minBidAmount);
    if (n != null && (isNaN(n) || n < 0)) return { error: "Minimum bid must be a number." };
    out.minBidAmount = n;
  }
  if (body.requireCard !== undefined) out.requireCard = body.requireCard === true || body.requireCard === "true";
  if (body.maxTicketsPerUser !== undefined) {
    const n = body.maxTicketsPerUser === "" || body.maxTicketsPerUser == null ? null : Math.floor(Number(body.maxTicketsPerUser));
    if (n != null && (isNaN(n) || n < 1)) return { error: "Ticket cap must be at least 1." };
    out.maxTicketsPerUser = n;
  }
  return { data: out };
}

/** Rules that must hold before a giveaway can go live (and that create enforces up front). */
export function validateForLive(g: {
  entryMode: string;
  requirement: string;
  requirementPrompt: string | null;
  requirementAnswer: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}): string | null {
  const gated = g.entryMode === "CLICK" && g.requirement !== "NONE";
  if (gated && !g.requirementPrompt) return "Add the question entrants will see.";
  if (g.entryMode === "CLICK" && g.requirement === "ANSWER" && !g.requirementAnswer) return "Set the correct answer.";
  if (g.startsAt && g.endsAt && g.endsAt <= g.startsAt) return "The end time has to be after the start time.";
  if (g.entryMode === "BID" && !g.endsAt) return "Bid-to-enter giveaways need an end time so everyone knows when tickets stop counting.";
  return null;
}

