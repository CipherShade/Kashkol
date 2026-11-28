import { AppError } from "@/lib/http/errors";
import type { DbTransactionClient } from "@/lib/db/scope";
import { resolveEffectiveWorkspacePlan, type EffectiveWorkspacePlan } from "./plans";
import { getWorkspacePlanStateTx } from "./repository";

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
  | { kind: "report_exports" }
  | { kind: "forms" };

/**
 * Check only the genuine workspace lifecycle state before a write.
 *
 * Plan quotas, feature gates, and payment status never block a teacher
 * (ADR-0046). The `resource` argument is retained so existing call sites do not
 * have to change; it is intentionally not used for enforcement.
 */
export async function assertWorkspaceWriteAllowedTx(
  tx: DbTransactionClient,
  workspaceId: string,
  _resource: EnforcedWorkspaceResource,
): Promise<EffectiveWorkspacePlan> {
  const row = await getWorkspacePlanStateTx(tx, workspaceId);
  if (!row) {
    throw new AppError("NOT_FOUND");
  }

  const effective = resolveEffectiveWorkspacePlan(row);
  if (
    effective.writeRestrictionReason === "workspace_suspended" ||
    effective.writeRestrictionReason === "workspace_deleted"
  ) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.workspaceInactive" });
  }

  return effective;
}
