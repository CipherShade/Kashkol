import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  getFileStorageAdapter,
  getMalwareScanAdapter,
} from "@/modules/files/adapters";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  isScannerConfigured,
  isStorageConfigured,
  validateFileContent,
} from "@/modules/files";
import {
  resolvePortalStudent,
  type PortalContext,
} from "@/modules/identity/session";
import { resolvePortalPermissions } from "./tokens";
import {
  findOwnHomeworkSubmissionFile,
  MAX_HOMEWORK_SUBMISSION_FILES,
  submitStudentHomeworkInScope,
  type PreparedSubmissionFile,
} from "./repository";

export { MAX_HOMEWORK_SUBMISSION_FILES };

/** A file read from a multipart student submission request. */
export type HomeworkFileUpload = {
  filename: string;
  mime: string;
  sizeBytes: number;
  body: Buffer;
};

/**
 * Attach scanned files and submit homework in one tenant transaction.
 *
 * Validation, scanning, and storage happen before the transaction opens: a
 * network call is never made inside it. If any later step fails, every object
 * written for this attempt is deleted so a failed submission leaves no residue.
 */
export async function submitStudentHomeworkWithFiles(
  portal: PortalContext,
  homeworkId: string,
  studentId?: string | null,
  uploads: HomeworkFileUpload[] = [],
  now: Date = new Date(),
  requestId?: string,
) {
  const studentGrants = portal.grants.filter((grant) => grant.kind === "student");
  if (studentGrants.length === 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" });
  }

  const targetStudentId = studentId ?? studentGrants[0].studentId;
  const resolved = await resolvePortalStudent(portal, targetStudentId, "student");
  const permissions = resolvePortalPermissions("student", resolved.grant.permissions);
  if (!permissions.showHomework) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.forbidden" });
  }
  if (uploads.length > MAX_HOMEWORK_SUBMISSION_FILES) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.homeworkSubmissionFileLimit",
      fields: { files: ["tooMany"] },
    });
  }

  const actorUserId = portal.user?.id ?? portal.userId;
  const stored: PreparedSubmissionFile[] = [];

  try {
    if (uploads.length > 0) {
      if (!isStorageConfigured()) {
        throw new AppError("CONFLICT", { messageKey: "errors.fileStorageUnavailable" });
      }
      if (!isScannerConfigured()) {
        throw new AppError("CONFLICT", { messageKey: "errors.fileScannerUnavailable" });
      }

      for (const upload of uploads) {
        const validated = validateFileContent(upload);
        const scan = await getMalwareScanAdapter().scan(upload.body);
        if (!scan.clean) {
          throw new AppError("VALIDATION_FAILED", { messageKey: "errors.fileMalware" });
        }

        const fileId = newUuidV7();
        const storageKey = `ws/${resolved.grant.workspaceId}/${fileId}.${validated.extension}`;
        await getFileStorageAdapter().put({
          key: storageKey,
          body: upload.body,
          contentType: validated.mime,
        });
        stored.push({
          fileId,
          storageKey,
          title: upload.filename.slice(0, 160),
          mime: validated.mime,
          sizeBytes: upload.sizeBytes,
        });
      }
    }

    const submission = await submitStudentHomeworkInScope(
      resolved.grant,
      actorUserId,
      homeworkId,
      now,
      stored,
      async (tx, saved, fileIds) => {
        await writeAuditEvent(tx, {
          workspaceId: resolved.grant.workspaceId,
          actorUserId,
          actorDisplayName: `${resolved.student.firstName} ${resolved.student.lastName}`,
          actorType: "user",
          entityType: "homework_submission",
          entityId: saved.id,
          action: "homework.submitted",
          requestId: requestId ?? newRequestId(),
          diff: {
            homeworkId,
            outcome: saved.status,
            fileCount: fileIds.length,
          },
        });
      },
    );

    if (!submission) {
      throw new AppError("NOT_FOUND");
    }
    return submission;
  } catch (error) {
    await Promise.allSettled(stored.map((file) => getFileStorageAdapter().delete(file.storageKey)));
    throw error;
  }
}

/**
 * Reauthorize the student and sign a short-lived download for one of their own
 * submitted files. The redirect target is never exposed to another student.
 */
export async function getHomeworkSubmissionFileDownloadUrl(
  portal: PortalContext,
  homeworkId: string,
  fileId: string,
  studentId?: string | null,
) {
  const studentGrants = portal.grants.filter((grant) => grant.kind === "student");
  if (studentGrants.length === 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" });
  }

  const targetStudentId = studentId ?? studentGrants[0].studentId;
  const resolved = await resolvePortalStudent(portal, targetStudentId, "student");
  const permissions = resolvePortalPermissions("student", resolved.grant.permissions);
  if (!permissions.showHomework) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.forbidden" });
  }

  const row = await findOwnHomeworkSubmissionFile(resolved.grant, homeworkId, fileId);
  if (!row) {
    throw new AppError("NOT_FOUND");
  }

  return getFileStorageAdapter().signDownload({
    key: row.file.storageKey,
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    filename: row.file.title,
    contentType: row.file.mime,
  });
}
