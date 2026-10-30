import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FollowUpsClient } from "@/components/academics/followups-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getStudents } from "@/modules/students/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { isAllowed } from "@/modules/tenancy/types";
import { getFollowUpDashboard, listFollowUpOwners } from "@/modules/followups/service";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Academics.followups");
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
  const [dashboard, studentResult, owners] = await Promise.all([
    getFollowUpDashboard(scope),
    getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" })),
    listFollowUpOwners(scope),
  ]);
  const serializableDashboard = {
    ...dashboard,
    followUps: dashboard.followUps.map((followUp) => ({
      ...followUp,
      dueAt: followUp.dueAt?.toISOString() ?? null,
      resolvedAt: followUp.resolvedAt?.toISOString() ?? null,
      createdAt: followUp.createdAt.toISOString(),
      history: followUp.history.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    })),
  };
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <FollowUpsClient
        initialDashboard={serializableDashboard}
        students={studentResult.items.map(({ id, firstName, lastName }) => ({
          id,
          firstName,
          lastName,
        }))}
        owners={owners}
        locale={locale}
        canWrite={isAllowed(scope, "students", "write")}
      />
    </div>
  );
}
