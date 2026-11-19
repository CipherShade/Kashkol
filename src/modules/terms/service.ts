import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  deleteTermTx,
  findAllTermsTx,
  findTermById,
  insertTermTx,
  listTerms,
  updateTermTx,
} from "./repository";
import { hasOverlap, type TermView } from "./resolution";
import type { TermInput } from "./schemas";

export type RequestContext = { requestId?: string };

function context(req: RequestContext | undefined) {
  return { requestId: req?.requestId ?? newRequestId() };
}

/** Management read. Terms are workspace configuration, gated by `settings:read`. */
export async function getTerms(scope: Scope): Promise<TermView[]> {
  authorize(scope, "settings", "read");
  return listTerms(scope);
}

/**
 * Read-only term metadata for the reports screen. The reports page is already
 * gated by the report permissions and passes no names, notes, or personal data
 * to the client; using this path avoids requiring `settings:read` just to see a
 * date range. Mutations always go through `settings:write` above.
 */
export async function getTermsForReporting(scope: Scope): Promise<TermView[]> {
  return listTerms(scope);
}

export async function getTerm(scope: Scope, termId: string): Promise<TermView> {
  authorize(scope, "settings", "read");
  const term = await findTermById(scope, termId);
  if (!term) throw new AppError("NOT_FOUND");
  return term;
}

function assertNoOverlap(existing: TermView[], candidate: TermView, excludeId?: string) {
  if (hasOverlap(existing, candidate, excludeId)) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "AcademicTerms.errors.overlap",
    });
  }
}

export async function createTerm(
  scope: Scope,
  input: TermInput,
  reqCtx?: RequestContext,
): Promise<TermView> {
  authorize(scope, "settings", "write");
  const ctx = context(reqCtx);
  const id = newUuidV7();

  return withScope(scope, async (tx) => {
    const existing = await findAllTermsTx(tx, scope);
    const candidate: TermView = {
      id,
      name: input.name,
      grade: input.grade,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    assertNoOverlap(existing, candidate);
    const term = await insertTermTx(tx, scope, { ...input, id });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "academic_term",
      entityId: id,
      action: "academic_term.created",
      diff: {
        termName: input.name,
        grade: input.grade,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      requestId: ctx.requestId,
    });
    return term;
  });
}

export async function updateTerm(
  scope: Scope,
  termId: string,
  input: TermInput,
  reqCtx?: RequestContext,
): Promise<TermView> {
  authorize(scope, "settings", "write");
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    const existing = await findAllTermsTx(tx, scope);
    const before = existing.find((term) => term.id === termId);
    if (!before) throw new AppError("NOT_FOUND");
    const candidate: TermView = {
      id: termId,
      name: input.name,
      grade: input.grade,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    assertNoOverlap(existing, candidate, termId);
    const term = await updateTermTx(tx, scope, termId, input);
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "academic_term",
      entityId: termId,
      action: "academic_term.updated",
      diff: {
        before: {
          termName: before.name,
          grade: before.grade,
          startDate: before.startDate,
          endDate: before.endDate,
        },
        after: {
          termName: input.name,
          grade: input.grade,
          startDate: input.startDate,
          endDate: input.endDate,
        },
      },
      requestId: ctx.requestId,
    });
    return term;
  });
}

export async function deleteTerm(
  scope: Scope,
  termId: string,
  reqCtx?: RequestContext,
): Promise<void> {
  authorize(scope, "settings", "write");
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    const existing = await findAllTermsTx(tx, scope);
    const term = existing.find((row) => row.id === termId);
    if (!term) throw new AppError("NOT_FOUND");
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "academic_term",
      entityId: termId,
      action: "academic_term.deleted",
      diff: {
        termName: term.name,
        grade: term.grade,
        startDate: term.startDate,
        endDate: term.endDate,
      },
      requestId: ctx.requestId,
    });
    await deleteTermTx(tx, scope, termId);
  });
}
