import { describe, expect, it } from "vitest";
import arJson from "../../messages/ar.json";
import enJson from "../../messages/en.json";
import { buildLandingMetadata, buildRobots, buildSitemap } from "@/lib/landing/seo";
import {
  FAQ_ITEMS,
  FEATURE_PILLARS,
  HERO_TRUST,
  INTELLIGENCE_STATS,
  LANDING_SECTIONS,
  PERSONAS,
  PRICING_FEATURES,
  PROBLEM_ITEMS,
  SOLUTION_ITEMS,
  STEPS,
} from "@/lib/landing/content";

type Obj = { readonly [key: string]: unknown };
function obj(value: unknown): Obj {
  expect(value).toBeTypeOf("object");
  return value as Obj;
}
function text(value: unknown): string {
  expect(value).toBeTypeOf("string");
  return value as string;
}
function list(value: unknown): readonly unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as readonly unknown[];
}
function allText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

const ar = obj(arJson);
const en = obj(enJson);
const arL = obj(ar.Landing);
const enL = obj(en.Landing);

describe("landing page contracts", () => {
  it("has Landing namespace parity and the reference section anchors", () => {
    expect(Object.keys(arL).sort()).toEqual(Object.keys(enL).sort());
    expect(LANDING_SECTIONS).toEqual([
      "problem",
      "features",
      "intelligence",
      "personas",
      "how-it-works",
      "pricing",
      "faq",
    ]);
    for (const L of [arL, enL]) {
      const nav = obj(L.nav);
      expect(Object.keys(nav).sort()).toEqual([...LANDING_SECTIONS, "label"].sort());
      for (const item of LANDING_SECTIONS) text(nav[item]);
    }
  });

  it("keeps the required Arabic hero headline and truthful trust points", () => {
    expect(text(obj(arL.hero).title)).toBe("شرح الدرس عليك، والباقي علينا.");
    expect(text(obj(enL.hero).title)).toBeTypeOf("string");
    for (const item of HERO_TRUST) {
      for (const L of [arL, enL]) text(obj(obj(L.hero).trust)[item]);
    }
  });

  it("covers problem mapping, intelligence, pillars, steps and personas", () => {
    for (const L of [arL, enL]) {
      for (const { key } of PROBLEM_ITEMS) {
        const item = obj(obj(obj(L.problem).items)[key]);
        text(item.title);
        text(item.body);
        text(item.tag);
      }
      for (const { key } of SOLUTION_ITEMS) {
        const item = obj(obj(obj(L.solution).items)[key]);
        text(item.label);
        text(item.title);
        text(item.body);
        text(item.benefit);
      }
      for (const { key } of INTELLIGENCE_STATS) {
        const stat = obj(obj(obj(L.intelligence).stats)[key]);
        text(stat.label);
        text(stat.value);
        text(stat.note);
      }
      for (const { key } of FEATURE_PILLARS) {
        const pillar = obj(obj(obj(L.features).pillars)[key]);
        text(pillar.title);
        text(pillar.body);
        text(pillar.previewTitle);
        expect(list(pillar.chips)).toHaveLength(3);
      }
      for (const { key } of STEPS) {
        text(obj(obj(obj(L.howItWorks).steps)[key]).title);
      }
      for (const { key } of PERSONAS) {
        text(obj(obj(obj(L.personas).items)[key]).title);
      }
    }
  });

  it("publishes the real 249 EGP manual subscription without inventing a plan", () => {
    for (const L of [arL, enL]) {
      const pricing = obj(L.pricing);
      expect(text(pricing.amount)).toBe("249");
      text(pricing.planName);
      text(pricing.cta);
      expect(list(pricing.items)).toHaveLength(PRICING_FEATURES.length);
      expect(text(obj(L.mobileCta).label)).toContain("249");
    }
    expect(text(obj(obj(ar.Auth).subscription).price)).toBe("٢٤٩");
    expect(text(obj(obj(en.Auth).subscription).price)).toBe("249");
    expect(text(obj(arL.pricing).currency)).toBe("جنيه مصري");
    expect(text(obj(enL.pricing).currency)).toBe("EGP");
  });

  it("labels every sample visual and makes no trial, unlimited, support or delivery claim", () => {
    for (const L of [arL, enL]) {
      const landing = allText(L);
      expect(landing).not.toContain("14 يوم");
      expect(landing).not.toContain("14-day");
      expect(landing).not.toContain("free trial");
      expect(landing).not.toContain("مجاناً");
      expect(landing).not.toContain("unlimited");
      expect(landing).not.toContain("غير محدود");
      expect(landing).not.toContain("daily whatsapp");
      expect(landing).not.toContain("دعم فني مصري");
      expect(landing).not.toContain("sent automatically");
      expect(landing).not.toContain("delivered automatically");
      expect(landing).not.toContain("أُرسل");
    }
    expect(text(obj(arL.hero).caption)).toContain("تجريبية");
    expect(text(obj(enL.hero).caption)).toMatch(/illustrative|synthetic/i);
    expect(text(obj(arL.intelligence).note)).toContain("تجريبية");
    expect(text(obj(enL.intelligence).note)).toMatch(/illustrative|synthetic/i);
    expect(text(obj(arL.features).previewNote)).toContain("تجريبية");
    expect(text(obj(enL.features).previewNote)).toMatch(/illustrative|synthetic/i);
    expect(text(obj(obj(arL.intelligence).stats).sampleMeta ?? "")).not.toMatch(/01\d{8,}/);
  });

  it("includes the four reference FAQs and both conversion routes", () => {
    expect(FAQ_ITEMS).toEqual(["audience", "start", "safety", "mobile"]);
    for (const L of [arL, enL]) {
      for (const item of FAQ_ITEMS) {
        const faq = obj(obj(obj(L.faq).items)[item]);
        text(faq.question);
        text(faq.answer);
      }
      const cta = obj(L.finalCta);
      text(cta.title);
      text(cta.primaryCta);
      expect(list(cta.notes)).toHaveLength(3);
      text(obj(L.mobileCta).cta);
    }
  });

  it("builds metadata/robots/sitemap for public landing only", () => {
    const meta = buildLandingMetadata({ locale: "ar", title: "T", description: "D", siteUrl: "https://kashkol.example" });
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/ar");
    const robots = buildRobots("https://kashkol.example");
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const disallow = rules.flatMap((r) => r.disallow ?? []);
    expect(disallow).toContain("/ar/app");
    const sitemap = buildSitemap("https://kashkol.example", new Date("2026-01-01T00:00:00Z"));
    expect(sitemap.map((e) => e.url)).toEqual(["https://kashkol.example/ar", "https://kashkol.example/en"]);
  });
});
