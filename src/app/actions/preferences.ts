"use server";

import { cookies, headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import {
  LOCALE_COOKIE,
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  isThemePreference,
} from "@/lib/theme";
import { getOptionalUser } from "@/modules/identity/session";
import { getUserPreferences, saveUserPreference } from "@/modules/identity/preferences";

export type PreferenceResult = { ok: boolean };

function cookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
  };
}

async function guardOrigin(): Promise<boolean> {
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist the language choice. The cookie is the browser-level preference and
 * `NEXT_LOCALE` is the value next-intl reads when it resolves an unprefixed
 * path; the `user_preference` row is the per-account preference. A signed-out
 * visitor gets the cookie only.
 */
export async function saveLocalePreference(locale: string): Promise<PreferenceResult> {
  if (locale !== "ar" && locale !== "en") return { ok: false };
  if (!(await guardOrigin())) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, cookieOptions());

  try {
    const user = await getOptionalUser();
    if (!user) return { ok: true };
    const current = await getUserPreferences(user.id);
    await saveUserPreference(user.id, { locale, theme: current.theme });
    return { ok: true };
  } catch {
    // The cookie already carries the choice; a failed database write must not
    // block the navigation or leave the interface in a half-switched state.
    return { ok: true };
  }
}

/** Persist the theme choice for the browser and, when signed in, the user. */
export async function saveThemePreference(theme: string): Promise<PreferenceResult> {
  if (!isThemePreference(theme)) return { ok: false };
  if (!(await guardOrigin())) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, cookieOptions());

  try {
    const user = await getOptionalUser();
    if (!user) return { ok: true };
    const current = await getUserPreferences(user.id);
    await saveUserPreference(user.id, { locale: current.locale, theme });
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
