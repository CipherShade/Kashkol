import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope, type DbTransactionClient } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  deleteSessionsForUserTx,
  findActiveMemberships,
  findActivePortalGrants,
  findUser,
} from "@/modules/identity/repository";
import {
  isPortalPhoneLocked,
  recordPortalSignInFailure,
} from "@/modules/identity/lockout";
import {
  resolvePortalStudent,
  type PortalContext,
} from "@/modules/identity/session";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import { getWebPushPublicConfig } from "./push";
import {
  generatePortalPassword,
  normalizePortalPhone,
  portalUsernameEmail,
} from "./credentials";
import {
  acceptPortalInvitationTx,
  createOrRotatePortalInvitationTx,
  deletePortalPushSubscriptionForUser,
  findAutoPortalGrantForStudentTx,
  findPortalLoginCandidates,
  findPortalInvitationByTokenHash,
  findStudentForPortalAccess,
  insertPortalLoginTx,
  listPortalNotificationsForGrants,
  listPortalPushSubscriptionsForUser,
  loadParentChildDetail,
  loadParentLinkedChildren,
  loadStudentPortalDetail,
  markPortalNotificationReadForGrants,
  revokePortalGrantTx,
  revokePortalInvitationTx,
  submitStudentHomeworkInScope,
  updatePortalGrantPermissionsTx,
  updatePortalPushPreferenceForUser,
  upsertPortalPushSubscriptionForUser,
  updatePortalLoginPasswordTx,
  setPortalLoginStatusTx,
  updatePortalLoginPhoneTx,
} from "./repository";
import {
  acceptPortalInvitationSchema,
  deletePushSubscriptionSchema,
  issuePortalInvitationSchema,
  updatePortalGrantPermissionsSchema,
  updatePushPreferenceSchema,
  upsertPushSubscriptionSchema,
  type AcceptPortalInvitationInput,
  type DeletePushSubscriptionInput,
  type IssuePortalInvitationInput,
  type UpdatePortalGrantPermissionsInput,
  type UpdatePushPreferenceInput,
  type UpsertPushSubscriptionInput,
} from "./schemas";
import {
  createPortalInvitationToken,
  hashPortalInvitationToken,
  normalizePortalEmail,
  portalInvitationExpiresAt,
  resolvePortalPermissions,
} from "./tokens";

export type RequestContext = {
  requestId?: string;
  ipHash?: string | null;
  locale?: string;
  userAgent?: string | null;
};

function resolveContext(request?: RequestContext) {
  return {
    requestId: request?.requestId ?? newRequestId(),
    ipHash: request?.ipHash ?? null,
    locale: request?.locale === "en" ? "en" : "ar",
    userAgent: request?.userAgent ?? null,
  };
}

type CredentialResult = { username: string; password: string };
type CredentialAuditContext = { requestId: string; ipHash: string | null };
type CredentialStudent = { id: string; phoneE164: string | null };

/**
 * Create the Better Auth credential identity and the portal grant for a
 * student, inside the caller's transaction. Returns null when the student has
 * no usable phone number — there is no safe way to provision a credential
 * without one, and the caller decides how to report that.
 */
