import type { IconName } from "@/components/ui/icon";

/**
 * The landing page's structure, held in one place so the message catalogue, the
 * icons, and the tests cannot drift apart.
 *
 * Every entry here describes a real, shipped capability. Do not add fabricated
 * testimonials, fake stats, or claims for capabilities that do not exist.
 */

export type LandingEntry = {
  /** Suffix under the section's `items` namespace in both catalogues. */
  readonly key: string;
  readonly icon: IconName;
};

/** Same-page anchors. The header and the footer both read this list. */
export const LANDING_SECTIONS = ["challenges", "pricing", "proof", "faq"] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

export const NAV_ITEMS: readonly { key: LandingSection }[] = LANDING_SECTIONS.map((key) => ({
  key,
}));

/**
 * The ten problem/solution showcases. Each key maps to a real, shipped or
 * clearly-scoped capability. The order follows the user's requested narrative.
 */
export const CHALLENGE_ITEMS: readonly LandingEntry[] = [
  { key: "students", icon: "users" },
  { key: "schedule", icon: "calendar" },
  { key: "attendance", icon: "check" },
  { key: "homework", icon: "book" },
  { key: "exams", icon: "file" },
  { key: "performance", icon: "bar" },
  { key: "payments", icon: "wallet" },
  { key: "content", icon: "folder" },
  { key: "parents", icon: "whatsapp" },
  { key: "team", icon: "staff" },
];

/** The five items given the largest visual treatment on the landing page. */
export const FEATURED_CHALLENGE_KEYS = new Set([
  "students",
  "attendance",
  "exams",
  "performance",
  "payments",
]);

/** Social proof uses real product facts, not fabricated testimonials. */
export const PROOF_ITEMS: readonly LandingEntry[] = [
  { key: "records", icon: "bar" },
  { key: "arabic", icon: "globe" },
  { key: "privacy", icon: "lock" },
];

export const STEPS: readonly LandingEntry[] = [
  { key: "workspace", icon: "plus" },
  { key: "roster", icon: "users" },
  { key: "day", icon: "check" },
];

export const FAQ_ITEMS = ["start", "language", "records", "support"] as const;
export type FaqItem = (typeof FAQ_ITEMS)[number];

/** Hero trust chips. */
export const HERO_TRUST = ["organized", "records", "bilingual"] as const;

/**
 * Demo screenshots are disabled until recaptured from a seeded workspace that
 * shows only M1 capabilities. The previous captures included M2 UI (payments,
 * follow-up, guardian messaging) and cannot be shown as current product truth.
 * While disabled, the hero renders a structural illustration — blocks and rails
 * with labels only, never a fabricated dashboard.
 */
export const HAS_DEMO_SCREENSHOT = false;

export function demoScreenshotPath(locale: string): string {
  return `/landing/workspace-${locale === "en" ? "en" : "ar"}.png`;
}
