import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { isEmailConfigured } from "@/lib/config/env";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string }> };

export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("Auth");
  return (
    <section className="auth-card" aria-labelledby="forgot-title">
      <h2 id="forgot-title" className="auth-title">
        {t("requestResetTitle")}
      </h2>
      <p className="auth-subtitle">{t("requestResetSubtitle")}</p>
      <ForgotPasswordForm locale={locale} emailDisabled={!isEmailConfigured()} />
    </section>
  );
}