async function createPortalCredentialTx(
  tx: DbTransactionClient,
  scope: Scope,
  student: CredentialStudent,
  ctx: CredentialAuditContext,
  action: "portal.credential.provisioned" | "portal.credential.regenerated",
  now: Date,
): Promise<CredentialResult | null> {
  const phone = student.phoneE164 ? normalizePortalPhone(student.phoneE164) : null;
  if (!phone) return null;

  const password = generatePortalPassword();
  const passwordHash = await hashPassword(password);
  const userId = newUuidV7();

  await tx.user.create({
    data: {
      id: userId,
      name: phone,
      email: portalUsernameEmail(userId),
      emailVerified: true,
    },
  });

  await tx.account.create({
    data: {
      id: newUuidV7(),
      providerId: "credential",
      accountId: userId,
      userId,
      password: passwordHash,
    },
  });

  await insertPortalLoginTx(tx, {
    id: newUuidV7(),
    portalUserId: userId,
    usernamePhone: phone,
    passwordSetAt: now,
  });

  await tx.portalGrant.create({
    data: {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      portalUserId: userId,
      studentId: student.id,
      guardianId: null,
      kind: "student",
      permissions: {},
      issuedBy: scope.actorUserId,
      issuedAt: now,
    },
  });

  await writeAuditEvent(tx, {
    workspaceId: scope.workspaceId,
    actorUserId: scope.actorUserId,
    actorDisplayName: scope.actorDisplayName,
    actorType: "user",
    entityType: "portal_credential",
    entityId: userId,
    action,
    diff: { studentId: student.id },
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });

  return { username: phone, password };
}

/** Rotate the password on the existing credential and kill every session. */
async function rotatePortalCredentialTx(
  tx: DbTransactionClient,
  scope: Scope,
  existing: NonNullable<Awaited<ReturnType<typeof findAutoPortalGrantForStudentTx>>>,
  ctx: CredentialAuditContext & { studentId: string },
  action: "portal.credential.provisioned" | "portal.credential.regenerated",
  now: Date,
): Promise<CredentialResult> {
  const password = generatePortalPassword();
  const passwordHash = await hashPassword(password);

  const updated = await updatePortalLoginPasswordTx(tx, {
    portalUserId: existing.login.portalUserId,
    passwordHash,
    now,
    status: "active",
  });

  if (!updated) {
    throw new AppError("NOT_FOUND");
  }

  await deleteSessionsForUserTx(tx, existing.login.portalUserId);

  await writeAuditEvent(tx, {
    workspaceId: scope.workspaceId,
    actorUserId: scope.actorUserId,
    actorDisplayName: scope.actorDisplayName,
    actorType: "user",
    entityType: "portal_credential",
    entityId: existing.login.portalUserId,
    action,
    diff: { studentId: ctx.studentId },
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });

  return { username: existing.login.usernamePhone, password };
}

/**
 * Shared provisioning flow. When an unrevoked auto credential exists:
 * `onExisting: "throw"` rejects with credentialAlreadyExists (the explicit
 * create path), while `onExisting: "skip"` silently keeps it (the student
 * creation path, where the plaintext password must not be revealed twice).
 */
async function provisionCredentialTx(
  tx: DbTransactionClient,
  scope: Scope,
  student: CredentialStudent,
  ctx: CredentialAuditContext,
  now: Date,
  onExisting: "throw" | "skip",
): Promise<CredentialResult | null> {
  const phone = student.phoneE164 ? normalizePortalPhone(student.phoneE164) : null;
  if (!phone) return null;

  const existing = await findAutoPortalGrantForStudentTx(tx, {
    workspaceId: scope.workspaceId,
    studentId: student.id,
  });

  if (existing && existing.grant.revokedAt === null) {
    if (onExisting === "skip") {
      return null;
    }
    throw new AppError("CONFLICT", {
      messageKey: "errors.credentialAlreadyExists",
    });
  }

  return createPortalCredentialTx(
    tx,
    scope,
    student,
    ctx,
    "portal.credential.provisioned",
    now,
  );
}

/** Create the teacher-provisioned credential for one student on demand. */
export async function provisionStudentPortalAccess(
  scope: Scope,
  studentId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "portal_access", "write");
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true, phoneE164: true },
    });
    if (!student) {
      throw new AppError("NOT_FOUND");
    }

    const result = await provisionCredentialTx(
      tx,
      scope,
      student,
      ctx,
      now,
      "throw",
    );
    if (!result) {
      throw new AppError("VALIDATION_FAILED", {
        messageKey: "students.portalCredentialPhoneRequired",
      });
    }
    return result;
  });
}

