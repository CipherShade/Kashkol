import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";

import { CalendarView } from "@/components/calendar/calendar-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  await setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "sessions" });
  return { title: t("calendarTitle") || "Calendar" };
}

function startOfWeekSaturday(date: Date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await setRequestLocale(locale);
  const { scope: _scope } = await requireStaffSession();
  const today = new Date();
  const from = startOfWeekSaturday(today);
  const to = new Date(from); to.setDate(from.getDate() + 6);
  return (
    <main className="p-4 md:p-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <PageHeader title={"Calendar"} description="Scheduled sessions for this week" />
      <CalendarView />
    </main>
  );
}