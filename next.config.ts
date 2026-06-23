import type { NextConfig } from "next";

// Security + privacy headers applied to every response. `camera=(self)` is
// deliberate — the barcode scanner needs getUserMedia on our own origin.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // don't advertise the stack
  compress: true,
  images: {
    // Serve AVIF/WebP (auto-resized) instead of full-size R2 originals.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "pub-829fa846d09e430db535c94618889062.r2.dev" },
      { protocol: "https", hostname: "assets.cdn.filesafe.space" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
