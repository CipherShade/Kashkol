import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import {
  createStudent,
  updateStudent,
} from "@/modules/students/service";
import {
  getPortalCredentialState,
  provisionStudentPortalAccess,
  regenerateStudentPortalCredential,
  resolveStudentPortalSignIn,
  setStudentPortalAccessStatus,
} from "@/modules/portals";
import {
  assistantScope,
  DELTA,
  DELTA_OWNER,
  NILE,
  NILE_ASSISTANT_MEMBER,
  NILE_ASSISTANT,
  ownerScope,
} from "./helpers";
import type {
  Permission,
  Scope,
  PermissionResource,
  PermissionAction,
} from "@/modules/tenancy/types";
import { permissionKey } from "@/modules/tenancy/types";

const DELTA_OWNER_SCOPE: Scope = {
  workspaceId: DELTA,
  actorUserId: DELTA_OWNER,
  actorDisplayName: "Delta Owner",
  role: "owner",
  permissions: new Set(),
};

const createdStudents: Array<{ workspaceId: string; studentId: string }> = [];
const tempAssistantGrants: Array<{
  memberId: string;
  resource: PermissionResource;
  action: PermissionAction;
}> = [];
afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  // Remove the grants this test created for the seeded assistant member.
  for (const grant of tempAssistantGrants.splice(0)) {
    await withScope({ workspaceId: NILE }, (tx) =>
      tx.permissionGrant.deleteMany({
        where: {
          workspaceId: NILE,
          memberId: grant.memberId,
          resource: grant.resource,
          action: grant.action,
        },
      }),
    );
  }

  // Tenant tables (student, portal_grant) enforce RLS: collect the owning
  // credential accounts per workspace inside a scoped transaction, then
  // delete the global auth rows (session/account/user/portal_login).
  const created = createdStudents.splice(0);
  const byWorkspace = new Map<string, string[]>();
  for (const { workspaceId, studentId } of created) {
    const list = byWorkspace.get(workspaceId) ?? [];
    list.push(studentId);
    byWorkspace.set(workspaceId, list);
  }

  const userIds: string[] = [];
  for (const [workspaceId, ids] of byWorkspace) {
    const grants = await withScope({ workspaceId }, async (tx) => {
      const found = await tx.portalGrant.findMany({
        where: { workspaceId, studentId: { in: ids } },
        select: { portalUserId: true },
      });
      await tx.portalGrant.deleteMany({ where: { workspaceId, studentId: { in: ids } } });
      await tx.enrollment.deleteMany({ where: { workspaceId, studentId: { in: ids } } });
      await tx.student.deleteMany({ where: { workspaceId, id: { in: ids } } });
      return found;
    });
    userIds.push(...grants.map((grant) => grant.portalUserId));
  }

  if (userIds.length === 0) return;
  await getDb().session.deleteMany({ where: { userId: { in: userIds } } });
  await getDb().account.deleteMany({ where: { userId: { in: userIds } } });
  await getDb().portalLogin.deleteMany({ where: { portalUserId: { in: userIds } } });
  await getDb().user.deleteMany({ where: { id: { in: userIds } } });
});

let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `+2010${String(10000000 + phoneCounter).slice(-8)}`;
}

async function createStudentAs(scope: Scope, phone: string | null) {
  const result = await createStudent(
    scope,
    {
      firstName: "Portal",
      lastName: randomUUID().slice(0, 8),
      grade: null,
      phone,
      parentName: null,
      parentPhone: null,
      groupIds: [],
      note: null,
      confirmDuplicate: true,
    },
    { requestId: randomUUID() },
  );
  if (result.duplicateWarning) throw new Error("unexpected duplicate student");
  createdStudents.push({ workspaceId: scope.workspaceId, studentId: result.student.id });
  return result;
}

