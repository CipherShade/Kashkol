import type { IconName } from "@/components/ui/icon";

/**
 * The landing page's structure, held in one place so the message catalogue, the
 * icons, and the tests cannot drift apart.
 *
 * Every entry here describes a capability that exists in this repository. A
 * section may only be added when the feature behind it is real — a marketing
 * page that promises what the product cannot do is the failure this list is
 * meant to prevent (`AGENTS.md` §1, `PRODUCT_REQUIREMENTS.md` §12).
 */

export type LandingEntry = {
  /** Suffix under the section's `items` namespace in both catalogues. */
  readonly key: string;
  readonly icon: IconName;
};

/** Same-page anchors. The header and the footer both read this list. */
export const LANDING_SECTIONS = ["features", "how", "security", "faq"] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

export const NAV_ITEMS: readonly { key: LandingSection }[] = LANDING_SECTIONS.map((key) => ({
  key,
}));

/** "What we never fake" — four prohibitions a teacher can check. */
export const TRUTH_ITEMS: readonly LandingEntry[] = [
  { key: "records", icon: "bar" },
  { key: "delivery", icon: "whatsapp" },
  { key: "portals", icon: "lock" },
  { key: "payments", icon: "creditCard" },
];

/**
 * Problem → solution pairs. Each solution names a module that exists:
 * students, groups, session conflict detection, attendance, homework,
 * assessments, student follow-up, and staff roles.
 */
export const PROBLEM_ROWS: readonly LandingEntry[] = [
  { key: "students", icon: "student" },
  { key: "groups", icon: "layers" },
  { key: "schedule", icon: "calendar" },
  { key: "attendance", icon: "qr" },
  { key: "homework", icon: "book" },
  { key: "assessments", icon: "clipboard" },
  { key: "followUp", icon: "target" },
  { key: "assistants", icon: "staff" },
];

/**
 * The four real capabilities the problem rows do not cover. Without this band
 * the page would silently omit payments, files, portals, and exports.
 */
export const GAP_ITEMS: readonly LandingEntry[] = [
  { key: "payments", icon: "creditCard" },
  { key: "files", icon: "file" },
  { key: "portals", icon: "parent" },
  { key: "reports", icon: "download" },
];

export const SECURITY_ITEMS: readonly LandingEntry[] = [
  { key: "isolation", icon: "layers" },
  { key: "roles", icon: "shield" },
  { key: "audit", icon: "activity" },
  { key: "minors", icon: "lock" },
];

export const STEPS: readonly LandingEntry[] = [
  { key: "workspace", icon: "plus" },
  { key: "roster", icon: "users" },
  { key: "day", icon: "check" },
];

export const FAQ_ITEMS = [
  "whatsapp",
  "money",
  "isolation",
  "guardian",
  "english",
  "video",
] as const;
export type FaqItem = (typeof FAQ_ITEMS)[number];

/** Hero trust chips. Wording is checked by `tests/unit/landing.test.ts`. */
export const HERO_TRUST = ["computed", "portals", "delivery"] as const;

/**
 * `true` once a real screenshot of the seeded demo workspace exists under
 * `public/landing/`. While it is false the hero renders an illustrative frame
 * with labels only, captioned as an illustration — never a drawn "screenshot".
 */
export const HAS_DEMO_SCREENSHOT = true;

export function demoScreenshotPath(locale: string): string {
  return `/landing/workspace-${locale === "en" ? "en" : "ar"}.png`;
}
