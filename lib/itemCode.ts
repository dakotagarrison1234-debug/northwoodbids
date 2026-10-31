import { prisma } from "@/lib/prisma";

/**
 * ITEM / TAG CODES — per-lister lanes, NUMBER FIRST: 1-DAK, 2-DAK … 201-ARY …
 *
 * Every employee gets a 3-letter prefix built from their name and their OWN
 * running counter. Why per-person instead of one shared counter:
 *
 *  - Two people listing at the same moment never interleave — each batch of
 *    printed tags is consecutive for ITS lister, so a gap in the shelf row
 *    still means a missed item even on a busy day.
 *  - The tag itself says who listed it — number first, so typing the number
 *    into search finds it instantly.
 *  - Allocation is a single atomic increment on the lister's row; the
 *    database cannot hand out the same number twice.
 *
 * Prefix rules (Dakota's): first 3 letters of the first name (DAK). Taken by
 * another Dakota? Blend the last name in — DA + J(ames) = DAJ, then D + AM,
 * then initials + a digit. Legacy random 4-digit codes stay valid forever.
 */

const LETTERS = /[^A-Z]/g;

function word(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(LETTERS, "");
}

/** Prefix candidates, best first, per the naming rule. Always 3 chars. */
function prefixCandidates(name: string | null, email: string | null): string[] {
  const parts = (name ?? "").trim().split(/\s+/);
  const first = word(parts[0]);
  const last = word(parts.slice(1).join(" "));
  const emailWord = word((email ?? "").split("@")[0]);
  const base = first || emailWord || "STF";
  const pad = (s: string) => (s + (last || emailWord || "XXX") + "XXX").slice(0, 3);

  const cands: string[] = [];
  cands.push(pad(base.slice(0, 3)));                       // DAK
  if (last) {
    cands.push(pad(base.slice(0, 2) + last.slice(0, 1)));  // DAJ  (Dakota James)
    cands.push(pad(base.slice(0, 1) + last.slice(0, 2)));  // DJA
  }
  for (let d = 2; d <= 9; d++) {
    cands.push((base.slice(0, 2) + String(d)).slice(0, 3)); // DA2 … DA9
  }
  // Last-resort randoms so the loop always terminates.
  for (let i = 0; i < 10; i++) {
    cands.push(
      Array.from({ length: 3 }, () => "ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 22)]).join("")
    );
  }
  return [...new Set(cands)];
}

/** Get (or create, resolving prefix collisions) this lister's code row. */
async function getListerRow(clerkUserId: string): Promise<{ prefix: string }> {
  const existing = await prisma.listerCode.findUnique({ where: { clerkUserId }, select: { prefix: true } });
  if (existing) return existing;

  const profile = await prisma.bidderProfile.findUnique({
    where: { clerkUserId },
    select: { name: true, email: true },
  });
  for (const prefix of prefixCandidates(profile?.name ?? null, profile?.email ?? null)) {
    try {
      return await prisma.listerCode.create({
        data: { clerkUserId, prefix },
        select: { prefix: true },
      });
    } catch (err) {
      // Prefix taken by a teammate (unique violation) → next candidate.
      // Row already created by a parallel request → use it.
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        const mine = await prisma.listerCode.findUnique({ where: { clerkUserId }, select: { prefix: true } });
        if (mine) return mine;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not assign a lister prefix");
}

/**
 * Peek at a lister's next code for the footer ("48-DAK") — no number is used up.
 * Creates the lister's lane on first use so the preview and the saved code
 * always share the same prefix.
 */
export async function peekNextCode(clerkUserId: string): Promise<string> {
  try {
    const { prefix } = await getListerRow(clerkUserId);
    const row = await prisma.listerCode.findUnique({ where: { clerkUserId }, select: { next: true } });
    if (!row) return "—";
    // Never preview a code that's already on an item (e.g. saved before this
    // lane existed): step the counter past taken numbers. Free numbers are
    // never skipped, so nothing is wasted.
    let n = row.next + 1;
    for (let i = 0; i < 200; i++) {
      const taken = await prisma.item.findFirst({ where: { itemCode: `${n}-${prefix}` }, select: { id: true } });
      if (!taken) break;
      n++;
    }
    if (n > row.next + 1) {
      await prisma.listerCode.updateMany({ where: { clerkUserId, next: { lt: n - 1 } }, data: { next: n - 1 } }).catch(() => {});
    }
    return `${n}-${prefix}`;
  } catch { /* fall through */ }
  return "—";
}

/** Old-style random 4-digit code, unique across all items (no lister known). */
async function randomCode(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const exists = await prisma.item.findFirst({ where: { itemCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return String(Date.now()).slice(-6);
}

/**
 * Allocate this lister's next code. Atomic increment — no read-then-write race.
 * Without a lister (system-made items like giveaway prizes) it falls back to
 * the old random 4-digit code.
 */
export async function generateItemCode(clerkUserId?: string | null): Promise<string> {
  if (!clerkUserId) return randomCode();
  try {
    const { prefix } = await getListerRow(clerkUserId);
    for (let i = 0; i < 20; i++) {
      const row = await prisma.listerCode.update({
        where: { clerkUserId },
        data: { next: { increment: 1 } },
        select: { prefix: true, next: true },
      });
      const code = `${row.next}-${row.prefix}`;
      const exists = await prisma.item.findFirst({ where: { itemCode: code }, select: { id: true } });
      if (!exists) return code;
      // Taken (e.g. a manually assigned tag squatted on it) — counter already
      // moved past it, just take the next one.
    }
    return `${Date.now() % 1_000_000}-${prefix}`;
  } catch {
    return String(Date.now()).slice(-7); // collision-proof emergency fallback
  }
}

/**
 * The code a new item saves with.
 *
 * With a lister (every New item save): their lane, always. The footer previews
 * "48-DAK" and sends it along; if that number is still free it's used AND the
 * lister's counter is moved up to it (the counter row is created first if this
 * is their first item, so the next preview is 49-DAK, never 48 again). If it's
 * taken, or missing, the next number is allocated atomically. A free code from
 * outside their lane (a pre-printed tag, an old 4-digit code) is honoured as is.
 *
 * Without a lister (system-made items): an old-style random 4-digit code.
 */
export async function ensureItemCode(provided: string | null | undefined, clerkUserId?: string | null): Promise<string> {
  const p = (provided ?? "").trim().toUpperCase();
  const valid = /^[0-9]{1,7}-[0-9A-Z]{1,4}$/.test(p) || /^[0-9A-Z]{1,4}-[0-9]{1,7}$/.test(p) || /^\d{4,7}$/.test(p);
  const free = valid ? !(await prisma.item.findFirst({ where: { itemCode: p }, select: { id: true } })) : false;

  if (!clerkUserId) return free ? p : generateItemCode(null);

  let prefix: string;
  try {
    prefix = (await getListerRow(clerkUserId)).prefix; // creates the row on a first item
  } catch {
    return free ? p : generateItemCode(null);
  }

  const m = p.match(/^([0-9]{1,7})-([0-9A-Z]{1,4})$/);
  if (free && m && m[2] === prefix) {
    const n = Number(m[1]);
    await prisma.listerCode
      .updateMany({ where: { clerkUserId, next: { lt: n } }, data: { next: n } })
      .catch(() => {});
    return p;
  }
  if (free && !m) return p; // pre-printed / legacy tag
  return generateItemCode(clerkUserId);
}

/** Prisma unique-violation on the itemCode column (only if the column is ever made unique). */
function isCodeCollision(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002" &&
    JSON.stringify((err as { meta?: unknown }).meta ?? "").includes("itemCode")
  );
}

/**
 * Create an item with a code that CANNOT drift: the code is minted and written
 * in the same insert, and the DB's unique constraint is the referee. On the
 * rare race, take the lister's next number and try again — the caller only
 * ever sees the code that actually landed, so the printed tag always matches
 * the database.
 */
export async function createItemWithCode<T>(
  clerkUserId: string | null,
  build: (code: string) => Promise<T>,
  preferred?: string | null
): Promise<T> {
  let code = await ensureItemCode(preferred, clerkUserId);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await build(code);
    } catch (err) {
      if (!isCodeCollision(err)) throw err;
      code = await generateItemCode(clerkUserId);
    }
  }
  return build(String(Date.now()).slice(-7));
}
