import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { BENEFIT_ITEMS, FAQ_ITEMS, PROOF_ITEMS, STEPS } from "@/lib/landing/content";

export async function LandingBenefits() {
  const t = await getTranslations("Landing.benefits");

  return (
    <section className="landing-section" id="benefits" aria-labelledby="benefits-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="benefits-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ul className="landing-gap__grid">
          {BENEFIT_ITEMS.map(({ key, icon }) => (
            <li key={key} className="landing-gap__item">
              <span className="landing-icon" aria-hidden="true">
                <Icon name={icon} size={20} />
              </span>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p>{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function LandingProof() {
  const t = await getTranslations("Landing.proof");

  return (
    <section className="landing-truth" id="proof" aria-labelledby="proof-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="proof-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ul className="landing-truth__grid">
          {PROOF_ITEMS.map(({ key, icon }) => (
            <li key={key} className="landing-truth__item">
              <span className="landing-icon" aria-hidden="true">
                <Icon name={icon} size={20} />
              </span>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p>{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function LandingHow() {
  const t = await getTranslations("Landing.how");

  return (
    <section className="landing-section" aria-labelledby="how-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="how-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ol className="landing-steps">
          {STEPS.map(({ key, icon }, index) => (
            <li key={key} className="landing-step">
              <span className="landing-step__number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="landing-icon" aria-hidden="true">
                <Icon name={icon} size={20} />
              </span>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p>{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export async function LandingFaq() {
  const t = await getTranslations("Landing.faq");

  return (
    <section className="landing-section" id="faq" aria-labelledby="faq-title">
      <div className="landing-container landing-container--narrow">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="faq-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <div className="landing-faq">
          {FAQ_ITEMS.map((item) => (
            <details key={item} className="landing-faq__item">
              <summary className="landing-faq__question">
                <span>{t(`items.${item}.question`)}</span>
                <span className="landing-faq__mark" aria-hidden="true" />
              </summary>
              <p className="landing-faq__answer">{t(`items.${item}.answer`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LandingCallToAction({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("Landing");

  return (
    <section className="landing-section landing-section--last" aria-labelledby="cta-title">
      <div className="landing-container">
        <div className="landing-cta">
          <p className="landing-eyebrow">{t("cta.eyebrow")}</p>
          <h2 id="cta-title" className="landing-h2">
            {t("cta.title")}
          </h2>
          <p className="landing-sub">{t("cta.body")}</p>
          <div className="landing-actions landing-actions--center">
            <Link
              href={signedIn ? "/app" : "/sign-up"}
              className="ui-button"
              data-variant="primary"
            >
              {signedIn ? t("openApp") : t("createAccount")}
            </Link>
            {signedIn ? null : (
              <Link href="/sign-in" className="ui-button" data-variant="secondary">
                {t("signIn")}
              </Link>
            )}
          </div>
          <p className="landing-cta__note">{t("cta.note")}</p>
        </div>
      </div>
    </section>
  );
}
