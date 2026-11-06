import { Prisma } from "@/generated/prisma/client";
import { withScope, withPublicFormScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { FormListQuery, FormSubmissionQuery } from "./schemas";

/**
 * JSON input types re-exported so the service layer can build typed rows without
 * importing the Prisma client itself (the project rule keeps that import inside
 * repository modules).
 */
export type JsonInput = Prisma.InputJsonValue;
export type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;
export const DB_NULL = Prisma.DbNull;

export const formSummarySelect = {
  id: true,
  workspaceId: true,
  title: true,
  description: true,
  status: true,
  submissionMode: true,
  isPublic: true,
  publicSlug: true,
  acceptingResponses: true,
  confirmationMessage: true,
  settingsJson: true,
  createdByUserId: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      questions: true,
      submissions: true,
    },
  },
} satisfies Prisma.FormSelect;

export const formDetailSelect = {
  ...formSummarySelect,
  sections: {
    orderBy: { orderIndex: "asc" as const },
    select: {
      id: true,
      title: true,
      description: true,
      orderIndex: true,
      pageBreakBefore: true,
    },
  },
  questions: {
    orderBy: { orderIndex: "asc" as const },
    select: {
      id: true,
      sectionId: true,
      orderIndex: true,
      questionType: true,
      prompt: true,
      description: true,
      isRequired: true,
      configJson: true,
      options: {
        orderBy: { orderIndex: "asc" as const },
        select: {
          id: true,
          label: true,
          orderIndex: true,
        },
      },
    },
  },
  logicRules: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      sourceQuestionId: true,
      operator: true,
      comparisonJson: true,
      action: true,
      targetQuestionId: true,
      targetSectionId: true,
    },
  },
} satisfies Prisma.FormSelect;

export type FormSummaryRow = Prisma.FormGetPayload<{ select: typeof formSummarySelect }>;
export type FormDetailRow = Prisma.FormGetPayload<{ select: typeof formDetailSelect }>;

export async function listFormRows(scope: Scope, query: FormListQuery) {
  return withScope(scope, (tx) =>
    tx.form.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: query.status,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: formSummarySelect,
    }),
  );
}

export async function findFormDetail(scope: Pick<Scope, "workspaceId">, formId: string) {
  return withScope(scope, (tx) => findFormDetailTx(tx, scope.workspaceId, formId));
}

export async function findFormDetailByPublicId(
  formId: string,
): Promise<FormDetailRow | null> {
  return withPublicFormScope(formId, async (tx) => {
    return tx.form.findFirst({
      where: { id: formId, archivedAt: null },
      select: formDetailSelect,
    });
  });
}

export function findFormDetailTx(
  tx: Prisma.TransactionClient,
  workspaceId: string | null,
  formId: string,
): Promise<FormDetailRow | null> {
  if (workspaceId === null) {
    // Public form lookup - find by ID without workspace constraint
    return tx.form.findFirst({
      where: { id: formId, archivedAt: null },
      select: formDetailSelect,
    });
  } else {
    // Regular form lookup with workspace constraint
    return tx.form.findFirst({
      where: { id: formId, workspaceId },
      select: formDetailSelect,
    });
  }
}

export function findFormByPublicSlugTx(
  tx: Prisma.TransactionClient,
  publicSlug: string,
): Promise<FormDetailRow | null> {
  return tx.form.findFirst({
    where: { publicSlug, isPublic: true, status: "published", archivedAt: null },
    select: formDetailSelect,
  });
}

export async function listFormSubmissionRows(scope: Scope, query: FormSubmissionQuery) {
  return withScope(scope, (tx) =>
    tx.formSubmission.findMany({
      where: {
        workspaceId: scope.workspaceId,
        formId: query.formId,
        studentId: query.studentId,
        archivedAt: null,
      },
      orderBy: [{ submittedAt: "desc" }],
      select: {
        id: true,
        formId: true,
        submissionMode: true,
        studentId: true,
        submittedByUserId: true,
        submittedAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: { answers: true },
        },
      },
    }),
  );
}

export async function findFormSubmissionDetail(
  scope: Pick<Scope, "workspaceId">,
  submissionId: string,
) {
  return withScope(scope, (tx) =>
    tx.formSubmission.findFirst({
      where: { id: submissionId, workspaceId: scope.workspaceId, archivedAt: null },
      select: {
        id: true,
        formId: true,
        submissionMode: true,
        studentId: true,
        submittedByUserId: true,
        submittedAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        answers: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            questionId: true,
            valueJson: true,
            question: {
              select: {
                questionType: true,
                prompt: true,
              },
            },
            files: {
              select: {
                fileId: true,
              },
            },
          },
        },
      },
    }),
  );
}
