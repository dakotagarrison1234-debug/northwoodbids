/**
 * The admin information architecture — ONE place that says what the groups are,
 * which pages live in each, and who can see them. The sidebar, the phone tab bar,
 * the drawer and every page's section tabs all read from this.
 *
 * Daily work first (Today · Auctions · Pickup · Money), then people, then the
 * growth tools, then setup. Creation actions (new auction, add a lot) are buttons
 * on their pages, not tabs.
 */

export type Role = "OWNER" | "ADMIN" | "STAFF";

export type NavPage = { label: string; href: string; ownerOnly?: boolean };
export type NavGroup = {
  key: string;
  label: string;
  icon: string;
  href: string; // where the group link lands
  pages: NavPage[]; // section tabs (first = the group's home)
  ownerOnly?: boolean;
};

export const ADMIN_GROUPS: NavGroup[] = [
  {
    key: "today",
    label: "Today",
    icon: "home",
    href: "/admin/dashboard",
    pages: [{ label: "Today", href: "/admin/dashboard" }],
  },
  {
    key: "auctions",
    label: "Auctions",
    icon: "gavel",
    href: "/admin/auctions",
    pages: [
      { label: "Auctions", href: "/admin/auctions" },
      { label: "Unsold", href: "/admin/unsold" },
    ],
  },
  {
    key: "pickup",
    label: "Pickup",
    icon: "package",
    href: "/admin/pickup",
    pages: [
      { label: "Pickup", href: "/admin/pickup" },
      { label: "Ship", href: "/admin/shipping" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "coin",
    href: "/admin/winners",
    ownerOnly: true,
    pages: [
      { label: "Payments", href: "/admin/winners" },
      { label: "Reports", href: "/admin/reports" },
    ],
  },
  {
    key: "bidders",
    label: "Bidders",
    icon: "users",
    href: "/admin/bidders",
    ownerOnly: true,
    pages: [
      { label: "Bidders", href: "/admin/bidders" },
      { label: "Report", href: "/admin/bidders/report" },
      { label: "Text a group", href: "/admin/blast" },
    ],
  },
  {
    key: "grow",
    label: "Grow",
    icon: "ticket",
    href: "/admin/giveaways",
    ownerOnly: true,
    pages: [
      { label: "Giveaways", href: "/admin/giveaways" },
      { label: "Welcome codes", href: "/admin/promos" },
      { label: "Bid Bucks", href: "/admin/referrals" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    href: "/admin/settings/locations",
    ownerOnly: true,
    pages: [
      { label: "Locations", href: "/admin/settings/locations" },
      { label: "Payments", href: "/admin/settings/payments" },
      { label: "Doors", href: "/admin/settings/doors" },
      { label: "Team", href: "/admin/staff" },
    ],
  },
];

export function visibleGroups(role: Role): NavGroup[] {
  const ownerish = role === "OWNER" || role === "ADMIN";
  return ADMIN_GROUPS.filter((g) => !g.ownerOnly || ownerish).map((g) => ({
    ...g,
    pages: g.pages.filter((p) => !p.ownerOnly || ownerish),
  }));
}

/** Which group a path belongs to (longest matching page href wins). */
export function groupForPath(pathname: string): NavGroup | null {
  let best: { g: NavGroup; len: number } | null = null;
  for (const g of ADMIN_GROUPS) {
    const hrefs = [g.href, ...g.pages.map((p) => p.href)];
    for (const h of hrefs) {
      if (pathname === h || pathname.startsWith(h + "/")) {
        if (!best || h.length > best.len) best = { g, len: h.length };
      }
    }
  }
  const byKey = (key: string) => ADMIN_GROUPS.find((g) => g.key === key) ?? null;
  // Lot pages and the auction creator belong to Auctions; bare /admin/settings to Settings.
  if (!best && (pathname.startsWith("/admin/items") || pathname.startsWith("/admin/auctions"))) return byKey("auctions");
  if (!best && pathname.startsWith("/admin/settings")) return byKey("settings");
  if (!best && pathname.startsWith("/admin/staff")) return byKey("settings");
  return best?.g ?? null;
}

export function isActivePage(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // "/admin/auctions" lights up for auction detail pages but not for /admin/unsold.
  if (href === "/admin/auctions") return pathname.startsWith("/admin/auctions/") || pathname.startsWith("/admin/items");
  if (href === "/admin/reports") return pathname.startsWith("/admin/reports/");
  if (href === "/admin/giveaways") return pathname.startsWith("/admin/giveaways/");
  return false;
}
