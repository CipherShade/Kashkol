import { describe, expect, it } from "vitest";
import arJson from "../../messages/ar.json";
import enJson from "../../messages/en.json";
import {
  buildLandingMetadata,
  buildRobots,
  buildSitemap,
} from "@/lib/landing/seo";
import { PROBLEM_ROWS, TRUTH_ITEMS, GAP_ITEMS, SECURITY_ITEMS, STEPS, FAQ_ITEMS } from "@/lib/landing/content";

type LandingCatalogue = {
  Landing: {
    truth: { items: Record<string, string> };
    problems: { items: Record<string, { problem: string; solution: string }> };
    gap: { items: Record<string, { title: string; body: string }> };
    security: { items: Record<string, string> };
    how: { items: Record<string, { title: string; body: string }> };
    faq: { items: Record<string, { question: string; answer: string }> };
  };
};
const ar = arJson as unknown as LandingCatalogue;
const en = enJson as unknown as LandingCatalogue;

type StringMap = Record<string, string>;
type ProblemMap = Record<string, { problem: string; solution: string }>;
type TitleBodyMap = Record<string, { title: string; body: string }>;

const truthItems = ar.Landing.truth.items as StringMap;
const enTruthItems = en.Landing.truth.items as StringMap;
const arProblems = ar.Landing.problems.items as ProblemMap;
const enProblems = en.Landing.problems.items as ProblemMap;
const arGap = ar.Landing.gap.items as TitleBodyMap;
const enGap = en.Landing.gap.items as TitleBodyMap;
const arSecurity = ar.Landing.security.items as StringMap;
const enSecurity = en.Landing.security.items as StringMap;
const arSteps = ar.Landing.how.items as TitleBodyMap;
const enSteps = en.Landing.how.items as TitleBodyMap;
const arFaq = ar.Landing.faq.items as Record<string, { question: string; answer: string }>;
const enFaq = en.Landing.faq.items as Record<string, { question: string; answer: string }>;

describe("landing page contracts", () => {
  it("ships the Landing namespace in both message catalogues with parity", () => {
    expect(ar.Landing).toBeDefined();
    expect(en.Landing).toBeDefined();

    const arKeys = Object.keys(ar.Landing);
    const enKeys = Object.keys(en.Landing);
    expect(arKeys.sort()).toEqual(enKeys.sort());
  });

  it("contains all required problem and truth keys in catalogues", () => {
    for (const { key } of TRUTH_ITEMS) {
      expect(truthItems[key]).toBeTypeOf("string");
      expect(enTruthItems[key]).toBeTypeOf("string");
    }

    for (const { key } of PROBLEM_ROWS) {
      expect(arProblems[key].problem).toBeTypeOf("string");
      expect(arProblems[key].solution).toBeTypeOf("string");
      expect(enProblems[key].problem).toBeTypeOf("string");
      expect(enProblems[key].solution).toBeTypeOf("string");
    }

    for (const { key } of GAP_ITEMS) {
      expect(arGap[key].title).toBeTypeOf("string");
      expect(enGap[key].title).toBeTypeOf("string");
    }

    for (const { key } of SECURITY_ITEMS) {
      expect(arSecurity[key]).toBeTypeOf("string");
      expect(enSecurity[key]).toBeTypeOf("string");
    }

    for (const { key } of STEPS) {
      expect(arSteps[key].title).toBeTypeOf("string");
      expect(enSteps[key].title).toBeTypeOf("string");
    }

    for (const item of FAQ_ITEMS) {
      expect(arFaq[item].question).toBeTypeOf("string");
      expect(enFaq[item].answer).toBeTypeOf("string");
    }
  });

  it("builds correct metadata with canonical and hreflang alternates", () => {
    const meta = buildLandingMetadata({
      locale: "ar",
      title: "Test Title",
      description: "Test Desc",
      siteUrl: "https://kashkol.example",
    });

    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/ar");
    expect(meta.alternates?.languages).toMatchObject({
      ar: "/ar",
      en: "/en",
      "x-default": "/ar",
    });
  });

  it("builds robots rules disallowing private paths", () => {
    const robots = buildRobots("https://kashkol.example");
    expect(robots.sitemap).toBe("https://kashkol.example/sitemap.xml");
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const disallow = rules.flatMap((r) => r.disallow ?? []);
    expect(disallow).toContain("/ar/app");
    expect(disallow).toContain("/en/portal");
  });

  it("builds sitemap entries for public landing paths only", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const sitemap = buildSitemap("https://kashkol.example", date);
    expect(sitemap).toHaveLength(2);
    expect(sitemap.map((e) => e.url)).toEqual([
      "https://kashkol.example/ar",
      "https://kashkol.example/en",
    ]);
  });
});
