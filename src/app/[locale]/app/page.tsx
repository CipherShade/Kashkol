import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Progress, Stat } from "@/components/ui/stat";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { requireStaffSession } from "@/modules/identity/session";
import { getOnboardingTasks, getWorkspaceIdentity, listMembers } from "@/modules/tenancy/service";
import { isAllowed } from "@/modules/tenancy/types";

const TASK_KEYS: Record<string, string> = {
  teaching_name: "taskTeachingName",
  grades: "taskGrades",
  first_group: "taskFirstGroup",
  first_students: "taskFirstStudents",
};

const UNAVAILABLE_TASKS = new Set(["first_group", "first_students"]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("title") };
}

type MemberRow = Awaited<ReturnType<typeof listMembers>>[number];

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { user, scope } = await requireStaffSession();
  const t = await getTranslations("Dashboard");
  const shell = await getTranslations("Shell");
  const workspaceT = await getTranslations("Workspace");

  const [workspace, tasks] = await Promise.all([
    getWorkspaceIdentity(scope),
    getOnboardingTasks(scope),
  ]);

  const canSeeTeam = isAllowed(scope, "team", "read");
  const canSeeSettings = isAllowed(scope, "settings", "read");
  const members = canSeeTeam ? await listMembers(scope) : [];

  const roleLabel = (role: string) =>
    role === "owner" ? workspaceT("roleOwner") : workspaceT("roleAssistant");
  const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  const knownTasks = tasks.filter((task) => TASK_KEYS[task.key]);
  const doneTasks = knownTasks.filter((task) => task.completedAt !== null).length;
  const completion = knownTasks.length > 0 ? (doneTasks / knownTasks.length) * 100 : 0;

  const columns: Array<Column<MemberRow>> = [
    {
      key: "name",
      header: t("memberName"),
      cell: (member) => (
        <span className="app-person">
          <Avatar name={member.user.name} size="sm" />
          <span className="app-person-text">
            <span className="app-person-name">{member.user.name}</span>
            <span className="app-person-meta">{roleLabel(member.role)}</span>
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
      key: "joined",
      header: t("memberJoined"),
      cell: (member) => <span className="app-muted">{dateFormat.format(member.joinedAt)}</span>,
      align: "end",
    },
  ];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          canSeeSettings ? (
            <Link
              href="/app/settings"
              className="ui-button"
              data-variant="secondary"
              data-size="md"
            >
              <Icon name="gear" size={16} />
              <span>{t("manageSettings")}</span>
            </Link>
          ) : null
        }
      />

      <p className="app-muted">{shell("greeting", { name: user.name })}</p>

      <div className="app-stat-grid">
        <Stat
          label={t("statMembers")}
          value={canSeeTeam ? members.length : "—"}
          hint={canSeeTeam ? t("statMembersHint") : t("permissionHidden")}
          icon="users"
        />
        <Stat
          label={t("statSetup")}
          value={`${doneTasks}/${knownTasks.length}`}
          hint={t("statSetupHint")}
          icon="checkCircle"
        />
        <Stat
          label={t("statRole")}
          value={roleLabel(scope.role)}
          hint={t("statRoleHint")}
          icon="shield"
        />
        <Stat
          label={t("statStatus")}
          value={
            <Badge tone="success" icon="checkCircle">
              {workspace.status === "active" ? t("active") : workspace.status}
            </Badge>
          }
          hint={<bdi className="ui-code">{workspace.slug}</bdi>}
          icon="activity"
        />
      </div>

      <div className="app-dashboard-grid">
        <Card labelledBy="workspace-card-title">
          <CardHeader title={t("workspaceCard")} titleId="workspace-card-title" />
          <CardBody>
            <dl className="app-fact-list">
              <div className="app-fact-row">
                <dt className="app-fact-label">{workspaceT("name")}</dt>
                <dd className="app-fact-value">{workspace.name}</dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("teachingName")}</dt>
                <dd className="app-fact-value">{workspace.teachingName}</dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("primarySubject")}</dt>
                <dd className="app-fact-value">{workspace.primarySubject ?? "—"}</dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("grades")}</dt>
                <dd className="app-fact-value">
                  {workspace.gradesTaught.length > 0
                    ? listFormat.format(workspace.gradesTaught)
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card labelledBy="checklist-title">
          <CardHeader
            title={t("checklist")}
            titleId="checklist-title"
            description={t("checklistHint")}
          />
          <CardBody>
            <div className="app-progress-row">
              <Progress value={completion} label={t("setupProgress")} />
              <span className="app-progress-value">
                {doneTasks}/{knownTasks.length}
              </span>
            </div>
            <ul className="app-checklist">
              {knownTasks.map((task) => {
                const key = TASK_KEYS[task.key];
                if (!key) return null;
                const done = task.completedAt !== null;
                const unavailable = UNAVAILABLE_TASKS.has(task.key);
                return (
                  <li key={task.key} className="app-checklist-item" data-done={done}>
                    <span className="app-checklist-label">{t(key)}</span>
                    {done ? (
                      <Badge tone="success" icon="checkCircle">
                        {t("checklistDone")}
                      </Badge>
                    ) : unavailable ? (
                      <Badge tone="accent" icon="clock">
                        {t("checklistPlanned")}
                      </Badge>
                    ) : (
                      <Badge tone="outline" icon="clock">
                        {t("checklistPending")}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {canSeeTeam ? (
          <Card labelledBy="members-title" className="app-dashboard-span">
            <CardHeader
              title={t("membersTitle")}
              titleId="members-title"
              description={t("membersHint")}
              actions={
                canSeeSettings ? (
                  <Link
                    href="/app/settings"
                    className="ui-button"
                    data-variant="ghost"
                    data-size="sm"
                  >
                    {t("manageSettings")}
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
                empty={workspaceT("membersEmpty")}
              />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <p className="app-inline-note">
        <Icon name="shield" size={15} />
        <span>{t("auditNote")}</span>
      </p>
    </div>
  );
}
