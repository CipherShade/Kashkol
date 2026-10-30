import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { Icon } from "@/components/ui/icon";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getPreferredTheme } from "@/modules/identity/preferences";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
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
      <div className="auth-shell">
        <div className="auth-intro">
          <p className="auth-eyebrow">{app("name")}</p>
          <h1 className="auth-headline">{app("tagline")}</h1>
          <p className="auth-lede">{app("tagline")}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
