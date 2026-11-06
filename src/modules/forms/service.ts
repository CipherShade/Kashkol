import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope, withPublicFormScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { assertWorkspaceWriteAllowedTx } from "@/modules/platform-admin/enforcement";
import { authorize, type Scope } from "@/modules/tenancy/types";
import { formAuditActions } from "./audit";
import {
  answerIsEmpty,
  computeFormVisibility,
  parseLogicComparison,
  type FormLogicRule,
  type LogicAnswer,
} from "./logic";
import {
  DB_NULL,
  findFormDetail,
  findFormDetailTx,
  findFormSubmissionDetail,
  listFormRows,
  listFormSubmissionRows,
  type JsonInput,
  type NullableJsonInput,
} from "./repository";
import type {
  DuplicateFormInput,
  FormDefinitionInput,
  FormListQuery,
  FormLogicAction,
  FormLogicInput,
  FormLogicOperator,
  FormQuestionType,
  FormSettingsUpdateInput,
  FormSubmissionQuery,
  SubmitFormResponseInput,
} from "./schemas";
import { validateAnswerValue } from "./validation";

type RequestContext = { requestId?: string; ipHash?: string | null };

function auditContext(value?: RequestContext) {
  return { requestId: value?.requestId ?? newRequestId(), ipHash: value?.ipHash ?? null };
}

function isPublicSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      constraint?: unknown;
      driverAdapterError?: { cause?: { constraint?: { index?: unknown } } };
    };
  };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  const targetText = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : "";
  if (targetText.includes("public_slug")) return true;

  const constraint = candidate.meta?.constraint;
  if (typeof constraint === "string" && constraint.includes("public_slug")) return true;

  // Prisma 7 driver adapters report the violated index here instead of `target`.
  const index = candidate.meta?.driverAdapterError?.cause?.constraint?.index;
  return typeof index === "string" && index.includes("public_slug");
}

/**
 * Translate the global `public_slug` unique index into a clean CONFLICT.
 *
 * The column is unique across tenants, but row-level security hides other
 * tenants from the pre-flight lookup. The database index is the authoritative
 * check, so the write is allowed to reach it and the unique violation is
 * translated here, outside the rolled-back transaction.
 */
async function withSlugConflictTranslation<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (isPublicSlugConflict(error)) {
      throw new AppError("CONFLICT", { messageKey: "errors.conflict" });
    }
    throw error;
  }
}

type SectionCreate = {
  id: string;
  workspaceId: string;
  formId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  pageBreakBefore: boolean;
};

type QuestionCreate = {
  id: string;
  workspaceId: string;
  formId: string;
  sectionId: string | null;
  orderIndex: number;
  questionType: FormQuestionType;
  prompt: string;
  description: string | null;
  isRequired: boolean;
  configJson: JsonInput;
};

type OptionCreate = {
  id: string;
  workspaceId: string;
  questionId: string;
  label: string;
  orderIndex: number;
};

type LogicCreate = {
  id: string;
  workspaceId: string;
  formId: string;
  sourceQuestionId: string;
  operator: FormLogicOperator;
  comparisonJson: NullableJsonInput;
  action: FormLogicAction;
  targetQuestionId: string | null;
  targetSectionId: string | null;
};

