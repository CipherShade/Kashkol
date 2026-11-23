import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SubscriptionPanel } from "@/components/auth/subscription-panel";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Step two of teacher registration (ADR-0036). The page is public and holds no
 * personal data: it only shows the real InstaPay QR and link. `registered=1`
 * and `verify=1` are display hints from the account-creation redirect, never
 * proof that a payment happened.
 */
export default async function SubscribePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const registered = query.registered === "1";
  const needsVerification = query.verify === "1";
  const t = await getTranslations("Auth");

  return (
    <div className="auth-signup-stack">
      <section className="auth-card" aria-labelledby="subscribe-title">
        <p className="auth-eyebrow">{t("step2Of2")}</p>
        <h2 id="subscribe-title" className="auth-title">
          {t("paymentTitle")}
        </h2>
        <p className="auth-subtitle">{t("paymentSubtitle")}</p>
        {registered ? (
          <p className="form-alert" data-kind="success" role="status">
            {t("accountCreated")}
          </p>
        ) : null}
        <div className="auth-links">
          {needsVerification ? (
            <Link href="/verify-email" locale={locale}>
              {t("verifyTitle")}
            </Link>
          ) : null}
          <Link href="/sign-in" locale={locale}>
            {t("signInLink")}
          </Link>
        </div>
      </section>

      <SubscriptionPanel locale={locale} />
    </div>
  );
}
