import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentsClient } from "@/components/payments/payments-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getPayments } from "@/modules/payments/service";
import { paymentQuerySchema } from "@/modules/payments/schemas";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Payments");
  if (!isAllowed(scope, "payments", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const data = await getPayments(
    scope,
    paymentQuerySchema.parse({ page: 1, pageSize: 25 }),
  );
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PaymentsClient
        initialData={{
          groups: data.groups,
          sessions: data.sessions,
          payments: data.payments.map((payment) => ({
            ...payment,
            paidOn: payment.paidOn.toISOString().slice(0, 10),
            voidedAt: payment.voidedAt?.toISOString() ?? null,
          })),
          adjustments: data.adjustments.map((adjustment) => ({
            ...adjustment,
            paidOn: adjustment.paidOn.toISOString().slice(0, 10),
            createdAt: adjustment.createdAt.toISOString(),
          })),
          totals: data.totals,
          pagination: data.pagination,
        }}
        canWrite={isAllowed(scope, "payments", "write")}
        today={data.today}
      />
    </div>
  );
}
