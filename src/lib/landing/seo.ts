import type { Metadata, MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

/**
 * Crawler-facing metadata for the landing page.
 *
 * Pure builders so the same values are asserted by a unit test instead of being
 * trusted by inspection. `robots.ts` and `sitemap.ts` import the same helpers.
 */

const FALLBACK_SITE_URL = "http://localhost:3000";

/** The app base URL. `BETTER_AUTH_URL` is the one configured origin. */
export function landingSiteUrl(): string {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) return FALLBACK_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

function metadataBase(siteUrl: string): URL {
  try {
    return new URL(siteUrl);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}

/**
 * The page paths that are private by construction. They are already `noindex`
 * through the locale layout; the crawl rules exist so a crawler does not spend
 * requests discovering that.
 */
export const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/ar/app",
  "/en/app",
  "/ar/portal",
  "/en/portal",
  "/ar/platform-admin",
  "/en/platform-admin",
  "/ar/invite",
  "/en/invite",
  "/ar/forms",
  "/en/forms",
  "/ar/sign-in",
  "/en/sign-in",
  "/ar/sign-up",
  "/en/sign-up",
] as const;

/** Every locale's landing page, with `hreflang` alternates. */
export const PUBLIC_LANDING_PATHS: readonly string[] = routing.locales.map(
  (locale) => `/${locale}`,
);

const OPEN_GRAPH_LOCALES: Record<string, string> = { ar: "ar_EG", en: "en_GB" };

export type LandingMetadataInput = {
  locale: string;
  title: string;
  description: string;
  siteUrl: string;
};

export function buildLandingMetadata({
  locale,
  title,
  description,
  siteUrl,
}: LandingMetadataInput): Metadata {
  const canonical = `/${locale}`;
  const other = locale === "ar" ? "en" : "ar";
  const languages = {
    ...Object.fromEntries(PUBLIC_LANDING_PATHS.map((path) => [path.slice(1), path])),
    "x-default": "/ar",
  };

  return {
    metadataBase: metadataBase(siteUrl),
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "Kashkol",
      title,
      description,
      locale: OPEN_GRAPH_LOCALES[locale] ?? "ar_EG",
      alternateLocale: OPEN_GRAPH_LOCALES[other] ?? "en_GB",
    },
    twitter: { card: "summary", title, description },
    // The locale layout marks every page `noindex` because the app is private.
    // The landing page is the one public surface, so it opts back in.
    robots: { index: true, follow: true },
  };
}

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  const origin = metadataBase(siteUrl).origin;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATH_PREFIXES],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

/**
 * Only the two landing pages are listed. `/status` stays out on purpose: it is
 * `noindex`, and a sitemap entry for a `noindex` URL contradicts itself.
 */
export function buildSitemap(siteUrl: string, lastModified: Date): MetadataRoute.Sitemap {
  const origin = metadataBase(siteUrl).origin;
  const languages = Object.fromEntries(
    PUBLIC_LANDING_PATHS.map((path) => [path.slice(1), `${origin}${path}`]),
  );

  return PUBLIC_LANDING_PATHS.map((path) => ({
    url: `${origin}${path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 1,
    alternates: { languages },
  }));
}
