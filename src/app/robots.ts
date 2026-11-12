import type { MetadataRoute } from "next";
import { buildRobots, landingSiteUrl } from "@/lib/landing/seo";

/**
 * Global robots.txt generator.
 *
 * It allows crawling the homepages but disallows private app and portal paths
 * to keep crawler budget for the public surface.
 *
 * The origin is resolved per request (`force-dynamic`) so the value always
 * comes from the current `BETTER_AUTH_URL`, never from whatever happened to
 * be present at build time.
 */

// The canonical origin comes from the runtime BETTER_AUTH_URL.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(landingSiteUrl());
}
