import type { Scope } from "@/modules/tenancy/types";

/**
 * The system actor used by the messaging outbox worker.
 *
 * A single constant is used by both the HTTP worker route and the
 * long-running worker process so the intended security model — a dedicated
 * worker identity, never a real user, never an owner pre-approval — is
 * preserved everywhere. The scope never carries a real user id, so audit
 * rows written by the worker identify the actor as the system, not as a
 * teacher.
 */
export function createMessagingWorkerScope(workspaceId: string): Scope {
  return {
    workspaceId,
    actorUserId: "system:messaging-worker",
    actorDisplayName: "Messaging worker",
    role: "owner",
    permissions: new Set(),
  };
}
