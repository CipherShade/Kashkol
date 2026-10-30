import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { getServerEnv, isEmailConfigured } from "@/lib/config/env";
import { writeAuditEvent } from "@/modules/audit/service";
import { getEmailTransport, workspaceInvitationEmail } from "@/modules/identity/email";
import { deleteSessionsForUserTx, findActiveMemberships, findGrantedPermissions, findUser, findWorkspaceState } from "@/modules/identity/repository";
import {
  findCallerMembership,
  findInvitationByTokenHash,
  findInvitationInWorkspace,
  findMemberByEmail,
  findMemberInWorkspace,
  findMembershipForUser,
  findPendingInvitationForEmail,
  findWorkspaceAndSettingsForUpdate,
  findWorkspaceProfile,
  findWorkspaceSettings,
  insertAssistantMembership,
  insertInvitation,
  insertOnboardingTasks,
  insertOwnerMembership,
  insertWorkspace,
  insertWorkspaceSettings,
  listInvitations,
  listMembersWithGrants,
  listOnboardingTasks,
  markInvitationAccepted,
  markInvitationExpired,
  markInvitationRevoked,
  markMemberRemoved,
  replaceMemberGrants,
  rotateInvitationToken,
  updateMemberStatus,
  updateWorkspaceRow,
  updateWorkspaceSettingsRow,
} from "./repository";
import {
  grantableOnly,
  permissionGrantSchema,
  type CreateWorkspaceInput,
  type InviteMemberInput,
  type PermissionGrantInput,
  type UpdateWorkspaceInput,
} from "./schemas";
import {
  assertGrantable,
  assertOwner,
  authorize,
  permissionKey,
  type PermissionAction,
  type PermissionResource,
  type Scope,
} from "./types";
import {
  canResendInvitation,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationIsOpen,
  invitationLink,
  invitationState,
  normalizeInvitationEmail,
} from "./invitations";
import { withScope } from "@/lib/db/scope";

export type RequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

export type WorkspaceOverview = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    teachingName: string;
    primarySubject: string | null;
    gradesTaught: string[];
    status: string;
  };
  settings: {
    locale: string;
    theme: string;
    timezone: string;
    currency: string;
    atRiskAfter: number;
    inactiveAfter: number;
  };
};

function context(request: RequestContext | undefined) {
  return {
    requestId: request?.requestId ?? newRequestId(),
    ipHash: request?.ipHash ?? null,
  };
}

