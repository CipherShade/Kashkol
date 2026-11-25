import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ParentPortalClient } from "@/components/portal/parent-portal-client";
import { requireStaffSession } from "@/modules/identity/session";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { previewParentPortalForStudent } from "@/modules/portals";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portal.parent" });
  return {
    title: t("previewBanner"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ParentPortalPreviewPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  setRequestLocale(locale);

  const { scope } = await requireStaffSession();
  const requestHeaders = await headers();
  const requestId = requestHeaders.get(REQUEST_ID_HEADER) ?? newRequestId();

  let overview;
  try {
    overview = await previewParentPortalForStudent(scope, studentId, { requestId });
  } catch {
    notFound();
  }

  return (
    <ParentPortalClient
      userEmail=""
      userName=""
      childrenList={overview.children}
      initialChild={overview.activeChild}
      isPreview
    />
  );
}
