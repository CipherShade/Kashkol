import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ResendVerificationForm } from "@/components/auth/forms";
import { isEmailConfigured } from "@/lib/config/env";
import { routing } from "@/i18n/routing";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VerifyEmailPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const verified = query.verified === "1";
  const failed = typeof query.error === "string";
  const t = await getTranslations("Auth");

  return (
    <section className="auth-card" aria-labelledby="verify-title">
      <h2 id="verify-title" className="auth-title">
        {t("verifyTitle")}
      </h2>
      <p className="auth-subtitle">{t("verifyBody")}</p>
      {verified ? (
        <p className="form-alert" data-kind="success" role="status">
          {t("verifySuccess")}
        </p>
      ) : null}
      {failed ? (
        <p className="form-alert" data-kind="error" role="alert">
          {t("verifyError")}
        </p>
      ) : null}
      {!isEmailConfigured() ? (
        <p className="form-alert" data-kind="warning" role="status">
          {t("emailDisabledNotice")}
        </p>
      ) : null}
      <h3 className="auth-subheading">{t("resend")}</h3>
      <ResendVerificationForm locale={locale} />
    </section>
  );
}
