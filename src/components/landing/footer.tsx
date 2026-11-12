import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LANDING_SECTIONS } from "@/lib/landing/content";

/**
 * Footer links point only at routes that exist. There is no privacy, terms, or
 * help-centre entry because none of those pages exist yet; linking them would
 * be a placeholder control (`NF-11`).
 */
export async function LandingFooter({ signedIn }: { signedIn: boolean }) {
  const t = await getTranslations("Landing");
  const nav = await getTranslations("Landing.nav");
  const app = await getTranslations("App");
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer__grid">
          <div className="landing-footer__brand">
            <p className="landing-footer__name">{app("name")}</p>
            <p className="landing-footer__tagline">{t("footer.tagline")}</p>
          </div>

          <nav className="landing-footer__group" aria-labelledby="footer-product">
            <h2 id="footer-product" className="landing-footer__heading">
              {t("footer.groups.product")}
            </h2>
            <ul>
              {LANDING_SECTIONS.map((section) => (
                <li key={section}>
                  <a className="landing-footer__link" href={`#${section}`}>
                    {nav(section)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="landing-footer__group" aria-labelledby="footer-account">
            <h2 id="footer-account" className="landing-footer__heading">
              {t("footer.groups.account")}
            </h2>
            <ul>
              {signedIn ? (
                <li>
                  <Link className="landing-footer__link" href="/app">
                    {t("openApp")}
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link className="landing-footer__link" href="/sign-in">
                      {t("signIn")}
                    </Link>
                  </li>
                  <li>
                    <Link className="landing-footer__link" href="/sign-up">
                      {t("createAccount")}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>

          <nav className="landing-footer__group" aria-labelledby="footer-system">
            <h2 id="footer-system" className="landing-footer__heading">
              {t("footer.groups.system")}
            </h2>
            <ul>
              <li>
                <Link className="landing-footer__link" href="/status">
                  {t("footer.status")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="landing-footer__bottom">
          <p>{t("footer.rights", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