type BuiltChildren = {
  sections: SectionCreate[];
  questions: QuestionCreate[];
  options: OptionCreate[];
  logic: LogicCreate[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jsonObject(value: unknown): JsonInput {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonInput;
}

function serializeComparison(
  rule: FormLogicInput,
  optionIdsByQuestion: string[][],
): JsonInput | null {
  const output: Record<string, unknown> = {};
  const comparison = rule.comparison;
  if (comparison.optionIndex !== undefined) {
    const optionId = optionIdsByQuestion[rule.sourceQuestionIndex]?.[comparison.optionIndex];
    if (optionId) output.optionId = optionId;
  }
  if (comparison.text !== undefined) output.text = comparison.text;
  if (comparison.number !== undefined) output.number = comparison.number;
  if (comparison.date !== undefined) output.date = comparison.date;
  if (comparison.time !== undefined) output.time = comparison.time;
  return Object.keys(output).length > 0 ? jsonObject(output) : null;
}

function buildFormChildren(
  definition: FormDefinitionInput,
  workspaceId: string,
  formId: string,
): BuiltChildren {
  const sectionIds = definition.sections.map(() => newUuidV7());
  const questionIds = definition.questions.map(() => newUuidV7());
  const optionIdsByQuestion = definition.questions.map((question) =>
    "options" in question ? question.options.map(() => newUuidV7()) : [],
  );

  const sections: SectionCreate[] = definition.sections.map((section, index) => ({
    id: sectionIds[index],
    workspaceId,
    formId,
    title: section.title,
    description: section.description ?? null,
    orderIndex: index + 1,
    pageBreakBefore: section.pageBreakBefore,
  }));

  const questions: QuestionCreate[] = definition.questions.map((question, index) => ({
    id: questionIds[index],
    workspaceId,
    formId,
    sectionId: question.sectionIndex === null ? null : (sectionIds[question.sectionIndex] ?? null),
    orderIndex: index + 1,
    questionType: question.questionType,
    prompt: question.prompt,
    description: question.description ?? null,
    isRequired: question.isRequired,
    configJson: jsonObject(question.config),
  }));

  const options: OptionCreate[] = definition.questions.flatMap((question, questionIndex) => {
    if (!("options" in question)) return [];
    return question.options.map((option, optionIndex) => ({
      id: optionIdsByQuestion[questionIndex][optionIndex],
      workspaceId,
      questionId: questionIds[questionIndex],
      label: option.label,
      orderIndex: optionIndex + 1,
    }));
  });

  const logic: LogicCreate[] = definition.logic.map((rule) => ({
    id: newUuidV7(),
    workspaceId,
    formId,
    sourceQuestionId: questionIds[rule.sourceQuestionIndex],
    operator: rule.operator,
    comparisonJson: serializeComparison(rule, optionIdsByQuestion) ?? DB_NULL,
    action: rule.action,
    targetQuestionId:
      rule.targetQuestionIndex === null ? null : questionIds[rule.targetQuestionIndex],
    targetSectionId: rule.targetSectionIndex === null ? null : sectionIds[rule.targetSectionIndex],
  }));

  return { sections, questions, options, logic };
}

async function createFormChildrenTx(
  tx: Parameters<Parameters<typeof withScope>[1]>[0],
  children: BuiltChildren,
): Promise<void> {
  if (children.sections.length > 0) {
    await tx.formSection.createMany({ data: children.sections });
  }
  if (children.questions.length > 0) {
    await tx.formQuestion.createMany({ data: children.questions });
  }
  if (children.options.length > 0) {
    await tx.formQuestionOption.createMany({ data: children.options });
  }
  if (children.logic.length > 0) {
    await tx.formQuestionLogic.createMany({ data: children.logic });
  }
}

async function deleteFormChildrenTx(
  tx: Parameters<Parameters<typeof withScope>[1]>[0],
  workspaceId: string,
  formId: string,
): Promise<void> {
  const questions = await tx.formQuestion.findMany({
    where: { workspaceId, formId },
    select: { id: true },
  });
  if (questions.length > 0) {
    await tx.formQuestionOption.deleteMany({
      where: { workspaceId, questionId: { in: questions.map((question) => question.id) } },
    });
  }
  await tx.formQuestionLogic.deleteMany({ where: { workspaceId, formId } });
  await tx.formQuestion.deleteMany({ where: { workspaceId, formId } });
  await tx.formSection.deleteMany({ where: { workspaceId, formId } });
}

async function publicSlugTx(
  tx: Parameters<Parameters<typeof withScope>[1]>[0],
  input: {
    workspaceId: string;
    isPublic: boolean;
    requested: string | null | undefined;
    currentFormId?: string;
    currentSlug?: string | null;
  },
): Promise<string | null> {
  if (!input.isPublic) return null;

  if (input.requested) {
    const existing = await tx.form.findFirst({
      where: {
        publicSlug: input.requested,
        ...(input.currentFormId ? { NOT: { id: input.currentFormId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new AppError("CONFLICT", { messageKey: "errors.conflict" });
    return input.requested;
  }

  if (input.currentSlug) return input.currentSlug;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomBytes(9).toString("hex");
    const existing = await tx.form.findFirst({
      where: { publicSlug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new AppError("INTERNAL");
}

export async function listForms(scope: Scope, query: FormListQuery) {
  authorize(scope, "forms", "read");
  return listFormRows(scope, query);
}

export async function getForm(scope: Scope, formId: string) {
  authorize(scope, "forms", "read");
  const form = await findFormDetail(scope, formId);
  if (!form) throw new AppError("NOT_FOUND");
  return form;
}

export async function createForm(
  scope: Scope,
  input: FormDefinitionInput,
  request?: RequestContext,
) {
  authorize(scope, "forms", "write");
  const formId = newUuidV7();

  return withSlugConflictTranslation(
    withScope(scope, async (tx) => {
      await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, { kind: "forms" });
      const publicSlug = await publicSlugTx(tx, {
        workspaceId: scope.workspaceId,
        isPublic: input.isPublic,
        requested: input.publicSlug,
      });

      const form = await tx.form.create({
        data: {
          id: formId,
          workspaceId: scope.workspaceId,
          title: input.title,
          description: input.description ?? null,
          status: "draft",
          submissionMode: input.submissionMode,
          isPublic: input.isPublic,
          publicSlug,
          acceptingResponses: input.acceptingResponses,
          confirmationMessage: input.confirmationMessage ?? null,
          settingsJson: jsonObject(input.settings),
          createdByUserId: scope.actorUserId,
        },
        select: {
          id: true,
          title: true,
          status: true,
          publicSlug: true,
          createdAt: true,
        },
      });

      await createFormChildrenTx(tx, buildFormChildren(input, scope.workspaceId, formId));

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "form",
        entityId: form.id,
        action: formAuditActions.formCreated,
        diff: {
          submissionMode: input.submissionMode,
          isPublic: input.isPublic,
          sectionCount: input.sections.length,
          questionCount: input.questions.length,
          logicRuleCount: input.logic.length,
        },
        ...auditContext(request),
      });

      return form;
    }),
  );
}

export async function updateFormDraft(
  scope: Scope,
  formId: string,
  input: FormDefinitionInput,
  request?: RequestContext,
  expectedUpdatedAt?: Date | string | null,
) {
  authorize(scope, "forms", "write");

  return withSlugConflictTranslation(
    withScope(scope, async (tx) => {
      await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, { kind: "forms" });
      const form = await findFormDetailTx(tx, scope.workspaceId, formId);
      if (!form) throw new AppError("NOT_FOUND");
      if (form.status !== "draft") {
        throw new AppError("CONFLICT", { messageKey: "errors.formNotEditable" });
      }
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
        const expectedIso = expectedUpdatedAt instanceof Date ? expectedUpdatedAt.toISOString() : String(expectedUpdatedAt);
        const currentIso = form.updatedAt instanceof Date ? form.updatedAt.toISOString() : String(form.updatedAt);
        if (currentIso !== expectedIso) {
          throw new AppError("CONFLICT", { messageKey: "errors.formModifiedByAnotherUser" });
        }
      }
      const submissionCount = await tx.formSubmission.count({
        where: { workspaceId: scope.workspaceId, formId },
      });
      if (submissionCount > 0) {
        throw new AppError("CONFLICT", { messageKey: "errors.formNotEditable" });
      }

      const publicSlug = await publicSlugTx(tx, {
        workspaceId: scope.workspaceId,
        isPublic: input.isPublic,
        requested: input.publicSlug,
        currentFormId: formId,
        currentSlug: form.publicSlug,
      });

      await deleteFormChildrenTx(tx, scope.workspaceId, formId);
      await createFormChildrenTx(tx, buildFormChildren(input, scope.workspaceId, formId));

      const updated = await tx.form.update({
        where: { id: formId },
        data: {
          title: input.title,
          description: input.description ?? null,
          submissionMode: input.submissionMode,
          isPublic: input.isPublic,
          publicSlug,
          acceptingResponses: input.acceptingResponses,
          confirmationMessage: input.confirmationMessage ?? null,
          settingsJson: jsonObject(input.settings),
        },
        select: {
          id: true,
          title: true,
          status: true,
          publicSlug: true,
          updatedAt: true,
        },
      });

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "form",
        entityId: formId,
        action: formAuditActions.formDraftUpdated,
        diff: {
          submissionMode: input.submissionMode,
          isPublic: input.isPublic,
          sectionCount: input.sections.length,
          questionCount: input.questions.length,
          logicRuleCount: input.logic.length,
        },
        ...auditContext(request),
      });

      return updated;
    }),
  );
}

export async function updateFormSettings(
  scope: Scope,
  formId: string,
  input: FormSettingsUpdateInput,
  request?: RequestContext,
) {
  authorize(scope, "forms", "write");

  return withSlugConflictTranslation(
    withScope(scope, async (tx) => {
      const form = await findFormDetailTx(tx, scope.workspaceId, formId);
      if (!form) throw new AppError("NOT_FOUND");
      if (form.status === "archived") {
        throw new AppError("CONFLICT", { messageKey: "errors.formNotEditable" });
      }

      const isPublic = input.isPublic ?? form.isPublic;
      const publicSlug = await publicSlugTx(tx, {
        workspaceId: scope.workspaceId,
        isPublic,
        requested: input.publicSlug,
        currentFormId: formId,
        currentSlug: form.publicSlug,
      });

      const updated = await tx.form.update({
        where: { id: formId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.submissionMode !== undefined ? { submissionMode: input.submissionMode } : {}),
          isPublic,
          publicSlug,
          ...(input.acceptingResponses !== undefined
            ? { acceptingResponses: input.acceptingResponses }
            : {}),
          ...(input.confirmationMessage !== undefined
            ? { confirmationMessage: input.confirmationMessage }
            : {}),
          ...(input.settings !== undefined ? { settingsJson: jsonObject(input.settings) } : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          submissionMode: true,
          isPublic: true,
          publicSlug: true,
          acceptingResponses: true,
          confirmationMessage: true,
          settingsJson: true,
          updatedAt: true,
        },
      });

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "form",
        entityId: formId,
        action: formAuditActions.formSettingsUpdated,
        diff: {
          isPublic,
          submissionMode: updated.submissionMode,
          acceptingResponses: updated.acceptingResponses,
        },
        ...auditContext(request),
      });

      return updated;
    }),
  );
}

export async function publishForm(
  scope: Scope,
  formId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "forms", "write");

  return withSlugConflictTranslation(
    withScope(scope, async (tx) => {
      await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, { kind: "forms" });
      const form = await findFormDetailTx(tx, scope.workspaceId, formId);
      if (!form) throw new AppError("NOT_FOUND");
      if (form.status !== "draft") {
        throw new AppError("CONFLICT", { messageKey: "errors.formNotEditable" });
      }
      if (form.questions.length === 0) {
        throw new AppError("CONFLICT", { messageKey: "errors.formHasNoQuestions" });
      }

      const publicSlug = await publicSlugTx(tx, {
        workspaceId: scope.workspaceId,
        isPublic: form.isPublic,
        requested: null,
        currentFormId: formId,
        currentSlug: form.publicSlug,
      });

      const updated = await tx.form.update({
        where: { id: formId },
        data: {
          status: "published",
          publicSlug,
          publishedAt: form.publishedAt ?? now,
          archivedAt: null,
        },
        select: {
          id: true,
          title: true,
          status: true,
          publicSlug: true,
          publishedAt: true,
        },
      });

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "form",
        entityId: formId,
        action: formAuditActions.formPublished,
        diff: {
          questionCount: form.questions.length,
          isPublic: form.isPublic,
        },
        ...auditContext(request),
      });

      return updated;
    }),
  );
}

