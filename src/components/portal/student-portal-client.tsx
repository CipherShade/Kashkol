"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { PWAInstallBanner } from "@/components/pwa/pwa-install-banner";
import {
  PortalNotificationsPanel,
  type PortalNotificationItem,
} from "./portal-notifications-panel";
import type { PortalPermissions } from "@/modules/portals/schemas";

type StudentPortalDetail = {
  grantId: string;
  kind: "student";
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
    timezone: string;
  };
  groups: Array<{
    id: string;
    name: string;
    grade: string | null;
    slots: Array<{
      weekday: number;
      startTime: string | null;
      endTime: string | null;
      room: string | null;
      capacity: number | null;
    }>;
    subjectName: string | null;
  }>;
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
  }> | null;
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
      isCrossSeason?: boolean;
      session: {
        id: string;
        startsAt: string;
        endsAt: string | null;
        status: string;
        groupName: string;
      };
    }>;
  } | null;
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
  notifications: PortalNotificationItem[] | null;
};

type StudentOnlineExamItem = {
  id: string;
  groupName: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: "published" | "closed";
  availableFrom: string;
  availableUntil: string;
  durationMinutes: number | null;
  maxAttempts: number;
  maxScore: number;
  questionCount: number;
  isWithinWindow: boolean;
  canStartAttempt: boolean;
  resultsVisible: boolean;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: "in_progress" | "submitted" | "graded";
    startedAt: string;
    submittedAt: string | null;
    gradedAt: string | null;
    totalScore: number | null;
    responses: Array<{
      questionId: string;
      answer: unknown;
      isCorrect: boolean | null;
      pointsAwarded: number | null;
      teacherFeedback: string | null;
    }>;
  }>;
};

type ActiveStudentAttemptPayload = {
  attempt: {
    id: string;
    attemptNumber: number;
    status: "in_progress" | "submitted" | "graded";
    startedAt: string;
  };
  exam: {
    id: string;
    title: string;
    instructions: string | null;
    durationMinutes: number | null;
    availableUntil: string;
    maxScore: number;
    questions: Array<{
      id: string;
      position: number;
      type: "mcq_single" | "true_false" | "short_answer" | "essay";
      prompt: string;
      points: number;
      options: Array<{ id: string; text: string }> | null;
    }>;
  };
  responses: Array<{
    questionId: string;
    answer: unknown;
  }>;
};

type StudentTabKey =
  | "sessions"
  | "homework"
  | "exams"
  | "grades"
  | "attendance"
  | "resources"
  | "notifications";

export type StudentCheckInStatus =
  | { state: "success"; sessionId: string }
  | { state: "already" }
  | { state: "invalid" }
  | { state: "failed" };