/** Create the credential during student creation, inside the same transaction. */
export async function provisionStudentPortalAccessTx(
  tx: DbTransactionClient,
  scope: Scope,
  studentId: string,
  request?: RequestContext,
  now: Date = new Date(),
): Promise<CredentialResult | null> {
  const ctx = resolveContext(request);

  const student = await tx.student.findFirst({
    where: { id: studentId, workspaceId: scope.workspaceId },
    select: { id: true, phoneE164: true },
  });
  if (!student) {
    throw new AppError("NOT_FOUND");
  }

  return provisionCredentialTx(tx, scope, student, ctx, now, "skip");
}

/**
 * Keep the portal credential in sync with a student phone change, inside the
 * caller's transaction. Changing the phone changes the sign-in identifier,
 * so an assistant without `portal_access:write` may not make the change once
 * a credential exists: the credential fails closed rather than silently
 * pointing at a phone the student no longer has.
 */
export async function syncStudentPortalCredentialPhoneTx(
  tx: DbTransactionClient,
  scope: Scope,
  studentId: string,
  newPhone: string | null,
  request?: RequestContext,
  now: Date = new Date(),
): Promise<void> {
  const ctx = resolveContext(request);
  const existing = await findAutoPortalGrantForStudentTx(tx, {
    workspaceId: scope.workspaceId,
    studentId,
  });
  if (!existing) return;

  const previous = existing.login.usernamePhone;
  if (newPhone === previous) return;

  if (!isAllowed(scope, "portal_access", "write")) {
    throw new AppError("FORBIDDEN", {
      messageKey: "errors.portalPhoneUpdateNeedsPortalAccess",
    });
  }

  if (newPhone) {
    await updatePortalLoginPhoneTx(tx, {
      portalUserId: existing.login.portalUserId,
      phone: newPhone,
      now,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_credential",
      entityId: existing.login.portalUserId,
      action: "portal.credential.phone_updated",
      diff: { studentId },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return;
  }

  await setPortalLoginStatusTx(tx, {
    portalUserId: existing.login.portalUserId,
    status: "disabled",
    now,
  });
  await deleteSessionsForUserTx(tx, existing.login.portalUserId);
  await writeAuditEvent(tx, {
    workspaceId: scope.workspaceId,
    actorUserId: scope.actorUserId,
    actorDisplayName: scope.actorDisplayName,
    actorType: "user",
    entityType: "portal_credential",
    entityId: existing.login.portalUserId,
    action: "portal.credential.disabled",
    diff: { studentId, reason: "phone_removed" },
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });
}

/**
 * Read the credential state for the student profile card. Contains no secret:
 * the password is never recoverable after creation, only the username, the
 * status, and whether a credential exists.
 */
export async function getPortalCredentialState(
  scope: Scope,
  studentId: string,
) {
  authorize(scope, "portal_access", "read");

  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true, phoneE164: true },
    });
    if (!student) {
      throw new AppError("NOT_FOUND");
    }

    const existing = await findAutoPortalGrantForStudentTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
    });

    if (!existing) {
      return {
        canProvision: normalizePortalPhone(student.phoneE164) !== null,
        credential: null as {
          username: string;
          status: "active" | "disabled" | "revoked";
        } | null,
      };
    }

    return {
      canProvision: false,
      credential: {
        username: existing.login.usernamePhone,
        status:
          existing.grant.revokedAt !== null
            ? ("revoked" as const)
            : existing.login.status,
      },
    };
  });
}

