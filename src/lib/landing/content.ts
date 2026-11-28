import type { IconName } from "@/components/ui/icon";

/**
 * Landing page structure for the public marketing surface.
 *
 * The visual direction comes from the Stitch teacher-platform reference
 * (`ADR-0044`). The copy describes shipped behaviour only: every illustrative
 * number is labelled as synthetic sample data, and no unverified commercial
 * promise (trial length, migration service, support channel) is published.
 */

export type LandingEntry = {
  readonly key: string;
  readonly icon: IconName;
};

/** Same-page anchors used by the announcement bar, header, footer and sections. */
export const LANDING_SECTIONS = [
  "problem",
  "features",
  "intelligence",
  "personas",
  "how-it-works",
  "pricing",
  "faq",
] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

export const NAV_ITEMS: readonly { key: LandingSection }[] = LANDING_SECTIONS.map((key) => ({ key }));

/** Hero trust points. All three describe real product behaviour. */
export const HERO_TRUST = ["records", "bilingual", "isolated"] as const;

/** Five everyday frustrations, ordered as in the reference design. */
export const PROBLEM_ITEMS: readonly LandingEntry[] = [
  { key: "scattered", icon: "folder" },
  { key: "attendance", icon: "clock" },
  { key: "visibility", icon: "bar" },
  { key: "groups", icon: "users" },
  { key: "receipts", icon: "wallet" },
];

/** Problem-to-solution mapping shown immediately after the problems. */
export const SOLUTION_ITEMS: readonly LandingEntry[] = [
  { key: "dossier", icon: "user" },
  { key: "attendance", icon: "qr" },
  { key: "attention", icon: "activity" },
  { key: "schedule", icon: "calendar" },
  { key: "receipts", icon: "file" },
];

/** Four metrics on the illustrative student spotlight card. */
export const INTELLIGENCE_STATS = [
  { key: "attendance", icon: "checkCircle" },
  { key: "average", icon: "bar" },
  { key: "homework", icon: "book" },
  { key: "rank", icon: "users" },
] as const satisfies readonly LandingEntry[];

/** Six illustrative quiz points on the spotlight chart. */
export const INTELLIGENCE_QUIZZES = [1, 2, 3, 4, 5, 6] as const;

/** Four operational pillars. Each preview contains sample data only. */
export const FEATURE_PILLARS: readonly LandingEntry[] = [
  { key: "students", icon: "users" },
  { key: "attendance", icon: "qr" },
  { key: "exams", icon: "book" },
  { key: "receipts", icon: "wallet" },
];

/** The three onboarding steps. */
export const STEPS: readonly LandingEntry[] = [
  { key: "account", icon: "plus" },
  { key: "roster", icon: "users" },
  { key: "day", icon: "grid" },
];

/** Four teacher profiles. */
export const PERSONAS: readonly LandingEntry[] = [
  { key: "independent", icon: "user" },
  { key: "multiCenter", icon: "grid" },
  { key: "highVolume", icon: "bar" },
  { key: "withAssistants", icon: "staff" },
];

/**
 * Features included with the free teacher account. Usage billing is described
 * in the pricing copy; `/subscribe` no longer exists. No card is charged, no
 * transfer is detected, and no trial is promised.
 */
export const PRICING_FEATURES = [
  "students",
  "attendance",
  "learning",
  "attention",
  "assistants",
  "reports",
  "bilingual",
] as const;
export type PricingFeature = (typeof PRICING_FEATURES)[number];

/** Four FAQ entries, matching the reference design's accordion. */
export const FAQ_ITEMS = ["audience", "start", "safety", "mobile"] as const;
export type FaqItem = (typeof FAQ_ITEMS)[number];
