export type PreferredTheme = "light" | "dark" | "system" | null;
export type ResolvedTheme = "light" | "dark";

/** Cookie names shared by the pre-paint script, the switch, and the server. */
export const THEME_COOKIE = "kashkol-theme";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: unknown): value is "light" | "dark" | "system" {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * The preference the theme switch may render before the browser has been
 * consulted. It must never read the document: the first client render has to
 * match the server markup exactly, otherwise React discards the hydrated tree
 * and — in development — the page reloads in a loop. A value only the browser
 * can see is adopted after hydration by `initialThemeFromDocument`.
 */
export function initialThemePreference(
  preference: PreferredTheme,
): "light" | "dark" | "system" {
  return isThemePreference(preference) ? preference : "system";
}

/** `system` follows the operating system; an explicit choice wins. */
export function resolveTheme(
  preference: PreferredTheme,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}

/**
 * The pre-paint theme script. A signed-in user's stored preference wins; an
 * anonymous visitor keeps the existing localStorage or cookie value; `system`
 * (or no value) resolves through `prefers-color-scheme`. The script is inline
 * and runs before the first paint, so a dark preference does not flash light.
 */
export function buildThemeScript(preferred: PreferredTheme): string {
  // Escape `<` so a stored value can never close the inline script element.
  const embedded = JSON.stringify(preferred).replace(/</g, "\\u003c");
  return `
(function () {
  try {
    var preferred = ${embedded};
    var stored = preferred;
    if (!stored) {
      try { stored = localStorage.getItem("${THEME_COOKIE}"); } catch (_) {}
      if (!stored) {
        var match = document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
        stored = match ? decodeURIComponent(match[1]) : null;
      }
    }
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "light" || stored === "dark" ? stored : (dark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
})();
`;
}
