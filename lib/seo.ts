// Structured-data (schema.org JSON-LD) builders for Northwood Bids.
//
// These emit invisible <script type="application/ld+json"> payloads that let Google
// understand the site: the brand (Organization), the site + its search box (WebSite),
// the two physical pickup locations (LocalBusiness — the engine of LOCAL ranking),
// each lot (Product + Offer), and page breadcrumbs. Nothing here changes what a
// visitor sees.

export const SEO_BASE = "https://northwoodbids.com";

const ORG_ID = `${SEO_BASE}/#organization`;
const WEBSITE_ID = `${SEO_BASE}/#website`;
const LOGO = `${SEO_BASE}/icon-512.png`;

/** The brand entity — referenced by everything else via @id. */
export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Northwood Bids",
    url: SEO_BASE,
    logo: { "@type": "ImageObject", url: LOGO, width: 512, height: 512 },
    image: LOGO,
    description:
      "Northwood Bids is a local online auction in mid-Michigan — bid on brand-name overstock, " +
      "returns and surplus, then pick up local in Owosso or Gladwin.",
    areaServed: [
      { "@type": "State", name: "Michigan" },
      { "@type": "City", name: "Owosso" },
      { "@type": "City", name: "Gladwin" },
    ],
  };
}

/** The site itself, with the on-site search action Google can surface as a sitelink. */
export function websiteLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SEO_BASE,
    name: "Northwood Bids",
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SEO_BASE}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Combined graph for the root layout — one script, on every page. */
export function siteGraphLd() {
  return { "@context": "https://schema.org", "@graph": [organizationLd(), websiteLd()] };
}

type Loc = { name: string; address: string | null };

/**
 * One LocalBusiness per physical pickup location. This is what tells Google there's a
 * real business in Owosso and in Gladwin — the foundation of local-pack ranking.
 * `name` is expected to be the city (e.g. "Owosso"); `address` the street line.
 */
export function localBusinessLd(locations: Loc[]) {
  const nodes = locations.map((loc) => {
    const node: Record<string, unknown> = {
      "@type": "LocalBusiness",
      "@id": `${SEO_BASE}/#location-${loc.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: `Northwood Bids — ${loc.name}`,
      url: SEO_BASE,
      image: LOGO,
      parentOrganization: { "@id": ORG_ID },
      priceRange: "$",
      areaServed: `${loc.name}, Michigan`,
    };
    node.address = {
      "@type": "PostalAddress",
      ...(loc.address ? { streetAddress: loc.address } : {}),
      addressLocality: loc.name,
      addressRegion: "MI",
      addressCountry: "US",
    };
    return node;
  });
  return { "@context": "https://schema.org", "@graph": nodes };
}

const CONDITION_LD: Record<string, string> = {
  NEW: "https://schema.org/NewCondition",
  LIKE_NEW: "https://schema.org/UsedCondition",
  GOOD: "https://schema.org/UsedCondition",
  FAIR: "https://schema.org/UsedCondition",
  POOR: "https://schema.org/DamagedCondition",
};

/** A single lot as a Product with an Offer (the live/closing price). */
export function productLd(opts: {
  name: string;
  description?: string | null;
  images: string[];
  url: string;
  price: number;
  condition?: string | null;
  availability?: "InStock" | "SoldOut" | "PreOrder";
  priceValidUntil?: string | null;
}) {
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url: opts.url,
    priceCurrency: "USD",
    price: Math.max(0, Math.round(opts.price * 100) / 100).toFixed(2),
    availability: `https://schema.org/${opts.availability ?? "InStock"}`,
    ...(opts.condition && CONDITION_LD[opts.condition] ? { itemCondition: CONDITION_LD[opts.condition] } : {}),
    ...(opts.priceValidUntil ? { priceValidUntil: opts.priceValidUntil } : {}),
    seller: { "@id": ORG_ID },
  };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.images.length ? { image: opts.images } : {}),
    offers: offer,
  };
}

/** Breadcrumb trail for a page (Home › … › current). */
export function breadcrumbLd(crumbs: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}
