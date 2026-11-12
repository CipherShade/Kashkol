import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const {
  withScope,
  txStudentFindFirst,
  txUserCreate,
  txAccountCreate,
  txGrantCreate,
  writeAuditEvent,
  identityRepo,
  lockout,
  portalRepo,
  sessionMock,
} = vi.hoisted(() => {
  const txStudentFindFirst = vi.fn();
  const txUserCreate = vi.fn();
  const txAccountCreate = vi.fn();
  const txGrantCreate = vi.fn();
  return {
    withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        student: { findFirst: txStudentFindFirst },
        user: { create: txUserCreate },
        account: { create: txAccountCreate },
        portalGrant: { create: txGrantCreate },
      }),
    ),
    txStudentFindFirst,
    txUserCreate,
    txAccountCreate,
    txGrantCreate,
    writeAuditEvent: vi.fn(async () => ({})),
    identityRepo: {
      deleteSessionsForUserTx: vi.fn(async () => ({ count: 0 })),
      findActiveMemberships: vi.fn(),
      findActivePortalGrants: vi.fn(),
      findUser: vi.fn(),
    },
    lockout: {
      isPortalPhoneLocked: vi.fn(async () => false),
      recordPortalSignInFailure: vi.fn(async () => undefined),
    },
    portalRepo: {
      acceptPortalInvitationTx: vi.fn(),
      createOrRotatePortalInvitationTx: vi.fn(),
      deletePortalPushSubscriptionForUser: vi.fn(),
      findAutoPortalGrantForStudentTx: vi.fn(),
      findPortalLoginCandidates: vi.fn(async (): Promise<unknown[]> => []),
      findPortalInvitationByTokenHash: vi.fn(),
      findPortalGrantWithLoginTx: vi.fn(),
      findStudentForPortalAccess: vi.fn(),
      insertPortalLoginTx: vi.fn(async () => ({ portalUserId: "user-1" })),
      listPortalNotificationsForGrants: vi.fn(),
      listPortalPushSubscriptionsForUser: vi.fn(async () => []),
      loadParentChildDetail: vi.fn(),
      loadParentLinkedChildren: vi.fn(),
      loadStudentPortalDetail: vi.fn(),
      markPortalNotificationReadForGrants: vi.fn(),
      revokePortalGrantTx: vi.fn(),
      revokePortalInvitationTx: vi.fn(),
      submitStudentHomeworkInScope: vi.fn(),
      updatePortalGrantPermissionsTx: vi.fn(),
      updatePortalPushPreferenceForUser: vi.fn(),
      upsertPortalPushSubscriptionForUser: vi.fn(),
      updatePortalLoginPasswordTx: vi.fn(async () => ({ portalUserId: "user-1" })),
      setPortalLoginStatusTx: vi.fn(async () => ({ portalUserId: "user-1" })),
      updatePortalLoginPhoneTx: vi.fn(async () => ({ portalUserId: "user-1" })),
    },
    sessionMock: {
      resolvePortalStudent: vi.fn(),
      requireStaffSession: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/scope", () => ({ withScope }));
vi.mock("@/modules/audit/service", () => ({ writeAuditEvent }));
vi.mock("@/modules/identity/repository", () => identityRepo);
vi.mock("@/modules/identity/lockout", () => lockout);
vi.mock("@/modules/identity/session", () => sessionMock);
vi.mock("@/modules/portals/repository", () => portalRepo);
vi.mock("@/modules/portals/push", () => ({
  getWebPushPublicConfig: vi.fn(() => ({ configured: false })),
}));

import { generatePortalPassword, normalizePortalPhone } from "@/modules/portals/credentials";
import {
  provisionStudentPortalAccess,
  regenerateStudentPortalCredential,
  setStudentPortalAccessStatus,
  resolveStudentPortalSignIn,
  getPortalCredentialState,
} from "@/modules/portals/service";
import type { Scope } from "@/modules/tenancy/types";

const OWNER: Scope = {
  workspaceId: "00000000-0000-4000-8000-0000000000a1",
  actorUserId: "10000000-0000-4000-8000-0000000000a1",
  actorDisplayName: "Mona",
  role: "owner",
  permissions: new Set(),
};

const ASSISTANT: Scope = {
  workspaceId: "00000000-0000-4000-8000-0000000000a1",
  actorUserId: "10000000-0000-4000-8000-0000000000a2",
  actorDisplayName: "Omar",
  role: "assistant",
  permissions: new Set(),
};

const STUDENT_ID = "30000000-0000-4000-8000-0000000000a3";
const PHONE = "+201012345678";

function existingGrant(opts: { revoked?: boolean; status?: "active" | "disabled" } = {}) {
  return {
    grant: {
      id: "grant-1",
      portalUserId: "portal-user-1",
      revokedAt: opts.revoked ? new Date() : null,
    },
    login: {
      portalUserId: "portal-user-1",
      usernamePhone: PHONE,
      status: opts.status ?? "active",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lockout.isPortalPhoneLocked.mockResolvedValue(false);
  txStudentFindFirst.mockResolvedValue({ id: STUDENT_ID, phoneE164: PHONE });
});

describe("generatePortalPassword", () => {
  it("matches the readable KSH-XXXX-XXXX format and avoids ambiguous glyphs", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generatePortalPassword()).toMatch(
        /^KSH-[2-9A-HJKMNPQRSTUVWXYZ]{4}-[2-9A-HJKMNPQRSTUVWXYZ]{4}$/,
      );
    }
  });

  it("generates distinct passwords", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generatePortalPassword()));
    expect(passwords.size).toBe(200);
  });
});

