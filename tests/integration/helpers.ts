import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import type { Permission, PermissionAction, PermissionResource, Scope } from "@/modules/tenancy/types";
import { permissionKey } from "@/modules/tenancy/types";

export const NILE = "00000000-0000-4000-8000-000000000001";
export const DELTA = "00000000-0000-4000-8000-000000000002";
// The sanctioned isolation boundary for integration fixtures (docs/STATUS.md
// §5.9). A dedicated, disposable workspace that the seeded tenants' data never
// enters; each test file re-asserts it exists and archives every active
// fixture so plan-cap counts start from zero without deleting any record.
export const FIXTURES = "00000000-0000-4000-8000-000000000099";
export const FIXTURE_OWNER = "10000000-0000-4000-8000-000000000099";
export const FIXTURE_ASSISTANT = "10000000-0000-4000-8000-000000000098";

export const NILE_OWNER = "10000000-0000-4000-8000-000000000001";
export const NILE_ASSISTANT = "10000000-0000-4000-8000-000000000002";
export const DELTA_OWNER = "10000000-0000-4000-8000-000000000003";

export const NILE_OWNER_MEMBER = "20000000-0000-4000-8000-000000000001";
export const NILE_ASSISTANT_MEMBER = "20000000-0000-4000-8000-000000000002";
export const FIXTURE_OWNER_MEMBER = "20000000-0000-4000-8000-000000000099";
export const FIXTURE_ASSISTANT_MEMBER = "20000000-0000-4000-8000-000000000098";

export const TEST_PASSWORD = "KashkolDev!2026";

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

export async function createTestUser(prefix = "user"): Promise<TestUser> {
  const id = randomUUID();
  const email = `${prefix}.${id}@kashkol.test`;
  const password = TEST_PASSWORD;
  const db = getDb();

  await db.user.create({
    data: { id, name: `Test ${prefix}`, email, emailVerified: true },
  });
  await db.account.create({
    data: {
      id: `account-${id}`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(password),
    },
  });

  return { id, email, password };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const db = getDb();
  await db.portalGrant.deleteMany({ where: { portalUserId: user.id } });
  await db.workspaceMember.deleteMany({ where: { userId: user.id } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.account.deleteMany({ where: { userId: user.id } });
  // `auth_event` is append-only for the application role. Test rows are left in
  // place deliberately; they carry a keyed hash, not an email address.
  await db.user.deleteMany({ where: { id: user.id } });
}

export function ownerScope(displayName = "Mona"): Scope {
  return {
    workspaceId: NILE,
    actorUserId: NILE_OWNER,
    actorDisplayName: displayName,
    role: "owner",
    permissions: new Set<Permission>(),
  };
}

export function fixturesScope(displayName = "Integration"): Scope {
  return {
    workspaceId: FIXTURES,
    actorUserId: FIXTURE_OWNER,
    actorDisplayName: displayName,
    role: "owner",
    permissions: new Set<Permission>(),
  };
}

export async function fixtureAssistantScope(): Promise<Scope> {
  const grants = await withScope({ workspaceId: FIXTURES }, (tx) =>
    tx.permissionGrant.findMany({
      where: { workspaceId: FIXTURES, memberId: FIXTURE_ASSISTANT_MEMBER },
      select: { resource: true, action: true },
    }),
  );
  return {
    workspaceId: FIXTURES,
    actorUserId: FIXTURE_ASSISTANT,
    actorDisplayName: "Integration Assistant",
    role: "assistant",
    permissions: new Set<Permission>(
      grants.map((grant) => permissionKey(grant.resource, grant.action)),
    ),
  };
}

/**
 * Idempotently create the disposable fixture workspace (and its owner and
 * assistant members) and archive every active fixture student and group in
 * it. Archiving preserves all append-only history and requires no delete
 * privilege; the plan-cap counts that scope to `archivedAt IS NULL` start
 * from zero for every test file. The seeded tenants are never touched.
 *
 * Called from `tests/integration/setup.ts`, which runs once per test file.
 */
export async function ensureIntegrationFixtures(): Promise<void> {
  const db = getDb();
  await db.user.upsert({
    where: { id: FIXTURE_OWNER },
    create: {
      id: FIXTURE_OWNER,
      name: "Integration Fixtures Owner",
      email: "fixtures.owner@kashkol.test",
      emailVerified: true,
    },
    update: {},
  });
  await db.user.upsert({
    where: { id: FIXTURE_ASSISTANT },
    create: {
      id: FIXTURE_ASSISTANT,
      name: "Integration Fixtures Assistant",
      email: "fixtures.assistant@kashkol.test",
      emailVerified: true,
    },
    update: {},
  });

  await withScope({ workspaceId: FIXTURES }, async (tx) => {
    await tx.workspace.upsert({
      where: { id: FIXTURES },
      create: {
        id: FIXTURES,
        name: "Integration Fixtures",
        slug: "integration-fixtures",
        teachingName: "Integration Fixtures",
        primarySubject: null,
        gradesTaught: [],
        status: "active",
        planTier: "pilot",
        planStatus: "pilot_active",
      },
      update: {},
    });
    await tx.workspaceSettings.upsert({
      where: { workspaceId: FIXTURES },
      create: {
        workspaceId: FIXTURES,
        atRiskAfter: 2,
        inactiveAfter: 4,
        locale: "en",
        theme: "system",
        timezone: "Africa/Cairo",
        currency: "EGP",
      },
      update: {},
    });
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: FIXTURES, userId: FIXTURE_OWNER } },
      create: {
        id: FIXTURE_OWNER_MEMBER,
        workspaceId: FIXTURES,
        userId: FIXTURE_OWNER,
        role: "owner",
        status: "active",
      },
      update: {},
    });
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: FIXTURES, userId: FIXTURE_ASSISTANT } },
      create: {
        id: FIXTURE_ASSISTANT_MEMBER,
        workspaceId: FIXTURES,
        userId: FIXTURE_ASSISTANT,
        role: "assistant",
        status: "active",
      },
      update: {},
    });
    // Mirror the seeded NILE assistant's grant set (students, grades,
    // attendance, homework, files read, messages) — deliberately no
    // portal_access. Grants are mutable configuration, not append-only
    // records, so the fixture assistant's grants are reconciled to exactly
    // this baseline on every run; a crashed file cannot leak into the next.
    await tx.permissionGrant.deleteMany({
      where: { workspaceId: FIXTURES, memberId: FIXTURE_ASSISTANT_MEMBER },
    });
    const standardGrants: Array<[PermissionResource, PermissionAction]> = [
      ["students", "read"],
      ["students", "write"],
      ["grades", "read"],
      ["grades", "write"],
      ["attendance", "read"],
      ["attendance", "write"],
      ["homework", "read"],
      ["homework", "write"],
      ["files", "read"],
      ["messages", "read"],
      ["messages", "write"],
    ];
    await tx.permissionGrant.createMany({
      data: standardGrants.map(([resource, action]) => ({
        workspaceId: FIXTURES,
        memberId: FIXTURE_ASSISTANT_MEMBER,
        resource,
        action,
      })),
    });
    const now = new Date();
    await tx.student.updateMany({
      where: { workspaceId: FIXTURES, archivedAt: null },
      data: { archivedAt: now },
    });
    await tx.group.updateMany({
      where: { workspaceId: FIXTURES, archivedAt: null },
      data: { archivedAt: now },
    });
  });
}

