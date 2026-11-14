import type { Scope } from "@/modules/tenancy/types";
import { isAllowed } from "@/modules/tenancy/types";
import {
  currentDateInTimezone,
  currentMonthInTimezone,
} from "@/modules/payments/calculations";
import { calculateFollowUpFlags } from "@/modules/followups/calculations";
import { scorePercentage } from "@/modules/assessments/calculations";
import { fetchDashboardRawData } from "./repository";
import type {
  AttentionStudent,
  DashboardAlert,
  DashboardData,
  DashboardFilter,
  RecentActivityEvent,
  TodaySessionItem,
} from "./schemas";

function extractMeetingUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s$.?#].[^\s]*/i);
  return match ? match[0] : null;
}

function resolvePeriodRange(
  period: DashboardFilter["period"],
  now: Date,
  timezone: string,
): { start: Date; end: Date; priorStart: Date; priorEnd: Date } {
  const todayStr = currentDateInTimezone(now, timezone);
  const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
  const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

  if (period === "today") {
    const priorStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const priorEnd = new Date(endOfToday.getTime() - 24 * 60 * 60 * 1000);
    return { start: startOfToday, end: endOfToday, priorStart, priorEnd };
  }

  if (period === "this_week") {
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    const priorStart = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorEnd = new Date(startOfWeek.getTime() - 1);
    return { start: startOfWeek, end: endOfToday, priorStart, priorEnd };
  }

  if (period === "all") {
    const startOfAll = new Date("2020-01-01T00:00:00.000Z");
    const priorStart = new Date("2020-01-01T00:00:00.000Z");
    return { start: startOfAll, end: endOfToday, priorStart, priorEnd: startOfAll };
  }

  // Default: this_month
  const currentMonth = currentMonthInTimezone(now, timezone);
  const startOfMonth = new Date(`${currentMonth}-01T00:00:00.000Z`);
  const priorMonthYear = Number(currentMonth.slice(0, 4));
  const priorMonthNum = Number(currentMonth.slice(5, 7)) - 1;
  const priorMonthStr =
    priorMonthNum === 0
      ? `${priorMonthYear - 1}-12`
      : `${priorMonthYear}-${String(priorMonthNum).padStart(2, "0")}`;
  const priorStart = new Date(`${priorMonthStr}-01T00:00:00.000Z`);
  const priorEnd = new Date(startOfMonth.getTime() - 1);

  return { start: startOfMonth, end: endOfToday, priorStart, priorEnd };
}