function slugFor(name: string, id: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${ascii || "workspace"}-${id.slice(0, 8)}`;
}

/**
 * A read use case for the settings screen: it requires `settings:read`.
 */
export async function resolveScope(userId: string, workspaceId: string): Promise<Scope> {
  const memberships = await findActiveMemberships(userId);
  const membership = memberships.find((candidate) => candidate.workspaceId === workspaceId);
  if (!membership) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.noWorkspace" });
  }

  const workspace = await findWorkspaceState(workspaceId);
  if (!workspace || workspace.status !== "active") {
    throw new AppError("FORBIDDEN", { messageKey: "errors.workspaceInactive" });
  }

  const grants = await findGrantedPermissions(workspaceId, membership.id);
  const user = await findUser(userId);
  const permissions = new Set(
    grants.map((grant) => permissionKey(grant.resource, grant.action)),
  );

  return {
    workspaceId,
    actorUserId: userId,
    actorDisplayName: user?.name ?? "User",
    role: membership.role,
    permissions,
  };
}

export async function getWorkspaceOverview(scope: Scope): Promise<WorkspaceOverview> {
  authorize(scope, "settings", "read");
  return readWorkspaceOverview(scope);
}

/**
 * The projection returned after an authorised write. It re-reads the row but
 * does not require `settings:read`, because `settings:write` is a separate
 * grantable permission; requiring both would make the write unreturnable.
 */
async function readWorkspaceOverview(scope: Scope): Promise<WorkspaceOverview> {
  const [workspace, settings] = await Promise.all([
    findWorkspaceProfile(scope),
    findWorkspaceSettings(scope),
  ]);

  if (!workspace || !settings) {
    throw new AppError("NOT_FOUND");
  }

  return { workspace, settings };
}

/**
 * The shell projection: a member may know the workspace's display name without
 * holding a settings grant. It never includes thresholds or other preferences.
 */
export async function getWorkspaceIdentity(scope: Scope) {
  const workspace = await findWorkspaceProfile(scope);
  if (!workspace) throw new AppError("NOT_FOUND");
  return workspace;
}

/**
 * Create the first workspace for a signed-in user.
 *
 * The workspace, its settings, the owner membership, the onboarding checklist,
 * and the audit event are written in one scoped transaction. A failure leaves
 * no orphaned workspace (`F-P0-06` AC-2).
 */
export async function createWorkspace(
  actor: { userId: string; displayName: string },
  input: CreateWorkspaceInput,
  request?: RequestContext,
): Promise<{ workspaceId: string; slug: string }> {
  const memberships = await findActiveMemberships(actor.userId);
  if (memberships.length > 0) {
    throw new AppError("CONFLICT", { messageKey: "workspace.errors.alreadyMember" });
  }

  const workspaceId = newUuidV7();
  const slug = slugFor(input.name, workspaceId);
  const log = context(request);

  await withScope({ workspaceId }, async (tx) => {
    await insertWorkspace(tx, {
      id: workspaceId,
      name: input.name,
      slug,
      teachingName: input.teachingName,
      primarySubject: input.primarySubject ?? null,
      gradesTaught: input.gradesTaught,
      status: "active",
    });

    await insertWorkspaceSettings(tx, {
      workspaceId,
      atRiskAfter: input.atRiskAfter,
      inactiveAfter: input.inactiveAfter,
      locale: input.locale,
      theme: input.theme,
      timezone: input.timezone,
      currency: input.currency,
    });

    await insertOwnerMembership(tx, {
      workspaceId,
      userId: actor.userId,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });

    await insertOnboardingTasks(tx, workspaceId);

    await writeAuditEvent(tx, {
      workspaceId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorType: "user",
      entityType: "workspace",
      entityId: workspaceId,
      action: "workspace.created",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: {
        name: input.name,
        teachingName: input.teachingName,
        primarySubject: input.primarySubject ?? null,
        gradesTaught: input.gradesTaught,
        atRiskAfter: input.atRiskAfter,
        inactiveAfter: input.inactiveAfter,
      },
    });
  });

  return { workspaceId, slug };
}

function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: Array<keyof T>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[String(key)] = { before: before[key], after: after[key] };
    }
  }
  return diff;
}

/**
 * Update the workspace identity and its settings in one transaction.
 *
 * The workspace id comes from the scope. There is no parameter that could name
 * a different workspace, and the update is additionally constrained by RLS.
 */
export async function updateWorkspaceProfile(
  scope: Scope,
  input: UpdateWorkspaceInput,
  request?: RequestContext,
): Promise<WorkspaceOverview> {
  authorize(scope, "settings", "write");
  const log = context(request);

  await withScope(scope, async (tx) => {
    const current = await findWorkspaceAndSettingsForUpdate(tx, scope.workspaceId);
    if (!current.workspace || !current.settings) {
      throw new AppError("NOT_FOUND");
    }

    const workspaceDiff = changedFields(
      {
        name: current.workspace.name,
        teachingName: current.workspace.teachingName,
        primarySubject: current.workspace.primarySubject,
        gradesTaught: current.workspace.gradesTaught,
      },
      {
        name: input.name,
        teachingName: input.teachingName,
        primarySubject: input.primarySubject ?? null,
        gradesTaught: input.gradesTaught,
      },
      ["name", "teachingName", "primarySubject", "gradesTaught"],
    );

    const settingsDiff = changedFields(
      {
        locale: current.settings.locale,
        theme: current.settings.theme,
        timezone: current.settings.timezone,
        currency: current.settings.currency,
        atRiskAfter: current.settings.atRiskAfter,
        inactiveAfter: current.settings.inactiveAfter,
      },
      {
        locale: input.locale,
        theme: input.theme,
        timezone: input.timezone,
        currency: input.currency,
        atRiskAfter: input.atRiskAfter,
        inactiveAfter: input.inactiveAfter,
      },
      ["locale", "theme", "timezone", "currency", "atRiskAfter", "inactiveAfter"],
    );

    const diff = { ...workspaceDiff, ...settingsDiff };
    if (Object.keys(diff).length === 0) {
      return;
    }

    await updateWorkspaceRow(tx, scope.workspaceId, {
      name: input.name,
      teachingName: input.teachingName,
      primarySubject: input.primarySubject ?? null,
      gradesTaught: input.gradesTaught,
    });
    await updateWorkspaceSettingsRow(tx, scope.workspaceId, {
      locale: input.locale,
      theme: input.theme,
      timezone: input.timezone,
      currency: input.currency,
      atRiskAfter: input.atRiskAfter,
      inactiveAfter: input.inactiveAfter,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "workspace",
      entityId: scope.workspaceId,
      action: "settings.updated",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff,
    });
  });

  return readWorkspaceOverview(scope);
}

/**
 * The signed-in member's own role, join date, and account verification state.
 * This is a self projection and needs no team grant.
 */
export async function getCallerMembership(scope: Scope) {
  const member = await findCallerMembership(scope);
  if (!member) throw new AppError("NOT_FOUND");
  return member;
}

export async function listMembers(scope: Scope) {
  authorize(scope, "team", "read");
  return listMembersWithGrants(scope);
}

function grantsFromJson(value: unknown): PermissionGrantInput[] {
  const parsed = permissionGrantSchema.array().safeParse(value);
  return parsed.success ? grantableOnly(parsed.data) : [];
}

function invitationView<
  T extends {
    status: string;
    expiresAt: Date;
    grants: unknown;
  },
>(row: T) {
  return {
    ...row,
    grants: grantsFromJson(row.grants),
    status: invitationState(
      { status: row.status as "pending" | "accepted" | "revoked" | "expired", expiresAt: row.expiresAt },
      new Date(),
    ),
  };
}

/**
 * The invitation list is a team projection. An expired invitation is shown as
 * expired even before a background pass writes the status back.
 */
export async function listWorkspaceInvitations(scope: Scope) {
  authorize(scope, "team", "read");
  const rows = await listInvitations(scope);
  return rows.map(invitationView);
}

function resolveEmailDelivery() {
  const env = getServerEnv();
  if (!isEmailConfigured(env)) {
    throw new AppError("CONFLICT", { messageKey: "team.errors.emailNotConfigured" });
  }
  return { env, transport: getEmailTransport(env) };
}

async function deliverInvitation(input: {
  email: string;
  token: string;
  workspaceName: string;
  inviterName: string;
  locale: string;
}) {
  const { env, transport } = resolveEmailDelivery();
  try {
    await transport.send(
      workspaceInvitationEmail(
        input.email,
        invitationLink(env.BETTER_AUTH_URL, input.locale, input.token),
        input.workspaceName,
        input.inviterName,
      ),
    );
  } catch {
    // The token stays unknown to the invitee. The owner can resend once the
    // transport is healthy; nothing is reported as delivered.
    throw new AppError("CONFLICT", { messageKey: "team.errors.inviteDeliveryFailed" });
  }
}

/**
 * Create an assistant invitation. The grant set defaults to empty (deny by
 * default), is validated against the grantable matrix, and is re-applied at
 * acceptance time inside the tenant transaction.
 *
 * The token is generated here, stored only as a hash, and handed to the
 * configured email transport. It is never returned to the caller.
 */
export async function inviteMember(
  scope: Scope,
  input: InviteMemberInput,
  locale: string,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);
  const email = normalizeInvitationEmail(input.email);
  const grants = grantableOnly(input.grants);
  const now = new Date();
  const token = createInvitationToken();
  const expiresAt = invitationExpiry(now);
  const tokenHash = hashInvitationToken(token);
  const workspace = await findWorkspaceProfile(scope);
  if (!workspace) throw new AppError("NOT_FOUND");

  const invitation = await withScope(scope, async (tx) => {
    const existingMember = await findMemberByEmail(tx, scope.workspaceId, email);
    if (existingMember) {
      throw new AppError("CONFLICT", { messageKey: "team.errors.alreadyMember" });
    }

    const pending = await findPendingInvitationForEmail(tx, scope.workspaceId, email);
    if (pending && invitationIsOpen(pending, now)) {
      throw new AppError("CONFLICT", { messageKey: "team.errors.alreadyInvited" });
    }
    if (pending) {
      await markInvitationRevoked(tx, scope.workspaceId, pending.id, now);
    }

    const created = await insertInvitation(tx, {
      workspaceId: scope.workspaceId,
      email,
      tokenHash,
      invitedByUserId: scope.actorUserId,
      expiresAt,
      lastSentAt: now,
      grants,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "invitation",
      entityId: created.id,
      action: "team.invitation_sent",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: { grants: grants.map((grant) => permissionKey(grant.resource, grant.action)) },
    });

    return created;
  });

  await deliverInvitation({
    email: invitation.email,
    token,
    workspaceName: workspace.name,
    inviterName: scope.actorDisplayName,
    locale,
  });

  return invitationView({ ...invitation, grants });
}

/**
 * Rotate the token. The previous link stops working immediately; the new link
 * is the only valid one. Rate-limited to one resend per minute.
 */
export async function resendInvitation(
  scope: Scope,
  invitationId: string,
  locale: string,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);
  const now = new Date();
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = invitationExpiry(now);
  const workspace = await findWorkspaceProfile(scope);
  if (!workspace) throw new AppError("NOT_FOUND");

  const email = await withScope(scope, async (tx) => {
    const invitation = await findInvitationInWorkspace(tx, scope.workspaceId, invitationId);
    if (!invitation) throw new AppError("NOT_FOUND");
    const state = invitationState(invitation, now);
    if (state === "expired") {
      await markInvitationExpired(tx, scope.workspaceId, invitation.id);
      throw new AppError("CONFLICT", { messageKey: "team.errors.invitationExpired" });
    }
    if (state !== "pending") {
      throw new AppError("CONFLICT", { messageKey: "team.errors.invitationNotPending" });
    }
    if (!canResendInvitation(invitation.lastSentAt, now)) {
      throw new AppError("CONFLICT", { messageKey: "team.errors.resendTooSoon" });
    }

    const count = await rotateInvitationToken(tx, scope.workspaceId, invitation.id, {
      tokenHash,
      expiresAt,
      lastSentAt: now,
    });
    if (!count) throw new AppError("CONFLICT");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "invitation",
      entityId: invitation.id,
      action: "team.invitation_resent",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: {},
    });

    return invitation.email;
  });

  await deliverInvitation({
    email,
    token,
    workspaceName: workspace.name,
    inviterName: scope.actorDisplayName,
    locale,
  });
}

export async function revokeInvitation(
  scope: Scope,
  invitationId: string,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);
  const now = new Date();

  await withScope(scope, async (tx) => {
    const invitation = await findInvitationInWorkspace(tx, scope.workspaceId, invitationId);
    if (!invitation) throw new AppError("NOT_FOUND");
    const state = invitationState(invitation, now);
    if (state === "expired") {
      await markInvitationExpired(tx, scope.workspaceId, invitation.id);
      throw new AppError("CONFLICT", { messageKey: "team.errors.invitationExpired" });
    }
    if (state !== "pending") {
      throw new AppError("CONFLICT", { messageKey: "team.errors.invitationNotPending" });
    }

    const count = await markInvitationRevoked(tx, scope.workspaceId, invitation.id, now);
    if (!count) throw new AppError("CONFLICT");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "invitation",
      entityId: invitation.id,
      action: "team.invitation_revoked",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: {},
    });
  });
}

/**
 * Accept an invitation as the signed-in invitee.
 *
 * The token resolves the workspace; the signed-in email must match the
 * invitation email. The membership, the grants, and the acceptance marker are
 * written together, and the token stops working at that moment.
 */
export async function acceptInvitation(
  actor: { userId: string; email: string; displayName: string; emailVerified: boolean },
  token: string,
  request?: RequestContext,
) {
  if (!actor.emailVerified) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.emailNotVerified" });
  }
  const log = context(request);
  const now = new Date();
  const tokenHash = hashInvitationToken(token);
  const invitation = await findInvitationByTokenHash(tokenHash);
  if (!invitation) throw new AppError("NOT_FOUND", { messageKey: "team.errors.invitationInvalid" });

  const status = invitationState(invitation, now);
  if (status === "expired") {
    await withScope({ workspaceId: invitation.workspaceId }, (tx) =>
      markInvitationExpired(tx, invitation.workspaceId, invitation.id),
    );
    throw new AppError("CONFLICT", { messageKey: "team.errors.invitationExpired" });
  }
  if (status !== "pending") {
    throw new AppError("CONFLICT", { messageKey: "team.errors.invitationUsed" });
  }
  if (normalizeInvitationEmail(actor.email) !== normalizeInvitationEmail(invitation.email)) {
    throw new AppError("FORBIDDEN", { messageKey: "team.errors.invitationEmailMismatch" });
  }
  const activeMemberships = await findActiveMemberships(actor.userId);
  if (activeMemberships.some((membership) => membership.workspaceId !== invitation.workspaceId)) {
    throw new AppError("CONFLICT", { messageKey: "team.errors.activeWorkspace" });
  }

  const grants = grantsFromJson(invitation.grants);

  const result = await withScope({ workspaceId: invitation.workspaceId }, async (tx) => {
    const workspace = await tx.workspace.findFirst({
      where: { id: invitation.workspaceId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!workspace || workspace.status !== "active") {
      throw new AppError("FORBIDDEN", { messageKey: "errors.workspaceInactive" });
    }

    const existing = await findMembershipForUser(tx, invitation.workspaceId, actor.userId);
    if (existing && existing.status !== "removed") {
      throw new AppError("CONFLICT", { messageKey: "team.errors.alreadyMember" });
    }

    const member = existing
      ? await tx.workspaceMember.update({
          where: { id: existing.id },
          data: { status: "active", joinedAt: now, removedAt: null },
          select: { id: true },
        })
      : await insertAssistantMembership(tx, {
          workspaceId: invitation.workspaceId,
          userId: actor.userId,
          role: "assistant",
          status: "active",
          joinedAt: now,
        });

    await replaceMemberGrants(tx, invitation.workspaceId, member.id, grants);

    const accepted = await markInvitationAccepted(
      tx,
      invitation.workspaceId,
      invitation.id,
      actor.userId,
      now,
    );
    if (!accepted) {
      throw new AppError("CONFLICT", { messageKey: "team.errors.invitationUsed" });
    }

    await writeAuditEvent(tx, {
      workspaceId: invitation.workspaceId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorType: "user",
      entityType: "invitation",
      entityId: invitation.id,
      action: "team.invitation_accepted",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: { grants: grants.map((grant) => permissionKey(grant.resource, grant.action)) },
    });

    return { workspaceId: invitation.workspaceId, memberId: member.id };
  });

  return result;
}

/** Suspend an assistant: the membership stops resolving and sessions die now. */
export async function suspendMember(
  scope: Scope,
  memberId: string,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);

  await withScope(scope, async (tx) => {
    const member = await findMemberInWorkspace(tx, scope.workspaceId, memberId);
    if (!member || member.status === "removed") throw new AppError("NOT_FOUND");
    if (member.role === "owner" || member.userId === scope.actorUserId) {
      throw new AppError("FORBIDDEN", { messageKey: "errors.ownerSuspension" });
    }
    if (member.status === "suspended") return;

    await updateMemberStatus(tx, scope.workspaceId, member.id, "suspended");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "member",
      entityId: member.id,
      action: "team.member_suspended",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: { role: member.role },
    });

    await deleteSessionsForUserTx(tx, member.userId);
  });
}

export async function reactivateMember(
  scope: Scope,
  memberId: string,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);

  await withScope(scope, async (tx) => {
    const member = await findMemberInWorkspace(tx, scope.workspaceId, memberId);
    if (!member || member.status === "removed") throw new AppError("NOT_FOUND");
    if (member.role === "owner") {
      throw new AppError("FORBIDDEN", { messageKey: "errors.ownerPermissions" });
    }
    if (member.status === "active") return;

    await updateMemberStatus(tx, scope.workspaceId, member.id, "active");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "member",
      entityId: member.id,
      action: "team.member_reactivated",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: { role: member.role },
    });
  });
}

/**
 * The onboarding checklist is a workspace-level convenience and is readable by
 * any active member; it never exposes another member's data.
 */
export async function getOnboardingTasks(scope: Scope) {
  return listOnboardingTasks(scope);
}

/**
 * Replace an assistant's grant set. Owner-only, refused before any read even if
 * the assistant somehow holds a `team:write` grant row.
 */
export async function updateMemberPermissions(
  scope: Scope,
  memberId: string,
  grants: Array<{ resource: PermissionResource; action: PermissionAction }>,
  request?: RequestContext,
) {
  assertOwner(scope);
  const log = context(request);

  const unique = new Map<string, { resource: PermissionResource; action: PermissionAction }>();
  for (const grant of grants) {
    assertGrantable(grant.resource, grant.action);
    unique.set(`${grant.resource}:${grant.action}`, grant);
  }
  const next = [...unique.values()].sort((a, b) =>
    `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`),
  );

  await withScope(scope, async (tx) => {
    const member = await findMemberInWorkspace(tx, scope.workspaceId, memberId);
    if (!member || member.status === "removed") throw new AppError("NOT_FOUND");
    if (member.role === "owner") {
      throw new AppError("FORBIDDEN", { messageKey: "errors.ownerPermissions" });
    }

    const before = member.grants.map((grant) => `${grant.resource}:${grant.action}`).sort();

    await replaceMemberGrants(tx, scope.workspaceId, memberId, next);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "member",
      entityId: memberId,
      action: "team.permissions_changed",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: {
        before,
        after: next.map((grant) => `${grant.resource}:${grant.action}`),
      },
    });

    // A privilege change must not leave an old session holding the old rights.
    await deleteSessionsForUserTx(tx, member.userId);
  });

  return next;
}

export async function removeMember(scope: Scope, memberId: string, request?: RequestContext) {
  assertOwner(scope);
  const log = context(request);

  await withScope(scope, async (tx) => {
    const member = await findMemberInWorkspace(tx, scope.workspaceId, memberId);
    if (!member || member.status === "removed") throw new AppError("NOT_FOUND");
    if (member.role === "owner" || member.userId === scope.actorUserId) {
      throw new AppError("FORBIDDEN", { messageKey: "errors.ownerRemoval" });
    }

    await markMemberRemoved(tx, scope.workspaceId, memberId, new Date());

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "member",
      entityId: memberId,
      action: "team.member_removed",
      requestId: log.requestId,
      ipHash: log.ipHash,
      diff: { role: member.role },
    });

    await deleteSessionsForUserTx(tx, member.userId);
  });
}
