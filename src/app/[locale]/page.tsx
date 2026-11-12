import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import {
  LandingCallToAction,
  LandingFaq,
  LandingGap,
  LandingHow,
  LandingProblems,
  LandingSecurity,
  LandingTruth,
} from "@/components/landing/sections";
import { buildLandingMetadata, landingSiteUrl } from "@/lib/landing/seo";
import type { PreferredTheme } from "@/lib/theme";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { getOptionalUser } from "@/modules/identity/session";

/**
 * The public landing page (`/ar`, `/en`).
 *
 * It is the only indexable surface in the product, and the only page that does
 * not require a session. It reads the session only to choose between "Sign in"
 * and "Open app", so it has to render per request.
 *
 * It collects nothing: no form, no analytics, no third-party script, and no
 * cookie of its own. The theme and language switches are the app's own
 * preference controls.
 */
export const dynamic = "force-dynamic";

type LandingPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const appLocale = locale === "en" ? "en" : "ar";
  const t = await getTranslations({ locale: appLocale, namespace: "Landing" });

  return buildLandingMetadata({
    locale: appLocale,
    title: t("meta.title"),
    description: t("meta.description"),
    siteUrl: landingSiteUrl(),
  });
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const appLocale = locale === "en" ? "en" : "ar";
  setRequestLocale(appLocale);

  const t = await getTranslations("Landing");
  const user = await getOptionalUser().catch(() => null);
  const signedIn = Boolean(user);

  let initialTheme: PreferredTheme = null;
  try {
    initialTheme = await getPreferredTheme();
  } catch {
    // An expired session or a failed preference read must not break the page;
    // the client falls back to the cookie, then localStorage, then the system.
  }

  return (
    <div className="landing">
      <a className="landing-skip" href="#main">
        {t("skipToContent")}
      </a>

      <LandingHeader signedIn={signedIn} initialTheme={initialTheme} />

      <main id="main">
        <LandingHero signedIn={signedIn} locale={appLocale} />
        <LandingTruth />
        <LandingProblems />
        <LandingGap />
        <LandingHow />
        <LandingSecurity />
        <LandingFaq />
        <LandingCallToAction signedIn={signedIn} />
      </main>

      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
