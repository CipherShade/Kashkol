import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/forms";
import { socialProviderConfig } from "@/lib/auth/auth-options";
import { getServerEnv } from "@/lib/config/env";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { getStaffGate } from "@/modules/identity/session";
import { Icon } from "@/components/ui/icon";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const env = getServerEnv();
  const providers = {
    google: socialProviderConfig(env).google.enabled,
    facebook: socialProviderConfig(env).facebook.enabled,
  };

  let portalOnly = false;
  try {
    const gate = await getStaffGate();
    if (gate.state === "phone_missing") redirect(`/${locale}/complete-phone`);
    if (gate.state !== "anonymous") redirect(`/${locale}/app`);
  } catch (error) {
    // A parent/student account must not be bounced between /app and /sign-in.
    // It stays here and is told why it cannot enter the teacher application.
    if (error instanceof AppError && error.messageKey === "errors.portalActor") {
      portalOnly = true;
    }
  }

  const query = await searchParams;
  const t = await getTranslations("Auth");
  const tRoot = await getTranslations();
  const notice =
    query.reset === "1"
      ? t("resetDone")
      : query.signedOut === "1"
        ? t("signedOut")
        : query.registered === "1"
          ? t("accountCreated")
          : portalOnly || query.error === "portal"
            ? tRoot("errors.portalActor")
            : query.error === "forbidden"
              ? tRoot("errors.forbidden")
              : query.signInError === "1"
                ? tRoot("auth.errors.socialSignInFailed")
                : null;

  return (
    <section className="auth-card auth-centered-card" aria-labelledby="sign-in-title">
      <div className="auth-centered-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h2 id="sign-in-title" className="auth-title">
        {t("signInTitle")}
      </h2>
      <p className="auth-subtitle">{t("signInSubtitle")}</p>
      {notice ? (
        <p
          className="form-alert"
          data-kind={portalOnly || query.error || query.signInError === "1" ? "error" : "success"}
          role="status"
        >
          {notice}
        </p>
      ) : null}
      <SignInForm locale={locale} providers={providers} />
      <p className="auth-centered-trust">
        <Icon name="shield" size={16} />
        <span>{t("secureWorkspace")}</span>
      </p>
    </section>
  );
}
