import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import {
  FAQ_ITEMS,
  GAP_ITEMS,
  PROBLEM_ROWS,
  SECURITY_ITEMS,
  STEPS,
  TRUTH_ITEMS,
} from "@/lib/landing/content";

export async function LandingTruth() {
  const t = await getTranslations("Landing.truth");

  return (
    <section className="landing-truth" aria-labelledby="truth-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="truth-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ul className="landing-truth__grid">
          {TRUTH_ITEMS.map(({ key, icon }) => (
            <li key={key} className="landing-truth__item">
              <span className="landing-icon" aria-hidden="true">
                <Icon name={icon} size={20} />
              </span>
              <p>{t(`items.${key}`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Eight problems, each paired with a solution that exists in this repository.
 * The list is deliberately not a feature grid: a teacher reads the pain first
 * and the answer second.
 */
export async function LandingProblems() {
  const t = await getTranslations("Landing.problems");

  return (
    <section className="landing-section" id="features" aria-labelledby="problems-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="problems-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ul className="landing-problems__grid">
          {PROBLEM_ROWS.map(({ key, icon }) => (
            <li key={key} className="landing-problem">
              <div className="landing-problem__block">
                <span className="landing-problem__label">
                  <Icon name="alert" size={13} />
                  {t("problemLabel")}
                </span>
                <p className="landing-problem__problem">{t(`items.${key}.problem`)}</p>
              </div>
              <div className="landing-problem__block landing-problem__block--solution">
                <span className="landing-problem__label landing-problem__label--solution">
                  <Icon name={icon} size={14} />
                  {t("solutionLabel")}
                </span>
                <p className="landing-problem__solution">{t(`items.${key}.solution`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function LandingGap() {
  const t = await getTranslations("Landing.gap");

  return (
    <section className="landing-gap" aria-labelledby="gap-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="gap-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <ul className="landing-gap__grid">
          {GAP_ITEMS.map(({ key, icon }) => (
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

export async function LandingHow() {
  const t = await getTranslations("Landing.how");

  return (
    <section className="landing-section" id="how" aria-labelledby="how-title">
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

export async function LandingSecurity() {
  const t = await getTranslations("Landing.security");

  return (
    <section className="landing-section" id="security" aria-labelledby="security-title">
      <div className="landing-container">
        <div className="landing-security">
          <div className="landing-security__intro">
            <p className="landing-eyebrow">{t("eyebrow")}</p>
            <h2 id="security-title" className="landing-h2">
              {t("title")}
            </h2>
            <p className="landing-sub">{t("body")}</p>
          </div>
          <ul className="landing-security__list">
            {SECURITY_ITEMS.map(({ key, icon }) => (
              <li key={key} className="landing-security__item">
                <span className="landing-icon" aria-hidden="true">
                  <Icon name={icon} size={19} />
                </span>
                <p>{t(`items.${key}`)}</p>
              </li>
            ))}
          </ul>
        </div>
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
