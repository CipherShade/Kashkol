"use client";

import {
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  resolveTheme,
  type PreferredTheme,
  type ResolvedTheme,
} from "./theme";

/**
 * Apply a theme choice immediately: the root attribute, the native
 * `color-scheme`, the browser cookie, and localStorage. The server row is
 * written separately by the `saveThemePreference` action.
 */
export function applyThemePreference(mode: "light" | "dark" | "system"): ResolvedTheme {
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(mode, prefersDark);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
    document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  try {
    window.localStorage.setItem(THEME_COOKIE, mode);
  } catch {
    // A blocked storage API must not break the control.
  }

  return resolved;
}

/** Re-apply the resolved theme when the OS preference changes under `system`. */
export function watchSystemTheme(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => callback();
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function initialThemeFromDocument(fallback: PreferredTheme): "light" | "dark" | "system" {
  if (fallback === "light" || fallback === "dark" || fallback === "system") return fallback;
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.getAttribute("data-theme");
  return value === "dark" || value === "light" ? value : "system";
}
