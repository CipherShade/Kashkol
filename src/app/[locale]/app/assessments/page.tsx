import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AssessmentsClient } from "@/components/academics/assessments-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroups } from "@/modules/groups/service";
import { groupQuerySchema } from "@/modules/groups/schemas";
import { getStudents } from "@/modules/students/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { isAllowed } from "@/modules/tenancy/types";
import { listAssessments } from "@/modules/assessments/service";
import { assessmentQuerySchema } from "@/modules/assessments/schemas";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Academics.assessments");
  if (!isAllowed(scope, "students", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("needStudentPermission")}</CardBody>
        </Card>
      </div>
    );
  }
  if (!isAllowed(scope, "grades", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("needGradesPermission")}</CardBody>
        </Card>
      </div>
    );
  }
  const [assessments, groups, studentResult] = await Promise.all([
    listAssessments(scope, assessmentQuerySchema.parse({})),
    getGroups(scope, groupQuerySchema.parse({})),
    getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" })),
  ]);
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AssessmentsClient
        initialAssessments={assessments}
        groups={groups.map(({ id, name }) => ({ id, name }))}
        students={studentResult.items.map(({ id, firstName, lastName }) => ({
          id,
          firstName,
          lastName,
        }))}
        locale={locale}
        canWriteGrades={isAllowed(scope, "grades", "write")}
      />
    </div>
  );
}
