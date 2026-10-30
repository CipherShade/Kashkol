import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "NotFound" });
  return { title: t("title") };
}

export default async function NotFoundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("NotFound");

  return (
    <main className="status-page">
      <div className="status-shell">
        <Card>
          <CardBody>
            <EmptyState
              icon="search"
              title={t("title")}
              description={t("body")}
              action={
                <div className="ui-form-actions">
                  <Link href="/" className="ui-button" data-variant="secondary">
                    <Icon name="home" size={16} />
                    <span>{t("home")}</span>
                  </Link>
                  <Link href="/app" className="ui-button" data-variant="primary">
                    <span>{t("app")}</span>
                    <Icon name="arrowRight" size={16} directional />
                  </Link>
                </div>
              }
            />
          </CardBody>
        </Card>
        <p className="status-note">{t("note")}</p>
      </div>
    </main>
  );
}
