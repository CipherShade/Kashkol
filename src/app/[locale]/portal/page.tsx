import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getPortalContext } from "@/modules/identity/session";
import { PortalSignInForm } from "@/components/portal/portal-signin-form";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { Icon } from "@/components/ui/icon";
import { getPreferredTheme } from "@/modules/identity/preferences";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Portal.signIn" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PortalPage({ params }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // An already-signed-in portal actor goes straight to their portal; nobody
  // else sees the sign-in form.
  const portal = await getPortalContext().catch(() => null);
  if (portal) {
    const isStudent = portal.grants.some((grant) => grant.kind === "student");
    redirect(`/${locale}/portal/${isStudent ? "student" : "parent"}`);
  }

  const t = await getTranslations("Portal.signIn");
  const app = await getTranslations("App");
  const preferredTheme = await getPreferredTheme().catch(() => null);

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link href="/" locale={locale} className="auth-brand">
          <span className="auth-brand-mark">
            <Icon name="target" size={20} />
          </span>
          <span className="auth-brand-text">
            <span className="auth-brand-name">{app("name")}</span>
            <span className="auth-brand-tagline">{app("tagline")}</span>
          </span>
        </Link>
        <div className="auth-topbar-actions">
          <LanguageSwitch />
          <ThemeSwitch initialTheme={preferredTheme ?? "system"} />
        </div>
      </header>
      <div className="mx-auto flex max-w-md flex-col justify-center pt-6">
        <section className="auth-card" aria-labelledby="portal-sign-in-title">
          <h1 id="portal-sign-in-title" className="auth-title">
            {t("title")}
          </h1>
          <p className="auth-subtitle">{t("subtitle")}</p>
          <PortalSignInForm locale={locale} />
        </section>
      </div>
    </main>
  );
}