describe("normalizePortalPhone", () => {
  it("normalizes Egyptian local, national and international forms", () => {
    expect(normalizePortalPhone("+201001234567")).toBe("+201001234567");
    expect(normalizePortalPhone("01001234567")).toBe("+201001234567");
    expect(normalizePortalPhone("0020101234567")).toBe("+20101234567");
  });

  it("normalizes Arabic-Indic digits and separators", () => {
    expect(normalizePortalPhone("٠١٠ ٠١٢٣٤٥٦٧")).toBe("+201001234567");
    expect(normalizePortalPhone("+20 (100) 123-4567")).toBe("+201001234567");
  });

  it("rejects unusable numbers", () => {
    expect(normalizePortalPhone("not a phone")).toBeNull();
    expect(normalizePortalPhone("")).toBeNull();
    expect(normalizePortalPhone(null)).toBeNull();
    expect(normalizePortalPhone(undefined)).toBeNull();
  });
});

describe("provisionStudentPortalAccess", () => {
  it("creates a hashed credential, a login row and a student grant in one transaction", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(null);

    const result = await provisionStudentPortalAccess(OWNER, STUDENT_ID, {
      requestId: "req-1",
      ipHash: "ip-hash",
    });

    expect(result.username).toBe(PHONE);
    expect(result.password).toMatch(
      /^KSH-[2-9A-HJKMNPQRSTUVWXYZ]{4}-[2-9A-HJKMNPQRSTUVWXYZ]{4}$/,
    );

    const createdAccount = txAccountCreate.mock.calls[0]?.[0] as {
      data: { providerId: string; accountId: string; password: string };
    };
    expect(createdAccount.data.providerId).toBe("credential");
    expect(createdAccount.data.password).not.toContain(result.password);
    await expect(
      verifyPassword({ hash: createdAccount.data.password, password: result.password }),
    ).resolves.toBe(true);

    expect(portalRepo.insertPortalLoginTx).toHaveBeenCalledTimes(1);
    expect(txGrantCreate).toHaveBeenCalledTimes(1);
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "portal.credential.provisioned" }),
    );
  });

  it("refuses an assistant without the portal_access grant", async () => {
    await expect(provisionStudentPortalAccess(ASSISTANT, STUDENT_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("rejects when an unrevoked credential already exists", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(existingGrant());

    await expect(provisionStudentPortalAccess(OWNER, STUDENT_ID)).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.credentialAlreadyExists",
    });
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("rejects when the student has no usable phone number", async () => {
    txStudentFindFirst.mockResolvedValue({ id: STUDENT_ID, phoneE164: null });

    await expect(provisionStudentPortalAccess(OWNER, STUDENT_ID)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "students.portalCredentialPhoneRequired",
    });
  });

  it("throws NOT_FOUND for a student outside the workspace", async () => {
    txStudentFindFirst.mockResolvedValue(null);

    await expect(provisionStudentPortalAccess(OWNER, STUDENT_ID)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("regenerateStudentPortalCredential", () => {
  it("rotates the password, keeps the username and invalidates sessions", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(existingGrant());

    const result = await regenerateStudentPortalCredential(OWNER, STUDENT_ID, {
      requestId: "req-2",
    });

    expect(result.username).toBe(PHONE);
    expect(portalRepo.updatePortalLoginPasswordTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ portalUserId: "portal-user-1", status: "active" }),
    );
    expect(identityRepo.deleteSessionsForUserTx).toHaveBeenCalledWith(
      expect.anything(),
      "portal-user-1",
    );
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "portal.credential.regenerated" }),
    );
  });

  it("creates a fresh credential when the previous grant was revoked", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(
      existingGrant({ revoked: true }),
    );

    const result = await regenerateStudentPortalCredential(OWNER, STUDENT_ID);

    expect(result.username).toBe(PHONE);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txGrantCreate).toHaveBeenCalledTimes(1);
    expect(identityRepo.deleteSessionsForUserTx).not.toHaveBeenCalled();
  });

  it("refuses when there is no credential and the phone was removed", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(null);
    txStudentFindFirst.mockResolvedValue({ id: STUDENT_ID, phoneE164: null });

    await expect(
      regenerateStudentPortalCredential(OWNER, STUDENT_ID),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "students.portalCredentialPhoneRequired",
    });
  });

  it("refuses an assistant without the portal_access grant", async () => {
    await expect(
      regenerateStudentPortalCredential(ASSISTANT, STUDENT_ID),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("setStudentPortalAccessStatus", () => {
  it("disabling kills sessions and clears the QR token", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(existingGrant());

    await setStudentPortalAccessStatus(OWNER, STUDENT_ID, false);

    expect(portalRepo.setPortalLoginStatusTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ portalUserId: "portal-user-1", status: "disabled" }),
    );
    expect(identityRepo.deleteSessionsForUserTx).toHaveBeenCalledWith(
      expect.anything(),
      "portal-user-1",
    );
  });

  it("enabling a revoked grant fails closed", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(
      existingGrant({ revoked: true }),
    );

    await expect(
      setStudentPortalAccessStatus(OWNER, STUDENT_ID, true),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.portalGrantRevoked",
    });
    expect(portalRepo.setPortalLoginStatusTx).not.toHaveBeenCalled();
  });

  it("enabling a disabled account flips it back to active", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(
      existingGrant({ status: "disabled" }),
    );

    await setStudentPortalAccessStatus(OWNER, STUDENT_ID, true);

    expect(portalRepo.setPortalLoginStatusTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "active" }),
    );
  });

  it("rejects when no credential exists", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(null);

    await expect(
      setStudentPortalAccessStatus(OWNER, STUDENT_ID, true),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

async function credentialCandidate(
  password: string,
  opts: { status?: "active" | "disabled"; portalUserId?: string; email?: string } = {},
) {
  return {
    portalUserId: opts.portalUserId ?? "portal-user-1",
    usernamePhone: PHONE,
    status: opts.status ?? "active",
    portalUser: {
      email: opts.email ?? "student-x@students.kashkol.invalid",
      accounts: [
        {
          accountId: opts.portalUserId ?? "portal-user-1",
          password: await hashPassword(password),
        },
      ],
    },
  };
}

describe("resolveStudentPortalSignIn", () => {
  it("locks the phone number after repeated failures", async () => {
    lockout.isPortalPhoneLocked.mockResolvedValue(true);

    await expect(
      resolveStudentPortalSignIn({ phone: PHONE, password: "whatever" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rejects an unparseable phone with the generic invalid-credentials error", async () => {
    await expect(
      resolveStudentPortalSignIn({ phone: "not-a-phone", password: "whatever" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "auth.errors.invalidCredentials",
    });
    expect(lockout.recordPortalSignInFailure).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong password and records the failure", async () => {
    portalRepo.findPortalLoginCandidates.mockResolvedValue([
      await credentialCandidate("correct-password"),
    ]);

    await expect(
      resolveStudentPortalSignIn({ phone: PHONE, password: "wrong-password" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "auth.errors.invalidCredentials",
    });
    expect(lockout.recordPortalSignInFailure).toHaveBeenCalledTimes(1);
  });

  it("rejects a disabled account with the portalAccessDisabled key", async () => {
    portalRepo.findPortalLoginCandidates.mockResolvedValue([
      await credentialCandidate("right-password", { status: "disabled" }),
    ]);

    await expect(
      resolveStudentPortalSignIn({ phone: PHONE, password: "right-password" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "errors.portalAccessDisabled",
    });
  });

  it("rejects a correct password with no student grant", async () => {
    portalRepo.findPortalLoginCandidates.mockResolvedValue([
      await credentialCandidate("right-password"),
    ]);
    identityRepo.findActivePortalGrants.mockResolvedValue([
      { kind: "parent", workspaceId: "w", studentId: "s" },
    ]);

    await expect(
      resolveStudentPortalSignIn({ phone: PHONE, password: "right-password" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "errors.notLinked",
    });
  });

  it("resolves the account whose password matches, even when phones are shared", async () => {
    const candidateA = await credentialCandidate("password-of-a", {
      portalUserId: "portal-user-a",
      email: "student-a@students.kashkol.invalid",
    });
    const candidateB = await credentialCandidate("password-of-b", {
      portalUserId: "portal-user-b",
      email: "student-b@students.kashkol.invalid",
    });
    portalRepo.findPortalLoginCandidates.mockResolvedValue([candidateA, candidateB]);
    identityRepo.findActivePortalGrants.mockResolvedValue([
      { kind: "student", workspaceId: "w", studentId: "s" },
    ]);

    const resolved = await resolveStudentPortalSignIn({
      phone: PHONE,
      password: "password-of-b",
    });

    expect(resolved).toEqual({
      userId: "portal-user-b",
      email: "student-b@students.kashkol.invalid",
      phone: PHONE,
    });
  });
});

describe("getPortalCredentialState", () => {
  it("reports that a credential can be provisioned when the student has a phone", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(null);

    const state = await getPortalCredentialState(OWNER, STUDENT_ID);

    expect(state.canProvision).toBe(true);
    expect(state.credential).toBeNull();
  });

  it("reports a disabled credential without revealing anything else", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(
      existingGrant({ status: "disabled" }),
    );

    const state = await getPortalCredentialState(OWNER, STUDENT_ID);

    expect(state.canProvision).toBe(false);
    expect(state.credential).toEqual({ username: PHONE, status: "disabled" });
  });

  it("reports a revoked grant as revoked", async () => {
    portalRepo.findAutoPortalGrantForStudentTx.mockResolvedValue(
      existingGrant({ revoked: true }),
    );

    const state = await getPortalCredentialState(OWNER, STUDENT_ID);

    expect(state.credential?.status).toBe("revoked");
  });

  it("refuses an assistant without portal_access read rights", async () => {
    await expect(getPortalCredentialState(ASSISTANT, STUDENT_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
