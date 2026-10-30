import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/navigation";
import { findPlannedModule, isDevelopmentBuild } from "@/lib/navigation/nav";
import { requireStaffSession } from "@/modules/identity/session";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

function slugFrom(module: string[]): string | null {
  return module.length === 1 ? module[0] : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string[] }>;
}): Promise<Metadata> {
  const { locale, module } = await params;
  const slug = slugFrom(module);
  const item = slug ? findPlannedModule(slug) : undefined;

  // Resolve the 404 before the authenticated shell starts streaming, so a
  // production request for a planned module carries a real 404 status.
  if (!item || !isDevelopmentBuild()) notFound();

  const nav = await getTranslations({ locale, namespace: "Nav" });
  return {
    title: nav(item.labelKey),
  };
}

export default async function PlannedModulePage({
  params,
}: {
  params: Promise<{ locale: string; module: string[] }>;
}) {
  const { module } = await params;
  const slug = slugFrom(module);
  const item = slug ? findPlannedModule(slug) : undefined;

  // A production build exposes no planned module page. The entry is not in the
  // production navigation either, so a request here is a 404, not a promise.
  if (!item || !isDevelopmentBuild()) notFound();

  const { scope } = await requireStaffSession();
  const nav = await getTranslations("Nav");
  const planned = await getTranslations("Planned");

  if (item.permission && !isAllowed(scope, item.permission.resource, item.permission.action)) {
    return (
      <div className="app-page">
        <PageHeader title={nav(item.labelKey)} />
        <Card>
          <CardBody>
            <EmptyState
              icon="lock"
              title={planned("noAccessTitle")}
              description={planned("noAccessBody")}
              action={
                <Link href="/app" className="ui-button" data-variant="secondary">
                  {planned("backToDashboard")}
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-planned">
        <PageHeader
          eyebrow={planned("eyebrow")}
          title={nav(item.labelKey)}
          description={planned(`modules.${item.key}`)}
          actions={
            <Link href="/app" className="ui-button" data-variant="secondary">
              <Icon name="chevronLeft" size={16} directional />
              <span>{planned("backToDashboard")}</span>
            </Link>
          }
        />

        <div className="app-planned-meta">
          <Badge tone="accent" icon="clock">
            {planned("badge", { milestone: item.milestone })}
          </Badge>
          {item.flow ? (
            <Badge tone="outline" icon="clipboard">
              <bdi className="ui-code">{item.flow}</bdi>
            </Badge>
          ) : null}
        </div>

        <Alert tone="info" title={planned("noticeTitle")} icon="info" live="status">
          {planned("noticeBody")}
        </Alert>

        <Card>
          <CardBody>
            <h2 className="ui-card-title">{planned("scopeTitle")}</h2>
            <ul className="app-planned-list">
              <li>{planned("scopeNoData")}</li>
              <li>{planned("scopeNoActions")}</li>
              <li>{planned("scopeProduction")}</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
