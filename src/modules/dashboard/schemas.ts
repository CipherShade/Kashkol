import { z } from "zod";

export const dashboardFilterSchema = z.object({
  period: z.enum(["today", "this_week", "this_month", "all"]).default("this_month"),
  groupId: z.string().uuid().optional(),
});

export type DashboardFilter = z.infer<typeof dashboardFilterSchema>;

export type KpiCardMetric = {
  primary: string | number;
  label: string;
  supporting: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    percentage?: number;
    label: string;
  };
  hasData: boolean;
};

export type TodaySessionItem = {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "started" | "completed" | "cancelled";
  enrolledStudentsCount: number;
  hasAttendance: boolean;
  meetingUrl: string | null;
  location: string | null;
  room: string | null;
};

export type AttentionStudent = {
  studentId: string;
  studentName: string;
  groupName: string;
  groupId: string;
  category: "absences" | "grades" | "homework";
  reason: string;
  severity: "danger" | "warn";
  supportingInfo: string;
  lastActivityDate: string | null;
};

export type DashboardAlert = {
  id: string;
  type: "session" | "attendance" | "payment" | "grading";
  tone: "primary" | "warn" | "danger" | "neutral";
  title: string;
  message: string;
  link?: string;
};

export type FinancialSummary = {
  totalRevenueMinor: number;
  currency: string;
  expectedRevenueMinor: number | null;
  revenueByGroup: Array<{
    groupId: string;
    groupName: string;
    color: string;
    amountMinor: number;
  }>;
  revenueTrend: Array<{
    label: string;
    amountMinor: number;
  }>;
  recentPayments: Array<{
    id: string;
    studentId: string | null;
    studentName: string;
    amountMinor: number;
    paidOn: string;
    method: string;
  }>;
};

export type AcademicSummary = {
  overallAveragePercent: number | null;
  homeworkCompletionRate: number | null;
  highestPerformingGroup: { id: string; name: string; averagePercent: number } | null;
  needsAttentionGroup: { id: string; name: string; averagePercent: number } | null;
  groupComparisons: Array<{
    groupId: string;
    groupName: string;
    color: string;
    averagePercent: number | null;
    gradedCount: number;
    studentsCount: number;
  }>;
  gradeTrend: Array<{
    label: string;
    averagePercent: number | null;
  }>;
};

export type PendingWorkSummary = {
  homework: {
    pendingSubmissionsCount: number;
    awaitingReviewCount: number;
  };
  exams: {
    upcomingCount: number;
    awaitingGradingCount: number;
  };
  forms: {
    activeFormsCount: number;
    recentSubmissionsCount: number;
  };
  essays: {
    awaitingGradingCount: number;
  };
};

export type AssistantActivityItem = {
  userId: string;
  name: string;
  email: string;
  attendanceRecordedCount: number;
  homeworkReviewedCount: number;
  examsGradedCount: number;
  lastActivityAt: string | null;
  lastAction: string | null;
};

export type RecentActivityEvent = {
  id: string;
  actorName: string;
  action: string;
  actionKey: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  link: string;
};

export type DashboardData = {
  workspace: {
    id: string;
    name: string;
    teachingName: string;
    slug: string;
    primarySubject: string | null;
    gradesTaught: string[];
    currency: string;
    timezone: string;
  };
  permissions: {
    canSeeFinancials: boolean;
    canSeeTeam: boolean;
    canSeeStudents: boolean;
    canSeeAssessments: boolean;
  };
  globalOverview: {
    students: {
      total: number;
      active: number;
      newlyEnrolled: number;
      inactive: number;
      atRisk: number;
    };
    revenue: {
      collectedMinor: number;
      expectedMinor: number | null;
      currency: string;
      priorPeriodChangePercent: number | null;
    };
    attendance: {
      rate: number | null;
      presentCount: number;
      absentCount: number;
      awaitingCount: number;
    };
    academic: {
      averageGradePercent: number | null;
      homeworkCompletionRate: number | null;
      priorPeriodChangePercent: number | null;
    };
  };
  todayOperations: {
    currentDateFormatted: string;
    sessions: TodaySessionItem[];
    totalSessionsCount: number;
    completedSessionsCount: number;
    sessionsAwaitingAttendanceCount: number;
  };
  attentionCenter: {
    students: AttentionStudent[];
    alerts: DashboardAlert[];
  };
  financialOverview: FinancialSummary | null;
  academicOverview: AcademicSummary;
  pendingWork: PendingWorkSummary;
  teamActivity: AssistantActivityItem[] | null;
  recentActivity: RecentActivityEvent[];
};
