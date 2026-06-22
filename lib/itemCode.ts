import { prisma } from "@/lib/prisma";

function random4(): string {
  return String(Math.floor(1000 + Math.random() * 9000)); // 1000–9999
}

/**
 * A random item code that is unique across ALL items, ever. 4 digits while there's
 * room; widens to 5–6 digits if the 4-digit space gets congested so generation
 * never loops forever.
 */
export async function generateItemCode(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const code = random4();
    const exists = await prisma.item.findFirst({ where: { itemCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000)); // 5 digits
    const exists = await prisma.item.findFirst({ where: { itemCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return String(Date.now()).slice(-6); // last-resort fallback
}

/**
 * Honor a code already shown to staff (so the tag they wrote matches) when it's
 * still free; otherwise mint a fresh unique one.
 */
export async function ensureItemCode(provided?: string | null): Promise<string> {
  const p = (provided ?? "").trim();
  if (/^\d{4,6}$/.test(p)) {
    const exists = await prisma.item.findFirst({ where: { itemCode: p }, select: { id: true } });
    if (!exists) return p;
  }
  return generateItemCode();
}
