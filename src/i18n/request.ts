import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing, type AppLocale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

/** Locale for non-localised API routes. Only the first Accept-Language tag is trusted. */
export function localeFromHeader(value: string | null): AppLocale {
  const requested = value?.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
}
