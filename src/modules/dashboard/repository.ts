import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { DashboardFilter } from "./schemas";

export async function fetchDashboardRawData(scope: Scope, _filter: DashboardFilter) {
  return withScope(scope, async (tx) => {
    const [
      workspace,
      settings,
      allStudents,
      groups,
      feeRules,
      enrollments,
      sessions,
      attendanceMarks,
      assessments,
      assessmentScores,
      homeworkList,
      homeworkSubmissions,
      payments,
      adjustments,
      onlineExams,
      onlineExamAttempts,
      forms,
      assistants,
      auditEvents,
    ] = await Promise.all([
      // 1. Workspace
      tx.workspace.findUnique({
        where: { id: scope.workspaceId },
        select: {
          id: true,
          name: true,
          teachingName: true,
          slug: true,
          primarySubject: true,
          gradesTaught: true,
        },
      }),

      // 2. Settings
      tx.workspaceSettings.findUnique({
        where: { workspaceId: scope.workspaceId },
        select: {
          timezone: true,
          currency: true,
          atRiskAfter: true,
          inactiveAfter: true,
        },
      }),

      // 3. Students
      tx.student.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          grade: true,
          joinedAt: true,
          archivedAt: true,
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),

      // 4. Groups
      tx.group.findMany({
        where: { workspaceId: scope.workspaceId, archivedAt: null },
        select: {
          id: true,
          name: true,
          color: true,
          grade: true,
          defaultPricePerStudentMinor: true,
        },
        orderBy: { name: "asc" },
      }),

      // 5. Fee rules
      tx.feeRule.findMany({
        where: { workspaceId: scope.workspaceId },
        orderBy: { effectiveFrom: "asc" },
      }),

      // 6. Enrollments
      tx.enrollment.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          studentId: true,
          groupId: true,
          enrolledAt: true,
          leftAt: true,
          group: {
            select: { id: true, name: true, color: true },
          },
        },
      }),

      // 7. Sessions (all non-cancelled or within recent/future horizon)
      tx.teachingSession.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          groupId: true,
          gradeLabel: true,
          startsAt: true,
          endsAt: true,
          status: true,
          room: true,
          location: true,
          notes: true,
          pricePerStudentMinor: true,
          attendanceMarks: {
            select: { id: true },
            take: 1,
          },
          group: {
            select: {
              id: true,
              name: true,
              color: true,
              defaultPricePerStudentMinor: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
      }),

      // 8. Attendance marks
      tx.attendanceMark.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          sessionId: true,
          studentId: true,
          mark: true,
          recordedBy: true,
          recordedAt: true,
          isCrossSeason: true,
          session: {
            select: {
              startsAt: true,
              status: true,
              groupId: true,
              gradeLabel: true,
              group: { select: { name: true } },
            },
          },
        },
        orderBy: { recordedAt: "desc" },
      }),

      // 9. Assessments
      tx.assessment.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          groupId: true,
          title: true,
          type: true,
          date: true,
          maxScore: true,
          lockedAt: true,
          group: { select: { id: true, name: true, color: true } },
        },
        orderBy: { date: "desc" },
      }),

      // 10. Assessment scores
      tx.assessmentScore.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          assessmentId: true,
          studentId: true,
          score: true,
          status: true,
          assessment: {
            select: {
              id: true,
              title: true,
              date: true,
              maxScore: true,
              groupId: true,
            },
          },
        },
      }),

      // 11. Homework list
      tx.homework.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          groupId: true,
          title: true,
          dueAt: true,
          maxScore: true,
          status: true,
          createdAt: true,
          group: { select: { id: true, name: true, color: true } },
        },
        orderBy: { dueAt: "desc" },
      }),

      // 12. Homework submissions
      tx.homeworkSubmission.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          homeworkId: true,
          studentId: true,
          status: true,
          score: true,
          submittedAt: true,
          updatedBy: true,
          homework: {
            select: {
              id: true,
              title: true,
              dueAt: true,
              status: true,
            },
          },
        },
      }),

      // 13. Payments
      tx.payment.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          studentId: true,
          sessionId: true,
          amountMinor: true,
          currency: true,
          method: true,
          paidOn: true,
          voidedAt: true,
          createdAt: true,
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          session: {
            select: {
              id: true,
              startsAt: true,
              groupId: true,
              gradeLabel: true,
              group: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
      }),

      // 14. Payment adjustments
      tx.paymentAdjustment.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          studentId: true,
          kind: true,
          amountMinor: true,
          balanceImpact: true,
          paidOn: true,
        },
      }),

      // 15. Online exams
      tx.onlineExam.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          groupId: true,
          title: true,
          status: true,
          availableFrom: true,
          availableUntil: true,
          maxScore: true,
          questions: {
            select: {
              id: true,
              questionType: true,
            },
          },
        },
        orderBy: { availableFrom: "desc" },
      }),

      // 16. Online exam attempts & responses
      tx.onlineExamAttempt.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          examId: true,
          studentId: true,
          status: true,
          submittedAt: true,
          gradedAt: true,
          gradedByUserId: true,
          manualScore: true,
          totalScore: true,
          responses: {
            select: {
              id: true,
              questionId: true,
              manualAwardedPoints: true,
              question: {
                select: { questionType: true },
              },
            },
          },
        },
      }),

      // 17. Forms
      tx.form.findMany({
        where: { workspaceId: scope.workspaceId },
        select: {
          id: true,
          title: true,
          status: true,
          acceptingResponses: true,
          submissions: {
            select: {
              id: true,
              submittedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      // 18. Assistants (workspace members with assistant role)
      tx.workspaceMember.findMany({
        where: { workspaceId: scope.workspaceId, role: "assistant" },
        select: {
          id: true,
          userId: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),

      // 19. Recent Audit events
      tx.auditEvent.findMany({
        where: { workspaceId: scope.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          actorDisplayName: true,
          actorUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      workspace,
      settings,
      allStudents,
      groups,
      feeRules,
      enrollments,
      sessions,
      attendanceMarks,
      assessments,
      assessmentScores,
      homeworkList,
      homeworkSubmissions,
      payments,
      adjustments,
      onlineExams,
      onlineExamAttempts,
      forms,
      assistants,
      auditEvents,
    };
  });
}
