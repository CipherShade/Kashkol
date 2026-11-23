"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";

const INSTAPAY_LINK = "https://ipn.eg/S/youssefahmed.telda/instapay/2PusEP";
const STEP_NUMBERS = ["١", "٢", "٣"] as const;

/**
 * The manual subscription payment instructions.
 *
 * This is step two of teacher registration. It opens the real InstaPay link and
 * shows the real QR image; it deliberately does not claim that Kashkol detected
 * a payment or activated an account (NF-5).
 */
export function SubscriptionPanel({ locale }: { locale: string }) {
  const t = useTranslations("Auth.subscription");

  return (
    <section className="auth-card auth-payment-card" aria-labelledby="signup-pricing-title">
      <div className="auth-payment-card__header">
        <span className="auth-payment-card__badge">{t("planTitle")}</span>
        <h2 id="signup-pricing-title" className="auth-payment-card__title">
          {t("title")}
        </h2>
        <div className="auth-payment-card__price-row">
          <span className="auth-payment-card__amount">{t("price")}</span>
          <span className="auth-payment-card__currency">{t("currency")}</span>
          <span className="auth-payment-card__period">/ {t("period")}</span>
        </div>
      </div>

      <ol className="auth-payment-card__steps">
        {[t("step1"), t("step2"), t("step3")].map((label, index) => (
          <li key={label} className="auth-payment-card__step">
            <span className="auth-payment-card__step-num" aria-hidden="true">
              {locale === "ar" ? STEP_NUMBERS[index] : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div className="auth-payment-card__qr-box">
        <Image
          src="/landing/instapay-qr.jpg"
          alt={t("qrAlt")}
          width={736}
          height={960}
          className="auth-payment-card__qr"
          priority={false}
        />
      </div>

      <p className="auth-payment-card__handle" dir="ltr">
        {t("instapayId")}
      </p>

      <a
        href={INSTAPAY_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="ui-button auth-payment-card__btn"
        data-variant="primary"
      >
        <Icon name="arrowRight" size={16} aria-hidden="true" />
        {t("payButton")}
      </a>

      <p className="auth-payment-card__note">
        <Icon name="alert" size={13} aria-hidden="true" />
        {t("note")}
      </p>
    </section>
  );
}