export async function getDashboardData(
  scope: Scope,
  filter: DashboardFilter,
  now = new Date(),
): Promise<DashboardData> {
  const raw = await fetchDashboardRawData(scope, filter);

  const timezone = raw.settings?.timezone ?? "Africa/Cairo";
  const currency = raw.settings?.currency ?? "EGP";
  const atRiskThreshold = raw.settings?.atRiskAfter ?? 2;
  const inactiveThreshold = raw.settings?.inactiveAfter ?? 4;
  const todayStr = currentDateInTimezone(now, timezone);

  const { start, end, priorStart, priorEnd } = resolvePeriodRange(filter.period, now, timezone);

  // -------------------------------------------------------------------------
  // 1. Permissions
  // -------------------------------------------------------------------------
  const canSeeFinancials = isAllowed(scope, "payments", "read");
  const canSeeTeam = isAllowed(scope, "team", "read");
  const canSeeStudents = isAllowed(scope, "students", "read");
  const canSeeAssessments = isAllowed(scope, "grades", "read");

  // -------------------------------------------------------------------------
  // 2. Student Status & Attention Analysis
  // -------------------------------------------------------------------------
  // Build attendance streaks per student. Marks are limited to the selected
  // dashboard period (by session start date, not by when the mark was
  // recorded) and processed most-recent-session first, so the trailing run of
  // consecutive absences reflects the selected window rather than all history
  // in arbitrary insertion order.
  const periodMarks = raw.attendanceMarks
    .filter(
      (mark) =>
        mark.session.startsAt >= start && mark.session.startsAt <= end,
    )
    .sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());
  const attendanceByStudent = new Map<string, typeof raw.attendanceMarks>();
  for (const mark of periodMarks) {
    const list = attendanceByStudent.get(mark.studentId) ?? [];
    list.push(mark);
    attendanceByStudent.set(mark.studentId, list);
  }

  let totalActive = 0;
  let totalInactive = 0;
  let totalAtRisk = 0;
  let newlyEnrolled = 0;

  const studentStatuses = new Map<string, "active" | "at_risk" | "inactive" | "archived">();

  for (const student of raw.allStudents) {
    if (student.archivedAt) {
      studentStatuses.set(student.id, "archived");
      continue;
    }

    if (student.joinedAt >= start && student.joinedAt <= end) {
      newlyEnrolled++;
    }

    const marks = attendanceByStudent.get(student.id) ?? [];
    let consecutiveAbsences = 0;
    for (const m of marks) {
      if (m.session.status === "cancelled") continue;
      if (m.mark === "absent") consecutiveAbsences++;
      else break;
    }

    if (consecutiveAbsences >= inactiveThreshold) {
      studentStatuses.set(student.id, "inactive");
      totalInactive++;
    } else if (consecutiveAbsences >= atRiskThreshold) {
      studentStatuses.set(student.id, "at_risk");
      totalAtRisk++;
      totalActive++; // At risk students are still active students needing attention
    } else {
      studentStatuses.set(student.id, "active");
      totalActive++;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Session-scoped revenue (ADR-0028)
  // -------------------------------------------------------------------------
  // Expected revenue counts present/late marks on non-cancelled sessions that
  // have a resolvable price (session price, else group default). Nothing
  // per-student is computed: there is no balance, no outstanding, no credit.
  const presentLateBySession = new Map<string, number>();
  for (const mark of raw.attendanceMarks) {
    if (mark.session.status === "cancelled") continue;
    if (mark.mark !== "present" && mark.mark !== "late") continue;
    presentLateBySession.set(mark.sessionId, (presentLateBySession.get(mark.sessionId) ?? 0) + 1);
  }

  function resolvablePrice(session: {
    pricePerStudentMinor: number | null;
    group: { defaultPricePerStudentMinor: number | null } | null;
  }): number | null {
    const price =
      session.pricePerStudentMinor ?? session.group?.defaultPricePerStudentMinor ?? null;
    return price != null && price > 0 ? price : null;
  }

  // Expected revenue over the *current period* (symmetric with collected).
  let periodExpectedMinor: number | null = null;
  for (const session of raw.sessions) {
    if (session.status === "cancelled") continue;
    if (session.startsAt < start || session.startsAt > end) continue;
    const price = resolvablePrice(session);
    if (price == null) continue;
    const attended = presentLateBySession.get(session.id) ?? 0;
    periodExpectedMinor = (periodExpectedMinor ?? 0) + price * attended;
  }

  // -------------------------------------------------------------------------
  // 4. Section 1: Global Overview Metrics
  // -------------------------------------------------------------------------
  // Payments collected in period & prior period
  let periodCollectedMinor = 0;
  let priorPeriodCollectedMinor = 0;

  for (const payment of raw.payments) {
    if (payment.voidedAt) continue;
    const paidAt = payment.paidOn;
    if (paidAt >= start && paidAt <= end) {
      periodCollectedMinor += payment.amountMinor;
    } else if (paidAt >= priorStart && paidAt <= priorEnd) {
      priorPeriodCollectedMinor += payment.amountMinor;
    }
  }

  let revenueChangePercent: number | null = null;
  if (priorPeriodCollectedMinor > 0) {
    revenueChangePercent = Math.round(
      ((periodCollectedMinor - priorPeriodCollectedMinor) / priorPeriodCollectedMinor) * 100,
    );
  }

  // Attendance in period
  let presentCount = 0;
  let absentCount = 0;
  let eligibleCount = 0;
  for (const mark of raw.attendanceMarks) {
    if (mark.session.status === "cancelled") continue;
    const sessionDate = mark.session.startsAt;
    if (sessionDate >= start && sessionDate <= end) {
      if (mark.mark !== "excused") {
        eligibleCount++;
        if (mark.mark === "present" || mark.mark === "late") {
          presentCount++;
        } else if (mark.mark === "absent") {
          absentCount++;
        }
      }
    }
  }
  const attendanceRate = eligibleCount > 0 ? Math.round((presentCount / eligibleCount) * 100) : null;

  // Awaiting attendance count for sessions in period that already started
  const awaitingCount = raw.sessions.filter(
    (s) =>
      s.startsAt >= start &&
      s.startsAt <= now &&
      s.status !== "cancelled" &&
      s.attendanceMarks.length === 0,
  ).length;

  // Academic performance in period
  let periodScoreSum = 0;
  let periodScoreCount = 0;
  let priorScoreSum = 0;
  let priorScoreCount = 0;

  for (const sc of raw.assessmentScores) {
    if (sc.score === null || sc.status !== "graded") continue;
    const max = Number(sc.assessment.maxScore);
    const scoreVal = Number(sc.score);
    if (max <= 0) continue;

    const pct = scorePercentage(scoreVal, max);
    const itemDate = sc.assessment.date;
    if (itemDate >= start && itemDate <= end) {
      periodScoreSum += pct;
      periodScoreCount++;
    } else if (itemDate >= priorStart && itemDate <= priorEnd) {
      priorScoreSum += pct;
      priorScoreCount++;
    }
  }

  const averageGradePercent =
    periodScoreCount > 0 ? Math.round(periodScoreSum / periodScoreCount) : null;
  const priorAverageGradePercent =
    priorScoreCount > 0 ? Math.round(priorScoreSum / priorScoreCount) : null;

  let academicChangePercent: number | null = null;
  if (averageGradePercent !== null && priorAverageGradePercent !== null) {
    academicChangePercent = averageGradePercent - priorAverageGradePercent;
  }

  // Homework completion in period
  let periodHwSubmitted = 0;
  let periodHwTotal = 0;
  for (const sub of raw.homeworkSubmissions) {
    const hwDate = sub.homework.dueAt;
    if (hwDate >= start && hwDate <= end) {
      periodHwTotal++;
      if (sub.status === "submitted" || sub.status === "late") {
        periodHwSubmitted++;
      }
    }
  }
  const homeworkCompletionRate =
    periodHwTotal > 0 ? Math.round((periodHwSubmitted / periodHwTotal) * 100) : null;

  // -------------------------------------------------------------------------
  // 5. Section 2: Today's Operations
  // -------------------------------------------------------------------------
  const todaySessions: TodaySessionItem[] = [];
  let completedTodayCount = 0;
  let awaitingAttendanceTodayCount = 0;

  // Map student count per group
  const activeStudentsByGroup = new Map<string, number>();
  for (const e of raw.enrollments) {
    if (e.leftAt === null) {
      activeStudentsByGroup.set(e.groupId, (activeStudentsByGroup.get(e.groupId) ?? 0) + 1);
    }
  }

  for (const session of raw.sessions) {
    const sessionDayStr = currentDateInTimezone(session.startsAt, timezone);
    if (sessionDayStr === todayStr) {
      const hasAttendance = session.attendanceMarks.length > 0;
      if (session.status === "completed") completedTodayCount++;
      if (session.startsAt <= now && session.status !== "cancelled" && !hasAttendance) {
        awaitingAttendanceTodayCount++;
      }

      const meetingUrl =
        extractMeetingUrl(session.location) ?? extractMeetingUrl(session.notes);

      todaySessions.push({
        id: session.id,
        groupId: session.groupId,
        groupName: session.group?.name ?? "",
        groupColor: session.group?.color ?? "",
        gradeLabel: session.gradeLabel,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt ? session.endsAt.toISOString() : null,
        status: session.status,
        enrolledStudentsCount: session.groupId
          ? activeStudentsByGroup.get(session.groupId) ?? 0
          : null,
        hasAttendance,
        meetingUrl,
        location: session.location,
        room: session.room,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Section 3: Attention Center
  // -------------------------------------------------------------------------
  // Use calculateFollowUpFlags
  const followUpStudents = calculateFollowUpFlags(
    raw.allStudents.filter((s) => !s.archivedAt).map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
    })),
    raw.attendanceMarks.map((m) => ({
      studentId: m.studentId,
      groupId: m.session.groupId,
      groupName: m.session.group?.name ?? m.session.gradeLabel ?? "",
      sessionId: m.sessionId,
      date: m.session.startsAt.toISOString().slice(0, 10),
      mark: m.mark,
    })),
    raw.homeworkSubmissions.map((h) => ({
      studentId: h.studentId,
      homeworkId: h.homeworkId,
      title: h.homework.title,
      dueAt: h.homework.dueAt.toISOString(),
      status: h.status,
    })),
    raw.assessmentScores.map((a) => ({
      studentId: a.studentId,
      assessmentId: a.assessmentId,
      title: a.assessment.title,
      date: a.assessment.date.toISOString().slice(0, 10),
      status: a.status,
      score: a.score ? Number(a.score) : null,
      maxScore: Number(a.assessment.maxScore),
    })),
    now,
    atRiskThreshold,
  );

  const attentionStudents: AttentionStudent[] = [];
  const primaryEnrollmentByStudent = new Map(
    raw.enrollments
      .filter((e) => e.leftAt === null)
      .map((e) => [e.studentId, { groupId: e.groupId, groupName: e.group.name }]),
  );

  for (const item of followUpStudents) {
    const studentInfo = primaryEnrollmentByStudent.get(item.student.id) ?? {
      groupId: "",
      groupName: "—",
    };

    for (const reason of item.reasons) {
      if (reason.rule === "repeated_absences") {
        const count = Number(reason.details.consecutiveAbsences ?? atRiskThreshold);
        attentionStudents.push({
          studentId: item.student.id,
          studentName: `${item.student.firstName} ${item.student.lastName}`,
          groupId: studentInfo.groupId,
          groupName: studentInfo.groupName,
          category: "absences",
          reason: "repeated_absences",
          severity: count >= inactiveThreshold ? "danger" : "warn",
          supportingInfo: `${count} consecutive absences`,
          lastActivityDate: reason.sources[0]?.date ?? null,
        });
      } else if (reason.rule === "declining_assessments") {
        attentionStudents.push({
          studentId: item.student.id,
          studentName: `${item.student.firstName} ${item.student.lastName}`,
          groupId: studentInfo.groupId,
          groupName: studentInfo.groupName,
          category: "grades",
          reason: "declining_assessments",
          severity: "warn",
          supportingInfo: `${reason.details.recentAveragePercent}% recent (vs ${reason.details.previousAveragePercent}%)`,
          lastActivityDate: reason.sources[0]?.date ?? null,
        });
      } else if (reason.rule === "overdue_homework") {
        attentionStudents.push({
          studentId: item.student.id,
          studentName: `${item.student.firstName} ${item.student.lastName}`,
          groupId: studentInfo.groupId,
          groupName: studentInfo.groupName,
          category: "homework",
          reason: "overdue_homework",
          severity: "warn",
          supportingInfo: reason.sources[0]?.label ?? "Missing homework",
          lastActivityDate: reason.sources[0]?.date ?? null,
        });
      }
    }
  }

  // Build compact alerts
  const alerts: DashboardAlert[] = [];
  if (awaitingAttendanceTodayCount > 0) {
    alerts.push({
      id: "alert-today-attendance",
      type: "attendance",
      tone: "warn",
      title: "Attendance Awaiting Completion",
      message: `${awaitingAttendanceTodayCount} session(s) today require attendance marks`,
      link: "/app/sessions",
    });
  }
  const severeAbsenceCount = attentionStudents.filter(
    (s) => s.category === "absences" && s.severity === "danger",
  ).length;
  if (severeAbsenceCount > 0) {
    alerts.push({
      id: "alert-severe-absences",
      type: "attendance",
      tone: "danger",
      title: "Students Inactive or At Risk",
      message: `${severeAbsenceCount} student(s) have reached consecutive absence thresholds`,
      link: "/app/students",
    });
  }

  // -------------------------------------------------------------------------
  // 7. Section 4: Financial Overview
  // -------------------------------------------------------------------------
  let financialOverview: DashboardData["financialOverview"] = null;

  if (canSeeFinancials) {
    // Revenue by group: session receipts are attributed via the session's group
    // (ADR-0028). Receipts not linked to a session are excluded from the group chart.
    const revenueByGroupMap = new Map<string, number>();
    for (const payment of raw.payments) {
      if (payment.voidedAt) continue;
      const groupId = payment.session?.groupId ?? null;
      if (groupId == null) continue;
      revenueByGroupMap.set(
        groupId,
        (revenueByGroupMap.get(groupId) ?? 0) + payment.amountMinor,
      );
    }

    const revenueByGroup = raw.groups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      color: g.color,
      amountMinor: revenueByGroupMap.get(g.id) ?? 0,
    }));

    // Revenue trend (last 6 months)
    const trendMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(key, 0);
    }
    for (const payment of raw.payments) {
      if (payment.voidedAt) continue;
      const m = payment.paidOn.toISOString().slice(0, 7);
      if (trendMap.has(m)) {
        trendMap.set(m, (trendMap.get(m) ?? 0) + payment.amountMinor);
      }
    }
    const revenueTrend = [...trendMap.entries()].map(([label, amountMinor]) => ({
      label,
      amountMinor,
    }));

    // Recent payments
    const recentPayments = raw.payments.slice(0, 5).map((p) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: p.student
        ? `${p.student.firstName} ${p.student.lastName}`
        : p.session
          ? `${p.session.group?.name ?? p.session.gradeLabel ?? ""} · ${p.session.startsAt.toISOString().slice(0, 10)}`
          : "—",
      amountMinor: p.amountMinor,
      paidOn: p.paidOn.toISOString().slice(0, 10),
      method: p.method,
    }));

    financialOverview = {
      totalRevenueMinor: periodCollectedMinor,
      currency,
      expectedRevenueMinor: periodExpectedMinor,
      revenueByGroup,
      revenueTrend,
      recentPayments,
    };
  }

  // -------------------------------------------------------------------------
  // 8. Section 5: Academic Overview
  // -------------------------------------------------------------------------
  // Group comparisons
  const groupScoresMap = new Map<string, { totalScore: number; count: number }>();
  for (const sc of raw.assessmentScores) {
    if (sc.score === null || sc.status !== "graded") continue;
    const max = Number(sc.assessment.maxScore);
    const val = Number(sc.score);
    if (max <= 0) continue;
    const pct = scorePercentage(val, max);
    const existing = groupScoresMap.get(sc.assessment.groupId) ?? { totalScore: 0, count: 0 };
    existing.totalScore += pct;
    existing.count++;
    groupScoresMap.set(sc.assessment.groupId, existing);
  }

  const groupComparisons = raw.groups.map((g) => {
    const stats = groupScoresMap.get(g.id);
    const avg = stats && stats.count > 0 ? Math.round(stats.totalScore / stats.count) : null;
    return {
      groupId: g.id,
      groupName: g.name,
      color: g.color,
      averagePercent: avg,
      gradedCount: stats?.count ?? 0,
      studentsCount: activeStudentsByGroup.get(g.id) ?? 0,
    };
  });

  const gradedGroups = groupComparisons.filter((g) => g.averagePercent !== null);
  gradedGroups.sort((a, b) => (b.averagePercent ?? 0) - (a.averagePercent ?? 0));

  const highestPerformingGroup =
    gradedGroups.length > 0
      ? {
          id: gradedGroups[0].groupId,
          name: gradedGroups[0].groupName,
          averagePercent: gradedGroups[0].averagePercent!,
        }
      : null;

  const needsAttentionGroup =
    gradedGroups.length > 1
      ? {
          id: gradedGroups[gradedGroups.length - 1].groupId,
          name: gradedGroups[gradedGroups.length - 1].groupName,
          averagePercent: gradedGroups[gradedGroups.length - 1].averagePercent!,
        }
      : null;

  // Grade trend from assessments over time
  const gradeTrend = raw.assessments.slice(0, 6).reverse().map((a) => {
    const scores = raw.assessmentScores.filter((sc) => sc.assessmentId === a.id && sc.status === "graded" && sc.score !== null);
    let sum = 0;
    for (const sc of scores) {
      sum += scorePercentage(Number(sc.score), Number(a.maxScore));
    }
    return {
      label: a.title,
      averagePercent: scores.length > 0 ? Math.round(sum / scores.length) : null,
    };
  });

  const academicOverview = {
    overallAveragePercent: averageGradePercent,
    homeworkCompletionRate,
    highestPerformingGroup,
    needsAttentionGroup,
    groupComparisons,
    gradeTrend,
  };

  // -------------------------------------------------------------------------
  // 9. Section 6: Pending Work
  // -------------------------------------------------------------------------
  const pendingHwSubmissions = raw.homeworkSubmissions.filter(
    (s) => s.status === "not_submitted" && s.homework.status === "active",
  ).length;
  const hwAwaitingReview = raw.homeworkSubmissions.filter(
    (s) => s.submittedAt !== null && s.score === null && s.homework.status === "active",
  ).length;

  const upcomingExams = raw.onlineExams.filter(
    (e) => e.status === "published" && e.availableUntil > now,
  ).length;
  const examsAwaitingGrading = raw.onlineExamAttempts.filter(
    (a) => a.status === "submitted" && a.gradedAt === null,
  ).length;

  const activeForms = raw.forms.filter(
    (f) => f.status === "published" && f.acceptingResponses,
  );
  let recentFormSubmissions = 0;
  for (const f of activeForms) {
    recentFormSubmissions += f.submissions.length;
  }

  // Count essays awaiting grading in online exams
  let essaysAwaitingGrading = 0;
  for (const attempt of raw.onlineExamAttempts) {
    if (attempt.status === "submitted") {
      for (const resp of attempt.responses) {
        if (resp.question.questionType === "essay" && resp.manualAwardedPoints === null) {
          essaysAwaitingGrading++;
        }
      }
    }
  }

  const pendingWork = {
    homework: {
      pendingSubmissionsCount: pendingHwSubmissions,
      awaitingReviewCount: hwAwaitingReview,
    },
    exams: {
      upcomingCount: upcomingExams,
      awaitingGradingCount: examsAwaitingGrading,
    },
    forms: {
      activeFormsCount: activeForms.length,
      recentSubmissionsCount: recentFormSubmissions,
    },
    essays: {
      awaitingGradingCount: essaysAwaitingGrading,
    },
  };

  // -------------------------------------------------------------------------
  // 10. Section 7: Team Activity
  // -------------------------------------------------------------------------
  let teamActivity: DashboardData["teamActivity"] = null;
  if (canSeeTeam) {
    teamActivity = raw.assistants.map((assistant) => {
      const attendanceRecorded = raw.attendanceMarks.filter(
        (m) => m.recordedBy === assistant.userId,
      ).length;
      const hwReviewed = raw.homeworkSubmissions.filter(
        (h) => h.updatedBy === assistant.userId && h.status !== "not_submitted",
      ).length;
      const examsGraded = raw.onlineExamAttempts.filter(
        (e) => e.gradedByUserId === assistant.userId,
      ).length;

      const lastAudit = raw.auditEvents.find((a) => a.actorUserId === assistant.userId);

      return {
        userId: assistant.userId,
        name: assistant.user.name,
        email: assistant.user.email,
        attendanceRecordedCount: attendanceRecorded,
        homeworkReviewedCount: hwReviewed,
        examsGradedCount: examsGraded,
        lastActivityAt: lastAudit ? lastAudit.createdAt.toISOString() : null,
        lastAction: lastAudit ? lastAudit.action : null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // 11. Section 8: Recent Activity
  // -------------------------------------------------------------------------
  const recentActivity: RecentActivityEvent[] = raw.auditEvents.map((event) => {
    let link = "/app";
    if (event.entityType === "student") link = `/app/students/${event.entityId}`;
    else if (event.entityType === "payment") link = "/app/payments";
    else if (event.entityType === "attendance") link = "/app/sessions";
    else if (event.entityType === "homework") link = "/app/homework";
    else if (event.entityType === "assessment") link = "/app/assessments";
    else if (event.entityType === "exam") link = "/app/assessments";

    return {
      id: event.id,
      actorName: event.actorDisplayName,
      action: event.action,
      actionKey: `audit_${event.action.replace(".", "_")}`,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt.toISOString(),
      link,
    };
  });

  return {
    workspace: {
      id: raw.workspace?.id ?? scope.workspaceId,
      name: raw.workspace?.name ?? "",
      teachingName: raw.workspace?.teachingName ?? "",
      slug: raw.workspace?.slug ?? "",
      primarySubject: raw.workspace?.primarySubject ?? null,
      gradesTaught: raw.workspace?.gradesTaught ?? [],
      currency,
      timezone,
    },
    permissions: {
      canSeeFinancials,
      canSeeTeam,
      canSeeStudents,
      canSeeAssessments,
    },
    globalOverview: {
      students: {
        total: raw.allStudents.filter((s) => !s.archivedAt).length,
        active: totalActive,
        newlyEnrolled,
        inactive: totalInactive,
        atRisk: totalAtRisk,
      },
      revenue: {
        collectedMinor: periodCollectedMinor,
        expectedMinor: periodExpectedMinor,
        currency,
        priorPeriodChangePercent: revenueChangePercent,
      },
      attendance: {
        rate: attendanceRate,
        presentCount,
        absentCount,
        awaitingCount,
      },
      academic: {
        averageGradePercent,
        homeworkCompletionRate,
        priorPeriodChangePercent: academicChangePercent,
      },
    },
    todayOperations: {
      currentDateFormatted: todayStr,
      sessions: todaySessions,
      totalSessionsCount: todaySessions.length,
      completedSessionsCount: completedTodayCount,
      sessionsAwaitingAttendanceCount: awaitingAttendanceTodayCount,
    },
    attentionCenter: {
      students: attentionStudents.slice(0, 10), // Top 10 requiring attention
      alerts,
    },
    financialOverview,
    academicOverview,
    pendingWork,
    teamActivity,
    recentActivity,
  };
}
