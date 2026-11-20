import type { TrendClassification } from "@/modules/performance/calculations";

/** Presentation-only formatting. Every value passed here was computed from source records. */
export function formatPerformancePercent(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatPerformanceNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB").format(value);
}

export function formatPerformanceDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function trendTranslationKey(
  classification: TrendClassification,
): `Performance.trends.${TrendClassification}` {
  return `Performance.trends.${classification}`;
}
