import { describe, expect, it } from "vitest";
import {
  normalizeSearchTerm,
  SEARCH_QUERY_MAX_LENGTH,
  searchFieldErrors,
  searchQuerySchema,
} from "@/modules/search/schemas";

describe("global search normalization", () => {
  it("removes diacritics and tatweel", () => {
    expect(normalizeSearchTerm("\u0623\u064e\u062d\u0652\u0645\u064e\u062f")).toBe(
      "\u0627\u062d\u0645\u062f",
    );
    expect(normalizeSearchTerm("\u0645\u0640\u0640\u0640\u062d\u0645\u062f")).toBe(
      "\u0645\u062d\u0645\u062f",
    );
  });

  it("folds the Arabic orthographic variants stored by the database key", () => {
    expect(normalizeSearchTerm("\u0645\u062f\u0631\u0633\u0629")).toBe(
      "\u0645\u062f\u0631\u0633\u0647",
    );
    expect(normalizeSearchTerm("\u0645\u0635\u0637\u0641\u0649")).toBe(
      "\u0645\u0635\u0637\u0641\u064a",
    );
    expect(normalizeSearchTerm("\u0645\u0624\u0645\u0646")).toBe("\u0645\u0648\u0645\u0646");
    expect(normalizeSearchTerm("\u0633\u0627\u0626\u0644")).toBe("\u0633\u0627\u064a\u0644");
  });

  it("maps Arabic-Indic and Extended Arabic-Indic digits to ASCII", () => {
    expect(normalizeSearchTerm("\u0637\u0627\u0644\u0628 \u0661\u0662\u0663")).toBe(
      "\u0637\u0627\u0644\u0628 123",
    );
    expect(normalizeSearchTerm("\u0637\u0627\u0644\u0628 \u06f1\u06f2\u06f3")).toBe(
      "\u0637\u0627\u0644\u0628 123",
    );
  });

  it("lowercases Latin text and collapses whitespace", () => {
    expect(normalizeSearchTerm("  NOUR   Ahmed  ")).toBe("nour ahmed");
  });
});

describe("global search query schema", () => {
  it("trims a search term", () => {
    expect(searchQuerySchema.parse({ q: "  nour  " })).toEqual({ q: "nour" });
  });

  it("rejects an empty or overlong term", () => {
    expect(searchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
    expect(
      searchQuerySchema.safeParse({ q: "x".repeat(SEARCH_QUERY_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("maps validation issues to a field key", () => {
    const parsed = searchQuerySchema.safeParse({ q: "" });
    if (parsed.success) throw new Error("expected validation to fail");
    expect(searchFieldErrors(parsed.error).q).toEqual(["errors.searchQueryRequired"]);
  });
});
