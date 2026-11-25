import { describe, expect, it } from "vitest";
import arJson from "../../messages/ar.json";
import enJson from "../../messages/en.json";
import {
  buildLandingMetadata,
  buildRobots,
  buildSitemap,
} from "@/lib/landing/seo";
import { CHALLENGE_ITEMS, FAQ_ITEMS, PROOF_ITEMS, STEPS } from "@/lib/landing/content";

type ChallengeItem = {
  number: string;
  nav: string;
  title: string;
  problemHeadline: string;
  problemBody: string;
  solutionHeadline: string;
  solutionBody: string;
  solutionDetail: string;
  showcase: string;
  points: string[];
};

type LandingCatalogue = {
  Landing: {
    challenges: {
      problemLabel: string;
      solutionLabel: string;
      featureLabel: string;
      items: Record<string, ChallengeItem>;
    };
    proof: { items: Record<string, { title: string; body: string }> };
    how: { items: Record<string, { title: string; body: string }> };
    faq: { items: Record<string, { question: string; answer: string }> };
  };
};
const ar = arJson as unknown as LandingCatalogue;
const en = enJson as unknown as LandingCatalogue;

const arChallenges = ar.Landing.challenges.items;
const enChallenges = en.Landing.challenges.items;
const arProof = ar.Landing.proof.items;
const enProof = en.Landing.proof.items;
const arSteps = ar.Landing.how.items;
const enSteps = en.Landing.how.items;
const arFaq = ar.Landing.faq.items;
const enFaq = en.Landing.faq.items;

describe("landing page contracts", () => {
  it("ships the Landing namespace in both message catalogues with parity", () => {
    expect(ar.Landing).toBeDefined();
    expect(en.Landing).toBeDefined();

    const arKeys = Object.keys(ar.Landing);
    const enKeys = Object.keys(en.Landing);
    expect(arKeys.sort()).toEqual(enKeys.sort());
  });

  it("contains all required landing keys in catalogues", () => {
    expect(ar.Landing.challenges.problemLabel).toBeTypeOf("string");
    expect(ar.Landing.challenges.solutionLabel).toBeTypeOf("string");
    expect(ar.Landing.challenges.featureLabel).toBeTypeOf("string");
    expect(en.Landing.challenges.problemLabel).toBeTypeOf("string");
    expect(en.Landing.challenges.solutionLabel).toBeTypeOf("string");
    expect(en.Landing.challenges.featureLabel).toBeTypeOf("string");

    for (const { key } of CHALLENGE_ITEMS) {
      for (const [locale, items] of [
        ["ar", arChallenges],
        ["en", enChallenges],
      ] as const) {
        const item = items[key];
        expect(item, `${locale}.${key}`).toBeDefined();
        expect(item.number, `${locale}.${key}.number`).toBeTypeOf("string");
        expect(item.nav, `${locale}.${key}.nav`).toBeTypeOf("string");
        expect(item.title, `${locale}.${key}.title`).toBeTypeOf("string");
        expect(item.problemHeadline, `${locale}.${key}.problemHeadline`).toBeTypeOf("string");
        expect(item.problemBody, `${locale}.${key}.problemBody`).toBeTypeOf("string");
        expect(item.solutionHeadline, `${locale}.${key}.solutionHeadline`).toBeTypeOf("string");
        expect(item.solutionBody, `${locale}.${key}.solutionBody`).toBeTypeOf("string");
        expect(item.solutionDetail, `${locale}.${key}.solutionDetail`).toBeTypeOf("string");
        expect(item.showcase, `${locale}.${key}.showcase`).toBeTypeOf("string");
        expect(Array.isArray(item.points), `${locale}.${key}.points`).toBe(true);
        expect(item.points.length, `${locale}.${key}.points.length`).toBeGreaterThan(0);
      }
    }

    for (const { key } of PROOF_ITEMS) {
      expect(arProof[key].title).toBeTypeOf("string");
      expect(arProof[key].body).toBeTypeOf("string");
      expect(enProof[key].title).toBeTypeOf("string");
      expect(enProof[key].body).toBeTypeOf("string");
    }

    for (const { key } of STEPS) {
      expect(arSteps[key].title).toBeTypeOf("string");
      expect(arSteps[key].body).toBeTypeOf("string");
      expect(enSteps[key].title).toBeTypeOf("string");
      expect(enSteps[key].body).toBeTypeOf("string");
    }

    for (const item of FAQ_ITEMS) {
      expect(arFaq[item].question).toBeTypeOf("string");
      expect(arFaq[item].answer).toBeTypeOf("string");
      expect(enFaq[item].question).toBeTypeOf("string");
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
