-- One-time, after the arcade's `prisma db push`: Gavel Slam scores saved
-- before the arcade were raw (unscaled). Put them on the shared scale
-- (x0.4, ceiling 20,000) so the new board is fair. Safe to run twice: the
-- second run only touches rows still above 20,000.
UPDATE "GameScore"
SET "bestScore" = LEAST(20000, FLOOR("bestScore" * 0.4))
WHERE "game" = 'gavel' AND "bestScore" > 20000;
