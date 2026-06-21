import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Northwood Bids",
    short_name: "Northwood Bids",
    description: "Charity auctions for churches, schools, and nonprofits",
    start_url: "/",
    display: "standalone",
    background_color: "#f1e7d5",
    theme_color: "#6c4d39",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
