import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AppError } from "@/lib/http/errors";
import { requireParentPortalContext } from "@/modules/identity/session";
import { getParentPortalOverview } from "@/modules/portals";
import { ParentPortalClient } from "@/components/portal/parent-portal-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.parent" });
  return {
    title: t("portalTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ParentPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { locale } = await params;
  const { studentId } = await searchParams;

  let portal;
  try {
    portal = await requireParentPortalContext();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") {
      return redirect({ href: "/portal", locale });
    }
    return redirect({ href: "/not-available", locale });
  }

  let overview;
  try {
    overview = await getParentPortalOverview(portal, studentId ?? null);
  } catch {
    return redirect({ href: "/not-available", locale });
  }

  return (
    <ParentPortalClient
      userEmail={portal.user?.email ?? ""}
      userName={portal.user?.name ?? ""}
      childrenList={overview.children}
      initialChild={overview.activeChild}
    />
  );
}
