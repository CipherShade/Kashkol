import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { CreateWorkspaceForm } from "@/components/workspace/forms";
import { Icon } from "@/components/ui/icon";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { routing } from "@/i18n/routing";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { getStaffGate, type StaffGate } from "@/modules/identity/session";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string }> };

export default async function NewWorkspacePage({ params }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  let gate: StaffGate;
  try {
    gate = await getStaffGate();
  } catch {
    redirect(`/${locale}/sign-in?error=portal`);
  }

  if (gate.state === "anonymous") redirect(`/${locale}/sign-in`);
  if (gate.state === "staff") redirect(`/${locale}/app`);

  const t = await getTranslations("Workspace");
  const app = await getTranslations("App");
  const preferredTheme = await getPreferredTheme().catch(() => null);

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <Icon name="target" size={20} />
          </span>
          <span className="auth-brand-text">
            <span className="auth-brand-name">{app("name")}</span>
            <span className="auth-brand-tagline">{app("tagline")}</span>
          </span>
        </div>
        <div className="auth-topbar-actions">
          <LanguageSwitch />
          <ThemeSwitch initialTheme={preferredTheme ?? "system"} />
        </div>
      </header>
      <div className="auth-shell">
        <section className="auth-card" aria-labelledby="create-workspace-title">
          <h1 id="create-workspace-title" className="auth-title">
            {t("createTitle")}
          </h1>
          <p className="auth-subtitle">{t("createSubtitle")}</p>
          <CreateWorkspaceForm locale={locale} />
        </section>
      </div>
    </main>
  );
}
