import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroup, getGroups } from "@/modules/groups/service";
import { listSubjects } from "@/modules/groups/repository";
import { getStudents } from "@/modules/students/service";
import { GroupDetailsClient } from "@/components/groups/group-details-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}): Promise<Metadata> {
  const { locale, groupId } = await params;
  try {
    const { scope } = await requireStaffSession();
    const group = await getGroup(scope, groupId);
    return {
      title: group.name,
    };
  } catch {
    const t = await getTranslations({ locale, namespace: "Groups" });
    return {
      title: t("groupDetails"),
    };
  }
}

export default async function GroupDetailsPage({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);

  const { scope } = await requireStaffSession();

  let group;
  try {
    group = await getGroup(scope, groupId);
  } catch {
    notFound();
  }

  const [t, tCommon, studentsResult, allGroups, subjects] = await Promise.all([
    getTranslations("Groups"),
    getTranslations("Common"),
    getStudents(scope, {
      page: 1,
      pageSize: 500,
      status: "all",
      sortBy: "name",
      sortOrder: "asc",
      showArchived: false,
    }),
    getGroups(scope, { showArchived: false }),
    listSubjects(scope),
  ]);

  const availableStudents = studentsResult.items.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    grade: s.grade,
  }));

  const availableGroups = allGroups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
  }));

  const labels: Record<string, string> = {
    groupDetails: t("groupDetails"),
    statusArchived: t("statusArchived"),
    capacityFull: t("capacityFull"),
    statusActive: t("statusActive"),
    students: t("students"),
    student: t("student"),
    grade: t("grade"),
    phone: t("phone"),
    guardian: t("guardian"),
    enrolledSince: t("enrolledSince"),
    actions: t("actions"),
    archivedMarker: t("archivedMarker"),
    enrollStudent: t("enrollStudent"),
    editGroup: t("editGroup"),
    archiveGroup: t("archiveGroup"),
    restoreGroup: t("restoreGroup"),
    internalNotes: t("internalNotes"),
    enrolledRoster: t("enrolledRoster"),
    noStudentsEnrolled: t("noStudentsEnrolled"),
    noStudentsEnrolledDesc: t("noStudentsEnrolledDesc"),
    enrollFirstStudent: t("enrollFirstStudent"),
    openWhatsApp: t("openWhatsApp"),
    transferStudent: t("transferStudent"),
    removeFromGroup: t("removeFromGroup"),
    upcomingSessions: t("upcomingSessions"),
    noSessionsScheduled: t("noSessionsScheduled"),
    backToGroups: t("backToGroups"),
    enrollStudentModalTitle: t("enrollStudentModalTitle"),
    capacityWarningNotice: t("capacityWarningNotice"),
    noMoreEligibleStudents: t("noMoreEligibleStudents"),
    selectStudent: t("selectStudent"),
    chooseStudentPlaceholder: t("chooseStudentPlaceholder"),
    cancel: tCommon("cancel"),
    enroll: t("enroll"),
    enrolling: t("enrolling"),
    transferStudentModalTitle: t("transferStudentModalTitle"),
    studentToTransfer: t("studentToTransfer"),
    transferHistoryPreservedNotice: t("transferHistoryPreservedNotice"),
    noOtherGroupsAvailable: t("noOtherGroupsAvailable"),
    destinationGroup: t("destinationGroup"),
    chooseGroupPlaceholder: t("chooseGroupPlaceholder"),
    confirmTransfer: t("confirmTransfer"),
    transferring: t("transferring"),
    removeStudentModalTitle: t("removeStudentModalTitle"),
    removeStudentConfirmMessage: t("removeStudentConfirmMessage"),
    confirmRemove: t("confirmRemove"),
    removing: t("removing"),
    editGroupTitle: t("editGroupTitle"),
    groupName: t("groupName"),
    subject: t("subject"),
    selectSubject: t("selectSubject"),
    gradeLevel: t("gradeLevel"),
    roomLocation: t("roomLocation"),
    weekday: t("weekday"),
    startTime: t("startTime"),
    endTime: t("endTime"),
    capacity: t("capacity"),
    color: t("color"),
    teacherNote: t("teacherNote"),
    saveChanges: t("saveChanges"),
    saving: tCommon("saving"),
  };

  return (
    <div className="app-page space-y-4">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={group.name}
        description={
          group.subject
            ? `${group.subject.name}${group.grade ? ` • ${group.grade}` : ""}`
            : group.grade ?? t("groupDetails")
        }
      />

      <GroupDetailsClient
        group={group}
        availableStudents={availableStudents}
        availableGroups={availableGroups}
        availableSubjects={subjects}
        locale={locale}
        labels={labels}
      />
    </div>
  );
}
