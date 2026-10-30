import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { NAV_GROUPS, isDevelopmentBuild, visibleNavGroups } from "@/lib/navigation/nav";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { getStaffGate, type StaffGate } from "@/modules/identity/session";
import { getWorkspaceIdentity } from "@/modules/tenancy/service";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  let gate: StaffGate;
  try {
    gate = await getStaffGate();
  } catch (error) {
    const reason =
      error instanceof AppError && error.messageKey === "errors.portalActor"
        ? "portal"
        : "forbidden";
    redirect(`/${locale}/sign-in?error=${reason}`);
  }

  if (gate.state === "anonymous") redirect(`/${locale}/sign-in`);
  if (gate.state === "no_workspace") redirect(`/${locale}/workspace/new`);

  let workspace;
  try {
    workspace = await getWorkspaceIdentity(gate.scope);
  } catch {
    redirect(`/${locale}/sign-in?error=forbidden`);
  }

  const [shell, nav, workspaceT, preferredTheme] = await Promise.all([
    getTranslations("Shell"),
    getTranslations("Nav"),
    getTranslations("Workspace"),
    getPreferredTheme().catch(() => null),
  ]);

  const settingsVisible = isAllowed(gate.scope, "settings", "read");
  const searchVisible =
    isAllowed(gate.scope, "students", "read") ||
    isAllowed(gate.scope, "grades", "read");
  const roleLabel =
    gate.scope.role === "owner" ? workspaceT("roleOwner") : workspaceT("roleAssistant");
  const groups = visibleNavGroups(gate.scope, {
    includePlanned: isDevelopmentBuild(),
    label: (key) => nav(key),
  });

  const labels: Record<string, string> = {
    "/app": nav("items.dashboard"),
    "/app/account": shell("account"),
    "/app/settings": nav("items.settings"),
  };
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      labels[item.href] = nav(item.labelKey);
    }
  }

  return (
    <AppShell
      groups={groups}
      labels={labels}
      locale={locale}
      workspace={{ name: workspace.name, slug: workspace.slug }}
      user={{ name: gate.user.name, email: gate.user.email }}
      roleLabel={roleLabel}
      settingsVisible={settingsVisible}
      searchVisible={searchVisible}
      initialTheme={preferredTheme ?? "system"}
    >
      {children}
    </AppShell>
  );
}
