import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { assertWorkspaceWriteAllowedTx } from "@/modules/platform-admin/enforcement";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  parseSpreadsheetBuffer,
  generateExportBuffer,
  generateTemplateBuffer,
  type ImportPreviewResult,
  type StudentExportRow,
} from "./adapters/spreadsheet";
import {
  archiveStudentTx,
  countStudentLinkedRecords,
  deleteStudentTx,
  findDuplicateStudents,
  findStudentById,
  findStudentProfile,
  insertStudentTx,
  insertStudentNoteTx,
  listStudents,
  restoreStudentTx,
  syncStudentEnrollmentsTx,
  updateStudentTx,
} from "./repository";
import type {
  CommitImportInput,
  CreateStudentInput,
  StudentQueryParams,
  UpdateStudentInput,
  CreateStudentNoteInput,
} from "./schemas";

export type RequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

function context(req: RequestContext | undefined) {
  return {
    requestId: req?.requestId ?? newRequestId(),
    ipHash: req?.ipHash ?? null,
  };
}

export async function getStudents(scope: Scope, query: StudentQueryParams) {
  authorize(scope, "students", "read");
  return listStudents(scope, query);
}

export async function getStudent(scope: Scope, studentId: string) {
  authorize(scope, "students", "read");
  const student = await findStudentById(scope, studentId);
  if (!student) throw new AppError("NOT_FOUND");
  return student;
}

export async function getStudentProfileDetails(scope: Scope, studentId: string) {
  authorize(scope, "students", "read");
  const canViewPayments = isAllowed(scope, "payments", "read");
  const profile = await findStudentProfile(scope, studentId, canViewPayments);
  if (!profile) throw new AppError("NOT_FOUND");
  return { ...profile, canViewPayments };
}

