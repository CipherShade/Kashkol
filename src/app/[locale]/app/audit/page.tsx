import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { listAuditEvents } from "@/modules/audit/service";
import { requireStaffSession } from "@/modules/identity/session";
import { isAllowed } from "@/modules/tenancy/types";

type EventRow = Awaited<ReturnType<typeof listAuditEvents>>[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Audit" });
  return { title: t("title") };
}

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Audit");
  if (!isAllowed(scope, "audit", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card><CardBody><EmptyState icon="lock" title={t("noAccess")} /></CardBody></Card>
      </div>
    );
  }

  const events = await listAuditEvents(scope);
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const columns: Array<Column<EventRow>> = [
    { key: "createdAt", header: t("date"), cell: (event) => dateFormat.format(event.createdAt) },
    { key: "actor", header: t("actor"), cell: (event) => event.actorDisplayName },
    { key: "action", header: t("action"), cell: (event) => <bdi>{event.action}</bdi> },
    { key: "entity", header: t("recordType"), cell: (event) => <bdi>{event.entityType}</bdi> },
  ];

  return (
    <div className="app-page">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Alert tone="info">{t("redactedHint")}</Alert>
      <Card labelledBy="audit-events-title">
        <CardHeader title={t("recentEvents")} titleId="audit-events-title" />
        <CardBody>
          <DataTable
            caption={t("caption")}
            scrollLabel={t("scrollLabel")}
            columns={columns}
            rows={events}
            rowKey={(event) => event.id}
            empty={t("empty")}
          />
        </CardBody>
      </Card>
    </div>
  );
}
