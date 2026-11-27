import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LandingAnnouncement } from "@/components/landing/announcement";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { LandingMobileCta } from "@/components/landing/mobile-cta";
import { LandingScrollTop } from "@/components/landing/scroll-top";
import {
  LandingFaq,
  LandingFeatures,
  LandingFinalCta,
  LandingHowItWorks,
  LandingIntelligence,
  LandingPersonas,
  LandingPricing,
  LandingProblem,
  LandingSolution,
} from "@/components/landing/sections";
import { buildLandingMetadata, landingSiteUrl } from "@/lib/landing/seo";
import type { PreferredTheme } from "@/lib/theme";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { getOptionalUser } from "@/modules/identity/session";

/**
 * Public landing page (`/ar`, `/en`) — the only indexable surface.
 * Renders per request only to read session for CTA state.
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
    initialTheme = null;
  }

  return (
    <div className="landing">
      <a className="landing-skip" href="#main">
        {t("skipToContent")}
      </a>

      <LandingAnnouncement />
      <LandingHeader signedIn={signedIn} initialTheme={initialTheme} />

      <main id="main">
        <LandingHero signedIn={signedIn} />
        <LandingProblem />
        <LandingSolution />
        <LandingIntelligence />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingPersonas />
        <LandingPricing signedIn={signedIn} />
        <LandingFaq />
        <LandingFinalCta signedIn={signedIn} />
      </main>

      <LandingFooter signedIn={signedIn} />
      <LandingMobileCta signedIn={signedIn} />
      <LandingScrollTop />
    </div>
  );
}
