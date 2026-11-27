import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import {
  FAQ_ITEMS,
  FEATURE_PILLARS,
  INTELLIGENCE_QUIZZES,
  INTELLIGENCE_STATS,
  PERSONAS,
  PRICING_FEATURES,
  PROBLEM_ITEMS,
  SOLUTION_ITEMS,
  STEPS,
} from "@/lib/landing/content";

function SectionHead({
  eyebrow,
  title,
  subtitle,
  titleId,
  center = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  titleId: string;
  center?: boolean;
}) {
  return (
    <div className={`landing-section-head landing-v2-section__head${center ? " landing-v2-section__head--center" : ""}`}>
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2 id={titleId} className="landing-h2 landing-v2-heading">{title}</h2>
      <p className="landing-sub">{subtitle}</p>
    </div>
  );
}

export async function LandingProblem() {
  const t = await getTranslations("Landing.problem");

  return (
    <section className="landing-v2-section landing-v2-section--surface" id="problem" aria-labelledby="problem-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="problem-title"
        />
        <div className="landing-v2-grid landing-v2-grid--problems">
          {PROBLEM_ITEMS.map(({ key, icon }, index) => (
            <article
              key={key}
              className="landing-v2-card"
              data-tone={index === 1 || index === 3 ? "warn" : index === 4 ? "primary" : "danger"}
            >
              <div className="landing-v2-card__icon"><Icon name={icon} size={22} /></div>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p className="landing-v2-card__body">{t(`items.${key}.body`)}</p>
              <p className="landing-v2-card__tag">{t(`items.${key}.tag`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LandingSolution() {
  const t = await getTranslations("Landing.solution");

  return (
    <section className="landing-v2-section landing-v2-section--canvas" aria-labelledby="solution-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="solution-title"
          center
        />
        <div className="landing-v2-grid landing-v2-grid--solutions">
          {SOLUTION_ITEMS.map(({ key, icon }) => (
            <article key={key} className="landing-v2-card landing-v2-card--solution">
              <span className="landing-v2-card__label">{t("problemLabel")}: {t(`items.${key}.label`)}</span>
              <div className="landing-v2-card__icon"><Icon name={icon} size={22} /></div>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p className="landing-v2-card__body">{t(`items.${key}.body`)}</p>
              <p className="landing-v2-card__benefit">
                <Icon name="checkCircle" size={15} />
                <span>{t(`items.${key}.benefit`)}</span>
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LandingIntelligence() {
  const t = await getTranslations("Landing.intelligence");
  const quizLabels = t.raw("quizLabels") as string[];
  const xs = [20, 120, 240, 360, 480, 580];
  const ys = [24, 26, 28, 54, 74, 84];

  return (
    <section className="landing-v2-section landing-v2-section--surface" id="intelligence" aria-labelledby="intelligence-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="intelligence-title"
          center
        />
        <p className="landing-v2-sample-note">
          <Icon name="info" size={14} />
          {t("note")}
        </p>

        <div className="landing-v2-spotlight">
          <div className="landing-v2-spotlight__head">
            <div className="landing-v2-spotlight__identity">
              <span className="landing-v2-spotlight__avatar"><Icon name="user" size={24} /></span>
              <div>
                <div className="landing-v2-spotlight__name-row">
                  <h3>{t("sampleName")}</h3>
                  <span className="landing-v2-spotlight__flag">{t("flag")}</span>
                </div>
                <p>{t("sampleMeta")}</p>
              </div>
            </div>
            <span className="landing-v2-spotlight__card-label">{t("cardLabel")}</span>
          </div>

          <div className="landing-v2-stats">
            {INTELLIGENCE_STATS.map(({ key, icon }) => (
              <div key={key} className="landing-v2-stat">
                <span className="landing-v2-stat__head">
                  <Icon name={icon} size={14} />
                  {t(`stats.${key}.label`)}
                </span>
                <strong>{t(`stats.${key}.value`)}</strong>
                <small>{t(`stats.${key}.note`)}</small>
              </div>
            ))}
          </div>

          <div className="landing-v2-alert">
            <Icon name="alert" size={22} />
            <div>
              <h4>{t("alertTitle")}</h4>
              <p>{t("alertBody")}</p>
            </div>
          </div>

          <div className="landing-v2-chart">
            <p className="landing-v2-chart__title">{t("chartTitle")}</p>
            <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label={t("chartTitle")}>
              <line className="landing-v2-chart__grid" x1="0" x2="600" y1="20" y2="20" />
              <line className="landing-v2-chart__grid" x1="0" x2="600" y1="60" y2="60" />
              <line className="landing-v2-chart__grid" x1="0" x2="600" y1="100" y2="100" />
              <polyline className="landing-v2-chart__average" points="20,48 120,46 240,45 360,44 480,42 580,40" />
              <polyline className="landing-v2-chart__line" points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} />
              {xs.map((x, i) => (
                <circle
                  key={x}
                  className={i === INTELLIGENCE_QUIZZES.length - 1 ? "landing-v2-chart__dot is-danger" : i === INTELLIGENCE_QUIZZES.length - 2 ? "landing-v2-chart__dot is-warn" : "landing-v2-chart__dot"}
                  cx={x}
                  cy={ys[i]}
                  r={i === INTELLIGENCE_QUIZZES.length - 1 ? 5 : 4}
                />
              ))}
            </svg>
            <div className="landing-v2-chart__labels">
              {quizLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export async function LandingFeatures() {
  const t = await getTranslations("Landing.features");

  return (
    <section className="landing-v2-section landing-v2-section--surface" id="features" aria-labelledby="features-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="features-title"
        />
        <p className="landing-v2-sample-note">
          <Icon name="info" size={14} />
          {t("previewNote")}
        </p>

        <div className="landing-v2-grid landing-v2-grid--features">
          {FEATURE_PILLARS.map(({ key, icon }) => {
            const chips = t.raw(`pillars.${key}.chips`) as string[];
            return (
              <article key={key} className="landing-v2-card landing-v2-card--feature">
                <div className="landing-v2-card__icon"><Icon name={icon} size={22} /></div>
                <h3 className="landing-h3">{t(`pillars.${key}.title`)}</h3>
                <p className="landing-v2-card__body">{t(`pillars.${key}.body`)}</p>

                <div className="landing-v2-preview">
                  <div className="landing-v2-preview__head">
                    <strong>{t(`pillars.${key}.previewTitle`)}</strong>
                    <span>{t(`pillars.${key}.previewMeta`)}</span>
                  </div>
                  {key === "students" ? (
                    <div className="landing-v2-preview__chips">
                      {chips.map((chip) => <span key={chip}>{chip}</span>)}
                    </div>
                  ) : null}
                  {key === "attendance" ? (
                    <>
                      <div className="landing-v2-scanner">
                        <Icon name="qr" size={30} />
                      </div>
                      <div className="landing-v2-preview__chips">
                        {chips.map((chip) => <span key={chip}>{chip}</span>)}
                      </div>
                    </>
                  ) : null}
                  {key === "exams" ? (
                    <div className="landing-v2-meter">
                      <div className="landing-v2-meter__fill" />
                    </div>
                  ) : null}
                  {key === "receipts" ? (
                    <div className="landing-v2-preview__chips">
                      {chips.map((chip) => <span key={chip}>{chip}</span>)}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export async function LandingHowItWorks() {
  const t = await getTranslations("Landing.howItWorks");

  return (
    <section className="landing-v2-section landing-v2-section--canvas" id="how-it-works" aria-labelledby="how-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="how-title"
          center
        />
        <div className="landing-v2-grid landing-v2-grid--steps">
          {STEPS.map(({ key, icon }, index) => (
            <article key={key} className="landing-v2-step">
              <div className="landing-v2-step__head">
                <span className="landing-v2-step__number">{index + 1}</span>
                <span className="landing-v2-step__icon"><Icon name={icon} size={22} /></span>
              </div>
              <h3 className="landing-h3">{t(`steps.${key}.title`)}</h3>
              <p>{t(`steps.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LandingPersonas() {
  const t = await getTranslations("Landing.personas");

  return (
    <section className="landing-v2-section landing-v2-section--surface" id="personas" aria-labelledby="personas-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="personas-title"
          center
        />
        <div className="landing-v2-grid landing-v2-grid--personas">
          {PERSONAS.map(({ key, icon }) => (
            <article key={key} className="landing-v2-card landing-v2-card--persona">
              <div className="landing-v2-card__icon"><Icon name={icon} size={22} /></div>
              <h3 className="landing-h3">{t(`items.${key}.title`)}</h3>
              <p className="landing-v2-card__body">{t(`items.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LandingPricing({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("Landing.pricing");
  const root = await getTranslations("Landing");
  const items = t.raw("items") as string[];

  return (
    <section className="landing-v2-section landing-v2-section--canvas" id="pricing" aria-labelledby="pricing-title">
      <div className="landing-container">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="pricing-title"
          center
        />
        <div className="landing-v2-pricing">
          <div className="landing-v2-pricing__head">
            <div>
              <h3>{t("planName")}</h3>
              <p>{t("planNote")}</p>
            </div>
            <span className="landing-v2-pricing__badge">{t("badge")}</span>
          </div>
          <div className="landing-v2-pricing__price">
            <strong>{t("amount")}</strong>
            <div>
              <span>{t("currency")}</span>
              <small>{t("period")}</small>
            </div>
          </div>
          <p className="landing-v2-pricing__clarity">{t("clarity")}</p>
          <ul className="landing-v2-pricing__features">
            {PRICING_FEATURES.map((feature, index) => (
              <li key={feature}>
                <Icon name="checkCircle" size={18} />
                <span>{items[index]}</span>
              </li>
            ))}
          </ul>
          <Link
            href={signedIn ? "/app" : "/sign-up"}
            className="ui-button landing-v2-pricing__cta"
            data-variant="primary"
          >
            <span>{signedIn ? root("openApp") : t("cta")}</span>
            <Icon name="arrowRight" size={17} directional />
          </Link>
          <p className="landing-v2-pricing__note">{t("note")}</p>
          <p className="landing-v2-pricing__payment">{t("paymentNote")}</p>
        </div>
      </div>
    </section>
  );
}

export async function LandingFaq() {
  const t = await getTranslations("Landing.faq");

  return (
    <section className="landing-v2-section landing-v2-section--surface" id="faq" aria-labelledby="faq-title">
      <div className="landing-container landing-container--narrow">
        <SectionHead
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          titleId="faq-title"
          center
        />
        <div className="landing-faq landing-v2-faq">
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

export async function LandingFinalCta({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("Landing.finalCta");
  const root = await getTranslations("Landing");
  const notes = t.raw("notes") as string[];

  return (
    <section className="landing-v2-section landing-v2-section--canvas landing-section--last" aria-labelledby="final-cta-title">
      <div className="landing-container">
        <div className="landing-v2-cta">
          <p className="landing-v2-cta__badge">{t("eyebrow")}</p>
          <h2 id="final-cta-title" className="landing-v2-cta__title">{t("title")}</h2>
          <p className="landing-v2-cta__body">{t("body")}</p>
          <div className="landing-v2-cta__actions">
            <Link href={signedIn ? "/app" : "/sign-up"} className="ui-button" data-variant="primary">
              <span>{signedIn ? root("openApp") : t("primaryCta")}</span>
              <Icon name="arrowRight" size={17} directional />
            </Link>
            <a href="#how-it-works" className="ui-button" data-variant="secondary">
              {t("secondaryCta")}
            </a>
          </div>
          <ul className="landing-v2-cta__notes">
            {notes.map((note) => <li key={note}><Icon name="check" size={14} />{note}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