export async function archiveForm(
  scope: Scope,
  formId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "forms", "write");

  return withScope(scope, async (tx) => {
    const form = await findFormDetailTx(tx, scope.workspaceId, formId);
    if (!form) throw new AppError("NOT_FOUND");
    if (form.status === "archived") {
      throw new AppError("CONFLICT", { messageKey: "errors.conflict" });
    }

    const updated = await tx.form.update({
      where: { id: formId },
      data: {
        status: "archived",
        archivedAt: now,
        acceptingResponses: false,
      },
      select: {
        id: true,
        title: true,
        status: true,
        archivedAt: true,
        acceptingResponses: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "form",
      entityId: formId,
      action: formAuditActions.formArchived,
      ...auditContext(request),
    });

    return updated;
  });
}

export async function duplicateForm(
  scope: Scope,
  formId: string,
  input: DuplicateFormInput = {},
  request?: RequestContext,
) {
  authorize(scope, "forms", "write");

  return withScope(scope, async (tx) => {
    await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, { kind: "forms" });
    const source = await findFormDetailTx(tx, scope.workspaceId, formId);
    if (!source) throw new AppError("NOT_FOUND");

    const newFormId = newUuidV7();
    const sectionIds = new Map<string, string>();
    const questionIds = new Map<string, string>();
    const optionIds = new Map<string, string>();

    for (const section of source.sections) sectionIds.set(section.id, newUuidV7());
    for (const question of source.questions) {
      questionIds.set(question.id, newUuidV7());
      for (const option of question.options) optionIds.set(option.id, newUuidV7());
    }

    const created = await tx.form.create({
      data: {
        id: newFormId,
        workspaceId: scope.workspaceId,
        title: input.title ?? `${source.title} (copy)`,
        description: source.description,
        status: "draft",
        submissionMode: source.submissionMode,
        isPublic: false,
        publicSlug: null,
        acceptingResponses: true,
        confirmationMessage: source.confirmationMessage,
        settingsJson: jsonObject(source.settingsJson),
        createdByUserId: scope.actorUserId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });

    const sections: SectionCreate[] = source.sections.map((section) => ({
      id: sectionIds.get(section.id) as string,
      workspaceId: scope.workspaceId,
      formId: newFormId,
      title: section.title,
      description: section.description,
      orderIndex: section.orderIndex,
      pageBreakBefore: section.pageBreakBefore,
    }));

    const questions: QuestionCreate[] = source.questions.map((question) => ({
      id: questionIds.get(question.id) as string,
      workspaceId: scope.workspaceId,
      formId: newFormId,
      sectionId: question.sectionId ? (sectionIds.get(question.sectionId) as string) : null,
      orderIndex: question.orderIndex,
      questionType: question.questionType,
      prompt: question.prompt,
      description: question.description,
      isRequired: question.isRequired,
      configJson: jsonObject(question.configJson),
    }));

    const options: OptionCreate[] = source.questions.flatMap((question) =>
      question.options.map((option) => ({
        id: optionIds.get(option.id) as string,
        workspaceId: scope.workspaceId,
        questionId: questionIds.get(question.id) as string,
        label: option.label,
        orderIndex: option.orderIndex,
      })),
    );

    const logic: LogicCreate[] = source.logicRules.map((rule) => {
      const comparison = { ...asRecord(rule.comparisonJson) };
      if (typeof comparison.optionId === "string") {
        comparison.optionId = optionIds.get(comparison.optionId) ?? comparison.optionId;
      }
      return {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        formId: newFormId,
        sourceQuestionId: questionIds.get(rule.sourceQuestionId) as string,
        operator: rule.operator,
        comparisonJson: Object.keys(comparison).length > 0 ? jsonObject(comparison) : DB_NULL,
        action: rule.action,
        targetQuestionId: rule.targetQuestionId
          ? (questionIds.get(rule.targetQuestionId) as string)
          : null,
        targetSectionId: rule.targetSectionId
          ? (sectionIds.get(rule.targetSectionId) as string)
          : null,
      };
    });

    await createFormChildrenTx(tx, { sections, questions, options, logic });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "form",
      entityId: newFormId,
      action: formAuditActions.formDuplicated,
      diff: {
        sourceFormId: formId,
        questionCount: questions.length,
      },
      ...auditContext(request),
    });

    return created;
  });
}

