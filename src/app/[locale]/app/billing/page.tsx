import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { PageHeader } from "@/components/ui/page-header";
import { BillingClient } from "@/components/billing/billing-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getTeacherBilling } from "@/modules/billing";

export const dynamic = "force-dynamic";

export default async function TeacherBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  // Platform billing is owner-only. Assistants receive no screen, not an empty one.
  if (scope.role !== "owner") notFound();

  const t = await getTranslations("TeacherBilling");
  const labelLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const data = await getTeacherBilling(scope, {}, new Date(), labelLocale);
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <BillingClient initialData={data} />
    </div>
  );
}
