import { AppError } from "@/lib/http/errors";
import type { DbTransactionClient } from "@/lib/db/scope";
import { resolveEffectiveWorkspacePlan, type EffectiveWorkspacePlan } from "./plans";
import {
  countActiveGroupsTx,
  countActiveStudentsTx,
  countAssistantSeatsTx,
  getWorkspacePlanStateTx,
  sumWorkspaceFileBytesTx,
} from "./repository";

export type EnforcedWorkspaceResource =
  | { kind: "students"; additionalCount?: number }
  | { kind: "groups"; additionalCount?: number }
  | { kind: "assistants"; additionalCount?: number; now?: Date }
  | { kind: "files"; additionalBytes: number }
  | {
      kind: "videos";
      currentVideoCount: number;
      currentStorageBytes: number;
      currentBandwidthBytes: number;
      additionalSizeBytes: number;
    }
  | { kind: "online_exams" }
  | { kind: "report_exports" };

/**
 * Enforce workspace account status, subscription/pilot plan status, feature gates,
 * and resource quotas on the server (`F-P3-04` AC-1, AC-3).
 *
 * Downgrading or reaching a cap never deletes existing data; it blocks new writes
 * with a deterministic `AppError` and localized message key.
 */
export async function assertWorkspaceWriteAllowedTx(
  tx: DbTransactionClient,
  workspaceId: string,
  resource: EnforcedWorkspaceResource,
): Promise<EffectiveWorkspacePlan> {
  const row = await getWorkspacePlanStateTx(tx, workspaceId);
  if (!row) {
    throw new AppError("NOT_FOUND");
  }

  const effective = resolveEffectiveWorkspacePlan(row);

  if (
    effective.writeRestrictionReason === "workspace_suspended" ||
    effective.writeRestrictionReason === "workspace_deleted" ||
    effective.writeRestrictionReason === "plan_suspended"
  ) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.workspaceInactive" });
  }

  if (
    effective.writeRestrictionReason === "plan_past_due" ||
    effective.writeRestrictionReason === "plan_cancelled"
  ) {
    throw new AppError("CONFLICT", { messageKey: "errors.planWriteRestricted" });
  }

  switch (resource.kind) {
    case "students": {
      const add = resource.additionalCount ?? 1;
      const activeCount = await countActiveStudentsTx(tx, workspaceId);
      if (activeCount + add > effective.limits.maxActiveStudents) {
        throw new AppError("CONFLICT", { messageKey: "errors.planStudentLimitReached" });
      }
      break;
    }
    case "groups": {
      const add = resource.additionalCount ?? 1;
      const activeCount = await countActiveGroupsTx(tx, workspaceId);
      if (activeCount + add > effective.limits.maxActiveGroups) {
        throw new AppError("CONFLICT", { messageKey: "errors.planGroupLimitReached" });
      }
      break;
    }
    case "assistants": {
      const add = resource.additionalCount ?? 1;
      const seatsUsed = await countAssistantSeatsTx(tx, workspaceId, resource.now);
      if (seatsUsed + add > effective.limits.maxAssistants) {
        throw new AppError("CONFLICT", { messageKey: "errors.planAssistantLimitReached" });
      }
      break;
    }
    case "files": {
      const usedBytes = await sumWorkspaceFileBytesTx(tx, workspaceId);
      if (usedBytes + resource.additionalBytes > effective.limits.maxFileStorageBytes) {
        throw new AppError("CONFLICT", { messageKey: "errors.planFileStorageLimitReached" });
      }
      break;
    }
    case "videos": {
      if (!effective.features.recordedVideosEnabled) {
        throw new AppError("FORBIDDEN", { messageKey: "errors.planFeatureDisabled" });
      }
      if (resource.currentVideoCount + 1 > effective.limits.maxVideoCount) {
        throw new AppError("CONFLICT", { messageKey: "errors.videoCountLimitReached" });
      }
      if (
        resource.currentStorageBytes + resource.additionalSizeBytes >
        effective.limits.maxVideoStorageBytes
      ) {
        throw new AppError("CONFLICT", { messageKey: "errors.videoStorageLimitReached" });
      }
      if (resource.currentBandwidthBytes >= effective.limits.maxVideoBandwidthBytesPerMonth) {
        throw new AppError("CONFLICT", { messageKey: "errors.videoBandwidthLimitReached" });
      }
      break;
    }
    case "online_exams": {
      if (!effective.features.onlineExamsEnabled) {
        throw new AppError("FORBIDDEN", { messageKey: "errors.planFeatureDisabled" });
      }
      break;
    }
    case "report_exports": {
      if (!effective.features.reportExportsEnabled) {
        throw new AppError("FORBIDDEN", { messageKey: "errors.planFeatureDisabled" });
      }
      break;
    }
  }

  return effective;
}