function toAnswerMap(input: SubmitFormResponseInput): Map<string, LogicAnswer> {
  const map = new Map<string, LogicAnswer>();
  for (const answer of input.answers) {
    map.set(answer.questionId, answer.value as LogicAnswer);
  }
  return map;
}

function toLogicRules(
  form: NonNullable<Awaited<ReturnType<typeof findFormDetailTx>>>,
): FormLogicRule[] {
  return form.logicRules.map((rule) => ({
    id: rule.id,
    sourceQuestionId: rule.sourceQuestionId,
    operator: rule.operator,
    comparison: parseLogicComparison(rule.comparisonJson),
    action: rule.action,
    targetQuestionId: rule.targetQuestionId,
    targetSectionId: rule.targetSectionId,
  }));
}

export async function submitFormResponse(
  scope: Scope,
  formId: string,
  input: SubmitFormResponseInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  // Member-facing submission path. Requires staff session and workspace scope.
  authorize(scope, "forms", "read");

  return withScope(scope, async (tx) => {
    await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, { kind: "forms" });
    const form = await findFormDetailTx(tx, scope.workspaceId, formId);
    if (!form) throw new AppError("NOT_FOUND");
    return processFormSubmission(tx, form, input, scope.workspaceId, request, now);
  });
}

/**
 * Public form submission path. No authentication or workspace scope required.
 *
 * The form is looked up by ID without a workspace constraint, then the
 * submission runs within the form's own workspace scope. This ensures:
 * - No workspace ID is trusted from the client (derived from the form itself)
 * - Cross-tenant access is impossible (form lookup is by ID only, then scoped)
 * - All validation, conditional logic, and security checks are shared
 *   with the member-facing path via `processFormSubmission`.
 */
