import type { MetadataRoute } from "next";
import { buildSitemap, landingSiteUrl } from "@/lib/landing/seo";

/**
 * Global sitemap.xml generator.
 *
 * Only the public landing pages are listed. Private app pages are omitted as
 * they are `noindex` and require a session.
 *
 * The origin is resolved per request (`force-dynamic`) so the value always
 * comes from the current `BETTER_AUTH_URL`, never from whatever happened to
 * be present at build time. `lastModified` is therefore the request time,
 * not the build time; crawlers fetch this rarely and the cost is trivial.
 */

// The canonical origin comes from the runtime BETTER_AUTH_URL.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(landingSiteUrl(), new Date());
}
