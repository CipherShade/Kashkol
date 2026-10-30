import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroups } from "@/modules/groups/service";
import { listSubjects } from "@/modules/groups/repository";
import { GroupsClient } from "@/components/groups/groups-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Groups" });
  return {
    title: t("pageTitle"),
  };
}

export default async function GroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { scope } = await requireStaffSession();
  const rawParams = await searchParams;

  const search = typeof rawParams.search === "string" ? rawParams.search : undefined;
  const subjectId = typeof rawParams.subjectId === "string" ? rawParams.subjectId : undefined;
  const grade = typeof rawParams.grade === "string" ? rawParams.grade : undefined;
  const weekday =
    typeof rawParams.weekday === "string" && rawParams.weekday !== ""
      ? parseInt(rawParams.weekday, 10)
      : undefined;
  const showArchived = rawParams.showArchived === "true" || rawParams.showArchived === "1";

  const [t, tCommon, groups, subjects] = await Promise.all([
    getTranslations("Groups"),
    getTranslations("Common"),
    getGroups(scope, {
      search,
      subjectId,
      grade,
      weekday,
      showArchived,
    }),
    listSubjects(scope),
  ]);

  const availableGrades = Array.from(
    new Set(
      groups
        .map((g) => g.grade)
        .filter((gr): gr is string => !!gr && gr.trim().length > 0),
    ),
  ).sort();

  const labels: Record<string, string> = {
    searchPlaceholder: t("searchPlaceholder"),
    search: tCommon("search"),
    createGroup: t("createGroup"),
    createGroupTitle: t("createGroupTitle"),
    editGroupTitle: t("editGroupTitle"),
    allSubjects: t("allSubjects"),
    allGrades: t("allGrades"),
    allDays: t("allDays"),
    showArchived: t("showArchived"),
    clearFilters: t("clearFilters"),
    noGroupsMatchFilters: t("noGroupsMatchFilters"),
    noGroupsMatchDesc: t("noGroupsMatchDesc"),
    noGroupsYet: t("noGroupsYet"),
    noGroupsYetDesc: t("noGroupsYetDesc"),
    statusArchived: t("statusArchived"),
    statusActive: t("statusActive"),
    archivedMarker: t("archivedMarker"),
    capacityFull: t("capacityFull"),
    students: t("students"),
    student: t("student"),
    group: t("group"),
    internalNotes: t("internalNotes"),
    phone: t("phone"),
    guardian: t("guardian"),
    enrolledSince: t("enrolledSince"),
    edit: tCommon("edit"),
    view: tCommon("view"),
    editGroup: t("editGroup"),
    cancel: tCommon("cancel"),
    save: tCommon("save"),
    saving: tCommon("saving"),
    saveChanges: t("saveChanges"),
    groupName: t("groupName"),
    subject: t("subject"),
    selectSubject: t("selectSubject"),
    addNewSubject: t("addNewSubject"),
    newSubjectName: t("newSubjectName"),
    gradeLevel: t("gradeLevel"),
    roomLocation: t("roomLocation"),
    weekday: t("weekday"),
    startTime: t("startTime"),
    endTime: t("endTime"),
    capacity: t("capacity"),
    capacityPlaceholder: t("capacityPlaceholder"),
    color: t("color"),
    teacherNote: t("teacherNote"),
    teacherNotePlaceholder: t("teacherNotePlaceholder"),
    archiveGroup: t("archiveGroup"),
    restoreGroup: t("restoreGroup"),
    conflictWarningTitle: t("conflictWarningTitle"),
    conflictDetectedWithName: t("conflictDetectedWithName"),
    ignoreConflictCheckbox: t("ignoreConflictCheckbox"),
  };

  return (
    <div className="app-page space-y-4">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <GroupsClient
        initialGroups={groups}
        availableSubjects={subjects}
        availableGrades={availableGrades}
        currentQuery={{
          search,
          subjectId,
          grade,
          weekday,
          showArchived,
        }}
        locale={locale}
        labels={labels}
      />
    </div>
  );
}
