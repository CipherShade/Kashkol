import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { requireStaffSession } from "@/modules/identity/session";
import { getStudentProfileDetails } from "@/modules/students/service";
import { StudentProfileTabs } from "@/components/students/student-profile-tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}): Promise<Metadata> {
  const { locale, studentId } = await params;
  try {
    const { scope } = await requireStaffSession();
    const profile = await getStudentProfileDetails(scope, studentId);
    return {
      title: `${profile.student.firstName} ${profile.student.lastName}`,
    };
  } catch {
    const t = await getTranslations({ locale, namespace: "Students" });
    return { title: t("studentProfile") };
  }
}

const STUDENT_PROFILE_TABS = [
  "overview",
  "attendance",
  "assessments",
  "homework",
  "payments",
  "notes",
  "portal",
  "qr",
] as const;
type StudentProfileTabId = (typeof STUDENT_PROFILE_TABS)[number];

function parseTabParam(value: string | string[] | undefined): StudentProfileTabId {
  const raw = Array.isArray(value) ? value[0] : value;
  return (STUDENT_PROFILE_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as StudentProfileTabId)
    : "overview";
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { locale, studentId } = await params;
  const { tab } = await searchParams;
  const initialTab = parseTabParam(tab);
  setRequestLocale(locale);

  const { scope } = await requireStaffSession();

  let profile;
  try {
    profile = await getStudentProfileDetails(scope, studentId);
  } catch {
    notFound();
  }

  const t = await getTranslations("Students");

  const { student, status, attendanceRate, quizAverage, consecutiveAbsences } = profile;

  return (
    <div className="app-page space-y-6">
      {/* Header with back navigation and profile summary */}
      <div className="space-y-4">
        <Link
          href="/app/students"
          className="ui-button inline-flex items-center gap-1.5"
          data-variant="ghost"
          data-size="sm"
        >
          <Icon name="chevronLeft" size={16} directional />
          <span>{t("backToDirectory")}</span>
        </Link>

        <Card>
          <CardBody className="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar
                  name={`${student.firstName} ${student.lastName}`}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">
                      {student.firstName} {student.lastName}
                    </h1>
                    {status === "active" && <Badge tone="success">{t("statusActive")}</Badge>}
                    {status === "at_risk" && <Badge tone="warn">{t("statusAtRisk")}</Badge>}
                    {status === "inactive" && <Badge tone="neutral">{t("statusInactive")}</Badge>}
                    {status === "archived" && <Badge tone="outline">{t("statusArchived")}</Badge>}
                  </div>
                  <p className="text-sm text-muted mt-1">
                    {student.grade || t("noGradeAssigned")} · {t("joinedDate")}:{" "}
                    {student.joinedAt.toISOString().slice(0, 10)}
                  </p>
                </div>
              </div>

              {/* Action and contact buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {student.phoneE164 && (
                  <a
                    href={`https://wa.me/${student.phoneE164.replace(/\+/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-button"
                    data-variant="secondary"
                  >
                    <Icon name="whatsapp" size={16} className="text-emerald-500" />
                    <span>{t("whatsappStudent")}</span>
                  </a>
                )}

                {student.parentPhoneE164 && (
                  <a
                    href={`https://wa.me/${student.parentPhoneE164.replace(/\+/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-button"
                    data-variant="secondary"
                  >
                    <Icon name="whatsapp" size={16} className="text-emerald-500" />
                    <span>{t("whatsappParent")}</span>
                  </a>
                )}

                <Link
                  href={`/app/students/${student.id}?tab=attendance`}
                  className="ui-button"
                  data-variant="secondary"
                >
                  <Icon name="calendar" size={16} />
                  <span>{t("openAttendance")}</span>
                </Link>

                <Link
                  href={`/app/students/${student.id}?tab=qr`}
                  className="ui-button"
                  data-variant="secondary"
                >
                  <Icon name="qr" size={16} />
                  <span>{t("openQrCard")}</span>
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Tabs view: Overview, Attendance, Grades, Homework, Payments, Notes */}
      <StudentProfileTabs
        key={initialTab}
        initialTab={initialTab}
        student={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          grade: student.grade,
          phoneE164: student.phoneE164,
          parentName: student.parentName,
          parentPhoneE164: student.parentPhoneE164,
          joinedAt: student.joinedAt.toISOString(),
          archivedAt: student.archivedAt ? student.archivedAt.toISOString() : null,
        }}
        attendanceRate={attendanceRate}
        quizAverage={quizAverage}
        consecutiveAbsences={consecutiveAbsences}
        currentEnrollments={profile.currentEnrollments.map((e) => ({
          id: e.id,
          group: e.group,
          enrolledAt: e.enrolledAt.toISOString(),
        }))}
        pastEnrollments={profile.pastEnrollments.map((e) => ({
          id: e.id,
          group: e.group,
          enrolledAt: e.enrolledAt.toISOString(),
          leftAt: e.leftAt ? e.leftAt.toISOString() : null,
        }))}
        attendanceMarks={profile.attendanceMarks.map((m) => ({
          id: m.id,
          mark: m.mark,
          recordedAt: m.recordedAt.toISOString(),
          session: {
            id: m.session.id,
            startsAt: m.session.startsAt.toISOString(),
            status: m.session.status,
            group: m.session.group,
          },
          revisions: m.revisions.map((r) => ({
            id: r.id,
            oldMark: r.oldMark,
            newMark: r.newMark,
            reason: r.reason,
            createdAt: r.createdAt.toISOString(),
          })),
        }))}
        assessmentScores={profile.assessmentScores.map((s) => ({
          id: s.id,
          score: s.score ? Number(s.score) : null,
          assessment: {
            id: s.assessment.id,
            title: s.assessment.title,
            date: s.assessment.date.toISOString().slice(0, 10),
            maxScore: Number(s.assessment.maxScore),
            group: s.assessment.group,
          },
        }))}
        payments={profile.payments.map((p) => ({
          id: p.id,
          period: p.period,
          amountMinor: p.amountMinor,
          currency: p.currency,
          method: p.method,
          paidOn: p.paidOn.toISOString().slice(0, 10),
          voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
          note: p.note,
        }))}
        canViewPayments={profile.canViewPayments}
        notes={profile.notes.map((note) => ({
          id: note.id,
          body: note.body,
          createdAt: note.createdAt.toISOString(),
        }))}
        locale={locale}
      />
    </div>
  );
}
