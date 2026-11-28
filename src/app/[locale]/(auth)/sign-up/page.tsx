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
 * Teacher registration creates a free, unrestricted account (ADR-0046). No
 * payment step gates access; usage billing is managed later in /app/billing.
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
