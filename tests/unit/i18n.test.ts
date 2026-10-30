import { describe, expect, it } from "vitest";
import { directionForLocale, routing } from "@/i18n/routing";

describe("locale routing", () => {
  it("ships Arabic and English with Arabic as the default", () => {
    expect(routing.locales).toEqual(["ar", "en"]);
    expect(routing.defaultLocale).toBe("ar");
    expect(routing.localePrefix).toBe("always");
  });

  it("maps direction from locale", () => {
    expect(directionForLocale("ar")).toBe("rtl");
    expect(directionForLocale("en")).toBe("ltr");
  });
});