/** Regenerate the student's password; the old password stops working immediately. */
export async function regenerateStudentPortalCredential(
  scope: Scope,
  studentId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "portal_access", "write");
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true, phoneE164: true },
    });
    if (!student) {
      throw new AppError("NOT_FOUND");
    }

    const grant = await findAutoPortalGrantForStudentTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
    });

    if (grant && grant.grant.revokedAt === null) {
      return rotatePortalCredentialTx(
        tx,
        scope,
        grant,
        { ...ctx, studentId },
        "portal.credential.regenerated",
        now,
      );
    }

    const phone = student.phoneE164 ? normalizePortalPhone(student.phoneE164) : null;
    if (!phone) {
      throw new AppError("VALIDATION_FAILED", {
        messageKey: "students.portalCredentialPhoneRequired",
      });
    }

    const result = await createPortalCredentialTx(
      tx,
      scope,
      { id: student.id, phoneE164: phone },
      ctx,
      "portal.credential.regenerated",
      now,
    );
    if (!result) {
      throw new AppError("VALIDATION_FAILED", {
        messageKey: "students.portalCredentialPhoneRequired",
      });
    }
    return result;
  });
}

/** Enable or disable the student's sign-in account. Disabling kills sessions. */
export async function setStudentPortalAccessStatus(
  scope: Scope,
  studentId: string,
  enabled: boolean,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "portal_access", "write");
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const grant = await findAutoPortalGrantForStudentTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
    });

    if (!grant) {
      throw new AppError("NOT_FOUND");
    }

    if (!enabled) {
      await setPortalLoginStatusTx(tx, {
        portalUserId: grant.login.portalUserId,
        status: "disabled",
        now,
      });
      await deleteSessionsForUserTx(tx, grant.login.portalUserId);
    } else {
      if (grant.grant.revokedAt !== null) {
        throw new AppError("CONFLICT", {
          messageKey: "errors.portalGrantRevoked",
        });
      }
      await setPortalLoginStatusTx(tx, {
        portalUserId: grant.login.portalUserId,
        status: "active",
        now,
      });
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_credential",
      entityId: grant.login.portalUserId,
      action: enabled ? "portal.credential.enabled" : "portal.credential.disabled",
      diff: { studentId, enabled },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { id: grant.grant.id, status: enabled ? "active" : "disabled" };
  });
}

/** Verify credentials and resolve the matching account for `/portal` sign-in. */
export async function resolveStudentPortalSignIn(
  input: { phone: string; password: string },
  request?: RequestContext,
  now: Date = new Date(),
) {
  const ctx = resolveContext(request);
  const lockoutContext = {
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
    userAgentHash: null as string | null,
  };
  const normalizedPhone = normalizePortalPhone(input.phone);
  if (!normalizedPhone) {
    await recordPortalSignInFailure(input.phone, lockoutContext, now);
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "auth.errors.invalidCredentials",
    });
  }

  if (await isPortalPhoneLocked(normalizedPhone, now)) {
    throw new AppError("RATE_LIMITED", {
      messageKey: "auth.errors.rateLimited",
    });
  }

  const candidates = await findPortalLoginCandidates(normalizedPhone, 20);
  for (const candidate of candidates) {
    for (const account of candidate.portalUser.accounts ?? []) {
      if (!account?.password) continue;
      const ok = await verifyPassword({ hash: account.password, password: input.password });
      if (!ok) continue;

      if (candidate.status !== "active") {
        await recordPortalSignInFailure(normalizedPhone, lockoutContext, now);
        throw new AppError("FORBIDDEN", {
          messageKey: "errors.portalAccessDisabled",
        });
      }

      const grants = await findActivePortalGrants(candidate.portalUserId, now);
      const hasStudentGrant = grants.some((grant) => grant.kind === "student");
      if (!hasStudentGrant) {
        await recordPortalSignInFailure(normalizedPhone, lockoutContext, now);
        throw new AppError("FORBIDDEN", {
          messageKey: "errors.notLinked",
        });
      }

      return {
        userId: candidate.portalUserId,
        email: candidate.portalUser.email,
        phone: normalizedPhone,
      };
    }
  }

  await recordPortalSignInFailure(normalizedPhone, lockoutContext, now);
  throw new AppError("VALIDATION_FAILED", {
    messageKey: "auth.errors.invalidCredentials",
  });
}

