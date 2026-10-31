import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/feedback";
import { AcceptPortalLink } from "@/components/portal/accept-portal-link";
import { getVerifiedSession } from "@/modules/identity/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.link" });
  return {
    title: t("pageTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PortalLinkPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("Portal.link");
  const session = await getVerifiedSession();

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-4 py-12">
      <section
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6 shadow-xs"
        aria-labelledby="portal-link-title"
      >
        <h1
          id="portal-link-title"
          className="text-xl font-bold text-[var(--text-primary)]"
        >
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("pageSubtitle")}
        </p>

        {session ? (
          <AcceptPortalLink token={token} userEmail={session.user.email} />
        ) : (
          <div className="mt-5 space-y-4">
            <Alert tone="info">{t("signInRequired")}</Alert>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className="ui-button"
                data-variant="primary"
                rel="noreferrer"
              >
                {t("signInAction")}
              </Link>
              <Link
                href="/sign-up"
                className="ui-button"
                data-variant="secondary"
                rel="noreferrer"
              >
                {t("signUpAction")}
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
