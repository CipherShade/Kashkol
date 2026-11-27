import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesDir = path.join(process.cwd(), "src", "styles");
const tokensCss = readFileSync(path.join(stylesDir, "tokens.css"), "utf8");
const landingCss = readFileSync(path.join(stylesDir, "landing.css"), "utf8");
const sectionsSource = readFileSync(
  path.join(process.cwd(), "src", "components", "landing", "sections.tsx"),
  "utf8",
);
const heroSource = readFileSync(
  path.join(process.cwd(), "src", "components", "landing", "hero.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  path.join(process.cwd(), "src", "app", "[locale]", "page.tsx"),
  "utf8",
);

function declarations(marker: string): Record<string, string> {
  let idx = 0;
  while (idx < tokensCss.length) {
    const start = tokensCss.indexOf(marker, idx);
    if (start < 0) break;
    const open = tokensCss.indexOf("{", start);
    const close = tokensCss.indexOf("}", open);
    const block = tokensCss.slice(open + 1, close);
    const found: Record<string, string> = {};
    for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) found[name] = value;
    if (found["--ink"] && found["--bg"]) return found;
    idx = close + 1;
  }
  throw new Error(`missing token block: ${marker}`);
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
const PAIRS = [["--ink","--bg"],["--muted","--bg"],["--primary-strong","--surface"],["--primary-contrast","--primary"],["--card-invert-ink","--card-invert-bg"]] as const;

describe("landing theme token contrast", () => {
  for (const [mode, marker] of [["light", ":root {"], ["dark", ':root[data-theme="dark"]']] as const) {
    it(`keeps ${mode} foreground readable`, () => {
      const tokens = declarations(marker);
      for (const [fg, bg] of PAIRS) {
        expect(tokens[fg], fg).toBeDefined();
        expect(tokens[bg], bg).toBeDefined();
        expect(contrast(tokens[fg], tokens[bg]), `${mode} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("landing reference structure", () => {
  it("renders every reference section in order", () => {
    for (const name of [
      "LandingProblem",
      "LandingSolution",
      "LandingIntelligence",
      "LandingFeatures",
      "LandingHowItWorks",
      "LandingPersonas",
      "LandingPricing",
      "LandingFaq",
      "LandingFinalCta",
    ]) {
      expect(sectionsSource).toContain(name);
      expect(pageSource).toContain(name);
    }
    const at = (name: string) => pageSource.lastIndexOf(`<${name}`);
    expect(at("LandingProblem")).toBeLessThan(at("LandingSolution"));
    expect(at("LandingSolution")).toBeLessThan(at("LandingIntelligence"));
    expect(at("LandingIntelligence")).toBeLessThan(at("LandingFeatures"));
    expect(at("LandingFinalCta")).toBeGreaterThan(at("LandingFaq"));
  });

  it("keeps sample-data labels beside every product illustration", () => {
    expect(heroSource).toContain("landing-preview__caption");
    expect(heroSource).toContain('t("hero.caption")');
    expect(sectionsSource).toContain('t("note")');
    expect(sectionsSource).toContain('t("previewNote")');
    expect(landingCss).toContain(".landing-v2-sample-note");
  });

  it("makes no fake WhatsApp delivery or payment claim in source", () => {
    const source = sectionsSource + heroSource;
    expect(source).not.toMatch(/sent automatically|delivered automatically|message delivered/i);
    expect(source).not.toMatch(/14.day|free trial/i);
  });

  it("has responsive reference CSS hooks", () => {
    for (const cls of [
      ".landing-v2-topbar",
      ".landing-v2-mock",
      ".landing-v2-grid--problems",
      ".landing-v2-spotlight",
      ".landing-v2-pricing",
      ".landing-v2-mobile-cta",
    ]) {
      expect(landingCss).toContain(cls);
    }
    expect(landingCss).toMatch(/@media \(max-width:\s*980px\)/);
    expect(landingCss).toMatch(/@media \(max-width:\s*720px\)/);
    expect(landingCss).toMatch(/@media \(max-width:\s*640px\)/);
  });
});
