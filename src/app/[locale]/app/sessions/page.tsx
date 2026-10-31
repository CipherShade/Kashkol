import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getSessions } from "@/modules/sessions/service";
import { getGroups } from "@/modules/groups/service";
import { SessionsClient, type SessionItem } from "@/components/sessions/sessions-client";

export const dynamic = "force-dynamic";

function startOfWeekSaturday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Sessions" });
  return {
    title: t("pageTitle"),
  };
}

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { scope } = await requireStaffSession();
  const t = await getTranslations("Sessions");

  const now = new Date();
  const weekStart = startOfWeekSaturday(now);
  const weekEnd = addDays(weekStart, 7);
  const [sessions, groups] = await Promise.all([
    getSessions(scope, { from: weekStart.toISOString(), to: weekEnd.toISOString() }),
    getGroups(scope, { showArchived: false }),
  ]);

  const serialized: SessionItem[] = sessions.map((s) => ({
    ...s,
    startsAt: s.startsAt instanceof Date ? s.startsAt.toISOString() : s.startsAt,
    endsAt: s.endsAt instanceof Date ? s.endsAt.toISOString() : s.endsAt,
    cancelledAt: s.cancelledAt instanceof Date ? s.cancelledAt.toISOString() : s.cancelledAt,
  }));

  return (
    <div className="app-page space-y-4">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        description={t("pageDescription")}
      />
      <SessionsClient groups={groups} initialSessions={serialized} />
    </div>
  );
}
