import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./client";

export type DbTransactionClient = Prisma.TransactionClient;

export type TenantScope = {
  workspaceId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  actorType: "user" | "system" | "platform_admin";
};

/**
 * Run a read or a write inside a transaction whose tenant GUC is set.
 *
 * The setting is transaction-local (`true`), so a pooled connection cannot
 * carry one tenant's scope into the next request. Outside this helper RLS
 * matches zero rows: the failure mode is closed, not open (ADR-0006).
 */
export async function withScope<T>(
  scope: Pick<TenantScope, "workspaceId">,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  return getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.workspace_id', ${scope.workspaceId}, true)`;
      return fn(tx);
    },
    options,
  );
}

/**
 * Run a transaction scoped to a *user*, not a workspace.
 *
 * This exists for exactly two bootstrap reads: listing the active memberships
 * of the signed-in user, and listing that user's portal grants. Both tables
 * carry a SELECT-only self policy keyed on `app.user_id`; no other table is
 * reachable this way and no write passes this scope.
 */
export async function withUserScope<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * Resolve one invitation by its token hash before a workspace scope exists.
 *
 * The token is a bearer secret: the caller already knows it, and the matching
 * RLS policy exposes exactly the row carrying that hash. The transaction is
 * SELECT-only by intent; the acceptance write runs inside the resolved
 * workspace scope afterwards.
 */
export async function withInvitationScope<T>(
  tokenHash: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
    return fn(tx);
  });
}

/**
 * Resolve one portal invitation by its token hash before a workspace scope exists.
 */
export async function withPortalInvitationScope<T>(
  tokenHash: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.portal_invitation_token_hash', ${tokenHash}, true)`;
    return fn(tx);
  });
}

/**
 * Run a transaction scoped to a verified platform admin (`F-P3-03`).
 *
 * The matching SELECT-only RLS policy on `workspace` checks that `adminUserId`
 * corresponds to an active (`revoked_at IS NULL`) row in `platform_admin`.
 * Tenant tables (`student`, `student_note`, `assessment_score`, `guardian`, etc.)
 * do not carry a platform-admin bypass policy.
 */
export async function withPlatformAdminScope<T>(
  adminUserId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_admin_user_id', ${adminUserId}, true)`;
    return fn(tx);
  });
}

/**
 * Run a transaction scoped to one public form by ID.
 *
 * The GUC `app.public_form_id` is set transaction-local so a pooled connection
 * cannot carry one public form's scope into the next request. Outside this
 * helper the public SELECT policies match zero rows: the failure mode is
 * closed, not open (ADR-0006, ADR-0023).
 *
 * The form ID is the only input: the workspace is derived from the form row
 * itself, never from a URL parameter, a body field, or a client-controlled
 * header.
 */
export async function withPublicFormScope<T>(
  formId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.public_form_id', ${formId}, true)`;
    return fn(tx);
  });
}


