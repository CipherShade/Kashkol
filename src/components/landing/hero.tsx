import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { LandingInteractiveWorkspace } from "@/components/landing/interactive-workspace";
import { HERO_TRUST } from "@/lib/landing/content";

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
          <LandingInteractiveWorkspace />
          <p className="landing-preview__caption">{t("hero.caption")}</p>
        </div>
      </div>
    </section>
  );
}
