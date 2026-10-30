import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/forms";
import { isEmailConfigured } from "@/lib/config/env";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const t = await getTranslations("Auth");

  if (token.length === 0) {
    return (
      <section className="auth-card" aria-labelledby="reset-missing-title">
        <h2 id="reset-missing-title" className="auth-title">
          {t("resetTitle")}
        </h2>
        <p className="form-alert" data-kind="error" role="alert">
          {t("verifyError")}
        </p>
        <div className="auth-links">
          <Link href="/forgot-password" locale={locale}>
            {t("requestResetAction")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="reset-title">
      <h2 id="reset-title" className="auth-title">
        {t("resetTitle")}
      </h2>
      <p className="auth-subtitle">{t("resetSubtitle")}</p>
      <ResetPasswordForm locale={locale} token={token} emailDisabled={!isEmailConfigured()} />
    </section>
  );
}
