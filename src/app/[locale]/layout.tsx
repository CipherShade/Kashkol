import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Direction } from "radix-ui";
import { directionForLocale, routing, type AppLocale } from "@/i18n/routing";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { buildThemeScript, type PreferredTheme } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/styles/globals.css";

type LocaleParams = { locale: string };

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D11" },
  ],
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams(): LocaleParams[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "App" });
  return {
    title: {
      default: `${t("name")} — ${t("tagline")}`,
      template: `%s · ${t("name")}`,
    },
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("name"),
    },
    icons: {
      icon: [
        { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<LocaleParams>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const appLocale = locale as AppLocale;
  const direction = directionForLocale(appLocale);

  let preferredTheme: PreferredTheme = null;
  try {
    preferredTheme = await getPreferredTheme();
  } catch {
    // An expired session or a preference read failure must not break rendering;
    // the script falls back to the cookie, localStorage, then the system.
  }

  const common = await getTranslations({ locale, namespace: "Common" });
  const resolvedInitial = preferredTheme === "dark" ? "dark" : "light";

  return (
    <html
      lang={appLocale}
      dir={direction}
      data-theme={resolvedInitial}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: buildThemeScript(preferredTheme) }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Direction.Provider dir={direction}>
            <TooltipProvider>
              <ToastProvider closeLabel={common("close")}>{children}</ToastProvider>
            </TooltipProvider>
          </Direction.Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
