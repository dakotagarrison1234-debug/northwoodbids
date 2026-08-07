// One-time: after adding GameScore.seasonStart, drop every existing best into the
// CURRENT 30-day season so the leaderboard isn't empty on launch (current bests
// carry into this first season, then reset normally in 30 days).
//
// Run AFTER `npx prisma db push`:
//   node scripts/backfill-game-season.mjs
// Skip it if you'd rather start with a totally clean board.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const EPOCH = Date.UTC(2025, 0, 1);
const PERIOD = 30 * 24 * 60 * 60 * 1000;
const seasonStart = new Date(EPOCH + Math.floor((Date.now() - EPOCH) / PERIOD) * PERIOD);

const res = await prisma.gameScore.updateMany({ data: { seasonStart } });
console.log(`Set seasonStart=${seasonStart.toISOString()} on ${res.count} existing game score(s).`);
await prisma.$disconnect();
