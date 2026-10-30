import { z } from "zod";

export const SEARCH_RESULTS_PER_TYPE = 5;
export const SEARCH_QUERY_MAX_LENGTH = 80;

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "errors.searchQueryRequired")
    .max(SEARCH_QUERY_MAX_LENGTH, "errors.searchQueryTooLong"),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchStudent = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
};

export type SearchGroup = {
  id: string;
  name: string;
  grade: string | null;
  subjectName: string | null;
};

export type SearchResults = {
  students: SearchStudent[];
  groups: SearchGroup[];
};

// The ranges are Arabic combining marks, intentionally stripped from search keys.
// eslint-disable-next-line no-misleading-character-class
const ARABIC_DIACRITICS = /[\u0640\u064b-\u0655\u0670]/g;
const ORTHOGRAPHIC_VARIANTS: Readonly<Record<string, string>> = {
  "\u0623": "\u0627",
  "\u0625": "\u0627",
  "\u0622": "\u0627",
  "\u0671": "\u0627",
  "\u0649": "\u064a",
  "\u0629": "\u0647",
  "\u0624": "\u0648",
  "\u0626": "\u064a",
};

/**
 * Mirror of the database `normalize_arabic` function, so the same term that is
 * sent to the API matches the derived `search_key` columns.
 */
export function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
      const code = digit.charCodeAt(0);
      const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
      return String(code - base);
    })
    .replace(/[\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626]/g, (letter) => {
      return ORTHOGRAPHIC_VARIANTS[letter] ?? letter;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function searchFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!key) continue;
    fields[key] ??= [];
    fields[key].push(issue.message);
  }
  return fields;
}
