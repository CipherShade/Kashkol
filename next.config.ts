import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Allow the configured auth origin and tunnel origins (e.g. Cloudflare quick tunnel)
// to load Next.js dev assets while developing.
const devOrigins = (() => {
  const origins = ["*.trycloudflare.com", "trycloudflare.com", "localhost:3000", "127.0.0.1:3000"];
  const url = process.env.BETTER_AUTH_URL;
  if (url) {
    try {
      const host = new URL(url).host;
      if (!origins.includes(host)) origins.push(host);
    } catch {
      // Ignore invalid URL
    }
  }
  const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (extra) {
    for (const item of extra.split(",")) {
      try {
        const cleaned = item.trim();
        if (cleaned) {
          const host = cleaned.startsWith("http") ? new URL(cleaned).host : cleaned;
          if (!origins.includes(host)) origins.push(host);
        }
      } catch {
        // Ignore invalid URL
      }
    }
  }
  return origins;
})();

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: devOrigins,
  experimental: { agentUpgrade: "security" },
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
