import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BulkGradesClient } from "@/components/performance/bulk-grades-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getBulkGradeFormData, getPerformanceOverview } from "@/modules/performance";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Performance.bulk" });
  return { title: t("title") };
}

export default async function BulkGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Performance");
  const canWrite =
    isAllowed(scope, "grades", "write") && isAllowed(scope, "students", "read");

  if (!isAllowed(scope, "grades", "read") || !isAllowed(scope, "students", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("bulk.title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const raw = await searchParams;
  const selected = typeof raw.groupId === "string" ? raw.groupId : undefined;
  const overview = await getPerformanceOverview(scope, {});
  const groups = overview.groups;
  const groupId = selected && groups.some((group) => group.id === selected) ? selected : groups[0]?.id;

  let initialData: Awaited<ReturnType<typeof getBulkGradeFormData>> | null = null;
  if (groupId) {
    initialData = await getBulkGradeFormData(scope, groupId);
  }

  return (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("bulk.title")}
        description={t("subtitle")}
        actions={
          <Link className="ui-button" data-variant="secondary" href="/app/performance">
            <Icon name="chevronLeft" directional size={16} />
            {t("profile.back")}
          </Link>
        }
      />

      {!canWrite ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-foreground">{t("needWritePermission")}</p>
          </CardBody>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-foreground">{t("bulk.noStudents")}</p>
          </CardBody>
        </Card>
      ) : (
        <BulkGradesClient
          groups={groups}
          initialGroupId={groupId ?? ""}
          initialData={initialData}
          locale={locale}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
