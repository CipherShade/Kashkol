import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/forms";
import { socialProviderConfig } from "@/lib/auth/auth-options";
import { getServerEnv } from "@/lib/config/env";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { getStaffGate } from "@/modules/identity/session";

type PageProps = { params: Promise<{ locale: string }> };

/**
 * Step one of teacher registration. The payment instructions are a separate
 * route (ADR-0036), reached only after this form has created the account.
 */
export default async function SignUpPage({ params }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  let portalOnly = false;
  try {
    const gate = await getStaffGate();
    if (gate.state !== "anonymous") redirect(`/${locale}/app`);
  } catch (error) {
    if (error instanceof AppError && error.messageKey === "errors.portalActor") {
      portalOnly = true;
    }
  }

  const t = await getTranslations("Auth");
  const tRoot = await getTranslations();
  const env = getServerEnv();
  const providers = {
    google: socialProviderConfig(env).google.enabled,
    facebook: socialProviderConfig(env).facebook.enabled,
  };
  return (
    <section className="auth-card" aria-labelledby="sign-up-title">
      <p className="auth-eyebrow">{t("step1Of2")}</p>
      <h2 id="sign-up-title" className="auth-title">
        {t("signUpTitle")}
      </h2>
      <p className="auth-subtitle">{t("signUpSubtitle")}</p>
      {portalOnly ? (
        <p className="form-alert" data-kind="error" role="alert">
          {tRoot("errors.portalActor")}
        </p>
      ) : (
        <SignUpForm locale={locale} providers={providers} />
      )}
    </section>
  );
}
