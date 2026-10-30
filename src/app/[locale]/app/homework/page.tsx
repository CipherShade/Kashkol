import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HomeworkClient } from "@/components/academics/homework-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroups } from "@/modules/groups/service";
import { groupQuerySchema } from "@/modules/groups/schemas";
import { getStudents } from "@/modules/students/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { isAllowed } from "@/modules/tenancy/types";
import { listHomework, listHomeworkResources } from "@/modules/homework/service";
import { homeworkQuerySchema } from "@/modules/homework/schemas";

export const dynamic = "force-dynamic";

export default async function HomeworkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Academics.homework");
  if (!isAllowed(scope, "students", "read") || !isAllowed(scope, "homework", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("needHomeworkPermission")}</CardBody>
        </Card>
      </div>
    );
  }
  const [assignments, groups, studentResult, resources] = await Promise.all([
    listHomework(scope, homeworkQuerySchema.parse({})),
    isAllowed(scope, "grades", "read")
      ? getGroups(scope, groupQuerySchema.parse({}))
      : Promise.resolve([]),
    getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" })),
    isAllowed(scope, "files", "read") ? listHomeworkResources(scope) : Promise.resolve([]),
  ]);
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <HomeworkClient
        initialAssignments={assignments.map((assignment) => ({
          ...assignment,
          dueAt: assignment.dueAt.toISOString(),
          submissions: assignment.submissions.map((submission) => ({
            ...submission,
            submittedAt: submission.submittedAt?.toISOString() ?? null,
          })),
        }))}
        groups={groups.map(({ id, name }) => ({ id, name }))}
        students={studentResult.items.map(({ id, firstName, lastName }) => ({
          id,
          firstName,
          lastName,
        }))}
        resources={resources.map(({ id, title }) => ({ id, displayName: title }))}
        locale={locale}
        canWriteHomework={isAllowed(scope, "homework", "write")}
        canReadGrades={isAllowed(scope, "grades", "read")}
        canEditGrades={isAllowed(scope, "grades", "write")}
      />
    </div>
  );
}
