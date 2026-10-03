/**
 * The admin information architecture — ONE place that says what the groups are,
 * which pages live in each, and who can see them. The sidebar, the phone tab bar,
 * the drawer and every page's section tabs all read from this, so moving a page
 * is a one-line change here.
 *
 * Seven groups, down from twelve top-level links:
 *   Today · Auctions · Pickup · Money · People · Giveaways · Settings
 */

export type Role = "OWNER" | "ADMIN" | "STAFF";

export type NavPage = { label: string; href: string; hint?: string; ownerOnly?: boolean };
export type NavGroup = {
  key: string;
  label: string;
  icon: string;
  href: string; // where the group link lands
  blurb: string; // one line under the title on the group's pages
  pages: NavPage[]; // section tabs (first = the group's home)
  ownerOnly?: boolean;
};

export const ADMIN_GROUPS: NavGroup[] = [
  {
    key: "today",
    label: "Today",
    icon: "home",
    href: "/admin/dashboard",
    blurb: "What needs you right now.",
    pages: [{ label: "Today", href: "/admin/dashboard" }],
  },
  {
    key: "auctions",
    label: "Auctions",
    icon: "gavel",
    href: "/admin/auctions",
    blurb: "Build, run and close auctions.",
    pages: [
      { label: "All auctions", href: "/admin/auctions" },
      { label: "New auction", href: "/admin/auctions/new" },
      { label: "Add a lot", href: "/admin/items/new" },
      { label: "Unsold & relist", href: "/admin/unsold", ownerOnly: true },
    ],
  },
  {
    key: "pickup",
    label: "Pickup",
    icon: "package",
    href: "/admin/pickup",
    blurb: "Appointments, transfers, warehouses.",
    pages: [{ label: "Board", href: "/admin/pickup" }],
  },
  {
    key: "money",
    label: "Money",
    icon: "coin",
    href: "/admin/winners",
    blurb: "Who owes, who paid, how it's going.",
    ownerOnly: true,
    pages: [
      { label: "Winners & payments", href: "/admin/winners" },
      { label: "Reports", href: "/admin/reports" },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: "users",
    href: "/admin/bidders",
    blurb: "Bidders, referrals, your team.",
    ownerOnly: true,
    pages: [
      { label: "Bidders", href: "/admin/bidders" },
      { label: "Referrals", href: "/admin/referrals" },
      { label: "Team", href: "/admin/staff" },
      { label: "Text a group", href: "/admin/blast" },
    ],
  },
  {
    key: "giveaways",
    label: "Giveaways",
    icon: "ticket",
    href: "/admin/giveaways",
    blurb: "Free prizes that grow the crowd.",
    ownerOnly: true,
    pages: [{ label: "Giveaways", href: "/admin/giveaways" }],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    href: "/admin/settings/payments",
    blurb: "Payments and business setup.",
    ownerOnly: true,
    pages: [{ label: "Payments", href: "/admin/settings/payments" }],
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
      if (pathname === h || pathname.startsWith(h + "/") || (h === "/admin/auctions" && pathname.startsWith("/admin/items"))) {
        if (!best || h.length > best.len) best = { g, len: h.length };
      }
    }
  }
  // Item pages belong to Auctions; "/admin/settings" (the bare group path, which
  // redirects to its first page) belongs to Settings.
  if (!best && pathname.startsWith("/admin/items")) {
    const auctions = ADMIN_GROUPS.find((g) => g.key === "auctions");
    if (auctions) best = { g: auctions, len: 0 };
  }
  if (!best && pathname.startsWith("/admin/settings")) {
    const settings = ADMIN_GROUPS.find((g) => g.key === "settings");
    if (settings) best = { g: settings, len: 0 };
  }
  return best?.g ?? null;
}

export function isActivePage(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // "/admin/auctions" must not light up for "/admin/auctions/new".
  if (href === "/admin/auctions") return /^\/admin\/auctions\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
  if (href === "/admin/reports") return pathname.startsWith("/admin/reports/");
  if (href === "/admin/giveaways") return pathname.startsWith("/admin/giveaways/");
  return false;
}
