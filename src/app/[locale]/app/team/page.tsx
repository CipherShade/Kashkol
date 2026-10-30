import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { TeamManagement } from "@/components/workspace/team-management";
import { requireStaffSession } from "@/modules/identity/session";
import { listMembers, listWorkspaceInvitations } from "@/modules/tenancy/service";
import { isAllowed } from "@/modules/tenancy/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Team" });
  return { title: t("title") };
}

export default async function TeamPage() {
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Team");
  if (!isAllowed(scope, "team", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card><CardBody><EmptyState icon="lock" title={t("noAccess")} /></CardBody></Card>
      </div>
    );
  }

  const [members, invitations] = await Promise.all([
    listMembers(scope),
    listWorkspaceInvitations(scope),
  ]);
  const canManageTeam = scope.role === "owner";
  const columns: Array<Column<(typeof members)[number]>> = [
    { key: "name", header: t("member"), cell: (member) => member.user.name },
    { key: "email", header: t("email"), cell: (member) => <bdi>{member.user.email}</bdi> },
    { key: "role", header: t("roleLabel"), cell: (member) => t(`role.${member.role}`) },
    { key: "status", header: t("statusLabel"), cell: (member) => t(`status.${member.status}`) },
  ];

  return (
    <div className="app-page">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {canManageTeam ? (
        <TeamManagement members={members} invitations={invitations} />
      ) : (
        <>
          <Alert tone="info">{t("assistantReadOnly")}</Alert>
          <Card labelledBy="team-members-title">
            <CardHeader title={t("membersTitle")} titleId="team-members-title" />
            <CardBody>
              <DataTable
                caption={t("membersCaption")}
                scrollLabel={t("membersCaption")}
                columns={columns}
                rows={members}
                rowKey={(member) => member.id}
                empty={t("noMembers")}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
