import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getStudents } from "@/modules/students/service";
import { getGroups } from "@/modules/groups/service";
import { StudentsClient } from "@/components/students/students-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Students" });
  return {
    title: t("pageTitle"),
  };
}

export default async function StudentsPage({
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

  const page = typeof rawParams.page === "string" ? parseInt(rawParams.page, 10) : 1;
  const pageSize = typeof rawParams.pageSize === "string" ? parseInt(rawParams.pageSize, 10) : 20;
  const search = typeof rawParams.search === "string" ? rawParams.search : undefined;
  const groupId = typeof rawParams.groupId === "string" ? rawParams.groupId : undefined;
  const status =
    typeof rawParams.status === "string"
      ? (rawParams.status as "all" | "active" | "at_risk" | "inactive" | "archived")
      : "all";
  const grade = typeof rawParams.grade === "string" ? rawParams.grade : undefined;
  const showArchived = rawParams.showArchived === "true" || rawParams.showArchived === "1";
  const sortBy =
    typeof rawParams.sortBy === "string"
      ? (rawParams.sortBy as "name" | "joinedAt" | "attendanceRate" | "quizAverage")
      : "name";
  const sortOrder = rawParams.sortOrder === "desc" ? "desc" : "asc";

  const [t, tCommon, tErrors, result, groups] = await Promise.all([
    getTranslations("Students"),
    getTranslations("Common"),
    getTranslations("errors"),
    getStudents(scope, {
      page,
      pageSize,
      search,
      groupId,
      status,
      grade,
      showArchived,
      sortBy,
      sortOrder,
    }),
    getGroups(scope, { showArchived: false }),
  ]);

  const availableGrades = Array.from(
    new Set(
      result.items
        .map((s) => s.grade)
        .filter((g): g is string => !!g && g.trim().length > 0),
    ),
  ).sort();

  const labels: Record<string, string> = {
    totalStudents: t("totalStudents"),
    statusActive: t("statusActive"),
    statusAtRisk: t("statusAtRisk"),
    statusInactive: t("statusInactive"),
    statusArchived: t("statusArchived"),
    searchPlaceholder: t("searchPlaceholder"),
    search: tCommon("search"),
    addStudent: t("addStudent"),
    importSpreadsheet: t("importSpreadsheet"),
    export: t("export"),
    filterByGroup: t("filterByGroup"),
    allGroups: t("allGroups"),
    filterByGrade: t("filterByGrade"),
    allGrades: t("allGrades"),
    clearFilters: t("clearFilters"),
    student: t("student"),
    group: t("group"),
    groups: t("groups"),
    grade: t("grade"),
    attendanceRate: t("attendanceRate"),
    quizAverage: t("quizAverage"),
    phone: t("phone"),
    parent: t("parent"),
    status: t("status"),
    actions: t("actions"),
    archivedMarker: t("archivedMarker"),
    guardian: t("guardian"),
    pageInfo: t.raw("pageInfo"),
    prevPage: tCommon("previous"),
    nextPage: tCommon("next"),
    noStudentsMatchFilters: t("noStudentsMatchFilters"),
    noStudentsMatchDesc: t("noStudentsMatchDesc"),
    noStudentsYet: t("noStudentsYet"),
    noStudentsYetDesc: t("noStudentsYetDesc"),
    addStudentModalTitle: t("addStudentModalTitle"),
    editStudentModalTitle: t("editStudentModalTitle"),
    importModalTitle: t("importModalTitle"),
    exportModalTitle: t("exportModalTitle"),
    exportDescription: t("exportDescription"),
    duplicateWarningTitle: t("duplicateWarningTitle"),
    duplicateWarningDesc: t("duplicateWarningDesc"),
    confirmDuplicateAddAnyway: t("confirmDuplicateAddAnyway"),
    firstName: t("firstName"),
    lastName: t("lastName"),
    parentName: t("parentName"),
    parentPhone: t("parentPhone"),
    assignGroups: t("assignGroups"),
    internalNotes: t("internalNotes"),
    egyptianPhoneHint: t("egyptianPhoneHint"),
    cancel: tCommon("cancel"),
    save: tCommon("save"),
    saving: tCommon("saving"),
    saveChanges: t("saveChanges"),
    close: tCommon("close"),
    createdSuccess: t("createdSuccess"),
    updatedSuccess: t("updatedSuccess"),
    archivedSuccess: t("archivedSuccess"),
    restoredSuccess: t("restoredSuccess"),
    importIntroText: t("importIntroText"),
    chooseFile: t("chooseFile"),
    needTemplate: t("needTemplate"),
    analyzing: t("analyzing"),
    uploadAndPreview: t("uploadAndPreview"),
    totalRows: t("totalRows"),
    validRows: t("validRows"),
    skippedRows: t("skippedRows"),
    detectedGroupsMapping: t("detectedGroupsMapping"),
    createNewGroup: t("createNewGroup"),
    mapToExistingGroup: t("mapToExistingGroup"),
    ignoreGroup: t("ignoreGroup"),
    selectGroup: t("selectGroup"),
    importMode: t("importMode"),
    allOrNothing: t("allOrNothing"),
    validOnly: t("validOnly"),
    name: t("name"),
    action: t("action"),
    actionCreate: t("actionCreate"),
    actionUpdate: t("actionUpdate"),
    back: tCommon("back"),
    committing: t("committing"),
    commitImport: t("commitImport"),
    importCompletedTitle: t("importCompletedTitle"),
    importSummary: t.raw("importSummary"),
    done: tCommon("done"),
    missingFirstName: t("missingFirstName"),
    missingLastName: t("missingLastName"),
    invalidStudentPhone: t("invalidStudentPhone"),
    invalidParentPhone: t("invalidParentPhone"),
    duplicateInFile: t("duplicateInFile"),
    phoneMatchesDifferentStudent: t("phoneMatchesDifferentStudent"),
    nameOnlyMatchWarning: t("nameOnlyMatchWarning"),
    encodingConvertedNotice: t("encodingConvertedNotice"),
    warningsAcknowledged: t("warningsAcknowledged"),
    downloadErrorReport: t("downloadErrorReport"),
    "errors.generic": tErrors("generic"),
    "errors.fileRequired": tErrors("fileRequired"),
    "errors.invalidSpreadsheetType": tErrors("invalidSpreadsheetType"),
    "errors.importHasSkippedRowsInAllOrNothing": tErrors("importHasSkippedRowsInAllOrNothing"),
    "errors.importWarningsNotAcknowledged": tErrors("importWarningsNotAcknowledged"),
    "errors.importRowLimit": tErrors("importRowLimit"),
    "errors.importEmptyFile": tErrors("importEmptyFile"),
    "errors.importUnreadableFile": tErrors("importUnreadableFile"),
  };

  return (
    <div className="app-page space-y-4">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <StudentsClient
        initialStudents={result.items}
        summary={result.summary}
        totalCount={result.total}
        currentPage={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        availableGroups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
        availableGrades={availableGrades}
        currentQuery={{
          search,
          groupId,
          status,
          grade,
          showArchived,
          sortBy,
          sortOrder,
        }}
        locale={locale}
        labels={labels}
      />
    </div>
  );
}
