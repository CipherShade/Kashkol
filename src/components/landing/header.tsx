import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import type { PreferredTheme } from "@/lib/theme";
import { LANDING_SECTIONS } from "@/lib/landing/content";

/**
 * The public header. The language and theme switches are the same components
 * the signed-in shell uses, so a visitor's choice carries into the app.
 *
 * There is no separate pricing page — the single subscription is stated in the
 * pricing section — and no help-centre link because no such page exists.
 */
export async function LandingHeader({
  signedIn,
  initialTheme,
}: {
  signedIn: boolean;
  initialTheme: PreferredTheme;
}) {
  const t = await getTranslations("Landing");
  const nav = await getTranslations("Landing.nav");
  const app = await getTranslations("App");
  const items = LANDING_SECTIONS.map((section) => ({ section, label: nav(section) }));

  return (
    <header className="landing-header">
      <div className="landing-container landing-header__inner">
        <Link href="/" className="landing-brand" aria-label={t("brandAria")}>
          <span className="landing-brand__mark">
            <BrandMark />
          </span>
          <span className="landing-brand__name">{app("name")}</span>
        </Link>

        <nav className="landing-nav" aria-label={nav("label")}>
          {items.map(({ section, label }) => (
            <a key={section} className="landing-nav__link" href={`#${section}`}>
              {label}
            </a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <ThemeSwitch initialTheme={initialTheme} />
          {signedIn ? (
            <Link
              href="/app"
              className="ui-button landing-header__cta"
              data-variant="primary"
              data-size="sm"
            >
              {t("openApp")}
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="ui-button landing-header__signin"
                data-variant="ghost"
                data-size="sm"
              >
                {t("signIn")}
              </Link>
              <Link
                href="/sign-up"
                className="ui-button landing-header__cta"
                data-variant="primary"
                data-size="sm"
              >
                {t("createAccount")}
              </Link>
            </>
          )}

          <details className="landing-menu">
            <summary
              className="ui-button landing-menu__toggle"
              data-variant="ghost"
              data-size="icon"
            >
              <Icon name="menu" size={19} />
              <span className="landing-sr-only">{t("menuLabel")}</span>
            </summary>
            <div className="landing-menu__panel">
              {items.map(({ section, label }) => (
                <a key={section} className="landing-menu__link" href={`#${section}`}>
                  {label}
                </a>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
