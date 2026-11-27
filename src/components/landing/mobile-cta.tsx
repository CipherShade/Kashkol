import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";

/**
 * Small-screen conversion bar. It links to the real sign-up route; it does not
 * charge, start a trial, or imply that a subscription is already active.
 */
export async function LandingMobileCta({ signedIn }: { signedIn: boolean }) {
  if (signedIn) return null;

  const t = await getTranslations("Landing.mobileCta");

  return (
    <div className="landing-v2-mobile-cta">
      <div>
        <p className="landing-v2-mobile-cta__price">{t("label")}</p>
        <p className="landing-v2-mobile-cta__note">{t("sublabel")}</p>
      </div>
      <Link href="/sign-up" className="ui-button landing-v2-mobile-cta__button" data-variant="primary">
        <span>{t("cta")}</span>
        <Icon name="arrowRight" size={16} directional />
      </Link>
    </div>
  );
}