export async function getStudentPortalAccess(
  scope: Scope,
  studentId: string,
  now: Date = new Date(),
) {
  authorize(scope, "students", "read");
  const student = await findStudentForPortalAccess(scope, studentId);
  if (!student) {
    throw new AppError("NOT_FOUND");
  }

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      parentName: student.parentName,
      parentPhoneE164: student.parentPhoneE164,
    },
    guardians: student.guardians,
    grants: student.portalGrants.map((grant) => {
      const isExpired =
        grant.expiresAt !== null && grant.expiresAt.getTime() <= now.getTime();
      const status =
        grant.revokedAt !== null
          ? ("revoked" as const)
          : isExpired
            ? ("expired" as const)
            : ("active" as const);
      return {
        id: grant.id,
        kind: grant.kind,
        guardianId: grant.guardianId,
        permissions: resolvePortalPermissions(grant.kind, grant.permissions),
        status,
        issuedAt: grant.issuedAt.toISOString(),
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        revokedAt: grant.revokedAt?.toISOString() ?? null,
        portalUser: {
          id: grant.portalUser.id,
          name: grant.portalUser.name,
          email: grant.portalUser.email,
        },
      };
    }),
    invitations: student.portalInvitations.map((inv) => {
      const effectiveStatus =
        inv.status === "pending" && inv.expiresAt.getTime() <= now.getTime()
          ? ("expired" as const)
          : inv.status;
      return {
        id: inv.id,
        kind: inv.kind,
        guardianId: inv.guardianId,
        email: inv.email,
        permissions: resolvePortalPermissions(inv.kind, inv.permissions),
        status: effectiveStatus,
        expiresAt: inv.expiresAt.toISOString(),
        lastSentAt: inv.lastSentAt.toISOString(),
        acceptedAt: inv.acceptedAt?.toISOString() ?? null,
        revokedAt: inv.revokedAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      };
    }),
  };
}

export async function issuePortalInvitation(
  scope: Scope,
  rawInput: IssuePortalInvitationInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "students", "write");
  const parsed = issuePortalInvitationSchema.parse(rawInput);
  const ctx = resolveContext(request);
  const email = normalizePortalEmail(parsed.email);
  const permissions = resolvePortalPermissions(parsed.kind, parsed.permissions);
  const { token, tokenHash } = createPortalInvitationToken();
  const expiresAt = portalInvitationExpiresAt(now);

  const invitation = await withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: {
        id: parsed.studentId,
        workspaceId: scope.workspaceId,
        archivedAt: null,
        mergedIntoId: null,
      },
      select: { id: true },
    });
    if (!student) {
      throw new AppError("NOT_FOUND");
    }

    if (parsed.guardianId) {
      const guardian = await tx.guardian.findFirst({
        where: {
          id: parsed.guardianId,
          workspaceId: scope.workspaceId,
          studentId: student.id,
          isAuthorized: true,
        },
        select: { id: true },
      });
      if (!guardian) {
        throw new AppError("NOT_FOUND");
      }
    }

    const row = await createOrRotatePortalInvitationTx(tx, {
      workspaceId: scope.workspaceId,
      studentId: student.id,
      guardianId: parsed.kind === "parent" ? (parsed.guardianId ?? null) : null,
      kind: parsed.kind,
      email,
      permissions,
      tokenHash,
      issuedByUserId: scope.actorUserId,
      expiresAt,
      now,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_invitation",
      entityId: row.id,
      action: "portal.invitation.issued",
      diff: {
        studentId: student.id,
        kind: row.kind,
        permissions,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return row;
  });

  return {
    invitation: {
      id: invitation.id,
      studentId: invitation.studentId,
      guardianId: invitation.guardianId,
      kind: invitation.kind,
      email: invitation.email,
      permissions: resolvePortalPermissions(invitation.kind, invitation.permissions),
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      lastSentAt: invitation.lastSentAt.toISOString(),
    },
    verificationPath: `/${ctx.locale}/portal/link/${token}`,
  };
}

