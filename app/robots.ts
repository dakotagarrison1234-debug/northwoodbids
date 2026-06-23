import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/admin/app surfaces out of search indexes.
        disallow: ["/admin", "/superadmin", "/api", "/dashboard", "/account", "/pickup", "/register"],
      },
    ],
    sitemap: "https://northwoodbids.com/sitemap.xml",
  };
}