export async function assistantScope(): Promise<Scope> {
  const grants = await withScope({ workspaceId: NILE }, (tx) =>
    tx.permissionGrant.findMany({
      where: { workspaceId: NILE, memberId: NILE_ASSISTANT_MEMBER },
      select: { resource: true, action: true },
    }),
  );
  return {
    workspaceId: NILE,
    actorUserId: NILE_ASSISTANT,
    actorDisplayName: "Omar",
    role: "assistant",
    permissions: new Set<Permission>(
      grants.map((grant) => permissionKey(grant.resource, grant.action)),
    ),
  };
}

export async function createStudent(
  workspaceId: string,
  firstName: string,
  lastName = "Test",
): Promise<string> {
  const id = randomUUID();
  await withScope({ workspaceId }, (tx) =>
    tx.student.create({
      data: { id, workspaceId, firstName, lastName },
    }),
  );
  return id;
}

export async function deleteStudent(workspaceId: string, studentId: string): Promise<void> {
  await withScope({ workspaceId }, async (tx) => {
    // Payments are append-only (prevent_financial_record_rewrite trigger) and
    // the application role has no DELETE privilege on payment; do not attempt
    // to delete them in fixtures.
    // The revision chain is append-only for the application role, so test
    // fixtures that create a revision intentionally leave it behind.
    await tx.attendanceMark.deleteMany({
      where: { workspaceId, studentId, revisions: { none: {} } },
    });
    await tx.assessmentScore.deleteMany({ where: { workspaceId, studentId } });
    await tx.file.deleteMany({ where: { workspaceId, studentId } });
    await tx.enrollment.deleteMany({ where: { workspaceId, studentId } });
    await tx.portalGrant.deleteMany({ where: { workspaceId, studentId } });
    // The student may reference append-only payments; if the FK blocks
    // deletion, the student stays (append-only record semantics) and
    // cleanup continues for all other fixtures.
    try {
      await tx.student.deleteMany({ where: { workspaceId, id: studentId } });
    } catch {
      // ignore FK from append-only payment
    }
  });
}

export function cookieFrom(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function signIn(email: string, password: string): Promise<Response> {
  const { getAuth } = await import("@/lib/auth/auth");
  return getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ email, password }),
    }),
  );
}
