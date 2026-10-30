import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/forms";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { getStaffGate } from "@/modules/identity/session";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  let portalOnly = false;
  try {
    const gate = await getStaffGate();
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
        : portalOnly || query.error === "portal"
          ? tRoot("errors.portalActor")
          : query.error === "forbidden"
            ? tRoot("errors.forbidden")
            : null;

  return (
    <section className="auth-card" aria-labelledby="sign-in-title">
      <h2 id="sign-in-title" className="auth-title">
        {t("signInTitle")}
      </h2>
      <p className="auth-subtitle">{t("signInSubtitle")}</p>
      {notice ? (
        <p
          className="form-alert"
          data-kind={portalOnly || query.error ? "error" : "success"}
          role="status"
        >
          {notice}
        </p>
      ) : null}
      <SignInForm locale={locale} />
    </section>
  );
}