export async function submitFormResponsePublic(
  formId: string,
  input: SubmitFormResponseInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  return withPublicFormScope(formId, async (outerTx) => {
    const form = await findFormDetailTx(outerTx, null, formId);
    if (!form) throw new AppError("NOT_FOUND");
    return withScope({ workspaceId: form.workspaceId }, async (innerTx) => {
      return processFormSubmission(innerTx, form, input, form.workspaceId, request, now);
    });
  });
}

/**
 * Shared form submission validation and creation logic.
 *
 * Runs within an active workspace transaction. Called by both the member-facing
 * `submitFormResponse` and the public `submitFormResponsePublic`.
 */
async function processFormSubmission(
  tx: Parameters<Parameters<typeof withScope>[1]>[0],
  form: NonNullable<Awaited<ReturnType<typeof findFormDetailTx>>>,
  input: SubmitFormResponseInput,
  workspaceId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  const formId = form.id;

  if (form.status !== "published" || !form.acceptingResponses || form.archivedAt) {
    throw new AppError("CONFLICT", { messageKey: "errors.formNotAcceptingResponses" });
  }

  // Idempotency: check for existing submission by token
  if (input.submissionToken) {
    const existing = await tx.formSubmission.findFirst({
      where: { formId, submissionToken: input.submissionToken },
      select: { id: true, submittedAt: true, _count: { select: { answers: true } } },
    });
    if (existing) {
      return {
        id: existing.id,
        submittedAt: existing.submittedAt,
        answerCount: existing._count.answers,
        ignoredHiddenAnswerCount: 0, // Cannot reconstruct accurately for idempotent return
      };
    }
  }

  const studentId = input.studentId ?? null;
  const submittedByUserId = input.submittedByUserId ?? null;

  // Identified submission deduplication
  if (form.submissionMode === "identified" && studentId && !input.dedupeKey) {
    const existing = await tx.formSubmission.findFirst({
      where: { formId, studentId, dedupeKey: null },
      select: { id: true },
    });
    if (existing && !asRecord(form.settingsJson).allowMultipleSubmissions) {
      throw new AppError("CONFLICT", { messageKey: "errors.formAlreadySubmitted" });
    }
  }

  if (input.dedupeKey) {
    const existing = await tx.formSubmission.findFirst({
      where: { formId, dedupeKey: input.dedupeKey },
      select: { id: true, submittedAt: true, _count: { select: { answers: true } } },
    });
    if (existing) {
      return {
        id: existing.id,
        submittedAt: existing.submittedAt,
        answerCount: existing._count.answers,
        ignoredHiddenAnswerCount: 0,
      };
    }
  }
  if (form.submissionMode === "anonymous" && (studentId || submittedByUserId)) {
    throw new AppError("CONFLICT", {
      messageKey: "errors.formSubmissionIdentityMismatch",
    });
  }
  if (form.submissionMode === "identified" && !studentId && !submittedByUserId) {
    throw new AppError("CONFLICT", {
      messageKey: "errors.formSubmissionIdentityMismatch",
    });
  }

  if (studentId) {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) throw new AppError("NOT_FOUND");
  }

  const questionById = new Map(form.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  for (const answer of input.answers) {
    if (seen.has(answer.questionId)) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formDuplicateAnswer" });
    }
    seen.add(answer.questionId);
    if (!questionById.has(answer.questionId)) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formUnknownQuestion" });
    }
  }

  const answers = toAnswerMap(input);
  const visibility = computeFormVisibility(
    form.sections,
    form.questions.map((question) => ({
      id: question.id,
      sectionId: question.sectionId,
      isRequired: question.isRequired,
      questionType: question.questionType,
    })),
    toLogicRules(form),
    answers,
  );

  for (const question of form.questions) {
    if (!visibility.requiredQuestionIds.has(question.id)) continue;
    if (answerIsEmpty(answers.get(question.id))) {
      throw new AppError("VALIDATION_FAILED", {
        messageKey: "errors.formAnswerRequired",
        fields: { [question.id]: ["required"] },
      });
    }
  }

  const fileIds = new Set<string>();
  const validAnswers: Array<{
    questionId: string;
    value: LogicAnswer;
    fileIds: string[];
  }> = [];
  let ignoredHiddenAnswerCount = 0;

  for (const answer of input.answers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;
    if (!visibility.visibleQuestionIds.has(question.id)) {
      ignoredHiddenAnswerCount += 1;
      continue;
    }

    const value = answer.value as LogicAnswer;
    const validation = validateAnswerValue(
      {
        id: question.id,
        questionType: question.questionType,
        config: question.configJson,
        optionIds: new Set(question.options.map((option) => option.id)),
      },
      value,
    );
    if (!validation.ok) {
      throw new AppError("VALIDATION_FAILED", {
        messageKey: validation.messageKey,
        fields: { [question.id]: [validation.messageKey.replace("errors.", "")] },
      });
    }

    const answerFileIds = question.questionType === "file_upload" ? (value.fileIds ?? []) : [];
    for (const fileId of answerFileIds) fileIds.add(fileId);
    validAnswers.push({
      questionId: question.id,
      value,
      fileIds: answerFileIds,
    });
  }

  const fileRows =
    fileIds.size > 0
      ? await tx.file.findMany({
          where: {
            workspaceId,
            id: { in: [...fileIds] },
            archivedAt: null,
            deletedAt: null,
            scanStatus: "clean",
            // Public submissions must use files recorded via FormUpload provenance
            ...(submittedByUserId === null
              ? {
                  formUploads: {
                    some: { formId, workspaceId },
                  },
                }
              : {}),
          },
          select: { id: true, mime: true, sizeBytes: true },
        })
      : [];
  if (fileRows.length !== fileIds.size) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
  }
  const fileById = new Map(fileRows.map((file) => [file.id, file]));

  for (const answer of validAnswers) {
    if (answer.fileIds.length === 0) continue;
    const question = questionById.get(answer.questionId);
    const config = asRecord(question?.configJson);
    const maxSizeBytes =
      typeof config.maxSizeBytes === "number" ? config.maxSizeBytes : 10 * 1024 * 1024;
    const allowedMimeTypes = Array.isArray(config.allowedMimeTypes)
      ? config.allowedMimeTypes.filter((mime): mime is string => typeof mime === "string")
      : [];
    for (const fileId of answer.fileIds) {
      const file = fileById.get(fileId);
      if (!file)
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
      if (file.sizeBytes > maxSizeBytes) {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
      }
      if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mime)) {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
      }
    }
  }

  const submission = await tx.formSubmission.create({
    data: {
      id: newUuidV7(),
      workspaceId,
      formId,
      submissionMode: form.submissionMode,
      studentId,
      submittedByUserId,
      submissionToken: input.submissionToken,
      dedupeKey: input.dedupeKey,
      submittedAt: now,
    },
    select: { id: true, submittedAt: true },
  });

  const answerRows = validAnswers.map((answer) => {
    const value = { ...answer.value };
    if (answer.fileIds.length > 0) delete value.fileIds;
    return {
      id: newUuidV7(),
      workspaceId,
      submissionId: submission.id,
      questionId: answer.questionId,
      valueJson: jsonObject(value),
    };
  });

  if (answerRows.length > 0) {
    await tx.formAnswer.createMany({ data: answerRows });
  }

  const answerFileRows = validAnswers.flatMap((answer, index) =>
    answer.fileIds.map((fileId) => ({
      workspaceId,
      answerId: answerRows[index].id,
      fileId,
    })),
  );
  if (answerFileRows.length > 0) {
    await tx.formAnswerFile.createMany({ data: answerFileRows });
  }

  await writeAuditEvent(tx, {
    workspaceId,
    actorUserId: submittedByUserId ?? null,
    actorDisplayName: submittedByUserId ?? "",
    actorType: "user",
    entityType: "form_submission",
    entityId: submission.id,
    action: formAuditActions.submissionReceived,
    diff: {
      formId,
      submissionMode: form.submissionMode,
      answerCount: answerRows.length,
      ignoredHiddenAnswerCount,
    },
    ...auditContext(request),
  });

  return {
    id: submission.id,
    submittedAt: submission.submittedAt,
    answerCount: answerRows.length,
    ignoredHiddenAnswerCount,
  };
}

export async function listFormSubmissions(scope: Scope, query: FormSubmissionQuery) {
  authorize(scope, "forms", "read");
  return listFormSubmissionRows(scope, query);
}

export async function getFormSubmission(scope: Scope, submissionId: string) {
  authorize(scope, "forms", "read");
  const submission = await findFormSubmissionDetail(scope, submissionId);
  if (!submission) throw new AppError("NOT_FOUND");
  return submission;
}
