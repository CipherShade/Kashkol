import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import {
  CHALLENGE_ITEMS,
  FAQ_ITEMS,
  FEATURED_CHALLENGE_KEYS,
  PROOF_ITEMS,
  STEPS,
} from "@/lib/landing/content";

function ChallengeVisual({ itemKey }: { itemKey: string }) {
  if (itemKey === "students") {
    return (
      <div className="landing-showcase landing-showcase--students" aria-hidden="true">
        <div className="landing-showcase__topbar">
          <span className="landing-showcase__pill is-active">Profile</span>
          <span className="landing-showcase__pill">Attendance</span>
          <span className="landing-showcase__pill">Grades</span>
          <span className="landing-showcase__pill">Payments</span>
        </div>
        <div className="landing-showcase__profile">
          <div className="landing-showcase__avatar" />
          <div>
            <div className="landing-showcase__line landing-showcase__line--strong" />
            <div className="landing-showcase__line landing-showcase__line--muted" />
          </div>
        </div>
        <div className="landing-showcase__stats">
          <div className="landing-showcase__stat"><span>92%</span><small>Attendance</small></div>
          <div className="landing-showcase__stat"><span>18/20</span><small>Homework</small></div>
          <div className="landing-showcase__stat"><span>EGP</span><small>Payments</small></div>
        </div>
        <div className="landing-showcase__rows">
          <div className="landing-showcase__row"><span /><span /></div>
          <div className="landing-showcase__row"><span /><span /></div>
          <div className="landing-showcase__row"><span /><span /></div>
        </div>
      </div>
    );
  }

  if (itemKey === "schedule") {
    return (
      <div className="landing-showcase landing-showcase--calendar" aria-hidden="true">
        <div className="landing-showcase__topbar">
          <span className="landing-showcase__pill is-active">Day</span>
          <span className="landing-showcase__pill">Week</span>
          <span className="landing-showcase__pill">Month</span>
        </div>
        <div className="landing-showcase__calendar-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => (
            <div key={day} className="landing-showcase__calendar-col">
              <span className="landing-showcase__calendar-day">{day}</span>
              <span className={`landing-showcase__event ${i === 1 ? "is-primary" : ""}`} />
              {i !== 3 ? <span className="landing-showcase__event is-soft" /> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (itemKey === "attendance") {
    return (
      <div className="landing-showcase landing-showcase--attendance" aria-hidden="true">
        <div className="landing-showcase__row-head"><span>Student</span><span>Status</span></div>
        {["Present", "Late", "Absent", "Present"].map((status, i) => (
          <div key={`${status}-${i}`} className="landing-showcase__attendance-row">
            <div className="landing-showcase__name"><span className="landing-showcase__dot" /><span className="landing-showcase__line" /></div>
            <span className={`landing-showcase__status is-${status.toLowerCase()}`}>{status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (itemKey === "homework") {
    return (
      <div className="landing-showcase landing-showcase--homework" aria-hidden="true">
        {[
          ["Submitted", "is-done"],
          ["Late", "is-late"],
          ["Pending", "is-pending"],
        ].map(([label, cls]) => (
          <div key={label} className="landing-showcase__homework-row">
            <div>
              <div className="landing-showcase__line landing-showcase__line--strong" />
              <div className="landing-showcase__line landing-showcase__line--muted" />
            </div>
            <span className={`landing-showcase__status ${cls}`}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (itemKey === "exams") {
    return (
      <div className="landing-showcase landing-showcase--exams" aria-hidden="true">
        <div className="landing-showcase__exam-card">
          <div className="landing-showcase__line landing-showcase__line--strong" />
          <div className="landing-showcase__choice"><span /><span className="landing-showcase__line" /></div>
          <div className="landing-showcase__choice"><span className="is-selected" /><span className="landing-showcase__line" /></div>
          <div className="landing-showcase__choice"><span /><span className="landing-showcase__line" /></div>
        </div>
        <div className="landing-showcase__exam-meta">
          <div className="landing-showcase__stat"><span>MCQ</span><small>Auto-graded</small></div>
          <div className="landing-showcase__stat"><span>Essay</span><small>Review</small></div>
        </div>
      </div>
    );
  }

  if (itemKey === "performance") {
    return (
      <div className="landing-showcase landing-showcase--performance" aria-hidden="true">
        <div className="landing-showcase__bars">
          {[40, 56, 72, 64, 82, 76].map((h, i) => (
            <span key={i} style={{ blockSize: `${h}%` }} />
          ))}
        </div>
        <div className="landing-showcase__legend">
          <span className="landing-showcase__status is-done">Top</span>
          <span className="landing-showcase__status is-late">Needs attention</span>
        </div>
      </div>
    );
  }

  if (itemKey === "payments") {
    return (
      <div className="landing-showcase landing-showcase--payments" aria-hidden="true">
        <div className="landing-showcase__stats">
          <div className="landing-showcase__stat"><span>Collected</span><small>EGP 12,400</small></div>
          <div className="landing-showcase__stat"><span>Outstanding</span><small>EGP 2,100</small></div>
        </div>
        <div className="landing-showcase__rows">
          <div className="landing-showcase__row"><span /><strong className="is-good">Paid</strong></div>
          <div className="landing-showcase__row"><span /><strong className="is-warn">Due</strong></div>
          <div className="landing-showcase__row"><span /><strong className="is-good">Paid</strong></div>
        </div>
      </div>
    );
  }

  if (itemKey === "content") {
    return (
      <div className="landing-showcase landing-showcase--content" aria-hidden="true">
        <div className="landing-showcase__folder"><Icon name="folder" size={16} /><span className="landing-showcase__line" /></div>
        <div className="landing-showcase__folder"><Icon name="file" size={16} /><span className="landing-showcase__line" /></div>
        <div className="landing-showcase__folder"><Icon name="video" size={16} /><span className="landing-showcase__line" /></div>
      </div>
    );
  }

  if (itemKey === "parents") {
    return (
      <div className="landing-showcase landing-showcase--mobile" aria-hidden="true">
        <div className="landing-showcase__phone">
          <div className="landing-showcase__phone-notch" />
          <div className="landing-showcase__line landing-showcase__line--strong" />
          <div className="landing-showcase__stat"><span>Attendance</span><small>Present today</small></div>
          <div className="landing-showcase__stat"><span>Homework</span><small>2 pending</small></div>
          <div className="landing-showcase__stat"><span>Grades</span><small>Latest: 18/20</small></div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-showcase landing-showcase--team" aria-hidden="true">
      {["Owner", "Assistant", "Assistant"].map((role, i) => (
        <div key={`${role}-${i}`} className="landing-showcase__team-row">
          <div className="landing-showcase__name"><span className="landing-showcase__dot" /><span className="landing-showcase__line" /></div>
          <span className={`landing-showcase__status ${i === 0 ? "is-done" : "is-pending"}`}>{role}</span>
        </div>
      ))}
    </div>
  );
}

export async function LandingChallenges() {
  const t = await getTranslations("Landing.challenges");

  return (
    <section className="landing-section landing-challenges" id="challenges" aria-labelledby="challenges-title">
      <div className="landing-container">
        <div className="landing-challenges__head">
          <p className="landing-eyebrow">{t("eyebrow")}</p>
          <h2 id="challenges-title" className="landing-h2">
            {t("title")}
          </h2>
          <p className="landing-sub">{t("subtitle")}</p>
        </div>

        <div className="landing-challenges__layout">
          <nav className="landing-challenges__nav" aria-label={t("eyebrow")}>
            {CHALLENGE_ITEMS.map(({ key, icon }) => (
              <a key={key} href={`#challenge-${key}`} className="landing-challenges__nav-link">
                <span className="landing-challenges__nav-number">{t(`items.${key}.number`)}</span>
                <Icon name={icon} size={16} aria-hidden="true" />
                <span>{t(`items.${key}.nav`)}</span>
              </a>
            ))}
          </nav>

          <div className="landing-challenges__list">
            {CHALLENGE_ITEMS.map(({ key, icon }) => {
              const featured = FEATURED_CHALLENGE_KEYS.has(key);
              const points = t.raw(`items.${key}.points`) as string[];
              return (
                <article
                  key={key}
                  id={`challenge-${key}`}
                  className={`landing-challenge ${featured ? "is-featured" : ""}`}
                >
                  <div className="landing-challenge__copy">
                    <p className="landing-challenge__kicker">
                      <span className="landing-challenge__number">{t(`items.${key}.number`)}</span>
                      <span>{t(`items.${key}.title`)}</span>
                    </p>
                    <div className="landing-challenge__block landing-challenge__block--problem">
                      <p className="landing-challenge__label">
                        <Icon name="alert" size={14} aria-hidden="true" />
                        {t("problemLabel")}
                      </p>
                      <h3 className="landing-h3">{t(`items.${key}.problemHeadline`)}</h3>
                      <p>{t(`items.${key}.problemBody`)}</p>
                    </div>
                    <div className="landing-challenge__block landing-challenge__block--solution">
                      <p className="landing-challenge__label">
                        <Icon name="checkCircle" size={14} aria-hidden="true" />
                        {t("solutionLabel")}
                      </p>
                      <h4 className="landing-challenge__solution-title">{t(`items.${key}.solutionHeadline`)}</h4>
                      <p>{t(`items.${key}.solutionBody`)}</p>
                      <p className="landing-challenge__detail">{t(`items.${key}.solutionDetail`)}</p>
                    </div>
                    <ul className="landing-challenge__points">
                      {points.map((point) => (
                        <li key={point}>
                          <Icon name="check" size={14} aria-hidden="true" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="landing-challenge__visual">
                    <div className="landing-challenge__visual-head">
                      <span className="landing-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
                      <div>
                        <p className="landing-challenge__visual-label">{t("featureLabel")}</p>
                        <p className="landing-challenge__visual-title">{t(`items.${key}.title`)}</p>
                      </div>
                    </div>
                    <ChallengeVisual itemKey={key} />
                    <p className="landing-challenge__showcase">{t(`items.${key}.showcase`)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
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

const PRICING_FEATURE_KEYS = [
  "attendance",
  "homework",
  "portal",
  "files",
  "team",
] as const;

export async function LandingPricing() {
  const t = await getTranslations("Landing.pricing");

  return (
    <section className="landing-section landing-section--pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="landing-container">
        <p className="landing-eyebrow">{t("eyebrow")}</p>
        <h2 id="pricing-title" className="landing-h2">
          {t("title")}
        </h2>
        <p className="landing-sub">{t("subtitle")}</p>

        <div className="landing-pricing-card">
          <div className="landing-pricing-card__header">
            <span className="landing-pricing-card__badge">{t("planName")}</span>
            <div className="landing-pricing-card__price-row">
              <span className="landing-pricing-card__amount">{t("price")}</span>
              <span className="landing-pricing-card__currency">{t("currency")}</span>
              <span className="landing-pricing-card__period">/ {t("period")}</span>
            </div>
            <p className="landing-pricing-card__sub">{t("subtitle")}</p>
          </div>

          <ul className="landing-pricing-card__features">
            {PRICING_FEATURE_KEYS.map((key) => (
              <li key={key} className="landing-pricing-card__feature">
                <span className="landing-pricing-card__check" aria-hidden="true">
                  <Icon name="checkCircle" size={16} />
                </span>
                <span>{t(`features.${key}`)}</span>
              </li>
            ))}
          </ul>

          <div className="landing-pricing-card__footer">
            <Link
              href="/sign-up"
              className="ui-button landing-pricing-card__cta"
              data-variant="primary"
            >
              <Icon name="arrowRight" size={16} aria-hidden="true" />
              {t("ctaButton")}
            </Link>
            <p className="landing-pricing-card__note">{t("note")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
