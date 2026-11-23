import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { HERO_TRUST, HAS_DEMO_SCREENSHOT, demoScreenshotPath } from "@/lib/landing/content";
import { LandingInteractivePreview } from "./interactive-preview";

export async function LandingHero({ signedIn, locale }: { signedIn: boolean; locale: string }) {
  const t = await getTranslations("Landing");
  const primaryHref = signedIn ? "/app" : "/sign-up";
  const primaryLabel = signedIn ? t("openApp") : t("hero.primaryCta");

  return (
    <section className="landing-hero">
      {/* Dynamic ambient floating lighting and subtle pattern */}
      <div className="landing-hero__ambient" aria-hidden="true">
        <div className="landing-hero__ambient-orb landing-hero__ambient-orb--start" />
        <div className="landing-hero__ambient-orb landing-hero__ambient-orb--end" />
        <div className="landing-hero__ambient-grid" />
      </div>

      <div className="landing-container landing-hero__grid">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">
            <span className="landing-eyebrow__pulse" aria-hidden="true" />
            <span>{t("hero.eyebrow")}</span>
          </p>
          <h1 className="landing-title">{t("hero.title")}</h1>
          <p className="landing-lede">{t("hero.subtitle")}</p>

          <div className="landing-actions">
            <Link
              href={primaryHref}
              className="ui-button landing-btn--primary-shimmer"
              data-variant="primary"
            >
              <span>{primaryLabel}</span>
              <Icon name="arrowRight" size={17} directional />
            </Link>
            {signedIn ? null : (
              <Link href="/sign-in" className="ui-button" data-variant="secondary">
                {t("hero.secondaryCta")}
              </Link>
            )}
          </div>

          <ul className="landing-trust">
            {HERO_TRUST.map((item) => (
              <li key={item} className="landing-trust__item">
                <Icon name="checkCircle" size={16} />
                <span>{t(`hero.trust.${item}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="landing-preview">
          {HAS_DEMO_SCREENSHOT ? (
            <div className="landing-preview__frame">
              <div className="landing-preview__chrome">
                <span className="landing-preview__dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="landing-preview__badge">{t("hero.demoBadge")}</span>
              </div>
              <Image
                className="landing-preview__shot"
                src={demoScreenshotPath(locale)}
                alt={t("hero.previewAlt")}
                width={1422}
                height={804}
                unoptimized
                priority
                sizes="(max-width: 980px) 100vw, 620px"
              />
            </div>
          ) : (
            <LandingInteractivePreview />
          )}
          <figcaption className="landing-preview__caption">
            {HAS_DEMO_SCREENSHOT ? t("hero.caption") : t("hero.illustrationCaption")}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
