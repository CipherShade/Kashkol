import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";

import { CalendarView } from "@/components/calendar/calendar-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Sessions" });
  return { title: t("calendarTitle") };
}

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await setRequestLocale(locale);
  await requireStaffSession();
  const t = await getTranslations("Sessions");
  return (
    <main className="p-4 md:p-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <PageHeader title={t("calendarTitle")} description={t("calendarDescription")} />
      <CalendarView />
    </main>
  );
}
