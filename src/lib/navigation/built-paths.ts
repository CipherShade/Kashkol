/**
 * The application paths that exist in every build. A production build exposes
 * only these; a planned module is a development-only preview and must be a
 * real 404 in production, not a streamed soft-404.
 *
 * This module is pure and imported by the proxy, so it carries no database or
 * React dependency.
 */
export const BUILT_APP_PATHS = [
  "/app",
  "/app/settings",
  "/app/account",
  "/app/students",
  "/app/groups",
  "/app/sessions",
  "/app/homework",
  "/app/assessments",
  "/app/payments",
  "/app/files",
  "/app/reports",
  "/app/follow-ups",
  "/app/audit",
  "/app/team",
  "/app/parent-updates",
] as const;

const BUILT_DETAIL_ROOTS = [
  "/app/students",
  "/app/groups",
  "/app/sessions",
] as const;

export function stripLocale(pathname: string): string {
  const stripped = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] ?? pathname;
  const stripped = stripLocale(withoutQuery);
  const normalized = stripped.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

export function isAppPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === "/app" || normalized.startsWith("/app/");
}

export function isBuiltAppPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if ((BUILT_APP_PATHS as readonly string[]).includes(normalized)) return true;

  return BUILT_DETAIL_ROOTS.some((root) => {
    if (!normalized.startsWith(`${root}/`)) return false;
    const rest = normalized.slice(root.length + 1);
    return rest.length > 0 && !rest.includes("/");
  });
}

export function localeFromPath(pathname: string): "ar" | "en" | null {
  const match = pathname.match(/^\/(ar|en)(?=\/|$)/);
  return match ? (match[1] as "ar" | "en") : null;
}
