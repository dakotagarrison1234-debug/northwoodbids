import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/admin/app + auth/transactional surfaces out of search indexes.
        disallow: [
          "/admin", "/superadmin", "/api", "/dashboard", "/account", "/pickup",
          "/register", "/sign-in", "/sign-up", "/onboarding", "/apply", "/join",
          "/invoice", "/my-bids", "/refer", "/r/",
        ],
      },
    ],
    sitemap: "https://northwoodbids.com/sitemap.xml",
  };
}
