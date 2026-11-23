import Image from "next/image";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/forms";
import { Icon } from "@/components/ui/icon";
import { socialProviderConfig } from "@/lib/auth/auth-options";
import { getServerEnv } from "@/lib/config/env";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { getStaffGate } from "@/modules/identity/session";

type PageProps = { params: Promise<{ locale: string }> };

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
    <div className="auth-signup-stack">
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

      <aside className="auth-card auth-payment-card" aria-labelledby="signup-pricing-title">
        <div className="auth-payment-card__header">
          <span className="auth-payment-card__badge">{t("subscription.planTitle")}</span>
          <h3 id="signup-pricing-title" className="auth-payment-card__title">
            {t("subscription.title")}
          </h3>
          <div className="auth-payment-card__price-row">
            <span className="auth-payment-card__amount">{t("subscription.price")}</span>
            <span className="auth-payment-card__currency">{t("subscription.currency")}</span>
            <span className="auth-payment-card__period">/ {t("subscription.period")}</span>
          </div>
        </div>

        <ol className="auth-payment-card__steps">
          <li className="auth-payment-card__step">
            <span className="auth-payment-card__step-num" aria-hidden="true">
              {locale === "ar" ? "١" : "1"}
            </span>
            <span>{t("subscription.step1")}</span>
          </li>
          <li className="auth-payment-card__step">
            <span className="auth-payment-card__step-num" aria-hidden="true">
              {locale === "ar" ? "٢" : "2"}
            </span>
            <span>{t("subscription.step2")}</span>
          </li>
          <li className="auth-payment-card__step">
            <span className="auth-payment-card__step-num" aria-hidden="true">
              {locale === "ar" ? "٣" : "3"}
            </span>
            <span>{t("subscription.step3")}</span>
          </li>
        </ol>

        <div className="auth-payment-card__qr-box">
          <Image
            src="/landing/instapay-qr.jpg"
            alt={t("subscription.qrAlt")}
            width={736}
            height={960}
            className="auth-payment-card__qr"
            priority={false}
          />
        </div>

        <p className="auth-payment-card__handle" dir="ltr">
          {t("subscription.instapayId")}
        </p>

        <a
          href="https://ipn.eg/S/youssefahmed.telda/instapay/2PusEP"
          target="_blank"
          rel="noopener noreferrer"
          className="ui-button auth-payment-card__btn"
          data-variant="primary"
        >
          <Icon name="arrowRight" size={16} aria-hidden="true" />
          {t("subscription.payButton")}
        </a>

        <p className="auth-payment-card__note">
          <Icon name="alert" size={13} aria-hidden="true" />
          {t("subscription.note")}
        </p>
      </aside>
    </div>
  );
}