describe("student portal credentials against PostgreSQL", () => {
  it("owner-created student receives a one-time credential that resolves sign-in", async () => {
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);

    expect(created.portalCredential).not.toBeNull();
    expect(created.portalCredential?.username).toBe(phone);
    expect(created.portalCredential?.password).toMatch(/^KSH-/);

    const resolved = await resolveStudentPortalSignIn({
      phone,
      password: created.portalCredential!.password,
    });
    expect(resolved.phone).toBe(phone);
    expect(resolved.email).toContain("@students.kashkol.invalid");

    await expect(
      resolveStudentPortalSignIn({ phone, password: "KSH-DEAD-BEEF" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("the permanent password works across repeated sign-ins (not single-use)", async () => {
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);
    const password = created.portalCredential!.password;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const resolved = await resolveStudentPortalSignIn({ phone, password });
      expect(resolved.phone).toBe(phone);
      expect(resolved.userId).toEqual(expect.any(String));
    }
  });

  it("does not leak the password into any stored record", async () => {
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);
    const password = created.portalCredential!.password;

    const grants = await withScope({ workspaceId: NILE }, (tx) =>
      tx.portalGrant.findMany({
        where: { workspaceId: NILE, studentId: created.student.id },
        select: { portalUserId: true },
      }),
    );
    const userIds = grants.map((grant) => grant.portalUserId);
    const accounts = await getDb().account.findMany({ where: { userId: { in: userIds } } });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].password).not.toContain(password);
    expect(JSON.stringify(accounts)).not.toContain(password);

    const login = await getDb().portalLogin.findFirst({
      where: { portalUserId: { in: userIds } },
    });
    expect(JSON.stringify(login)).not.toContain(password);
  });

  it("assistant without portal_access gets no credential; explicit provision is denied", async () => {
    const scope = await assistantScope();
    const phone = freshPhone();
    const created = await createStudentAs(scope, phone);

    expect(created.portalCredential).toBeNull();
    expect(
      await withScope(scope, (tx) => tx.portalGrant.count({
        where: { workspaceId: NILE, studentId: created.student.id },
      })),
    ).toBe(0);

    await expect(
      provisionStudentPortalAccess(scope, created.student.id, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const ownerState = await getPortalCredentialState(ownerScope(), created.student.id);
    expect(ownerState).toMatchObject({ canProvision: true, credential: null });
  });

  it("assistant explicitly granted portal_access provisions and resets a credential", async () => {
    // Grant the seeded assistant membership portal_access:write for this test only.
    await withScope({ workspaceId: NILE }, async (tx) => {
      await tx.permissionGrant.create({
        data: {
          workspaceId: NILE,
          memberId: NILE_ASSISTANT_MEMBER,
          resource: "portal_access",
          action: "write",
        },
      });
    });
    tempAssistantGrants.push({
      memberId: NILE_ASSISTANT_MEMBER,
      resource: "portal_access",
      action: "write",
    });

    const scope: Scope = {
      workspaceId: NILE,
      actorUserId: NILE_ASSISTANT,
      actorDisplayName: "Omar",
      role: "assistant",
      permissions: new Set<Permission>([
        permissionKey("students", "write"),
        permissionKey("portal_access", "write"),
      ]),
    };

    const phone = freshPhone();
    const created = await createStudentAs(scope, phone);
    expect(created.portalCredential).not.toBeNull();

    // The credential auto-provisioned at creation, so an explicit provision
    // fails closed instead of minting a second account for the same student.
    await expect(
      provisionStudentPortalAccess(scope, created.student.id, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const regenerated = await regenerateStudentPortalCredential(scope, created.student.id, {
      requestId: randomUUID(),
    });
    expect(regenerated.username).toBe(phone);
  });

  it("regeneration invalidates the old password immediately and kills sessions", async () => {
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);
    const password = created.portalCredential!.password;

    // Simulate an active session for the credential account.
    const grant = await withScope({ workspaceId: NILE }, (tx) =>
      tx.portalGrant.findFirstOrThrow({
        where: { workspaceId: NILE, studentId: created.student.id },
        select: { portalUserId: true },
      }),
    );
    await getDb().session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
        userId: grant.portalUserId,
      },
    });

    const regenerated = await regenerateStudentPortalCredential(
      ownerScope(),
      created.student.id,
      { requestId: randomUUID() },
    );

    await expect(
      resolveStudentPortalSignIn({ phone, password }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const resolved = await resolveStudentPortalSignIn({
      phone,
      password: regenerated.password,
    });
    expect(resolved.userId).toBe(grant.portalUserId);

    expect(
      await getDb().session.count({ where: { userId: grant.portalUserId } }),
    ).toBe(0);
  });

  it("disabling blocks sign-in; re-enabling restores it", async () => {
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);
    const password = created.portalCredential!.password;

    await setStudentPortalAccessStatus(ownerScope(), created.student.id, false, {
      requestId: randomUUID(),
    });

    await expect(
      resolveStudentPortalSignIn({ phone, password }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", messageKey: "errors.portalAccessDisabled" });

    await setStudentPortalAccessStatus(ownerScope(), created.student.id, true, {
      requestId: randomUUID(),
    });

    const resolved = await resolveStudentPortalSignIn({ phone, password });
    expect(resolved.phone).toBe(phone);
  });

  it("students with the same phone in different workspaces each get a login, selected by password", async () => {
    // student(workspace_id, phone_e164) is unique per workspace, so a shared
    // phone is only possible across workspaces. The global login lookup must
    // still disambiguate by password.
    const sharedPhone = freshPhone();
    const first = await createStudentAs(ownerScope(), sharedPhone);
    const second = await createStudentAs(DELTA_OWNER_SCOPE, sharedPhone);

    expect(first.portalCredential!.username).toBe(sharedPhone);
    expect(second.portalCredential!.username).toBe(sharedPhone);
    expect(first.portalCredential!.password).not.toBe(second.portalCredential!.password);

    const nileGrant = await withScope({ workspaceId: NILE }, (tx) =>
      tx.portalGrant.findFirstOrThrow({
        where: { workspaceId: NILE, studentId: first.student.id },
        select: { portalUserId: true },
      }),
    );
    const deltaGrant = await withScope({ workspaceId: DELTA }, (tx) =>
      tx.portalGrant.findFirstOrThrow({
        where: { workspaceId: DELTA, studentId: second.student.id },
        select: { portalUserId: true },
      }),
    );
    expect(nileGrant.portalUserId).not.toBe(deltaGrant.portalUserId);

    const resolvedFirst = await resolveStudentPortalSignIn({
      phone: sharedPhone,
      password: first.portalCredential!.password,
    });
    const resolvedSecond = await resolveStudentPortalSignIn({
      phone: sharedPhone,
      password: second.portalCredential!.password,
    });

    expect(resolvedFirst.userId).toBe(nileGrant.portalUserId);
    expect(resolvedSecond.userId).toBe(deltaGrant.portalUserId);
  });

  it("changing the student's phone re-points the username; the old phone stops working", async () => {
    const phone = freshPhone();
    const newPhone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);
    const password = created.portalCredential!.password;

    await updateStudent(
      ownerScope(),
      {
        id: created.student.id,
        firstName: "Portal",
        lastName: created.student.lastName,
        grade: null,
        phone: newPhone,
        parentName: null,
        parentPhone: null,
        groupIds: [],
        note: null,
        confirmDuplicate: true,
      },
      { requestId: randomUUID() },
    );

    await expect(
      resolveStudentPortalSignIn({ phone, password }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const resolved = await resolveStudentPortalSignIn({ phone: newPhone, password });
    expect(resolved.phone).toBe(newPhone);
  });

  it("an assistant without portal_access cannot move a credential onto another phone", async () => {
    const scope = await assistantScope();
    const phone = freshPhone();
    const created = await createStudentAs(ownerScope(), phone);

    await expect(
      updateStudent(
        scope,
        {
          id: created.student.id,
          firstName: "Portal",
          lastName: created.student.lastName,
          grade: null,
          phone: freshPhone(),
          parentName: null,
          parentPhone: null,
          groupIds: [],
          note: null,
          confirmDuplicate: true,
        },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "errors.portalPhoneUpdateNeedsPortalAccess",
    });
  });
});
