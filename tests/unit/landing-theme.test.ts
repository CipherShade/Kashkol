import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The landing page is the only public surface. Its soft-surface trust band and
 * the calculator's filled stat card use foreground/background pairs that can
 * silently collapse to the same colour when a token or the cascade changes.
 * These assertions run without a browser or a build so a regression is caught
 * in the unit gate.
 */
const stylesDir = path.join(process.cwd(), "src", "styles");
const tokensCss = readFileSync(path.join(stylesDir, "tokens.css"), "utf8");
const landingCss = readFileSync(path.join(stylesDir, "landing.css"), "utf8");

function declarations(marker: string): Record<string, string> {
  const start = tokensCss.indexOf(marker);
  if (start < 0) throw new Error(`missing token block: ${marker}`);
  const open = tokensCss.indexOf("{", start);
  const close = tokensCss.indexOf("}", open);
  const found: Record<string, string> = {};
  for (const [, name, value] of tokensCss
    .slice(open + 1, close)
    .matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    found[name] = value;
  }
  return found;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

const PAIRS = [
  ["--ink", "--bg"],
  ["--muted", "--bg"],
  ["--primary-strong", "--surface"],
  ["--danger-ink", "--surface"],
  ["--accent-ink", "--accent-tint"],
  ["--card-invert-ink", "--card-invert-bg"],
  ["--card-invert-muted", "--card-invert-bg"],
  ["--primary-contrast", "--primary"],
] as const;

describe("landing theme token contrast", () => {
  for (const [mode, marker] of [
    ["light", ":root {"],
    ["dark", ':root[data-theme="dark"]'],
  ] as const) {
    it(`keeps every ${mode} foreground readable on its background`, () => {
      const tokens = declarations(marker);
      for (const [foreground, background] of PAIRS) {
        expect(
          tokens[foreground],
          `${mode} missing ${foreground}`,
        ).toBeDefined();
        expect(
          tokens[background],
          `${mode} missing ${background}`,
        ).toBeDefined();
        expect(
          contrast(tokens[foreground], tokens[background]),
          `${mode} ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("landing cascade rules", () => {
  it("paints the trust band on a soft token surface with ink headings", () => {
    const band = landingCss.match(/\.landing-truth \{([^}]*)\}/)?.[1];
    expect(band).toBeDefined();
    expect(band).toContain("background: color-mix(in srgb, var(--primary-tint)");
    expect(band).toContain("color: var(--ink)");

    const title = landingCss.match(/\.landing-truth__title \{([^}]*)\}/)?.[1];
    expect(title).toBeDefined();
    expect(title).toContain("color: var(--ink)");
  });

  it("keeps the trust-card motion subtle and reduced-motion aware", () => {
    expect(landingCss).toMatch(
      /\.landing-truth__item:hover \{[\s\S]*?transform: translateY\(-3px\)/,
    );
    expect(landingCss).toMatch(
      /\.landing-truth__item:hover \.landing-truth__visual \{[\s\S]*?transform: translateY\(-2px\)/,
    );
    expect(landingCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(landingCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.landing-truth__item:hover,\s*\.landing-truth__item:hover \.landing-truth__visual \{\s*transform: none;/,
    );
  });

  it("uses readable colour for step numbers instead of a border token", () => {
    const rule = landingCss.match(/^\.landing-step__number\s*\{([^}]*)\}/m)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toContain("color: var(--muted)");
    expect(rule).not.toContain("color: var(--border-strong)");
  });

  it("lets the calculator hero card keep its filled background", () => {
    expect(landingCss).toContain(
      ".landing-calculator__stat-card.landing-calculator__stat-card--hero {",
    );
  });

  it("does not hardcode red label colours that fail in dark mode", () => {
    expect(landingCss).not.toContain("#dc2626");
    expect(landingCss).not.toContain("#ef4444");
  });
});
