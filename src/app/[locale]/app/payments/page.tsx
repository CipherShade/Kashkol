import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentsClient } from "@/components/payments/payments-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getPayments } from "@/modules/payments/service";
import { paymentQuerySchema } from "@/modules/payments/schemas";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  // Money never exists for assistants or portals, even as an empty screen.
  if (scope.role !== "owner") notFound();

  const t = await getTranslations("Payments");
  const data = await getPayments(scope, paymentQuerySchema.parse({ page: 1, pageSize: 25 }));
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
          })),
          totals: data.totals,
          pagination: data.pagination,
        }}
        today={data.today}
      />
    </div>
  );
}
