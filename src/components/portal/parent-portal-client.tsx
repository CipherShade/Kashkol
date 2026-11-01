"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth";
import { Icon, type IconName } from "@/components/ui/icon";
import { PWAInstallBanner } from "@/components/pwa/pwa-install-banner";
import {
  PortalNotificationsPanel,
  type PortalNotificationItem,
} from "./portal-notifications-panel";
import type { PortalPermissions } from "@/modules/portals/schemas";

type LinkedChildSummary = {
  grantId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  teachingName: string;
  primarySubject: string | null;
  groups: Array<{ id: string; name: string; grade: string | null }>;
  unreadNotificationsCount: number;
  permissions: PortalPermissions;
};

type ParentChildDetail = {
  grantId: string;
  kind: "parent";
  permissions: PortalPermissions;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    grade: string | null;
  };
  teacher: {
    teachingName: string;
    primarySubject: string | null;
    currency: string;
    timezone: string;
  };
  groups: Array<{
    id: string;
    name: string;
    grade: string | null;
    room: string | null;
    weekday: number;
    startTime: string | null;
    endTime: string | null;
    subjectName: string | null;
  }>;
  attendance: {
    summary: {
      present: number;
      absent: number;
      late: number;
      excused: number;
      total: number;
      attendanceRate: number | null;
    };
    records: Array<{
      id: string;
      mark: "present" | "absent" | "late" | "excused";
      recordedAt: string;
      session: {
        id: string;
        startsAt: string;
        endsAt: string | null;
        status: string;
        groupName: string;
      };
    }>;
  } | null;
  grades: Array<{
    id: string;
    score: number | null;
    status: "graded" | "missing" | "excused" | "not_taken";
    updatedAt: string;
    assessment: {
      id: string;
      title: string;
      type: string;
      date: string;
      maxScore: number;
      groupName: string;
      publishedAt: string;
    };
  }> | null;
  homework: Array<{
    id: string;
    title: string;
    instructions: string | null;
    dueAt: string;
    maxScore: number | null;
    groupName: string | null;
    submission: {
      status: "not_submitted" | "submitted" | "late" | "excused";
      score: number | null;
      submittedAt: string | null;
    };
    resources: Array<{
      fileId: string;
      title: string;
      mime: string;
      sizeBytes: number;
      downloadUrl: string;
    }>;
  }> | null;
  resources: Array<{
    id: string;
    title: string;
    description: string | null;
    topic: string | null;
    mime: string;
    sizeBytes: number;
    subjectName: string | null;
    createdAt: string;
    downloadUrl: string;
  }> | null;
  videos?: Array<{
    id: string;
    title: string;
    description: string | null;
    topic: string | null;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
    subjectName: string | null;
    publishedAt: string | null;
    playbackEndpoint: string;
  }> | null;
  payments: {
    currency: string;
    balance: {
      expectedMinor: number;
      receivedMinor: number;
      adjustmentsMinor: number;
      balanceMinor: number;
    };
    history: Array<{
      id: string;
      period: string | null;
      amountMinor: number;
      currency: string;
      method: string;
      methodLabel: string | null;
      paidOn: string;
      purpose: string | null;
      referenceNumber: string | null;
    }>;
    adjustments: Array<{
      id: string;
      kind: string;
      amountMinor: number;
      balanceImpact: number;
      currency: string;
      paidOn: string;
      reason: string;
    }>;
  } | null;
  schedule: {
    upcomingSessions: Array<{
      id: string;
      startsAt: string;
      endsAt: string | null;
      status: string;
      room: string | null;
      location: string | null;
      groupName: string;
      cancelledAt: string | null;
      isRescheduled: boolean;
    }>;
    recentChanges: Array<{
      id: string;
      sessionId: string;
      groupName: string;
      changeType: "cancelled" | "rescheduled";
      startsAt: string;
      createdAt: string;
    }>;
  } | null;
  notifications: PortalNotificationItem[] | null;
};

type TabKey =
  | "schedule"
  | "attendance"
  | "grades"
  | "homework"
  | "resources"
  | "payments"
  | "notifications";

function formatMoney(amountMinor: number, currency: string): string {
  const major = (amountMinor / 100).toFixed(2);
  return `${major} ${currency}`;
}