export async function createStudent(
  scope: Scope,
  input: CreateStudentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  // Check duplicate warning if not explicitly confirmed
  if (!input.confirmDuplicate) {
    const duplicates = await findDuplicateStudents(scope, {
      phoneE164: input.phone,
      parentPhoneE164: input.parentPhone,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    if (duplicates.length > 0) {
      return {
        duplicateWarning: true as const,
        duplicates,
      };
    }
  }

  const studentId = newUuidV7();

  return withScope(scope, async (tx) => {
    await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, {
      kind: "students",
      additionalCount: 1,
    });
    if (input.groupIds && input.groupIds.length > 0) {
      const count = await tx.group.count({
        where: { workspaceId: scope.workspaceId, id: { in: input.groupIds }, archivedAt: null },
      });
      if (count !== new Set(input.groupIds).size) throw new AppError("NOT_FOUND");
    }
    const student = await insertStudentTx(tx, scope, {
      id: studentId,
      firstName: input.firstName,
      lastName: input.lastName,
      grade: input.grade,
      phoneE164: input.phone,
      parentName: input.parentName,
      parentPhoneE164: input.parentPhone,
    });

    if (input.groupIds && input.groupIds.length > 0) {
      await syncStudentEnrollmentsTx(tx, scope, studentId, input.groupIds);
    }

    if (input.note && scope.actorUserId) {
      await insertStudentNoteTx(tx, scope, {
        id: newUuidV7(),
        studentId,
        body: input.note,
        authorId: scope.actorUserId,
      });
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: studentId,
      action: "student.created",
      diff: {
        firstName: input.firstName,
        lastName: input.lastName,
        grade: input.grade,
        groupIds: input.groupIds,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { duplicateWarning: false as const, student };
  });
}

export async function updateStudent(
  scope: Scope,
  input: UpdateStudentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  const existing = await findStudentById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");

  if (!input.confirmDuplicate) {
    const duplicates = await findDuplicateStudents(scope, {
      phoneE164: input.phone,
      parentPhoneE164: input.parentPhone,
      firstName: input.firstName,
      lastName: input.lastName,
      excludeId: input.id,
    });

    if (duplicates.length > 0) {
      return {
        duplicateWarning: true as const,
        duplicates,
      };
    }
  }

  return withScope(scope, async (tx) => {
    if (input.groupIds !== undefined) {
      const count = await tx.group.count({
        where: { workspaceId: scope.workspaceId, id: { in: input.groupIds }, archivedAt: null },
      });
      if (count !== new Set(input.groupIds).size) throw new AppError("NOT_FOUND");
    }
    const student = await updateStudentTx(tx, scope, input.id, {
      firstName: input.firstName,
      lastName: input.lastName,
      grade: input.grade,
      phoneE164: input.phone,
      parentName: input.parentName,
      parentPhoneE164: input.parentPhone,
    });

    if (input.groupIds !== undefined) {
      await syncStudentEnrollmentsTx(tx, scope, input.id, input.groupIds);
    }

    if (input.note && scope.actorUserId) {
      await insertStudentNoteTx(tx, scope, {
        id: newUuidV7(),
        studentId: input.id,
        body: input.note,
        authorId: scope.actorUserId,
      });
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: input.id,
      action: "student.updated",
      diff: {
        before: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          grade: existing.grade,
        },
        after: {
          firstName: input.firstName,
          lastName: input.lastName,
          grade: input.grade,
        },
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { duplicateWarning: false as const, student };
  });
}

export async function createStudentNote(
  scope: Scope,
  studentId: string,
  input: CreateStudentNoteInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!student) throw new AppError("NOT_FOUND");

    const note = await insertStudentNoteTx(tx, scope, {
      id: newUuidV7(),
      studentId,
      body: input.body,
      authorId: scope.actorUserId,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student_note",
      entityId: note.id,
      action: "note.created",
      diff: { studentId },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return note;
  });
}

export async function archiveStudent(
  scope: Scope,
  studentId: string,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  const existing = await findStudentById(scope, studentId);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const archived = await archiveStudentTx(tx, scope, studentId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: studentId,
      action: "student.archived",
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return archived;
  });
}

export async function restoreStudent(
  scope: Scope,
  studentId: string,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  const existing = await findStudentById(scope, studentId);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const restored = await restoreStudentTx(tx, scope, studentId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: studentId,
      action: "student.restored",
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return restored;
  });
}

export async function deleteStudent(
  scope: Scope,
  studentId: string,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  const existing = await findStudentById(scope, studentId);
  if (!existing) throw new AppError("NOT_FOUND");

  // Check linked records. A student with linked attendance, assessments, or payments
  // must be archived, not hard-deleted.
  const linked = await countStudentLinkedRecords(scope, studentId);
  if (linked.totalLinked > 0) {
    throw new AppError("CONFLICT", {
      messageKey: "errors.studentHasLinkedRecordsArchiveInstead",
    });
  }

  return withScope(scope, async (tx) => {
    await deleteStudentTx(tx, scope, studentId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: studentId,
      action: "student.deleted",
      diff: {
        deletedFirstName: existing.firstName,
        deletedLastName: existing.lastName,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { deleted: true };
  });
}

export async function previewStudentsImport(
  scope: Scope,
  buffer: Buffer,
  fileType: "csv" | "xlsx",
): Promise<ImportPreviewResult> {
  authorize(scope, "students", "write");

  const parsed = await (async () => {
    try {
      return await parseSpreadsheetBuffer(buffer, fileType);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "ROW_LIMIT_EXCEEDED") {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.importRowLimit" });
      }
      if (code === "EMPTY_WORKBOOK") {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.importEmptyFile" });
      }
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.importUnreadableFile" });
    }
  })();

  // Check matching students in workspace to determine create vs update
  const existingStudents = await withScope(scope, (tx) =>
    tx.student.findMany({
      where: { workspaceId: scope.workspaceId, archivedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneE164: true,
      },
    }),
  );

  const phoneMap = new Map<string, (typeof existingStudents)[0]>();
  const nameMap = new Map<string, Array<(typeof existingStudents)[0]>>();
  for (const s of existingStudents) {
    if (s.phoneE164) phoneMap.set(s.phoneE164, s);
    const key = `${s.firstName.toLowerCase()}\u0000${s.lastName.toLowerCase()}`;
    const bucket = nameMap.get(key);
    if (bucket) bucket.push(s);
    else nameMap.set(key, [s]);
  }

  let validCount = 0;
  let errorCount = 0;

  for (const row of parsed.rows) {
    if (row.errors.length > 0) {
      row.action = "skip";
      errorCount++;
      continue;
    }

    // Match on name + phone. A name-only match is allowed but requires the
    // teacher to acknowledge the warning during commit.
    let matched: (typeof existingStudents)[0] | undefined;
    if (row.phone && phoneMap.has(row.phone)) {
      const candidate = phoneMap.get(row.phone)!;
      if (
        candidate.firstName.toLowerCase() === row.firstName.toLowerCase() &&
        candidate.lastName.toLowerCase() === row.lastName.toLowerCase()
      ) {
        matched = candidate;
      } else {
        row.warnings.push("phoneMatchesDifferentStudent");
      }
    } else if (!row.phone) {
      const candidates =
        nameMap.get(`${row.firstName.toLowerCase()}\u0000${row.lastName.toLowerCase()}`) ?? [];
      if (candidates.length === 1) {
        matched = candidates[0];
        row.warnings.push("nameOnlyMatch");
      }
    }

    if (matched) {
      row.action = "update";
      row.existingStudentId = matched.id;
    } else {
      row.action = "create";
    }

    validCount++;
  }

  return {
    totalRows: parsed.rows.length,
    validRows: validCount,
    errorRows: errorCount,
    detectedGroups: parsed.detectedGroups,
    columnsMatched: parsed.columnsMatched,
    sourceEncoding: parsed.sourceEncoding,
    rows: parsed.rows,
  };
}

export async function commitStudentsImport(
  scope: Scope,
  input: CommitImportInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = context(reqCtx);

  const rowsToProcess =
    input.mode === "all_or_nothing"
      ? input.rows
      : input.rows.filter((r) => r.action !== "skip");

  if (input.mode === "all_or_nothing" && input.rows.some((r) => r.action === "skip")) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.importHasSkippedRowsInAllOrNothing",
    });
  }

  // A name-only match can update the wrong student. The server derives the
  // condition from the payload (an update with no phone) instead of trusting
  // a client-supplied warning flag.
  const hasNameOnlyMatch = input.rows.some((r) => r.action === "update" && !r.phone);
  if (hasNameOnlyMatch && !input.acknowledgeWarnings) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.importWarningsNotAcknowledged",
    });
  }

  return withScope(scope, async (tx) => {
    const newStudentsCount = rowsToProcess.filter((r) => r.action === "create").length;
    await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, {
      kind: "students",
      additionalCount: newStudentsCount,
    });
    // 1. Resolve or create groups
    const groupNameToId = new Map<string, string>();
    const existingGroups = await tx.group.findMany({
      where: { workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true, name: true },
    });
    for (const g of existingGroups) {
      groupNameToId.set(g.name.toLowerCase().trim(), g.id);
    }

    for (const [groupName, mapping] of Object.entries(input.groupMappings)) {
      const normalized = groupName.toLowerCase().trim();
      if (mapping.action === "map" && mapping.targetGroupId) {
        groupNameToId.set(normalized, mapping.targetGroupId);
      } else if (mapping.action === "create") {
        if (!groupNameToId.has(normalized)) {
          const newGid = newUuidV7();
          const defaultStartTime = new Date("1970-01-01T16:00:00Z");
          const created = await tx.group.create({
            data: {
              id: newGid,
              workspaceId: scope.workspaceId,
              name: groupName,
              weekday: 0, // Saturday
              startTime: defaultStartTime,
              color: "indigo",
            },
          });
          groupNameToId.set(normalized, created.id);
        }
      }
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of rowsToProcess) {
      const studentId = row.existingStudentId ?? newUuidV7();
      const targetGroupId = row.groupName
        ? groupNameToId.get(row.groupName.toLowerCase().trim())
        : undefined;

      if (row.action === "create") {
        await tx.student.create({
          data: {
            id: studentId,
            workspaceId: scope.workspaceId,
            firstName: row.firstName,
            lastName: row.lastName,
            grade: row.grade ?? null,
            phoneE164: row.phone ?? null,
            parentName: row.parentName ?? null,
            parentPhoneE164: row.parentPhone ?? null,
          },
        });
        createdCount++;
      } else if (row.action === "update") {
        await tx.student.update({
          where: { id: studentId, workspaceId: scope.workspaceId },
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            grade: row.grade !== undefined ? row.grade : undefined,
            phoneE164: row.phone !== undefined ? row.phone : undefined,
            parentName: row.parentName !== undefined ? row.parentName : undefined,
            parentPhoneE164: row.parentPhone !== undefined ? row.parentPhone : undefined,
          },
        });
        updatedCount++;
      }

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "student",
        entityId: studentId,
        action: row.action === "create" ? "student.created" : "student.updated",
        diff: {
          source: "import",
          rowNumber: row.rowNumber,
          groupId: targetGroupId ?? null,
        },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });

      if (targetGroupId) {
        const hasEnrollment = await tx.enrollment.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            studentId,
            groupId: targetGroupId,
            leftAt: null,
          },
        });
        if (!hasEnrollment) {
          await tx.enrollment.create({
            data: {
              workspaceId: scope.workspaceId,
              studentId,
              groupId: targetGroupId,
            },
          });
        }
      }
    }

    const skippedCount = input.rows.length - createdCount - updatedCount;

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: scope.workspaceId,
      action: "student.imported",
      diff: {
        createdCount,
        updatedCount,
        skippedCount,
        mode: input.mode,
        groupMappings: input.groupMappings,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return {
      success: true,
      createdCount,
      updatedCount,
      skippedCount,
      totalProcessed: createdCount + updatedCount,
    };
  });
}

export async function exportStudents(
  scope: Scope,
  query: StudentQueryParams,
  format: "csv" | "xlsx",
  locale: "ar" | "en",
): Promise<Buffer> {
  authorize(scope, "exports", "write");
  authorize(scope, "students", "read");

  // Get full list without pagination for export
  const allStudentsQuery = { ...query, page: 1, pageSize: 5000 };
  const result = await listStudents(scope, allStudentsQuery);

  const exportRows: StudentExportRow[] = result.items.map((item) => ({
    id: item.id,
    firstName: item.firstName,
    lastName: item.lastName,
    grade: item.grade,
    phoneE164: item.phoneE164,
    parentName: item.parentName,
    parentPhoneE164: item.parentPhoneE164,
    status: item.status,
    groupNames: item.groups.map((g) => g.name),
    attendanceRate: item.attendanceRate,
    quizAverage: item.quizAverage,
    joinedAt: item.joinedAt,
    archivedAt: item.archivedAt,
  }));

  return generateExportBuffer(exportRows, format, locale);
}

export async function getStudentImportTemplate(
  format: "csv" | "xlsx",
  locale: "ar" | "en",
): Promise<Buffer> {
  return generateTemplateBuffer(format, locale);
}
