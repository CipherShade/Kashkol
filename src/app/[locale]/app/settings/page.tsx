import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignOutEverywhereDialog } from "@/components/app/account-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { PageHeader } from "@/components/ui/page-header";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { Link } from "@/i18n/navigation";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { requireStaffSession } from "@/modules/identity/session";
import { getWorkspaceOverview, listMembers } from "@/modules/tenancy/service";
import { isAllowed } from "@/modules/tenancy/types";
import { WorkspaceSettingsForm } from "@/components/workspace/forms";
import { NotificationPreferencesForm } from "@/components/workspace/notification-preferences";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Workspace" });
  return { title: t("settingsTitle") };
}

type MemberRow = Awaited<ReturnType<typeof listMembers>>[number];

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Workspace");
  const shell = await getTranslations("Shell");

  if (!isAllowed(scope, "settings", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("settingsTitle")} description={t("settingsSubtitle")} />
        <Card>
          <CardBody>
            <EmptyState
              icon="lock"
              title={t("noSettingsAccessTitle")}
              description={t("noSettingsAccess")}
              action={
                <Link href="/app" className="ui-button" data-variant="secondary">
                  {t("backToDashboard")}
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const [overview, preferredTheme] = await Promise.all([
    getWorkspaceOverview(scope),
    getPreferredTheme().catch(() => null),
  ]);
  const canSeeTeam = isAllowed(scope, "team", "read");
  const canWrite = isAllowed(scope, "settings", "write");
  const canReadIntegrations = isAllowed(scope, "integrations", "read");
  const canWriteIntegrations = isAllowed(scope, "integrations", "write");
  const members = canSeeTeam ? await listMembers(scope) : [];
  const roleLabel = (role: string) =>
    role === "owner" ? t("roleOwner") : t("roleAssistant");
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  const tabItems = [
    { value: "workspace", label: t("tabWorkspace") },
    ...(canSeeTeam ? [{ value: "team", label: t("tabTeam") }] : []),
    { value: "sessions", label: t("tabSessions") },
  ];

  const columns: Array<Column<MemberRow>> = [
    {
      key: "name",
      header: t("memberName"),
      cell: (member) => (
        <span className="app-person">
          <Avatar name={member.user.name} size="sm" />
          <span className="app-person-text">
            <span className="app-person-name">{member.user.name}</span>
            <span className="app-person-meta">
              <bdi>{member.user.email}</bdi>
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: t("memberRole"),
      cell: (member) => (
        <Badge tone={member.role === "owner" ? "primary" : "outline"} icon="staff">
          {roleLabel(member.role)}
        </Badge>
      ),
    },
    {
      key: "grants",
      header: t("memberPermissions"),
      cell: (member) =>
        member.role === "owner" ? (
          <span className="app-muted">{t("allPermissions")}</span>
        ) : (
          <span className="app-muted">{member.grants.length}</span>
        ),
      align: "end",
    },
    {
      key: "joined",
      header: t("memberJoined"),
      cell: (member) => <span className="app-muted">{dateFormat.format(member.joinedAt)}</span>,
      align: "end",
    },
  ];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow={t("settingsEyebrow")}
        title={t("settingsTitle")}
        description={t("settingsSubtitle")}
        actions={
          <Link href="/app/account" className="ui-button" data-variant="secondary">
            <Icon name="user" size={16} />
            <span>{shell("account")}</span>
          </Link>
        }
      />

      <Tabs items={tabItems} label={t("settingsTabsLabel")}>
        <TabPanel value="workspace">
          <div className="app-page-section">
            <Card labelledBy="personal-preferences-title">
              <CardHeader
                title={t("personalPreferencesTitle")}
                titleId="personal-preferences-title"
                description={t("personalPreferencesHint")}
              />
              <CardBody>
                <div className="ui-form-row">
                  <div className="ui-field">
                    <span className="ui-label">{t("languageLabel")}</span>
                    <LanguageSwitch />
                  </div>
                  <div className="ui-field">
                    <span className="ui-label">{t("themeLabel")}</span>
                    <ThemeSwitch initialTheme={preferredTheme ?? "system"} />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card labelledBy="settings-form-title">
              <CardHeader
                title={t("profileSection")}
                titleId="settings-form-title"
                description={t("workspaceDefaultsHint")}
              />
              <CardBody>
                <WorkspaceSettingsForm
                  locale={locale}
                  canWrite={canWrite}
                  defaults={{
                    name: overview.workspace.name,
                    teachingName: overview.workspace.teachingName,
                    primarySubject: overview.workspace.primarySubject,
                    gradesTaught: overview.workspace.gradesTaught,
                    atRiskAfter: overview.settings.atRiskAfter,
                    inactiveAfter: overview.settings.inactiveAfter,
                    locale: overview.settings.locale,
                    theme: overview.settings.theme,
                    timezone: overview.settings.timezone,
                    currency: overview.settings.currency,
                  }}
                />
              </CardBody>
            </Card>

            {canReadIntegrations ? (
              <Card labelledBy="notification-settings-title">
                <CardHeader
                  title={t("notificationPreferencesTitle")}
                  titleId="notification-settings-title"
                  description={t("notificationPreferencesHint")}
                />
                <CardBody>
                  <NotificationPreferencesForm canWrite={canWriteIntegrations} />
                </CardBody>
              </Card>
            ) : null}
          </div>
        </TabPanel>

        {canSeeTeam ? (
          <TabPanel value="team">
            <Card labelledBy="team-title">
              <CardHeader
                title={t("teamSection")}
                titleId="team-title"
                description={t("teamReadOnly")}
                actions={
                  scope.role === "owner" ? (
                    <Link href="/app/team" className="ui-button" data-variant="secondary">
                      {t("manageTeam")}
                    </Link>
                  ) : null
                }
              />
              <CardBody>
                <DataTable
                  caption={t("membersTableCaption")}
                  scrollLabel={t("membersTableScroll")}
                  columns={columns}
                  rows={members}
                  rowKey={(member) => member.id}
                  empty={t("membersEmpty")}
                />
              </CardBody>
            </Card>
          </TabPanel>
        ) : null}

        <TabPanel value="sessions">
          <Card labelledBy="sessions-title">
            <CardHeader
              title={t("sessionsTitle")}
              titleId="sessions-title"
              description={t("sessionsHint")}
            />
            <CardBody>
              <p className="app-note">{t("sessionsBody")}</p>
              <div className="ui-form-actions">
                <SignOutEverywhereDialog locale={locale} />
              </div>
            </CardBody>
          </Card>
        </TabPanel>
      </Tabs>
    </div>
  );
}
