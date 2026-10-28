import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Baseline security headers for every response.
 *
 * The CSP here restricts framing, <base>, plugins and form targets, which do not
 * interfere with Next.js hydration. A full script-src policy needs per-request
 * nonces (which forces dynamic rendering); it is planned for the hardening stage
 * (docs/SECURITY_MODEL.md → Known gaps).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  },
  // Ignored by browsers over plain HTTP (local development); effective once served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // Only CMS images (served by /media/…, published content only) are optimised.
    localPatterns: [{ pathname: "/media/assets/**", search: "" }],
    // The optimiser's cache cannot be purged: an unpublished image may be served
    // from it for at most this long (seconds), matching /media's Cache-Control.
    minimumCacheTTL: 300,
  },
  experimental: {
    serverActions: {
      // The largest legitimate request is an inquiry (~25 KB with Amharic text
      // at the field limits). Anything bigger is rejected before parsing.
      bodySizeLimit: "64kb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Sample videos and posters (public/videos): files in public get max-age=0 by
        // default, so every visit re-checked each clip. A day in the browser cache, then
        // refreshed in the background; a changed clip therefore needs a new file name.
        source: "/videos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
