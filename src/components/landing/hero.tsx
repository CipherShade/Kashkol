import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { HERO_TRUST } from "@/lib/landing/content";

/**
 * A CSS-built product illustration. Every figure is labelled as synthetic in
 * the visible copy, so the mockup explains the product without pretending to
 * show a real teacher's records (`NF-1`).
 */
async function HeroMock() {
  const t = await getTranslations("Landing.hero.mock");

  const stats = [
    { label: t("students"), value: t("studentsValue"), note: t("studentsNote") },
    { label: t("sessions"), value: t("sessionsValue"), note: t("sessionsNote") },
    { label: t("attendance"), value: t("attendanceValue"), note: t("attendanceNote") },
  ];

  return (
    <div className="landing-hero-mock landing-v2-mock" aria-hidden="true">
      <div className="landing-v2-mock__top">
        <div className="landing-v2-mock__dots">
          <span /><span /><span />
        </div>
        <p className="landing-v2-mock__title">{t("title")}</p>
        <span className="landing-v2-mock__status">{t("status")}</span>
      </div>

      <div className="landing-v2-mock__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="landing-v2-mock__stat">
            <span className="landing-v2-mock__stat-label">{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </div>
        ))}
      </div>

      <div className="landing-v2-mock__schedule">
        <div className="landing-v2-mock__schedule-head">
          <span className="landing-v2-mock__schedule-title">
            <Icon name="calendar" size={15} />
            {t("scheduleTitle")}
          </span>
          <span className="landing-v2-mock__time">{t("time")}</span>
        </div>

        <div className="landing-v2-mock__session is-active">
          <span className="landing-v2-mock__marker" />
          <div>
            <p className="landing-v2-mock__session-title">{t("session1Title")}</p>
            <p className="landing-v2-mock__session-meta">{t("session1Meta")}</p>
          </div>
          <span className="landing-v2-mock__chip">{t("active")}</span>
        </div>

        <div className="landing-v2-mock__session">
          <span className="landing-v2-mock__marker is-muted" />
          <div>
            <p className="landing-v2-mock__session-title">{t("session2Title")}</p>
            <p className="landing-v2-mock__session-meta">{t("session2Meta")}</p>
          </div>
          <span className="landing-v2-mock__chip is-muted">{t("upcoming")}</span>
        </div>
      </div>

      <div className="landing-v2-mock__alert">
        <Icon name="alert" size={20} />
        <div>
          <p className="landing-v2-mock__alert-title">{t("alertTitle")}</p>
          <p className="landing-v2-mock__alert-body">{t("alertBody")}</p>
        </div>
        <span className="landing-v2-mock__alert-action">{t("alertAction")}</span>
      </div>
    </div>
  );
}

export async function LandingHero({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("Landing");
  const primaryHref = signedIn ? "/app" : "/sign-up";
  const primaryLabel = signedIn ? t("openApp") : t("hero.primaryCta");

  return (
    <section className="landing-v2-hero" aria-labelledby="hero-title">
      <div className="landing-hero__ambient" aria-hidden="true">
        <div className="landing-hero__ambient-orb landing-hero__ambient-orb--start" />
        <div className="landing-hero__ambient-orb landing-hero__ambient-orb--end" />
      </div>

      <div className="landing-container landing-v2-hero__grid">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow landing-eyebrow--pill">
            <Icon name="shield" size={16} />
            <span>{t("hero.pill")}</span>
          </p>
          <h1 id="hero-title" className="landing-title landing-v2-hero__title">{t("hero.title")}</h1>
          <p className="landing-lede">{t("hero.subtitle")}</p>

          <div className="landing-actions">
            <Link href={primaryHref} className="ui-button" data-variant="primary">
              <span>{primaryLabel}</span>
              <Icon name="arrowRight" size={17} directional />
            </Link>
            <a href="#how-it-works" className="ui-button" data-variant="secondary">
              <Icon name="target" size={17} />
              {t("hero.secondaryCta")}
            </a>
          </div>

          <p className="landing-hero__note">{t("hero.note")}</p>

          <ul className="landing-trust landing-v2-trust">
            {HERO_TRUST.map((item) => (
              <li key={item} className="landing-trust__item">
                <Icon name="checkCircle" size={16} />
                <span>{t(`hero.trust.${item}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="landing-hero__visual-wrap">
          <HeroMock />
          <p className="landing-preview__caption">{t("hero.caption")}</p>
        </div>
      </div>
    </section>
  );
}
