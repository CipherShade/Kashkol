import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAuthenticatedUser } from "@/modules/identity/session";
import { resolvePlatformAdminForUser } from "@/modules/platform-admin";
import { PlatformAdminConsole } from "@/components/platform-admin/PlatformAdminConsole";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await getAuthenticatedUser();
  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const t = await getTranslations("PlatformAdmin");

  try {
    await resolvePlatformAdminForUser(user);
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-canvas)] p-6 text-[var(--color-text-primary)]">
        <div
          role="alert"
          className="max-w-md rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] font-mono text-lg font-bold text-[var(--color-danger)]">
            403
          </div>
          <h1 className="mt-4 text-lg font-bold">{t("forbiddenTitle")}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t("forbiddenBody")}</p>
          <div className="mt-6">
            <Link
              href="/app"
              className="inline-flex items-center rounded-md bg-[var(--color-accent-primary)] px-4 py-2 text-xs font-semibold text-white"
            >
              {t("backToApp")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <PlatformAdminConsole />;
}