export function StudentPortalClient({
  userEmail,
  userName,
  initialDetail,
  initialCheckin = null,
}: {
  userEmail: string;
  userName: string;
  initialDetail: StudentPortalDetail;
  /** The scanned QR token from `?checkin=`, consumed exactly once on mount. */
  initialCheckin: string | null;
}) {
  const t = useTranslations("Portal.student");
  const [detail, setDetail] = useState<StudentPortalDetail>(initialDetail);
  const [activeTab, setActiveTab] = useState<StudentTabKey>("sessions");
  const [checkinStatus, setCheckinStatus] = useState<StudentCheckInStatus | null>(null);
  const checkinStarted = useRef(false);
  const [submittingHomeworkId, setSubmittingHomeworkId] = useState<
    string | null
  >(null);
  const [activeVideoPlayback, setActiveVideoPlayback] = useState<{
    videoId: string;
    title: string;
    embedUrl: string;
  } | null>(null);
  const [videoPlaybackError, setVideoPlaybackError] = useState(false);

  const [onlineExams, setOnlineExams] = useState<StudentOnlineExamItem[]>([]);
  const [examsLoaded, setExamsLoaded] = useState(false);
  const [activeAttempt, setActiveAttempt] =
    useState<ActiveStudentAttemptPayload | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
  const [examBusy, setExamBusy] = useState(false);
  const [examError, setExamError] = useState(false);

  const perms = detail.permissions;

  // The QR check-in (F-P2-05, OQ-05 default (a)) fires exactly once per page
  // load: the token is single-use on the server, and a re-submit would only
  // produce a redundant audit entry. The server is the authority on every
  // outcome; the client only reports what the server said.
  useEffect(() => {
    if (!initialCheckin || checkinStarted.current) return;
    checkinStarted.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/portal/attendance/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: initialCheckin,
            studentId: detail.student.id,
          }),
        });
        if (res.ok) {
          const payload = (await res.json()) as { sessionId?: string };
          setCheckinStatus({
            state: "success",
            sessionId: payload.sessionId ?? "",
          });
          if (perms.showAttendance) setActiveTab("attendance");
          return;
        }
        const payload = (await res.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const code = payload?.error?.code;
        if (res.status === 409 || code === "CONFLICT") {
          setCheckinStatus({ state: "already" });
        } else if (res.status === 403 || code === "FORBIDDEN") {
          setCheckinStatus({ state: "invalid" });
        } else {
          setCheckinStatus({ state: "failed" });
        }
      } catch {
        setCheckinStatus({ state: "failed" });
      }
    })();
  }, [initialCheckin, detail.student.id, perms.showAttendance]);

  const loadStudentExams = async () => {
    setExamBusy(true);
    setExamError(false);
    try {
      const res = await fetch(
        `/api/portal/student/exams?studentId=${encodeURIComponent(detail.student.id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setExamError(true);
        return;
      }
      const data = (await res.json()) as { exams: StudentOnlineExamItem[] };
      setOnlineExams(data.exams);
      setExamsLoaded(true);
    } catch {
      setExamError(true);
    } finally {
      setExamBusy(false);
    }
  };

  const handleStartOrResumeExam = async (examId: string) => {
    setExamBusy(true);
    setExamError(false);
    try {
      const res = await fetch(
        `/api/portal/student/exams/${encodeURIComponent(examId)}/attempts?studentId=${encodeURIComponent(detail.student.id)}`,
        { method: "POST", cache: "no-store" },
      );
      if (!res.ok) {
        setExamError(true);
        return;
      }
      const payload = (await res.json()) as ActiveStudentAttemptPayload;
      const map: Record<string, unknown> = {};
      for (const r of payload.responses) {
        map[r.questionId] = r.answer;
      }
      setDraftAnswers(map);
      setActiveAttempt(payload);
    } catch {
      setExamError(true);
    } finally {
      setExamBusy(false);
    }
  };

  const handleSaveDraftAnswers = async () => {
    if (!activeAttempt) return;
    setExamBusy(true);
    setExamError(false);
    try {
      const responses = activeAttempt.exam.questions.map((q) => ({
        questionId: q.id,
        answer: draftAnswers[q.id] ?? null,
      }));
      const res = await fetch(
        `/api/portal/student/exams/${encodeURIComponent(activeAttempt.exam.id)}/attempts/${encodeURIComponent(activeAttempt.attempt.id)}?studentId=${encodeURIComponent(detail.student.id)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ responses }),
        },
      );
      if (!res.ok) setExamError(true);
    } catch {
      setExamError(true);
    } finally {
      setExamBusy(false);
    }
  };

  const handleSubmitFinalExam = async () => {
    if (!activeAttempt) return;
    setExamBusy(true);
    setExamError(false);
    try {
      const responses = activeAttempt.exam.questions.map((q) => ({
        questionId: q.id,
        answer: draftAnswers[q.id] ?? null,
      }));
      const res = await fetch(
        `/api/portal/student/exams/${encodeURIComponent(activeAttempt.exam.id)}/attempts/${encodeURIComponent(activeAttempt.attempt.id)}?studentId=${encodeURIComponent(detail.student.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ responses }),
        },
      );
      if (!res.ok) {
        setExamError(true);
        return;
      }
      setActiveAttempt(null);
      await loadStudentExams();
    } catch {
      setExamError(true);
    } finally {
      setExamBusy(false);
    }
  };

  const handleWatchVideo = async (video: {
    id: string;
    title: string;
    playbackEndpoint: string;
  }) => {
    setVideoPlaybackError(false);
    try {
      const res = await fetch(
        `${video.playbackEndpoint}?studentId=${encodeURIComponent(detail.student.id)}`,
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

  const allTabs: Array<{
    key: StudentTabKey;
    label: string;
    icon: IconName;
    visible: boolean;
  }> = [
    {
      key: "sessions",
      label: t("tabs.sessions"),
      icon: "calendar",
      visible: perms.showSchedule,
    },
    {
      key: "homework",
      label: t("tabs.homework"),
      icon: "clipboard",
      visible: perms.showHomework,
    },
    {
      key: "exams",
      label: t("tabs.exams"),
      icon: "clipboard",
      visible: perms.showGrades || perms.showHomework,
    },
    {
      key: "grades",
      label: t("tabs.grades"),
      icon: "student",
      visible: perms.showGrades,
    },
    {
      key: "attendance",
      label: t("tabs.attendance"),
      icon: "checkCircle",
      visible: perms.showAttendance,
    },
    {
      key: "resources",
      label: t("tabs.resources"),
      icon: "file",
      visible: perms.showResources,
    },
    {
      key: "notifications",
      label: t("tabs.notifications"),
      icon: "bell",
      visible: perms.showNotifications,
    },
  ];
  const availableTabs = allTabs.filter((tab) => tab.visible);

  const handleMarkHomeworkSubmitted = async (homeworkId: string) => {
    setSubmittingHomeworkId(homeworkId);
    try {
      const res = await fetch(
        `/api/portal/student/homework/${encodeURIComponent(homeworkId)}/submit?studentId=${encodeURIComponent(detail.student.id)}`,
        { method: "POST" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        submission: {
          homeworkId: string;
          status: "submitted" | "late";
          submittedAt: string;
        };
      };

      setDetail((prev) => ({
        ...prev,
        homework:
          prev.homework?.map((hw) =>
            hw.id === homeworkId
              ? {
                  ...hw,
                  submission: {
                    ...hw.submission,
                    status: data.submission.status,
                    submittedAt: data.submission.submittedAt,
                  },
                }
              : hw,
          ) ?? null,
      }));
    } finally {
      setSubmittingHomeworkId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Top Role-Protected Student Portal Header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-subtle)] text-[var(--brand-fg)]">
              <Icon name="book" size={20} />
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

        {checkinStatus ? (
          <div
            role="status"
            className="mb-6 rounded-2xl border p-5 text-sm font-semibold"
            style={
              checkinStatus.state === "success"
                ? {
                    borderColor: "var(--success)",
                    background: "var(--success-tint)",
                    color: "var(--success-ink)",
                  }
                : checkinStatus.state === "failed"
                  ? {
                      borderColor: "var(--danger)",
                      background: "var(--danger-tint)",
                      color: "var(--danger-ink)",
                    }
                  : {
                      borderColor: "var(--warn)",
                      background: "var(--warn-tint)",
                      color: "var(--warn-ink)",
                    }
            }
          >
            {checkinStatus.state === "success" ? t("checkinSuccess") : null}
            {checkinStatus.state === "already" ? t("checkinAlready") : null}
            {checkinStatus.state === "invalid" ? t("checkinInvalid") : null}
            {checkinStatus.state === "failed" ? t("checkinFailed") : null}
          </div>
        ) : null}

        {/* Student Profile Banner */}
        <section className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {detail.student.firstName} {detail.student.lastName}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {detail.teacher.teachingName}
                {detail.teacher.primarySubject
                  ? ` · ${detail.teacher.primarySubject}`
                  : ""}
                {detail.student.grade ? ` · ${detail.student.grade}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {detail.groups.map((group) => (
                <span
                  key={group.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {group.name}
                  {group.slots.length > 0
                    ? ` (${group.slots.map((slot) => slot.startTime).filter(Boolean).join(" · ")})`
                    : ""}
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
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key === "exams" && !examsLoaded) {
                    void loadStudentExams();
                  }
                }}
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

        {/* Tab 1: Upcoming Sessions */}
        {activeTab === "sessions" && detail.upcomingSessions && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("upcomingSessionsTitle")}
              </h3>
            </div>
            {detail.upcomingSessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("noUpcomingSessions")}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {detail.upcomingSessions.map((session) => (
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
        )}

        {/* Tab 2: Assigned Homework */}
        {activeTab === "homework" && detail.homework && (
          <div className="space-y-4">
            {detail.homework.length === 0 ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("noHomework")}
              </div>
            ) : (
              detail.homework.map((hw) => (
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

                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                        {t(`homeworkStatus.${hw.submission.status}`)}
                        {hw.submission.score !== null && hw.maxScore !== null
                          ? ` · ${hw.submission.score}/${hw.maxScore}`
                          : ""}
                      </span>

                      {hw.submission.status === "not_submitted" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={submittingHomeworkId === hw.id}
                          onClick={() => void handleMarkHomeworkSubmitted(hw.id)}
                          className="gap-1.5"
                        >
                          <Icon name="checkCircle" size={14} />
                          <span>{t("markSubmittedAction")}</span>
                        </Button>
                      )}
                    </div>
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

        {/* Tab 3: Published Grades Only */}
        {activeTab === "grades" && detail.grades && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("publishedGradesTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t("publishedGradesSubtitle")}
              </p>
            </div>
            {detail.grades.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("noPublishedGrades")}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {detail.grades.map((grade) => (
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

        {/* Tab 4: Own Attendance */}
        {activeTab === "attendance" && detail.attendance && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.rate")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--text-primary)]">
                  {detail.attendance.summary.attendanceRate !== null
                    ? `${detail.attendance.summary.attendanceRate}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.present")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--success-fg)]">
                  {detail.attendance.summary.present}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.absent")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--danger-fg)]">
                  {detail.attendance.summary.absent}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.late")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--warning-fg)]">
                  {detail.attendance.summary.late}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("attendanceStats.excused")}
                </span>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--text-secondary)]">
                  {detail.attendance.summary.excused}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("attendanceHistoryTitle")}
                </h3>
              </div>
              {detail.attendance.records.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noAttendanceRecords")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {detail.attendance.records.map((rec) => (
                    <li
                      key={rec.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {rec.session.groupName}
                          </p>
                          {rec.isCrossSeason && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              {t("crossSeasonBadge")}
                            </span>
                          )}
                        </div>
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

        {/* Tab: Online Exams & Quizzes (Authenticated Student Only) */}
        {activeTab === "exams" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("onlineExams.title")}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t("onlineExams.subtitle")}
              </p>
            </div>

            {examError ? (
              <p className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs text-[var(--danger-fg)]" role="alert">
                {t("onlineExams.error")}
              </p>
            ) : null}

            {activeAttempt ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 space-y-4">
                <div>
                  <h4 className="text-base font-bold text-[var(--text-primary)]">
                    {activeAttempt.exam.title}
                  </h4>
                  {activeAttempt.exam.instructions ? (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {activeAttempt.exam.instructions}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {activeAttempt.exam.questions.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-lg border border-[var(--border-subtle)] p-4 space-y-2"
                    >
                      <div className="flex justify-between gap-2 text-sm font-semibold">
                        <span>
                          {q.position}. {q.prompt}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {q.points} pts
                        </span>
                      </div>

                      {q.type === "mcq_single" && q.options ? (
                        <div className="space-y-1.5">
                          {q.options.map((opt) => (
                            <label key={opt.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="radio"
                                name={`q_${q.id}`}
                                checked={draftAnswers[q.id] === opt.id}
                                onChange={() =>
                                  setDraftAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: opt.id,
                                  }))
                                }
                              />
                              <span>{opt.text}</span>
                            </label>
                          ))}
                        </div>
                      ) : q.type === "true_false" ? (
                        <div className="flex gap-4 text-xs">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              checked={draftAnswers[q.id] === true}
                              onChange={() =>
                                setDraftAnswers((prev) => ({ ...prev, [q.id]: true }))
                              }
                            />
                            <span>{t("onlineExams.trueLabel")}</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              checked={draftAnswers[q.id] === false}
                              onChange={() =>
                                setDraftAnswers((prev) => ({ ...prev, [q.id]: false }))
                              }
                            />
                            <span>{t("onlineExams.falseLabel")}</span>
                          </label>
                        </div>
                      ) : (
                        <textarea
                          className="ui-input w-full text-xs"
                          rows={q.type === "essay" ? 3 : 1}
                          placeholder={t("onlineExams.answerPlaceholder")}
                          value={typeof draftAnswers[q.id] === "string" ? String(draftAnswers[q.id]) : ""}
                          onChange={(e) =>
                            setDraftAnswers((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={examBusy}
                    onClick={() => void handleSaveDraftAnswers()}
                  >
                    {t("onlineExams.saveProgressAction")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={examBusy}
                    onClick={() => void handleSubmitFinalExam()}
                  >
                    {examBusy
                      ? t("onlineExams.submitting")
                      : t("onlineExams.submitFinalAction")}
                  </Button>
                </div>
              </div>
            ) : onlineExams.length === 0 ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                {t("onlineExams.empty")}
              </div>
            ) : (
              onlineExams.map((exam) => {
                const inProgress = exam.attempts.find((a) => a.status === "in_progress");
                const latestAttempt = exam.attempts[exam.attempts.length - 1];
                return (
                  <div
                    key={exam.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">
                          {exam.title}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {exam.groupName} ·{" "}
                          {t("onlineExams.windowLabel", {
                            from: new Date(exam.availableFrom).toLocaleString(),
                            until: new Date(exam.availableUntil).toLocaleString(),
                          })}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {t("onlineExams.attemptsLabel", {
                            used: exam.attempts.length,
                            max: exam.maxAttempts,
                          })}
                          {exam.durationMinutes
                            ? ` · ${t("onlineExams.durationLabel", {
                                minutes: exam.durationMinutes,
                              })}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {exam.canStartAttempt ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={examBusy}
                            onClick={() => void handleStartOrResumeExam(exam.id)}
                          >
                            {inProgress
                              ? t("onlineExams.resumeAttemptAction")
                              : t("onlineExams.startAttemptAction")}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {latestAttempt && latestAttempt.status !== "in_progress" ? (
                      <div className="border-t border-[var(--border-subtle)] pt-2 text-xs">
                        {exam.resultsVisible && latestAttempt.totalScore !== null ? (
                          <span className="font-semibold">
                            {t("onlineExams.scoreLabel", {
                              score: latestAttempt.totalScore,
                              maxScore: exam.maxScore,
                            })}
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">
                            {t("onlineExams.resultsPendingNotice")}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 5: Shared Learning Materials & Recorded Video Lessons */}
        {activeTab === "resources" && detail.resources && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("sharedResourcesTitle")}
                </h3>
              </div>
              {detail.resources.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                  {t("noSharedResources")}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {detail.resources.map((file) => (
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

            {detail.videos ? (
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
                {detail.videos.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    {t("videos.empty")}
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {detail.videos.map((video) => (
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

        {/* Tab 6: In-App Notifications & Push Privacy */}
        {activeTab === "notifications" && (
          <PortalNotificationsPanel
            initialNotifications={detail.notifications}
          />
        )}
      </main>
    </div>
  );
}