export async function revokePortalInvitation(
  scope: Scope,
  studentId: string,
  invitationId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "students", "write");
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const revoked = await revokePortalInvitationTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
      invitationId,
      now,
    });

    if (!revoked) {
      throw new AppError("NOT_FOUND");
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_invitation",
      entityId: revoked.id,
      action: "portal.invitation.revoked",
      diff: {
        studentId,
        kind: revoked.kind,
        status: revoked.status,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return {
      id: revoked.id,
      status: revoked.status,
      revokedAt: revoked.revokedAt?.toISOString() ?? now.toISOString(),
    };
  });
}

export async function updateStudentPortalGrantPermissions(
  scope: Scope,
  studentId: string,
  grantId: string,
  rawInput: UpdatePortalGrantPermissionsInput,
  request?: RequestContext,
) {
  authorize(scope, "students", "write");
  const parsed = updatePortalGrantPermissionsSchema.parse(rawInput);
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const existing = await tx.portalGrant.findFirst({
      where: {
        id: grantId,
        workspaceId: scope.workspaceId,
        studentId,
        revokedAt: null,
      },
      select: { id: true, kind: true, permissions: true },
    });
    if (!existing) {
      throw new AppError("NOT_FOUND");
    }

    const mergedPermissions = resolvePortalPermissions(existing.kind, {
      ...(existing.permissions && typeof existing.permissions === "object"
        ? (existing.permissions as Record<string, unknown>)
        : {}),
      ...parsed.permissions,
    });

    const updated = await updatePortalGrantPermissionsTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
      grantId,
      permissions: mergedPermissions,
    });

    if (!updated) {
      throw new AppError("NOT_FOUND");
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_grant",
      entityId: updated.id,
      action: "portal.grant.permissions_updated",
      diff: {
        studentId,
        kind: updated.kind,
        permissions: mergedPermissions,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return {
      id: updated.id,
      kind: updated.kind,
      permissions: resolvePortalPermissions(updated.kind, updated.permissions),
    };
  });
}