export function ParentPortalClient({
  userEmail,
  userName,
  childrenList,
  initialChild,
}: {
  userEmail: string;
  userName: string;
  childrenList: LinkedChildSummary[];
  initialChild: ParentChildDetail;
}) {
  const t = useTranslations("Portal.parent");
  const [activeChild, setActiveChild] =
    useState<ParentChildDetail>(initialChild);
  const [loadingChildId, setLoadingChildId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("schedule");
  const [activeVideoPlayback, setActiveVideoPlayback] = useState<{
    videoId: string;
    title: string;
    embedUrl: string;
  } | null>(null);
  const [videoPlaybackError, setVideoPlaybackError] = useState(false);

  const handleWatchVideo = async (video: {
    id: string;
    title: string;
    playbackEndpoint: string;
  }) => {
    setVideoPlaybackError(false);
    try {
      const res = await fetch(
        `${video.playbackEndpoint}?studentId=${encodeURIComponent(activeChild.student.id)}`,
        { method: "POST", cache: "no-store" },
      );
      if (!res.ok) {
        setVideoPlaybackError(true);
        return;
      }
      const data = (await res.json()) as {
        videoId: string;
        title: string;
        playback: { embedUrl: string };
      };
      setActiveVideoPlayback({
        videoId: data.videoId,
        title: data.title,
        embedUrl: data.playback.embedUrl,
      });
    } catch {
      setVideoPlaybackError(true);
    }
  };

  const handleSelectChild = async (studentId: string) => {
    if (studentId === activeChild.student.id) return;
    setLoadingChildId(studentId);
    setActiveVideoPlayback(null);
    try {
      const res = await fetch(
        `/api/portal/parent/children/${encodeURIComponent(studentId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const detail = (await res.json()) as ParentChildDetail;
      setActiveChild(detail);
      setActiveTab("schedule");
    } finally {
      setLoadingChildId(null);
    }
  };

  const perms = activeChild.permissions;

  const allTabs: Array<{
    key: TabKey;
    label: string;
    icon: IconName;
    visible: boolean;
  }> = [
    {
      key: "schedule",
      label: t("tabs.schedule"),
      icon: "calendar",
      visible: perms.showSchedule,
    },
    {
      key: "attendance",
      label: t("tabs.attendance"),
      icon: "checkCircle",
      visible: perms.showAttendance,
    },
    {
      key: "grades",
      label: t("tabs.grades"),
      icon: "student",
      visible: perms.showGrades,
    },
    {
      key: "homework",
      label: t("tabs.homework"),
      icon: "clipboard",
      visible: perms.showHomework,
    },
    {
      key: "resources",
      label: t("tabs.resources"),
      icon: "file",
      visible: perms.showResources,
    },
    {
      key: "payments",
      label: t("tabs.payments"),
      icon: "creditCard",
      visible: perms.showPayments,
    },
    {
      key: "notifications",
      label: t("tabs.notifications"),
      icon: "bell",
      visible: perms.showNotifications,
    },
  ];
  const availableTabs = allTabs.filter((tab) => tab.visible);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Top Role-Protected Portal Header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-subtle)] text-[var(--brand-fg)]">
              <Icon name="shield" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[var(--text-primary)]">
                  {t("portalTitle")}
                </h1>
                <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  {t("roleBadge")}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {userName} · <bdi>{userEmail}</bdi>
              </p>
            </div>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <PWAInstallBanner />

        {/* Multi-child selector when parent has multiple explicitly linked children */}
        {childrenList.length > 1 && (
          <section
            aria-label={t("linkedChildrenLabel")}
            className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4"
          >
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
              <Icon name="users" size={16} className="text-[var(--brand-fg)]" />
              <span>{t("linkedChildrenLabel")}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {childrenList.map((child) => {
                const isSelected = child.studentId === activeChild.student.id;
                return (
                  <button
                    key={child.studentId}
                    type="button"
                    disabled={loadingChildId !== null}
                    onClick={() => void handleSelectChild(child.studentId)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-start text-xs font-semibold transition ${
                      isSelected
                        ? "border-[var(--brand-fg)] bg-[var(--brand-subtle)] text-[var(--brand-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span>
                      {child.firstName} {child.lastName}
                    </span>
                    {child.grade && (
                      <span className="text-[11px] opacity-80">
                        · {child.grade}
                      </span>
                    )}
                    {child.unreadNotificationsCount > 0 && (
                      <span className="rounded-full bg-[var(--brand-fg)] px-1.5 py-0.5 text-[10px] text-white">
                        {child.unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Child Banner */}
        <section className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {activeChild.student.firstName} {activeChild.student.lastName}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {activeChild.teacher.teachingName}
                {activeChild.teacher.primarySubject
                  ? ` · ${activeChild.teacher.primarySubject}`
                  : ""}
                {activeChild.student.grade
                  ? ` · ${activeChild.student.grade}`
                  : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {activeChild.groups.map((group) => (
                <span
                  key={group.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {group.name}
                  {group.startTime ? ` (${group.startTime})` : ""}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <nav
          aria-label={t("portalSectionsLabel")}
          className="mb-6 flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-3"
        >
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "bg-[var(--brand-subtle)] text-[var(--brand-fg)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon name={tab.icon} size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab 1: Schedule & Schedule Changes */}
        {activeTab === "schedule" && activeChild.schedule && (
          <div className="space-y-6">
            {activeChild.schedule.recentChanges.length > 0 && (
              <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-subtle)] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--warning-fg)]">
                  <Icon name="alert" size={16} />
                  <span>{t("scheduleChangesTitle")}</span>
                </div>
                <ul className="mt-2.5 space-y-2 text-xs text-[var(--text-primary)]">
                  {activeChild.schedule.recentChanges.map((change) => (
                    <li
                      key={change.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-elevated)] px-3 py-2"
                    >
                      <span className="font-medium">
                        {change.groupName} —{" "}
                        {change.changeType === "cancelled"
                          ? t("sessionCancelled")
                          : t("sessionRescheduled")}
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {new Date(change.startsAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("upcomingSessionsTitle")}
                </h3>
              </div>
              {activeChild.schedule.upcomingSessions.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noUpcomingSessions")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {activeChild.schedule.upcomingSessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {session.groupName}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                          <Icon name="clock" size={14} />
                          <span>
                            {new Date(session.startsAt).toLocaleString()}
                          </span>
                          {session.room ? ` · ${session.room}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                          session.status === "cancelled"
                            ? "bg-[var(--danger-subtle)] text-[var(--danger-fg)]"
                            : session.isRescheduled
                              ? "bg-[var(--warning-subtle)] text-[var(--warning-fg)]"
                              : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {session.status === "cancelled"
                          ? t("sessionCancelled")
                          : session.isRescheduled
                            ? t("sessionRescheduled")
                            : t("sessionScheduled")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Permitted Attendance */}
        {activeTab === "attendance" && activeChild.attendance && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.rate")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--text-primary)]">
                  {activeChild.attendance.summary.attendanceRate !== null
                    ? `${activeChild.attendance.summary.attendanceRate}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.present")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--success-fg)]">
                  {activeChild.attendance.summary.present}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.absent")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--danger-fg)]">
                  {activeChild.attendance.summary.absent}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.late")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--warning-fg)]">
                  {activeChild.attendance.summary.late}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.excused")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--text-secondary)]">
                  {activeChild.attendance.summary.excused}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("attendanceHistoryTitle")}
                </h3>
              </div>
              {activeChild.attendance.records.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noAttendanceRecords")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {activeChild.attendance.records.map((rec) => (
                    <li
                      key={rec.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {rec.session.groupName}
                        </p>
                        <p className="font-mono text-xs text-[var(--text-secondary)]">
                          {new Date(rec.session.startsAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                        {t(`attendanceMark.${rec.mark}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Published Grades Only */}
        {activeTab === "grades" && activeChild.grades && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("publishedGradesTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t("publishedGradesSubtitle")}
              </p>
            </div>
            {activeChild.grades.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("noPublishedGrades")}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {activeChild.grades.map((grade) => (
                  <li
                    key={grade.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {grade.assessment.title}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {grade.assessment.groupName} · {grade.assessment.date}
                      </p>
                    </div>
                    <div className="text-end font-mono">
                      {grade.score !== null ? (
                        <span className="text-base font-bold text-[var(--text-primary)]">
                          {grade.score} / {grade.assessment.maxScore}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">
                          {t(`gradeStatus.${grade.status}`)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tab 4: Assigned Homework */}
        {activeTab === "homework" && activeChild.homework && (
          <div className="space-y-4">
            {activeChild.homework.length === 0 ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("noHomework")}
              </div>
            ) : (
              activeChild.homework.map((hw) => (
                <div
                  key={hw.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {hw.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {hw.groupName ? `${hw.groupName} · ` : ""}
                        {t("dueAtLabel")}:{" "}
                        {new Date(hw.dueAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                      {t(`homeworkStatus.${hw.submission.status}`)}
                      {hw.submission.score !== null && hw.maxScore !== null
                        ? ` · ${hw.submission.score}/${hw.maxScore}`
                        : ""}
                    </span>
                  </div>

                  {hw.instructions && (
                    <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {hw.instructions}
                    </p>
                  )}

                  {hw.resources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {hw.resources.map((res) => (
                        <a
                          key={res.fileId}
                          href={res.downloadUrl}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                        >
                          <Icon name="download" size={14} />
                          <span>{res.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 5: Shared Clean Resources & Recorded Video Lessons */}
        {activeTab === "resources" && activeChild.resources && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("sharedResourcesTitle")}
                </h3>
              </div>
              {activeChild.resources.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noSharedResources")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {activeChild.resources.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {file.title}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {file.subjectName ? `${file.subjectName} · ` : ""}
                          {file.topic ? `${file.topic} · ` : ""}
                          {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                        </p>
                      </div>
                      <a
                        href={file.downloadUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      >
                        <Icon name="download" size={14} />
                        <span>{t("downloadResource")}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {activeChild.videos ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t("videos.title")}
                  </h3>
                </div>
                {videoPlaybackError ? (
                  <p className="px-4 py-2 text-xs text-[var(--danger-fg)]" role="alert">
                    {t("videos.playbackError")}
                  </p>
                ) : null}
                {activeVideoPlayback ? (
                  <div className="border-b border-[var(--border-subtle)] p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs">{activeVideoPlayback.title}</strong>
                      <button
                        type="button"
                        onClick={() => setActiveVideoPlayback(null)}
                        className="text-xs text-[var(--text-secondary)] underline"
                      >
                        {t("videos.closeVideo")}
                      </button>
                    </div>
                    <iframe
                      title={activeVideoPlayback.title}
                      src={activeVideoPlayback.embedUrl}
                      className="h-60 w-full rounded border border-[var(--border-subtle)]"
                      allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : null}
                {activeChild.videos.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    {t("videos.empty")}
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {activeChild.videos.map((video) => (
                      <li
                        key={video.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {video.title}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {video.subjectName ? `${video.subjectName} · ` : ""}
                            {video.topic ? `${video.topic} · ` : ""}
                            {video.durationSeconds !== null
                              ? t("videos.durationSeconds", { seconds: video.durationSeconds })
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleWatchVideo(video)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        >
                          <span>{t("videos.watchAction")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 6: Approved Payments & Balance */}
        {activeTab === "payments" && activeChild.payments && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("paymentStats.expected")}
                </span>
                <p className="mt-1 font-mono text-lg font-bold text-[var(--text-primary)]">
                  {formatMoney(
                    activeChild.payments.balance.expectedMinor,
                    activeChild.payments.currency,
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("paymentStats.received")}
                </span>
                <p className="mt-1 font-mono text-lg font-bold text-[var(--success-fg)]">
                  {formatMoney(
                    activeChild.payments.balance.receivedMinor,
                    activeChild.payments.currency,
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("paymentStats.outstanding")}
                </span>
                <p className="mt-1 font-mono text-lg font-bold text-[var(--text-primary)]">
                  {formatMoney(
                    activeChild.payments.balance.balanceMinor,
                    activeChild.payments.currency,
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("paymentHistoryTitle")}
                </h3>
              </div>
              {activeChild.payments.history.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noPaymentsRecorded")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {activeChild.payments.history.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {payment.purpose ?? payment.period ?? t("tuitionPayment")}
                        </p>
                        <p className="font-mono text-xs text-[var(--text-secondary)]">
                          {payment.paidOn}
                          {payment.referenceNumber
                            ? ` · #${payment.referenceNumber}`
                            : ""}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-[var(--success-fg)]">
                        {formatMoney(payment.amountMinor, payment.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tab 7: In-App Notifications & Push Privacy */}
        {activeTab === "notifications" && (
          <PortalNotificationsPanel
            initialNotifications={activeChild.notifications}
          />
        )}
      </main>
    </div>
  );
}
