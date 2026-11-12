import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { HERO_TRUST, HAS_DEMO_SCREENSHOT, demoScreenshotPath } from "@/lib/landing/content";

/**
 * A structural illustration of the workspace: rails, panels, and skeleton
 * blocks only. It carries no numbers, no names, and no records, so it cannot
 * be mistaken for a real dashboard (`NF-1`). It is used only when no captured
 * screenshot exists; the caption says which one is on screen.
 */
function PreviewIllustration() {
  return (
    <div className="landing-preview__illustration" aria-hidden="true">
      <div className="landing-preview__rail">
        <span className="landing-skeleton landing-skeleton--dot" />
        <span className="landing-skeleton landing-skeleton--rail" />
        <span className="landing-skeleton landing-skeleton--rail" />
        <span className="landing-skeleton landing-skeleton--rail" />
      </div>
      <div className="landing-preview__canvas">
        <span className="landing-skeleton landing-skeleton--heading" />
        <div className="landing-preview__tiles">
          <span className="landing-skeleton landing-skeleton--tile" />
          <span className="landing-skeleton landing-skeleton--tile" />
          <span className="landing-skeleton landing-skeleton--tile" />
        </div>
        <span className="landing-skeleton landing-skeleton--row" />
        <span className="landing-skeleton landing-skeleton--row" />
        <span className="landing-skeleton landing-skeleton--row landing-skeleton--short" />
      </div>
    </div>
  );
}

export async function LandingHero({ signedIn, locale }: { signedIn: boolean; locale: string }) {
  const t = await getTranslations("Landing");
  const primaryHref = signedIn ? "/app" : "/sign-up";
  const primaryLabel = signedIn ? t("openApp") : t("hero.primaryCta");

  return (
    <section className="landing-hero">
      <div className="landing-container landing-hero__grid">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">{t("hero.eyebrow")}</p>
          <h1 className="landing-title">{t("hero.title")}</h1>
          <p className="landing-lede">{t("hero.subtitle")}</p>

          <div className="landing-actions">
            <Link href={primaryHref} className="ui-button" data-variant="primary">
              {primaryLabel}
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
          <div className="landing-preview__frame">
            <div className="landing-preview__chrome">
              <span className="landing-preview__dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="landing-preview__badge">{t("hero.demoBadge")}</span>
            </div>

            {HAS_DEMO_SCREENSHOT ? (
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
            ) : (
              <PreviewIllustration />
            )}
          </div>
          <figcaption className="landing-preview__caption">
            {HAS_DEMO_SCREENSHOT ? t("hero.caption") : t("hero.illustrationCaption")}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