export async function revokeStudentPortalGrant(
  scope: Scope,
  studentId: string,
  grantId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "students", "write");
  const ctx = resolveContext(request);

  return withScope(scope, async (tx) => {
    const revoked = await revokePortalGrantTx(tx, {
      workspaceId: scope.workspaceId,
      studentId,
      grantId,
      now,
    });

    if (!revoked) {
      throw new AppError("NOT_FOUND");
    }

    // Invalidate active sessions for the portal user so revoked access stops immediately.
    await deleteSessionsForUserTx(tx, revoked.portalUserId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "portal_grant",
      entityId: revoked.id,
      action: "portal.grant.revoked",
      diff: {
        studentId,
        kind: revoked.kind,
        revokedAt: now.toISOString(),
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return {
      id: revoked.id,
      kind: revoked.kind,
      revokedAt: revoked.revokedAt?.toISOString() ?? now.toISOString(),
    };
  });
}

export async function inspectPortalInvitation(
  token: string,
  now: Date = new Date(),
) {
  const trimmed = token.trim();
  if (trimmed.length < 32 || trimmed.length > 256) {
    throw new AppError("NOT_FOUND");
  }

  const tokenHash = hashPortalInvitationToken(trimmed);
  const invitation = await findPortalInvitationByTokenHash(tokenHash);

  if (
    !invitation ||
    !invitation.workspace ||
    invitation.workspace!.status !== "active" ||
    invitation.workspace!.deletedAt !== null ||
    !invitation.student ||
    invitation.student!.archivedAt !== null ||
    invitation.student!.mergedIntoId !== null
  ) {
    throw new AppError("NOT_FOUND");
  }

  const status =
    invitation.status === "pending" && invitation.expiresAt.getTime() <= now.getTime()
      ? ("expired" as const)
      : invitation.status;

  return {
    id: invitation.id,
    kind: invitation.kind,
    email: invitation.email,
    status,
    expiresAt: invitation.expiresAt.toISOString(),
    studentFirstName: invitation.student!.firstName,
    grade: invitation.student!.grade,
    teachingName: invitation.workspace!.teachingName,
    primarySubject: invitation.workspace!.primarySubject,
    permissions: resolvePortalPermissions(invitation.kind, invitation.permissions),
  };
}

export async function acceptPortalInvitation(
  userId: string,
  rawInput: AcceptPortalInvitationInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  const parsed = acceptPortalInvitationSchema.parse(rawInput);
  const ctx = resolveContext(request);

  const [user, staffMemberships] = await Promise.all([
    findUser(userId),
    findActiveMemberships(userId),
  ]);

  if (!user) {
    throw new AppError("UNAUTHORIZED");
  }

  if (!user.emailVerified) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.emailNotVerified" });
  }

  // Staff accounts and portal accounts are strictly separated (ADR-0003).
  if (staffMemberships.length > 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.forbidden" });
  }

  const tokenHash = hashPortalInvitationToken(parsed.token);
  const invitation = await findPortalInvitationByTokenHash(tokenHash);

  if (
    !invitation ||
    !invitation.workspace ||
    invitation.workspace!.status !== "active" ||
    invitation.workspace!.deletedAt !== null ||
    !invitation.student ||
    invitation.student!.archivedAt !== null ||
    invitation.student!.mergedIntoId !== null
  ) {
    throw new AppError("NOT_FOUND");
  }

  if (invitation.status === "revoked" || invitation.revokedAt !== null) {
    throw new AppError("CONFLICT", { messageKey: "errors.invitationRevoked" });
  }

  if (invitation.status === "accepted" || invitation.acceptedAt !== null) {
    throw new AppError("CONFLICT", { messageKey: "errors.invitationUsed" });
  }

  if (invitation.expiresAt.getTime() <= now.getTime()) {
    throw new AppError("CONFLICT", { messageKey: "errors.invitationExpired" });
  }

  if (normalizePortalEmail(user.email) !== normalizePortalEmail(invitation.email)) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.invitationEmailMismatch" });
  }

  const permissions = resolvePortalPermissions(invitation.kind, invitation.permissions);

  const grant = await withScope({ workspaceId: invitation.workspaceId }, async (tx) => {
    const createdGrant = await acceptPortalInvitationTx(tx, {
      invitationId: invitation.id,
      workspaceId: invitation.workspaceId,
      studentId: invitation.studentId,
      guardianId: invitation.guardianId,
      kind: invitation.kind,
      portalUserId: user.id,
      permissions,
      issuedByUserId: invitation.issuedByUserId,
      now,
    });

    await writeAuditEvent(tx, {
      workspaceId: invitation.workspaceId,
      actorUserId: user.id,
      actorDisplayName: user.name,
      actorType: "user",
      entityType: "portal_grant",
      entityId: createdGrant.id,
      action: "portal.invitation.accepted",
      diff: {
        invitationId: invitation.id,
        studentId: invitation.studentId,
        kind: invitation.kind,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return createdGrant;
  });

  return {
    grantId: grant.id,
    kind: grant.kind,
    studentId: grant.studentId,
    redirectPath:
      grant.kind === "parent"
        ? `/${ctx.locale}/portal/parent?studentId=${encodeURIComponent(grant.studentId)}`
        : `/${ctx.locale}/portal/student`,
  };
}

export async function getParentPortalOverview(
  portal: PortalContext,
  selectedStudentId?: string | null,
  now: Date = new Date(),
) {
  const parentGrants = portal.grants.filter((grant) => grant.kind === "parent");
  if (parentGrants.length === 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" });
  }

  const children = await loadParentLinkedChildren(parentGrants);
  if (children.length === 0) {
    throw new AppError("NOT_FOUND");
  }

  const targetStudentId = selectedStudentId ?? children[0].studentId;
  const resolved = await resolvePortalStudent(portal, targetStudentId, "parent");
  const activeChild = await loadParentChildDetail(resolved.grant, now);

  if (!activeChild) {
    throw new AppError("NOT_FOUND");
  }

  return {
    children,
    activeChild,
  };
}

export async function getParentChildPortalView(
  portal: PortalContext,
  studentId: string,
  now: Date = new Date(),
) {
  const resolved = await resolvePortalStudent(portal, studentId, "parent");
  const detail = await loadParentChildDetail(resolved.grant, now);
  if (!detail) {
    throw new AppError("NOT_FOUND");
  }
  return detail;
}

export async function getStudentPortalOverview(
  portal: PortalContext,
  selectedStudentId?: string | null,
  now: Date = new Date(),
) {
  const studentGrants = portal.grants.filter((grant) => grant.kind === "student");
  if (studentGrants.length === 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" });
  }

  const targetStudentId = selectedStudentId ?? studentGrants[0].studentId;
  const resolved = await resolvePortalStudent(portal, targetStudentId, "student");
  const detail = await loadStudentPortalDetail(resolved.grant, now);

  if (!detail) {
    throw new AppError("NOT_FOUND");
  }

  return detail;
}

export async function submitStudentHomework(
  portal: PortalContext,
  homeworkId: string,
  studentId?: string | null,
  now: Date = new Date(),
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

  const submission = await submitStudentHomeworkInScope(
    resolved.grant,
    portal.user?.id ?? portal.userId,
    homeworkId,
    now,
  );

  if (!submission) {
    throw new AppError("NOT_FOUND");
  }

  return submission;
}

export async function listPortalNotifications(portal: PortalContext) {
  const notifications = await listPortalNotificationsForGrants(portal.grants);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return {
    notifications,
    unreadCount,
  };
}

export async function markPortalNotificationRead(
  portal: PortalContext,
  notificationId: string,
  now: Date = new Date(),
) {
  const updated = await markPortalNotificationReadForGrants(
    portal.grants,
    notificationId,
    now,
  );
  if (!updated) {
    throw new AppError("NOT_FOUND");
  }
  return updated;
}

export async function getPortalPushStatus(portal: PortalContext) {
  const config = getWebPushPublicConfig();
  const subscriptions = await listPortalPushSubscriptionsForUser(
    portal.grants,
    portal.user?.id ?? portal.userId,
  );
  return {
    ...config,
    subscriptions,
  };
}

export async function subscribePortalPush(
  portal: PortalContext,
  rawInput: UpsertPushSubscriptionInput,
  request?: RequestContext,
) {
  const parsed = upsertPushSubscriptionSchema.parse(rawInput);
  const ctx = resolveContext(request);
  const subscription = await upsertPortalPushSubscriptionForUser(
    portal.grants,
    portal.user?.id ?? portal.userId,
    parsed,
    ctx.userAgent,
  );
  if (!subscription) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" });
  }
  return {
    subscription,
    configured: getWebPushPublicConfig().configured,
  };
}

export async function updatePortalPushLockScreenPreference(
  portal: PortalContext,
  rawInput: UpdatePushPreferenceInput,
) {
  const parsed = updatePushPreferenceSchema.parse(rawInput);
  const updated = await updatePortalPushPreferenceForUser(
    portal.grants,
    portal.user?.id ?? portal.userId,
    parsed,
  );
  if (!updated) {
    throw new AppError("NOT_FOUND");
  }
  return {
    endpoint: parsed.endpoint,
    includeSensitiveDetails: parsed.includeSensitiveDetails,
  };
}

export async function unsubscribePortalPush(
  portal: PortalContext,
  rawInput: DeletePushSubscriptionInput,
  now: Date = new Date(),
) {
  const parsed = deletePushSubscriptionSchema.parse(rawInput);
  const removed = await deletePortalPushSubscriptionForUser(
    portal.grants,
    portal.user?.id ?? portal.userId,
    parsed.endpoint,
    now,
  );
  return { removed };
}
