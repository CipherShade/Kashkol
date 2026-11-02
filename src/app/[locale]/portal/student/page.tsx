import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AppError } from "@/lib/http/errors";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { getStudentPortalOverview } from "@/modules/portals";
import { StudentPortalClient } from "@/components/portal/student-portal-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.student" });
  return {
    title: t("portalTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function StudentPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string; checkin?: string }>;
}) {
  const { locale } = await params;
  const { studentId, checkin } = await searchParams;

  let portal;
  try {
    portal = await requireStudentPortalContext();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") {
      return redirect({ href: "/sign-in", locale });
    }
    return redirect({ href: "/not-available", locale });
  }

  let overview;
  try {
    overview = await getStudentPortalOverview(portal, studentId ?? null);
  } catch {
    return redirect({ href: "/not-available", locale });
  }

  return (
    <StudentPortalClient
      userEmail={portal.user?.email ?? ""}
      userName={portal.user?.name ?? ""}
      initialDetail={overview}
      initialCheckin={checkin ?? null}
    />
  );
}
