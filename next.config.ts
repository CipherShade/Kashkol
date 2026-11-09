import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Allow the configured auth origin (e.g. a Cloudflare quick tunnel) to load
// Next.js dev assets while developing. Derived from BETTER_AUTH_URL so the
// ephemeral tunnel host does not have to be hard-coded.
const devOrigins = (() => {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) return [];
  try {
    return [new URL(url).host];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: devOrigins,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
