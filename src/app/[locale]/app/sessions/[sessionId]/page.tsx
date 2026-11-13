import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { isAllowed } from "@/modules/tenancy/types";
import { getSessionRoster } from "@/modules/attendance/service";
import { SessionAttendanceClient, type AttendanceRosterStudent, type AttendanceSession } from "@/components/sessions/session-attendance-client";


export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Sessions.attendance" });
  return {
    title: t("pageTitle"),
  };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);

  let scope;
  try {
    scope = (await requireStaffSession()).scope;
  } catch {
    return redirect({ href: "/sign-in", locale });
  }

  const data = await getSessionRoster(scope, sessionId);
  if (!data.session) {
    notFound();
  }

  const t = await getTranslations("Sessions.attendance");
  const canSeeFinancials = isAllowed(scope, "payments", "read");

  const session: AttendanceSession = {
    id: data.session.id,
    groupName: data.session.group.name,
    groupColor: data.session.group.color,
    startsAt: data.session.startsAt.toISOString(),
    endsAt: data.session.endsAt ? data.session.endsAt.toISOString() : null,
    status: data.session.status,
    room: data.session.room,
    location: data.session.location,
    isOneOff: data.session.isOneOff,
    seriesId: data.session.seriesId,
    pricePerStudentMinor:
      data.session.pricePerStudentMinor ??
      data.session.group.defaultPricePerStudentMinor ??
      null,
  };

  const roster: AttendanceRosterStudent[] = data.roster.map((r) => ({
    studentId: r.studentId,
    firstName: r.firstName,
    lastName: r.lastName,
    mark: r.mark,
    source: r.source,
    recordedAt: r.recordedAt ? r.recordedAt.toISOString() : null,
    isCrossSeason: r.isCrossSeason,
    primaryGroupId: r.primaryGroupId,
    primaryGroupName: r.primaryGroupName,
    homeworkStatus: r.homeworkStatus ?? null,
  }));

  const homework = data.homework
    ? {
        id: data.homework.id,
        title: data.homework.title,
        dueAt: data.homework.dueAt ? data.homework.dueAt.toISOString() : null,
      }
    : null;

  return (
    <div className="app-page space-y-4">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={session.groupName}
        description={t("pageDescription")}
      />
      <SessionAttendanceClient
        session={session}
        initialRoster={roster}
        checkinPathPrefix={`/${locale}/portal/student`}
        canSeeFinancials={canSeeFinancials}
        homework={homework}
        canRecordHomework={data.canRecordHomework}
      />
    </div>
  );
}
