import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enJson from "../../messages/en.json";
import { LandingInteractiveWorkspace } from "@/components/landing/interactive-workspace";

/**
 * The landing illustration is a labelled demo, not a real workspace. These
 * tests render the real client component with the shipped English catalogue to
 * prove that the accessible tabs, sample controls and computed sample rate are
 * present in the markup without a browser or a network call.
 */
function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enJson} timeZone="UTC">
      <LandingInteractiveWorkspace />
    </NextIntlClientProvider>,
  );
}

describe("landing interactive workspace demo", () => {
  it("renders accessible demo screens instead of a hidden static illustration", () => {
    const html = render();

    expect(html).toMatch(/class="landing-hero-mock landing-v2-mock" data-demo="interactive"/);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);

    const panels = html.match(/<div class="landing-v2-mock__panel"[^>]*>/g) ?? [];
    expect(panels).toHaveLength(3);
    expect(panels.filter((panel) => panel.includes("hidden"))).toHaveLength(2);
  });

  it("computes the visible sample rate from the synthetic roster", () => {
    const html = render();

    expect(html).toContain("<strong>33%</strong>");
    expect(html).toContain("1 of 3 sample students marked present");
    expect(html).not.toContain("94.8%");
  });

  it("exposes every attendance control with a pressed state", () => {
    const html = render();

    for (const status of ["present", "absent", "late", "excused"]) {
      expect(html).toContain(`data-status="${status}"`);
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(html).toContain("Nothing is saved.");
  });
});
