import { cookies } from "next/headers";
import { THEME_COOKIE, isThemePreference } from "@/lib/theme";
import {
  deleteSessionsForUser,
  findActiveMemberships,
  findUserPreference,
  findWorkspaceTheme,
  upsertUserPreference,
} from "./repository";
import { getOptionalUser } from "./session";

export type UserPreferences = {
  locale: "ar" | "en";
  theme: "light" | "dark" | "system";
};

export const DEFAULT_PREFERENCES: UserPreferences = { locale: "ar", theme: "system" };

/**
 * Persist the per-user locale and theme (`F-P0-03`, `F-P0-04`). They live on
 * the user, not the workspace, so they survive a workspace switch in M2.
 */
export async function saveUserPreference(
  userId: string,
  preference: UserPreferences,
): Promise<void> {
  await upsertUserPreference(userId, preference);
}

/** Read the signed-in user's saved preferences, falling back to the defaults. */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const preference = await findUserPreference(userId);
  if (!preference) return DEFAULT_PREFERENCES;
  return {
    locale: preference.locale === "en" ? "en" : "ar",
    theme: isThemePreference(preference.theme) ? preference.theme : "system",
  };
}

/** "Sign out everywhere" (`F-P0-02` AC-6): every session row for the user. */
export async function signOutEverywhere(userId: string): Promise<number> {
  return deleteSessionsForUser(userId);
}

/**
 * The signed-in user's saved theme takes precedence over the workspace default.
 * Anonymous visitors fall back to the theme cookie and then to localStorage/system.
 */
export async function getPreferredTheme(): Promise<"light" | "dark" | "system" | null> {
  const user = await getOptionalUser();
  if (user) {
    const preference = await findUserPreference(user.id);
    if (preference && isThemePreference(preference.theme)) return preference.theme;
    const membership = (await findActiveMemberships(user.id))[0];
    if (membership) {
      const workspaceTheme = await findWorkspaceTheme(membership.workspaceId);
      if (workspaceTheme && isThemePreference(workspaceTheme)) return workspaceTheme;
    }
  }

  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(THEME_COOKIE)?.value;
    if (isThemePreference(value)) return value;
  } catch {
    // Outside a request context (for example a build-time import) there is no
    // cookie store; the inline script still resolves system/localStorage.
  }

  return null;
}
