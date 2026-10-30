/**
 * Deterministic LOCAL DEVELOPMENT seed.
 *
 * This script refuses to run unless APP_ENV is exactly "local" and the target
 * database is on the loopback interface. Production credentials cannot be used
 * by accident, and nothing here runs automatically during a deploy.
 *
 * The people, phone-number-free emails, workspaces, and grants below are
 * synthetic. The passwords are development-only and are documented in README.
 */
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { assertLocalSeedTarget } from "../src/lib/config/seed-guard";
import { getDb } from "../src/lib/db/client";
import { withScope } from "../src/lib/db/scope";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const DEV_PASSWORD = "KashkolDev!2026";
const FIXED_DATE = new Date("2026-09-01T09:00:00.000Z");

const NILE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const DELTA_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

const OWNER_NILE_ID = "10000000-0000-4000-8000-000000000001";
const ASSISTANT_NILE_ID = "10000000-0000-4000-8000-000000000002";
const OWNER_DELTA_ID = "10000000-0000-4000-8000-000000000003";

const NILE_OWNER_MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const NILE_ASSISTANT_MEMBER_ID = "20000000-0000-4000-8000-000000000002";
const DELTA_OWNER_MEMBER_ID = "20000000-0000-4000-8000-000000000003";

const NILE_SUBJECT_ID = "30000000-0000-4000-8000-000000000001";
const NILE_GROUP_ID = "40000000-0000-4000-8000-000000000001";
const NILE_STUDENT_ID = "50000000-0000-4000-8000-000000000001";

type SeedUser = {
  id: string;
  name: string;
  email: string;
};

const USERS: SeedUser[] = [
  {
    id: OWNER_NILE_ID,
    name: "منى عبد الرحمن",
    email: "demo.owner@kashkol.local",
  },
  {
    id: ASSISTANT_NILE_ID,
    name: "عمر السيد",
    email: "demo.assistant@kashkol.local",
  },
  {
    id: OWNER_DELTA_ID,
    name: "هدى مصطفى",
    email: "demo.owner2@kashkol.local",
  },
];

