import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/modules/identity/session";
import { resolvePlatformAdminForUser } from "@/modules/platform-admin";
import { getPlatformBillingOverview } from "@/modules/billing";
import { PlatformBillingConsole } from "@/components/platform-admin/PlatformBillingConsole";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function PlatformBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await getAuthenticatedUser();
  if (!user) redirect(`/${locale}/sign-in`);
  const admin = await resolvePlatformAdminForUser(user);
  const labelLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const data = await getPlatformBillingOverview(admin, {}, labelLocale);

  return <PlatformBillingConsole initialData={data} />;
}