async function seedUsers(passwordHash: string): Promise<void> {
  const db = getDb();

  for (const user of USERS) {
    await db.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: true,
      },
      update: {
        name: user.name,
        emailVerified: true,
      },
    });

    await db.account.upsert({
      where: { id: `account-${user.id}` },
      create: {
        id: `account-${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
      update: {
        password: passwordHash,
      },
    });

    await db.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, locale: "ar", theme: "system" },
      update: {},
    });
  }
}

async function seedNileWorkspace(): Promise<void> {
  await withScope({ workspaceId: NILE_WORKSPACE_ID }, async (tx) => {
    await tx.workspace.upsert({
      where: { id: NILE_WORKSPACE_ID },
      create: {
        id: NILE_WORKSPACE_ID,
        name: "أكاديمية النيل",
        slug: "nile-academy",
        teachingName: "أ. منى عبد الرحمن",
        primarySubject: "الرياضيات",
        gradesTaught: ["الصف الأول الثانوي", "الصف الثاني الثانوي"],
        status: "active",
      },
      update: {
        name: "أكاديمية النيل",
        teachingName: "أ. منى عبد الرحمن",
      },
    });

    await tx.workspaceSettings.upsert({
      where: { workspaceId: NILE_WORKSPACE_ID },
      create: {
        workspaceId: NILE_WORKSPACE_ID,
        atRiskAfter: 2,
        inactiveAfter: 4,
        locale: "ar",
        theme: "system",
        timezone: "Africa/Cairo",
        currency: "EGP",
      },
      update: {},
    });

    await tx.onboardingTask.createMany({
      data: [
        {
          workspaceId: NILE_WORKSPACE_ID,
          key: "teaching_name",
          completedAt: FIXED_DATE,
        },
        {
          workspaceId: NILE_WORKSPACE_ID,
          key: "grades",
          completedAt: FIXED_DATE,
        },
        { workspaceId: NILE_WORKSPACE_ID, key: "first_group" },
        { workspaceId: NILE_WORKSPACE_ID, key: "first_students" },
      ],
      skipDuplicates: true,
    });

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: NILE_WORKSPACE_ID,
          userId: OWNER_NILE_ID,
        },
      },
      create: {
        id: NILE_OWNER_MEMBER_ID,
        workspaceId: NILE_WORKSPACE_ID,
        userId: OWNER_NILE_ID,
        role: "owner",
        status: "active",
        joinedAt: FIXED_DATE,
      },
      update: { role: "owner", status: "active", removedAt: null },
    });

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: NILE_WORKSPACE_ID,
          userId: ASSISTANT_NILE_ID,
        },
      },
      create: {
        id: NILE_ASSISTANT_MEMBER_ID,
        workspaceId: NILE_WORKSPACE_ID,
        userId: ASSISTANT_NILE_ID,
        role: "assistant",
        status: "active",
        joinedAt: FIXED_DATE,
      },
      update: { role: "assistant", status: "active", removedAt: null },
    });

    for (const [resource, action] of [
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
    ] as const) {
      await tx.permissionGrant.upsert({
        where: {
          memberId_resource_action: {
            memberId: NILE_ASSISTANT_MEMBER_ID,
            resource,
            action,
          },
        },
        create: {
          workspaceId: NILE_WORKSPACE_ID,
          memberId: NILE_ASSISTANT_MEMBER_ID,
          resource,
          action,
        },
        update: {},
      });
    }

    // Minimal synthetic records make local development usable without implying
    // that production workspaces contain demo data.
    await tx.subject.upsert({
      where: { id: NILE_SUBJECT_ID },
      create: { id: NILE_SUBJECT_ID, workspaceId: NILE_WORKSPACE_ID, name: "الرياضيات" },
      update: { name: "الرياضيات", archivedAt: null },
    });
    await tx.group.upsert({
      where: { id: NILE_GROUP_ID },
      create: {
        id: NILE_GROUP_ID,
        workspaceId: NILE_WORKSPACE_ID,
        subjectId: NILE_SUBJECT_ID,
        name: "رياضيات - السبت 4 مساءً",
        grade: "الصف الأول الثانوي",
        weekday: 0,
        startTime: new Date("1970-01-01T16:00:00.000Z"),
        endTime: new Date("1970-01-01T17:30:00.000Z"),
        capacity: 20,
        color: "indigo",
      },
      update: { archivedAt: null, capacity: 20 },
    });
    await tx.student.upsert({
      where: { id: NILE_STUDENT_ID },
      create: {
        id: NILE_STUDENT_ID,
        workspaceId: NILE_WORKSPACE_ID,
        firstName: "أحمد",
        lastName: "محمود",
        grade: "الصف الأول الثانوي",
        parentName: "محمود أحمد",
        parentPhoneE164: "+201012345678",
      },
      update: { archivedAt: null },
    });
    await tx.enrollment.upsert({
      where: { id: "60000000-0000-4000-8000-000000000001" },
      create: {
        id: "60000000-0000-4000-8000-000000000001",
        workspaceId: NILE_WORKSPACE_ID,
        groupId: NILE_GROUP_ID,
        studentId: NILE_STUDENT_ID,
        enrolledAt: FIXED_DATE,
      },
      update: { leftAt: null },
    });
  });
}

async function seedDeltaWorkspace(): Promise<void> {
  await withScope({ workspaceId: DELTA_WORKSPACE_ID }, async (tx) => {
    await tx.workspace.upsert({
      where: { id: DELTA_WORKSPACE_ID },
      create: {
        id: DELTA_WORKSPACE_ID,
        name: "مركز دلتا للتعليم",
        slug: "delta-study-centre",
        teachingName: "أ. هدى مصطفى",
        primarySubject: "اللغة الإنجليزية",
        gradesTaught: ["الصف الثالث الإعدادي"],
        status: "active",
      },
      update: {
        name: "مركز دلتا للتعليم",
        teachingName: "أ. هدى مصطفى",
      },
    });

    await tx.workspaceSettings.upsert({
      where: { workspaceId: DELTA_WORKSPACE_ID },
      create: {
        workspaceId: DELTA_WORKSPACE_ID,
        atRiskAfter: 2,
        inactiveAfter: 4,
        locale: "ar",
        theme: "system",
        timezone: "Africa/Cairo",
        currency: "EGP",
      },
      update: {},
    });

    await tx.onboardingTask.createMany({
      data: [
        { workspaceId: DELTA_WORKSPACE_ID, key: "teaching_name", completedAt: FIXED_DATE },
        { workspaceId: DELTA_WORKSPACE_ID, key: "grades", completedAt: FIXED_DATE },
        { workspaceId: DELTA_WORKSPACE_ID, key: "first_group" },
        { workspaceId: DELTA_WORKSPACE_ID, key: "first_students" },
      ],
      skipDuplicates: true,
    });

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: DELTA_WORKSPACE_ID,
          userId: OWNER_DELTA_ID,
        },
      },
      create: {
        id: DELTA_OWNER_MEMBER_ID,
        workspaceId: DELTA_WORKSPACE_ID,
        userId: OWNER_DELTA_ID,
        role: "owner",
        status: "active",
        joinedAt: FIXED_DATE,
      },
      update: { role: "owner", status: "active", removedAt: null },
    });
  });
}

async function main(): Promise<void> {
  assertLocalSeedTarget(process.env);

  const passwordHash = await hashPassword(DEV_PASSWORD);
  await seedUsers(passwordHash);
  await seedNileWorkspace();
  await seedDeltaWorkspace();

  console.log("Development seed complete: 2 workspaces, 3 synthetic users.");
  console.log("");
  console.log("Local-only sign-in credentials (password for every account):");
  console.log(`  ${DEV_PASSWORD}`);
  console.log("  demo.owner@kashkol.local      — owner, Nile Academy");
  console.log("  demo.assistant@kashkol.local  — assistant, Nile Academy");
  console.log("  demo.owner2@kashkol.local     — owner, Delta Study Centre");
  console.log("");
  console.log("Sign-in endpoint: POST /api/auth/sign-in/email");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    const { disconnectDb } = await import("../src/lib/db/client");
    await disconnectDb();
  });
