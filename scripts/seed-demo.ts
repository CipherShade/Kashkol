/**
 * Comprehensive LOCAL DEVELOPMENT demo seed.
 *
 * This script refuses to run unless APP_ENV is exactly "local" and the target
 * database is on the loopback interface. It enriches the existing Nile Academy
 * workspace with a full, truthful data set for every feature the product has
 * shipped: students, guardians, groups, sessions, attendance, assessments,
 * homework, payments, files, notes, follow-ups, notifications, messaging
 * outbox rows, online exams, forms, portals, reports, and audit events.
 *
 * Nothing here fabricates a capability. Messages are only `pending` or
 * `cancelled` (never `sent`/`delivered`), report exports are only `queued`,
 * and recorded video lessons are intentionally absent because the local
 * environment has no video provider (`VIDEO_PROVIDER_DRIVER=none`).
 *
 * Every row uses a fixed UUID and an upsert (or `createMany` with
 * `skipDuplicates`), so re-running the script does not duplicate data.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "../src/generated/prisma/client";
import { assertLocalSeedTarget } from "../src/lib/config/seed-guard";
import { disconnectDb, getDb } from "../src/lib/db/client";
import { withScope } from "../src/lib/db/scope";
import { evaluateExamResponses, type GradableQuestion } from "../src/modules/exams/grading";
import { renderTemplate } from "../src/modules/messaging/templates";
import { DEFAULT_PARENT_PERMISSIONS, DEFAULT_STUDENT_PERMISSIONS } from "../src/modules/portals/tokens";
import { normalizeSearchTerm } from "../src/modules/search/schemas";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
// The demo seed intentionally uses the owner role for local-only reset
// (same pattern as `scripts/grant-permissions.ts`): the studio app role cannot
// insert or delete payment/ledger rows (enforced append-only by the migration
// and the grant script). The tenant isolation guard in `seed-guard.ts` ensures
// this script refuses to run against any non-loopback or non-`local` target.
if (process.env.DIRECT_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Fixed identities (created by `scripts/seed.ts`).
// ---------------------------------------------------------------------------

const NILE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
const ASSISTANT_USER_ID = "10000000-0000-4000-8000-000000000002";
const ASSISTANT_MEMBER_ID = "20000000-0000-4000-8000-000000000002";

const BASE_SUBJECT_ID = "30000000-0000-4000-8000-000000000001";
const BASE_GROUP_ID = "40000000-0000-4000-8000-000000000001";
const BASE_STUDENT_ID = "50000000-0000-4000-8000-000000000001";
const BASE_ENROLLMENT_ID = "60000000-0000-4000-8000-000000000001";

const DEV_PASSWORD = "KashkolDev!2026";

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** Deterministic, valid UUIDs so re-runs update instead of duplicating. */
function fid(prefix: number, n: number): string {
  return `${prefix.toString(16).padStart(8, "0")}-0000-4000-8000-${n
    .toString(16)
    .padStart(12, "0")}`;
}

const CAIRO_TZ = "Africa/Cairo";
const cairoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type CairoDay = { year: number; month: number; day: number };

function cairoParts(date: Date) {
  const parts = cairoFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function cairoOffsetMinutes(date: Date): number {
  const p = cairoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Build the UTC instant for a Cairo wall-clock time. */
function cairoAt(day: CairoDay, hour: number, minute = 0): Date {
  const guess = new Date(Date.UTC(day.year, day.month - 1, day.day, hour, minute, 0));
  const firstOffset = cairoOffsetMinutes(guess);
  let result = new Date(guess.getTime() - firstOffset * 60000);
  const verifyOffset = cairoOffsetMinutes(result);
  if (verifyOffset !== firstOffset) {
    result = new Date(guess.getTime() - verifyOffset * 60000);
  }
  return result;
}

function todayInCairo(): CairoDay {
  const p = cairoParts(new Date());
  return { year: p.year, month: p.month, day: p.day };
}

function addDays(day: CairoDay, delta: number): CairoDay {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Workspace weekday convention: 0 = Saturday … 6 = Friday. */
function weekdayOf(day: CairoDay): number {
  return (new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 1) % 7;
}

function dateOnly(day: CairoDay): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

function isoDate(day: CairoDay): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

function monthKey(day: CairoDay, offsetMonths: number): string {
  const d = new Date(Date.UTC(day.year, day.month - 1 + offsetMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(days: number, hour = 10): Date {
  return cairoAt(addDays(todayInCairo(), -days), hour);
}

function daysAhead(days: number, hour = 10): Date {
  return cairoAt(addDays(todayInCairo(), days), hour);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const scope = { workspaceId: NILE_WORKSPACE_ID };
const TX_OPTIONS = { maxWait: 20000, timeout: 120000 };

// ---------------------------------------------------------------------------
// Static demo data.
// ---------------------------------------------------------------------------

const SUBJECTS = [
  { id: BASE_SUBJECT_ID, name: "الرياضيات" },
  { id: fid(0x31, 2), name: "الفيزياء" },
  { id: fid(0x31, 3), name: "الميكانيكا" },
];

type GroupSeed = {
  id: string;
  slotId: string;
  subjectIndex: number;
  name: string;
  grade: string;
  weekday: number;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  room: string;
  color: string;
  capacity: number;
  pricePerStudentMinor: number;
  teacherNote: string;
};

const GROUPS: GroupSeed[] = [
  {
    id: BASE_GROUP_ID,
    slotId: fid(0xa2, 1),
    subjectIndex: 0,
    name: "رياضيات — السبت 4 مساءً",
    grade: "الصف الأول الثانوي",
    weekday: 0,
    startHour: 16,
    startMinute: 0,
    durationMinutes: 90,
    room: "قاعة أ",
    color: "indigo",
    capacity: 20,
    pricePerStudentMinor: 45000,
    teacherNote: "مجموعة الصف الأول الثانوي — منهج الترم الأول.",
  },
  {
    id: fid(0x41, 2),
    slotId: fid(0xa2, 2),
    subjectIndex: 1,
    name: "فيزياء — الأحد 6 مساءً",
    grade: "الصف الثاني الثانوي",
    weekday: 1,
    startHour: 18,
    startMinute: 0,
    durationMinutes: 90,
    room: "قاعة ب",
    color: "teal",
    capacity: 18,
    pricePerStudentMinor: 50000,
    teacherNote: "قوانين نيوتن والحركة الدائرية.",
  },
  {
    id: fid(0x41, 3),
    slotId: fid(0xa2, 3),
    subjectIndex: 2,
    name: "ميكانيكا — الثلاثاء 5 مساءً",
    grade: "الصف الثالث الثانوي",
    weekday: 3,
    startHour: 17,
    startMinute: 0,
    durationMinutes: 120,
    room: "قاعة أ",
    color: "amber",
    capacity: 15,
    pricePerStudentMinor: 60000,
    teacherNote: "مراجعة العزم والاتزان قبل الامتحان.",
  },
  {
    id: fid(0x41, 4),
    slotId: fid(0xa2, 4),
    subjectIndex: 0,
    name: "رياضيات — الأربعاء 3 عصرًا",
    grade: "الصف الأول الثانوي",
    weekday: 4,
    startHour: 15,
    startMinute: 0,
    durationMinutes: 90,
    room: "قاعة ج",
    color: "rose",
    capacity: 20,
    pricePerStudentMinor: 45000,
    teacherNote: "مجموعة تعزيز لمهارات الجبر.",
  },
];

type StudentSeed = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  groupIndex: number;
  parentName: string;
  parentPhone: string;
  guardianRelation: "father" | "mother" | "legal_guardian";
};

const STUDENTS: StudentSeed[] = [
  {
    id: BASE_STUDENT_ID,
    firstName: "أحمد",
    lastName: "محمود",
    grade: "الصف الأول الثانوي",
    groupIndex: 0,
    parentName: "محمود أحمد",
    parentPhone: "+201012345678",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 2),
    firstName: "مريم",
    lastName: "خالد",
    grade: "الصف الأول الثانوي",
    groupIndex: 0,
    parentName: "خالد سعيد",
    parentPhone: "+201023456789",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 3),
    firstName: "يوسف",
    lastName: "إبراهيم",
    grade: "الصف الأول الثانوي",
    groupIndex: 0,
    parentName: "إبراهيم فتحي",
    parentPhone: "+201034567890",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 4),
    firstName: "سلمى",
    lastName: "أشرف",
    grade: "الصف الأول الثانوي",
    groupIndex: 0,
    parentName: "أشرف كمال",
    parentPhone: "+201045678901",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 5),
    firstName: "عمر",
    lastName: "طارق",
    grade: "الصف الثاني الثانوي",
    groupIndex: 1,
    parentName: "طارق منير",
    parentPhone: "+201056789012",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 6),
    firstName: "نورهان",
    lastName: "سمير",
    grade: "الصف الثاني الثانوي",
    groupIndex: 1,
    parentName: "سمير رمضان",
    parentPhone: "+201067890123",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 7),
    firstName: "كريم",
    lastName: "حسام",
    grade: "الصف الثاني الثانوي",
    groupIndex: 1,
    parentName: "حسام الدين",
    parentPhone: "+201078901234",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 8),
    firstName: "فاطمة",
    lastName: "عادل",
    grade: "الصف الثالث الثانوي",
    groupIndex: 2,
    parentName: "عادل عبد الله",
    parentPhone: "+201089012345",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 9),
    firstName: "مصطفى",
    lastName: "شريف",
    grade: "الصف الثالث الثانوي",
    groupIndex: 2,
    parentName: "شريف حمدي",
    parentPhone: "+201090123456",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 10),
    firstName: "دينا",
    lastName: "وليد",
    grade: "الصف الثالث الثانوي",
    groupIndex: 2,
    parentName: "وليد مصطفى",
    parentPhone: "+201001234567",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 11),
    firstName: "مالك",
    lastName: "حسن",
    grade: "الصف الأول الثانوي",
    groupIndex: 3,
    parentName: "حسن علي",
    parentPhone: "+201012345679",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 12),
    firstName: "جنى",
    lastName: "عمرو",
    grade: "الصف الأول الثانوي",
    groupIndex: 3,
    parentName: "عمرو إبراهيم",
    parentPhone: "+201023456780",
    guardianRelation: "father",
  },
  {
    id: fid(0x51, 13),
    firstName: "زياد",
    lastName: "سامي",
    grade: "الصف الأول الثانوي",
    groupIndex: 3,
    parentName: "سامي فؤاد",
    parentPhone: "+201034567891",
    guardianRelation: "father",
  },
];

// ---------------------------------------------------------------------------
// 1. Subjects, groups, onboarding, team grants, students, guardians, enrolments.
// ---------------------------------------------------------------------------

function timeOnly(hour: number, minute: number): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`1970-01-01T${hh}:${mm}:00.000Z`);
}

async function seedSubjectsGroupsAndPeople(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      for (const subject of SUBJECTS) {
        await tx.subject.upsert({
          where: { id: subject.id },
          create: {
            id: subject.id,
            workspaceId: NILE_WORKSPACE_ID,
            name: subject.name,
            searchKey: normalizeSearchTerm(subject.name),
          },
          update: {
            name: subject.name,
            searchKey: normalizeSearchTerm(subject.name),
            archivedAt: null,
          },
        });
      }

      for (const group of GROUPS) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          subjectId: SUBJECTS[group.subjectIndex].id,
          name: group.name,
          grade: group.grade,
          color: group.color,
          teacherNote: group.teacherNote,
          defaultPricePerStudentMinor: group.pricePerStudentMinor,
          searchKey: normalizeSearchTerm(group.name),
        };
        const slotData = {
          weekday: group.weekday,
          startTime: timeOnly(group.startHour, group.startMinute),
          endTime: timeOnly(
            group.startHour + Math.floor((group.startMinute + group.durationMinutes) / 60),
            (group.startMinute + group.durationMinutes) % 60,
          ),
          room: group.room,
          capacity: group.capacity,
        };
        await tx.group.upsert({
          where: { id: group.id },
          create: {
            id: group.id,
            ...data,
            scheduleSlots: { create: { id: group.slotId, ...slotData } },
          },
          update: { ...data, archivedAt: null },
        });
        // Keep the slot true on re-runs even when the group already existed.
        await tx.groupScheduleSlot.upsert({
          where: { id: group.slotId },
          create: { id: group.slotId, workspaceId: NILE_WORKSPACE_ID, groupId: group.id, ...slotData },
          update: slotData,
        });
      }

      const completedAt = daysAgo(60);
      for (const key of ["teaching_name", "grades", "first_group", "first_students"]) {
        await tx.onboardingTask.upsert({
          where: { workspaceId_key: { workspaceId: NILE_WORKSPACE_ID, key } },
          create: { workspaceId: NILE_WORKSPACE_ID, key, completedAt },
          update: { completedAt },
        });
      }

      // The assistant keeps the base grants and gains the rest of the daily
      // workflow, except money, team, audit, and integrations.
      const assistantGrants = [
        ["students", "read"],
        ["students", "write"],
        ["grades", "read"],
        ["grades", "write"],
        ["groups", "read"],
        ["groups", "write"],
        ["sessions", "read"],
        ["sessions", "write"],
        ["attendance", "read"],
        ["attendance", "write"],
        ["homework", "read"],
        ["homework", "write"],
        ["files", "read"],
        ["files", "write"],
        ["forms", "read"],
        ["forms", "write"],
        ["messages", "read"],
        ["messages", "write"],
        ["exports", "read"],
        ["settings", "read"],
      ] as const;
      for (const [resource, action] of assistantGrants) {
        await tx.permissionGrant.upsert({
          where: {
            memberId_resource_action: {
              memberId: ASSISTANT_MEMBER_ID,
              resource,
              action,
            },
          },
          create: {
            workspaceId: NILE_WORKSPACE_ID,
            memberId: ASSISTANT_MEMBER_ID,
            resource,
            action,
          },
          update: {},
        });
      }

      for (const [index, student] of STUDENTS.entries()) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          firstName: student.firstName,
          lastName: student.lastName,
          grade: student.grade,
          parentName: student.parentName,
          parentPhoneE164: student.parentPhone,
          joinedAt: daysAgo(75 - index * 2),
          searchKey: normalizeSearchTerm(`${student.firstName} ${student.lastName}`),
        };
        await tx.student.upsert({
          where: { id: student.id },
          create: { id: student.id, ...data },
          update: { ...data, archivedAt: null, mergedIntoId: null },
        });
      }

      for (const [index, student] of STUDENTS.entries()) {
        const nameParts = student.parentName.split(" ");
        const guardianId = fid(0x52, index + 1);
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          studentId: student.id,
          firstName: nameParts[0] ?? student.parentName,
          lastName: nameParts.slice(1).join(" ") || "—",
          relation: student.guardianRelation,
          phoneE164: student.parentPhone,
          email: `guardian.${index + 1}@kashkol.local`,
          isPrimary: true,
          isAuthorized: true,
          optOut: false,
          consentGiven: true,
          consentAt: daysAgo(70),
        };
        await tx.guardian.upsert({
          where: { id: guardianId },
          create: { id: guardianId, ...data },
          update: data,
        });
      }

      for (const [index, student] of STUDENTS.entries()) {
        const enrollmentId = index === 0 ? BASE_ENROLLMENT_ID : fid(0x61, index + 1);
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          groupId: GROUPS[student.groupIndex].id,
          studentId: student.id,
          enrolledAt: daysAgo(70 - index),
        };
        await tx.enrollment.upsert({
          where: { id: enrollmentId },
          create: { id: enrollmentId, ...data },
          update: { ...data, leftAt: null },
        });
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 2. Sessions, attendance, revisions, and QR tokens.
// ---------------------------------------------------------------------------

type SessionStatusSeed = "completed" | "cancelled" | "scheduled";

type SessionPlan = {
  id: string;
  groupIndex: number;
  startsAt: Date;
  endsAt: Date;
  status: SessionStatusSeed;
  occurrenceNo: number;
};

function matchingDays(weekday: number, direction: -1 | 1, count: number): CairoDay[] {
  const today = todayInCairo();
  const days: CairoDay[] = [];
  for (let offset = direction; Math.abs(offset) <= 60 && days.length < count; offset += direction) {
    const day = addDays(today, offset);
    if (weekdayOf(day) === weekday) days.push(day);
  }
  // Past days are collected newest-first; reverse so the plan reads oldest-first.
  return direction === -1 ? days.reverse() : days;
}

function buildSessionPlan(): SessionPlan[] {
  const plan: SessionPlan[] = [];
  GROUPS.forEach((group, groupIndex) => {
    const past = matchingDays(group.weekday, -1, 4);
    const future = matchingDays(group.weekday, 1, 2);
    const days = [...past, ...future];
    days.forEach((day, index) => {
      const isPast = index < past.length;
      let status: SessionStatusSeed = isPast ? "completed" : "scheduled";
      if (isPast && groupIndex === 1 && index === past.length - 1) status = "cancelled";
      if (!isPast && groupIndex === 2 && index === past.length) status = "cancelled";
      const startsAt = cairoAt(day, group.startHour, group.startMinute);
      const endsAt = new Date(startsAt.getTime() + group.durationMinutes * 60000);
      plan.push({
        id: fid(0x71, groupIndex * 10 + index + 1),
        groupIndex,
        startsAt,
        endsAt,
        status,
        occurrenceNo: index + 1,
      });
    });
  });
  return plan;
}

const MARK_PATTERN = [
  "present",
  "present",
  "present",
  "absent",
  "present",
  "late",
  "present",
  "present",
  "excused",
  "present",
  "present",
  "present",
] as const;

type MarkPlanEntry = {
  id: string;
  sessionId: string;
  studentId: string;
  groupIndex: number;
  occurrenceNo: number;
  studentIndex: number;
  mark: (typeof MARK_PATTERN)[number];
  revision?: { oldMark: "absent" | "late" | "excused"; newMark: "present" };
  startsAt: Date;
  pricePerStudentMinor: number;
};

/**
 * The single deterministic attendance plan shared by the attendance-mark seed
 * and the receipt seed, so the seeded session receipts always agree with
 * what was attended.
 *
 * The most recent completed session of each group records no receipt — a
 * small, truthful uncollected subset for the demo (expected is shown, but
 * collected for that session stays 0 until the teacher records it).
 */
function buildMarkPlan(): MarkPlanEntry[] {
  const plan = buildSessionPlan();
  const marks: MarkPlanEntry[] = [];
  let markCounter = 0;
  for (const session of plan) {
    if (session.status !== "completed") continue;
    const roster = studentsInGroup(session.groupIndex);
    for (const [index, student] of roster.entries()) {
      markCounter += 1;
      const markId = fid(0x72, markCounter);
      const mark = MARK_PATTERN[(index * 3 + session.occurrenceNo * 5) % MARK_PATTERN.length];
      const entry: MarkPlanEntry = {
        id: markId,
        sessionId: session.id,
        studentId: student.id,
        groupIndex: session.groupIndex,
        occurrenceNo: session.occurrenceNo,
        studentIndex: index,
        mark,
        startsAt: session.startsAt,
        pricePerStudentMinor: GROUPS[session.groupIndex].pricePerStudentMinor,
      };
      // One recorded correction, with a matching revision row.
      if (session.groupIndex === 0 && session.occurrenceNo === 4 && index === 2) {
        entry.mark = "present";
        entry.revision = { oldMark: "absent", newMark: "present" };
      }
      marks.push(entry);
    }
  }
  return marks;
}

/** Sessions that deliberately have no receipt yet (the latest per group). */
function unreceiptedSessionIds(): Set<string> {
  const marks = buildMarkPlan();
  const byGroup = new Map<number, MarkPlanEntry[]>();
  for (const mark of marks) {
    const list = byGroup.get(mark.groupIndex) ?? [];
    list.push(mark);
    byGroup.set(mark.groupIndex, list);
  }
  const unreceipted = new Set<string>();
  for (const [, list] of byGroup) {
    const latest = Math.max(...list.map((mark) => mark.occurrenceNo));
    const target = list.find(
      (mark) =>
        mark.occurrenceNo === latest &&
        (mark.mark === "present" || mark.mark === "late"),
    );
    if (target) unreceipted.add(target.sessionId);
  }
  return unreceipted;
}


function isPayableMark(mark: MarkPlanEntry): boolean {
  return mark.mark === "present" || mark.mark === "late";
}

function studentsInGroup(groupIndex: number): StudentSeed[] {
  return STUDENTS.filter((student) => student.groupIndex === groupIndex);
}

async function seedSessionsAndAttendance(): Promise<void> {
  const plan = buildSessionPlan();

  await withScope(
    scope,
    async (tx) => {
      for (const session of plan) {
        const group = GROUPS[session.groupIndex];
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          groupId: group.id,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          status: session.status,
          isOneOff: false,
          room: group.room,
          location: "المقر الرئيسي — المهندسين",
          notes:
            session.status === "cancelled"
              ? "أُلغيت الحصة لظرف طارئ، وتم إبلاغ أولياء الأمور."
              : null,
          teacherId: OWNER_USER_ID,
          assistantId: session.groupIndex === 1 ? ASSISTANT_USER_ID : null,
          seriesId: fid(0x76, session.groupIndex + 1),
          occurrenceNo: session.occurrenceNo,
          pricePerStudentMinor: group.pricePerStudentMinor,
          cancelledAt: session.status === "cancelled" ? new Date(session.startsAt.getTime() - 86400000) : null,
          cancelledBy: session.status === "cancelled" ? OWNER_USER_ID : null,
          startedAt: session.status === "completed" ? session.startsAt : null,
          completedAt: session.status === "completed" ? session.endsAt : null,
        };
        await tx.teachingSession.upsert({
          where: { id: session.id },
          create: { id: session.id, ...data },
          update: data,
        });
      }

      const marks = buildMarkPlan();
      const revisionSeeds = marks
        .filter((mark) => mark.revision)
        .map((mark) => ({
          markId: mark.id,
          sessionId: mark.sessionId,
          studentId: mark.studentId,
          ...(mark.revision as NonNullable<MarkPlanEntry["revision"]>),
        }));

      for (const mark of marks) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          sessionId: mark.sessionId,
          studentId: mark.studentId,
          mark: mark.mark,
          source: (mark.studentIndex === 1 ? "qr" : "manual") as "qr" | "manual",
          deviceId: mark.studentIndex === 1 ? "demo-device-1" : null,
          recordedBy: mark.groupIndex === 1 ? ASSISTANT_USER_ID : OWNER_USER_ID,
          recordedAt: new Date(mark.startsAt.getTime() + 30 * 60000),
          isCrossSeason: false,
          primaryGroupId: null,
        };
        await tx.attendanceMark.upsert({
          where: { sessionId_studentId: { sessionId: mark.sessionId, studentId: mark.studentId } },
          create: { id: mark.id, ...data },
          update: data,
        });
      }

      for (const revision of revisionSeeds) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          sessionId: revision.sessionId,
          studentId: revision.studentId,
          attendanceMarkId: revision.markId,
          oldMark: revision.oldMark,
          newMark: revision.newMark,
          actorId: OWNER_USER_ID,
          reason: "ولي الأمر أرسل ما يثبت وجود الطالب متأخرًا، فتم تصحيح الغياب إلى حضور.",
          batchId: null,
          createdAt: daysAgo(2, 20),
        };
        await tx.attendanceRevision.upsert({
          where: { id: fid(0x73, 1) },
          create: { id: fid(0x73, 1), ...data },
          update: data,
        });
      }

      const cancelledPast = plan.find(
        (session) => session.groupIndex === 1 && session.status === "cancelled",
      );
      if (cancelledPast) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          sessionId: cancelledPast.id,
          actorId: OWNER_USER_ID,
          reason: "ظرف طارئ لدى المعلمة.",
          before: { status: "scheduled", startsAt: cancelledPast.startsAt.toISOString() },
          after: { status: "cancelled", cancelledAt: new Date(cancelledPast.startsAt.getTime() - 86400000).toISOString() },
          createdAt: new Date(cancelledPast.startsAt.getTime() - 86400000),
        };
        await tx.sessionRevision.upsert({
          where: { id: fid(0x75, 1) },
          create: { id: fid(0x75, 1), ...data },
          update: data,
        });
      }

      const nextGroupZero = plan.find(
        (session) => session.groupIndex === 0 && session.status === "scheduled",
      );
      if (nextGroupZero) {
        const tokenHash = createHash("sha256").update("demo-attendance-token-group-0").digest("hex");
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          sessionId: nextGroupZero.id,
          tokenHash,
          expiresAt: new Date(nextGroupZero.startsAt.getTime() + 20 * 60000),
          rotatedAt: null,
        };
        await tx.attendanceToken.upsert({
          where: { id: fid(0x74, 1) },
          create: { id: fid(0x74, 1), ...data },
          update: data,
        });
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 3. Assessments, scores, homework, submissions, and completion marks.
// ---------------------------------------------------------------------------

type AssessmentSeed = {
  id: string;
  groupIndex: number;
  title: string;
  type: "paper_exam" | "quiz" | "test" | "other";
  daysAgo: number;
  maxScore: number;
  locked: boolean;
  note: string | null;
};

const ASSESSMENTS: AssessmentSeed[] = [
  {
    id: fid(0x81, 1),
    groupIndex: 0,
    title: "اختبار الوحدة الأولى — الأعداد المركبة",
    type: "quiz",
    daysAgo: 21,
    maxScore: 20,
    locked: true,
    note: "تصحيح جماعي داخل الحصة.",
  },
  {
    id: fid(0x81, 2),
    groupIndex: 0,
    title: "امتحان الشهر الأول",
    type: "paper_exam",
    daysAgo: 10,
    maxScore: 30,
    locked: true,
    note: "يشمل الوحدة الأولى والثانية.",
  },
  {
    id: fid(0x81, 3),
    groupIndex: 1,
    title: "اختبار قوانين نيوتن",
    type: "test",
    daysAgo: 14,
    maxScore: 25,
    locked: false,
    note: null,
  },
  {
    id: fid(0x81, 4),
    groupIndex: 2,
    title: "اختبار العزم والاتزان",
    type: "quiz",
    daysAgo: 7,
    maxScore: 15,
    locked: false,
    note: "أسئلة تطبيقية على العزم.",
  },
  {
    id: fid(0x81, 5),
    groupIndex: 3,
    title: "اختبار الدوال",
    type: "paper_exam",
    daysAgo: 5,
    maxScore: 40,
    locked: false,
    note: "مراجعة شاملة قبل اختبار نصف الترم.",
  },
];

type HomeworkSeed = {
  id: string;
  groupIndex: number;
  title: string;
  instructions: string;
  dueInDays: number;
  maxScore: number | null;
  status: "active" | "archived";
};

const HOMEWORK: HomeworkSeed[] = [
  {
    id: fid(0x83, 1),
    groupIndex: 0,
    title: "واجب الأعداد المركبة — صفحة 42",
    instructions: "حل التمارين 1 إلى 12 في دفتر الواجب، واكتب خطوات الحل كاملة.",
    dueInDays: 3,
    maxScore: 10,
    status: "active",
  },
  {
    id: fid(0x83, 2),
    groupIndex: 1,
    title: "تطبيق على قانون نيوتن الثاني",
    instructions: "ارسم مخطط الجسم الحر لكل مسألة قبل التعويض في القانون.",
    dueInDays: -2,
    maxScore: 10,
    status: "active",
  },
  {
    id: fid(0x83, 3),
    groupIndex: 2,
    title: "مسائل العزم — ورقة المراجعة",
    instructions: "حل المسائل الخمس الأولى وراجع اتجاه العزم في كل حالة.",
    dueInDays: 5,
    maxScore: null,
    status: "active",
  },
  {
    id: fid(0x83, 4),
    groupIndex: 0,
    title: "واجب تشخيصي — الجبر الأساسي",
    instructions: "واجب قديم أُرشف بعد تصحيحه.",
    dueInDays: -30,
    maxScore: 10,
    status: "archived",
  },
];

async function seedAssessmentsAndHomework(): Promise<void> {
  const plan = buildSessionPlan();
  const lastCompletedSession = (groupIndex: number) =>
    [...plan]
      .reverse()
      .find((session) => session.groupIndex === groupIndex && session.status === "completed");

  await withScope(
    scope,
    async (tx) => {
      for (const [assessmentIndex, assessment] of ASSESSMENTS.entries()) {
        const day = addDays(todayInCairo(), -assessment.daysAgo);
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          groupId: GROUPS[assessment.groupIndex].id,
          title: assessment.title,
          type: assessment.type,
          note: assessment.note ?? null,
          date: dateOnly(day),
          maxScore: assessment.maxScore,
          extraCreditAllowance: null,
          lockedAt: null,
          unlockReason: null,
        };
        await tx.assessment.upsert({
          where: { id: assessment.id },
          create: { id: assessment.id, ...data },
          update: data,
        });

        const roster = studentsInGroup(assessment.groupIndex);
        for (const [studentIndex, student] of roster.entries()) {
          let status: "graded" | "missing" | "excused" | "not_taken" = "graded";
          let score: number | null = round2(
            assessment.maxScore * (0.6 + ((studentIndex * 11 + assessmentIndex * 7) % 36) / 100),
          );
          if (studentIndex === 3) {
            status = "missing";
            score = null;
          } else if (studentIndex === 5) {
            status = "excused";
            score = null;
          }
          const scoreData = {
            workspaceId: NILE_WORKSPACE_ID,
            assessmentId: assessment.id,
            studentId: student.id,
            score,
            status,
            note:
              status === "missing"
                ? "لم يحضر الاختبار."
                : status === "excused"
                  ? "غياب بعذر مقبول."
                  : null,
            updatedBy: OWNER_USER_ID,
          };
          await tx.assessmentScore.upsert({
            where: {
              assessmentId_studentId: {
                assessmentId: assessment.id,
                studentId: student.id,
              },
            },
            create: { id: fid(0x82, assessmentIndex * 20 + studentIndex + 1), ...scoreData },
            update: scoreData,
          });
        }

        if (assessment.locked) {
          await tx.assessment.update({
            where: { id: assessment.id },
            data: { lockedAt: daysAgo(assessment.daysAgo - 1, 18) },
          });
        }
      }

      for (const [homeworkIndex, homework] of HOMEWORK.entries()) {
        const dueDay = addDays(todayInCairo(), homework.dueInDays);
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          groupId: GROUPS[homework.groupIndex].id,
          title: homework.title,
          instructions: homework.instructions,
          dueAt: cairoAt(dueDay, 20, 0),
          maxScore: homework.maxScore,
          status: homework.status,
          createdBy: OWNER_USER_ID,
          archivedAt: homework.status === "archived" ? daysAgo(28, 12) : null,
        };
        await tx.homework.upsert({
          where: { id: homework.id },
          create: { id: homework.id, ...data },
          update: data,
        });

        if (homework.status !== "active") continue;

        const roster = studentsInGroup(homework.groupIndex);
        const session = lastCompletedSession(homework.groupIndex);
        for (const [studentIndex, student] of roster.entries()) {
          let submissionStatus: "submitted" | "late" | "not_submitted" | "excused" =
            "not_submitted";
          let submittedAt: Date | null = null;
          if (homeworkIndex === 0) {
            if (studentIndex === 2) {
              submissionStatus = "not_submitted";
            } else {
              submissionStatus = "submitted";
              submittedAt = new Date(data.dueAt.getTime() - 86400000);
            }
          } else if (homeworkIndex === 1) {
            if (studentIndex === 6) {
              submissionStatus = "late";
              submittedAt = new Date(data.dueAt.getTime() + 12 * 3600000);
            } else {
              submissionStatus = "submitted";
              submittedAt = new Date(data.dueAt.getTime() - 6 * 3600000);
            }
          }

          if (submissionStatus !== "not_submitted") {
            const submissionData = {
              workspaceId: NILE_WORKSPACE_ID,
              homeworkId: homework.id,
              studentId: student.id,
              status: submissionStatus,
              teacherFeedback:
                submissionStatus === "late"
                  ? "تم التسليم متأخرًا، والتصحيح كامل."
                  : studentIndex === 1
                    ? "حل ممتاز ومنظم."
                    : null,
              score:
                homework.maxScore === null
                  ? null
                  : round2(homework.maxScore * (0.7 + ((studentIndex * 9 + homeworkIndex * 5) % 26) / 100)),
              updatedBy: OWNER_USER_ID,
              submittedAt,
            };
            await tx.homeworkSubmission.upsert({
              where: {
                homeworkId_studentId: {
                  homeworkId: homework.id,
                  studentId: student.id,
                },
              },
              create: {
                id: fid(0x84, homeworkIndex * 20 + studentIndex + 1),
                ...submissionData,
              },
              update: submissionData,
            });
          }

          const completionStatus =
            studentIndex === 2 && homeworkIndex === 0 ? "not_completed" : "completed";
          const completionData = {
            workspaceId: NILE_WORKSPACE_ID,
            homeworkId: homework.id,
            studentId: student.id,
            sessionId: session?.id ?? null,
            status: completionStatus as "completed" | "not_completed",
            note: completionStatus === "not_completed" ? "لم يُحضر الواجب للمراجعة." : null,
            recordedBy: OWNER_USER_ID,
          };
          await tx.homeworkCompletionMark.upsert({
            where: {
              homeworkId_studentId: {
                homeworkId: homework.id,
                studentId: student.id,
              },
            },
            create: {
              id: fid(0x85, homeworkIndex * 20 + studentIndex + 1),
              ...completionData,
            },
            update: completionData,
          });
        }
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 4. The session-scoped payments ledger (ADR-0028), adjustments, and revisions.
// ---------------------------------------------------------------------------

function monthDay(offsetMonths: number, day: number): CairoDay {
  const d = new Date(Date.UTC(todayInCairo().year, todayInCairo().month - 1 + offsetMonths, day));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function seedPayments(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      // 1. The financial ledger is append-only by design (migration
      //    20261029150000_manual_payment_ledger creates triggers that forbid
      //    UPDATE and DELETE on payment / payment_adjustment / fee_rule, and
      //    REVOKE from the app role). A local-only demo reset therefore cannot
      //    rewrite individual rows. `TRUNCATE` does not fire row triggers and
      //    this script refuses to run outside the local loopback database
      //    (see assertLocalSeedTarget), so it is the honest way to rebuild the
      //    demo ledger from scratch. The complete row set is re-created below
      //    in the same transaction. Nothing here fabricates the billing model:
      //    one session receipt per completed session that had present/late
      //    attendance (expected = attendees × session price, per ADR-0028),
      //    an explicitly voided mistaken entry, a payment revision, a discount
      //    adjustment, and a refund adjustment — none of them per-student.
      //
      //    NOTE: this wipes ledger rows for every workspace in the local
      //    database. That is safe locally (scripts/seed.ts creates no ledger
      //    rows) and would be unacceptable anywhere else.
      await tx.$executeRawUnsafe(
        'TRUNCATE TABLE "payment", "payment_adjustment", "fee_rule", "payment_revision"',
      );

      // 2. Payment rows: one receipt per completed session with present/late
      //    attendance, except the latest completed session of each group,
      //    which is left unreceipted on purpose (ADR-0028 truthful subset).
      const today = todayInCairo();
      const marks = buildMarkPlan();
      const attendedBySession = new Map<string, number>();
      for (const mark of marks) {
        if (!isPayableMark(mark)) continue;
        attendedBySession.set(
          mark.sessionId,
          (attendedBySession.get(mark.sessionId) ?? 0) + 1,
        );
      }
      const sessionById = new Map(marks.map((mark) => [mark.sessionId, mark]));
      const unreceipted = unreceiptedSessionIds();
      const receiptable = [...attendedBySession.keys()]
        .filter((sessionId) => !unreceipted.has(sessionId))
        .map((sessionId) => sessionById.get(sessionId))
        .filter((mark): mark is MarkPlanEntry => Boolean(mark))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

      const paymentRows: Prisma.PaymentUncheckedCreateInput[] = [];
      for (let index = 0; index < receiptable.length; index += 1) {
        const mark = receiptable[index];
        const sessionId = mark.sessionId;
        const attended = attendedBySession.get(sessionId) ?? 0;
        const parts = cairoParts(mark.startsAt);
        const period = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
        const method = (index % 3 === 0 ? "transfer" : "cash") as "cash" | "transfer";
        paymentRows.push({
          id: fid(0x91, 200 + index),
          workspaceId: NILE_WORKSPACE_ID,
          studentId: null,
          sessionId,
          period,
          amountMinor: mark.pricePerStudentMinor * attended,
          currency: "EGP",
          method,
          methodLabel: method === "transfer" ? "تحويل بنكي" : null,
          paidOn: new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
          purpose: "سداد حصة",
          referenceNumber: method === "transfer" ? `TRX-${period}-${index + 1}` : null,
          idempotencyKey: `demo-session-receipt-${sessionId}`,
          note: `تحصيل حصة (${attended} حاضر/متأخر × ${mark.pricePerStudentMinor / 100} جنيه) في ${mark.startsAt.toISOString().slice(0, 10)}`,
          voidedAt: null,
          voidReason: null,
          createdBy: OWNER_USER_ID,
        });
      }

      await tx.payment.createMany({ data: paymentRows, skipDuplicates: true });

      // A voided mistaken entry on the demo ledger — a real ledger row
      // linked to a session, not an inferred balance.
      const voidedId = fid(0x91, 101);
      const voidedSession = receiptable[0] ?? sessionById.values().next().value;
      if (voidedSession) {
        const voidedAttended = attendedBySession.get(voidedSession.sessionId) ?? 0;
        await tx.payment.create({
          data: {
            id: voidedId,
            workspaceId: NILE_WORKSPACE_ID,
            studentId: null,
            sessionId: voidedSession.sessionId,
            period: monthKey(today, -1),
            amountMinor: GROUPS[1].pricePerStudentMinor * Math.max(voidedAttended, 1),
            currency: "EGP",
            method: "cash" as const,
            methodLabel: null,
            paidOn: dateOnly(monthDay(-1, 4)),
            purpose: "سداد حصة",
            referenceNumber: null,
            idempotencyKey: "demo-payment-voided-1",
            note: "قيد خاطئ أُلغي بعد مراجعة الخزينة.",
            voidedAt: daysAgo(20, 13),
            voidReason: "سُجّل المبلغ مرتين بالخطأ.",
            createdBy: OWNER_USER_ID,
          },
        });
      }

      // 3. A payment revision pointing at the first seeded receipt.
      const firstPaymentId: string = paymentRows[0]?.id ?? "";
      const firstReceiptAmount = paymentRows[0]?.amountMinor ?? 0;
      if (paymentRows.length > 0) {
        await tx.paymentRevision.upsert({
          where: { id: fid(0x94, 1) },
          create: {
            id: fid(0x94, 1),
            workspaceId: NILE_WORKSPACE_ID,
            paymentId: firstPaymentId,
            actorId: OWNER_USER_ID,
            before: { amountMinor: firstReceiptAmount, method: "cash", methodLabel: null },
            after: {
              amountMinor: firstReceiptAmount,
              method: "transfer",
              methodLabel: "تحويل بنكي",
            },
            reason: "تصحيح طريقة الدفع بعد مطابقة كشف الحساب البنكي.",
            createdAt: daysAgo(25, 11),
          },
          update: {
            paymentId: firstPaymentId,
            before: { amountMinor: firstReceiptAmount, method: "cash", methodLabel: null },
            after: {
              amountMinor: firstReceiptAmount,
              method: "transfer",
              methodLabel: "تحويل بنكي",
            },
            reason: "تصحيح طريقة الدفع بعد مطابقة كشف الحساب البنكي.",
          },
        });
      }

      // 4. Adjustments (real rows on the same ledger, not UI voodoo), linked
      //    to receipts rather than to students (ADR-0028).
      const lastPaymentId: string = paymentRows[paymentRows.length - 1]?.id ?? firstPaymentId;
      const adjustments: Prisma.PaymentAdjustmentUncheckedCreateInput[] = [
        {
          id: fid(0x92, 1),
          workspaceId: NILE_WORKSPACE_ID,
          studentId: null,
          paymentId: firstPaymentId || null,
          kind: "discount",
          amountMinor: 5000,
          balanceImpact: -1,
          paidOn: dateOnly(monthDay(-1, 5)),
          reason: "خصم أُقر بالتنسيق مع ولي الأمر بعد الحصة.",
          idempotencyKey: "demo-adjustment-discount-1",
          createdBy: OWNER_USER_ID,
        },
        {
          id: fid(0x92, 2),
          workspaceId: NILE_WORKSPACE_ID,
          studentId: null,
          paymentId: lastPaymentId || null,
          kind: "refund",
          amountMinor: 10000,
          balanceImpact: 1,
          paidOn: dateOnly(monthDay(-1, 18)),
          reason: "استرداد مقابل سجل دفع مبالغ فيه.",
          idempotencyKey: "demo-adjustment-refund-1",
          createdBy: OWNER_USER_ID,
        },
      ];
      await tx.paymentAdjustment.createMany({
        data: adjustments,
        skipDuplicates: true,
      });
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 5. Files with real bytes on the local storage adapter, notes, follow-ups.
// ---------------------------------------------------------------------------

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function minimalPdf(title: string): Buffer {
  const ascii = title.replace(/[^\x20-\x7e]/g, "?");
  const stream = `BT /F1 16 Tf 72 760 Td (${ascii}) Tj ET`;
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      `4 0 obj<</Length ${stream.length}>>stream`,
      stream,
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "trailer<</Root 1 0 R>>",
      "%%EOF",
    ].join("\n"),
    "latin1",
  );
}

type FileSeed = {
  id: string;
  title: string;
  description: string;
  subjectIndex: number;
  scope: "teacher_only" | "groups" | "students";
  groupIndexes: number[];
  studentIndexes: number[];
  extension: "pdf" | "png";
  mime: string;
  body: Buffer;
  daysAgo: number;
};

const FILE_SEEDS: FileSeed[] = [
  {
    id: fid(0xa1, 1),
    title: "مذكرة الأعداد المركبة — الوحدة الأولى",
    description: "شرح مبسط مع أمثلة محلولة وتمارين متدرجة.",
    subjectIndex: 0,
    scope: "groups",
    groupIndexes: [0, 3],
    studentIndexes: [],
    extension: "pdf",
    mime: "application/pdf",
    body: minimalPdf("Kashkol demo worksheet - Complex numbers"),
    daysAgo: 18,
  },
  {
    id: fid(0xa1, 2),
    title: "جدول الحصص الأسبوعي",
    description: "الجدول المعتمد لهذا الترم مع أرقام القاعات.",
    subjectIndex: 0,
    scope: "groups",
    groupIndexes: [0, 1, 2, 3],
    studentIndexes: [],
    extension: "png",
    mime: "image/png",
    body: PNG_BYTES,
    daysAgo: 30,
  },
  {
    id: fid(0xa1, 3),
    title: "نماذج امتحانات سابقة — رياضيات",
    description: "نماذج للتدريب قبل امتحان نصف الترم.",
    subjectIndex: 0,
    scope: "students",
    groupIndexes: [],
    studentIndexes: [0, 1, 2],
    extension: "pdf",
    mime: "application/pdf",
    body: minimalPdf("Kashkol demo past papers - Mathematics"),
    daysAgo: 9,
  },
];

async function seedFiles(): Promise<void> {
  const root = path.resolve(process.env.FILE_LOCAL_STORAGE_PATH ?? ".data/files");
  for (const file of FILE_SEEDS) {
    const key = `ws/${NILE_WORKSPACE_ID}/${file.id}.${file.extension}`;
    const destination = path.join(root, ...key.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.body);
  }

  await withScope(
    scope,
    async (tx) => {
      for (const [index, file] of FILE_SEEDS.entries()) {
        const key = `ws/${NILE_WORKSPACE_ID}/${file.id}.${file.extension}`;
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          scope: file.scope,
          groupId: file.scope === "groups" && file.groupIndexes.length > 0 ? GROUPS[file.groupIndexes[0]].id : null,
          studentId: file.scope === "students" && file.studentIndexes.length > 0 ? STUDENTS[file.studentIndexes[0]].id : null,
          title: file.title,
          description: file.description,
          subjectId: SUBJECTS[file.subjectIndex].id,
          topic: index === 0 ? "الأعداد المركبة" : index === 1 ? "تنظيم الحصص" : "مراجعة",
          storageKey: key,
          sizeBytes: file.body.length,
          mime: file.mime,
          scanStatus: "clean" as const,
          uploadedBy: OWNER_USER_ID,
          archivedAt: null,
          deletedAt: null,
          createdAt: daysAgo(file.daysAgo, 9),
        };
        await tx.file.upsert({
          where: { id: file.id },
          create: { id: file.id, ...data },
          update: data,
        });
      }

      await tx.fileGroupAccess.createMany({
        data: FILE_SEEDS.flatMap((file) =>
          file.groupIndexes.map((groupIndex) => ({
            workspaceId: NILE_WORKSPACE_ID,
            fileId: file.id,
            groupId: GROUPS[groupIndex].id,
          })),
        ),
        skipDuplicates: true,
      });

      await tx.fileStudentAccess.createMany({
        data: FILE_SEEDS.flatMap((file) =>
          file.studentIndexes.map((studentIndex) => ({
            workspaceId: NILE_WORKSPACE_ID,
            fileId: file.id,
            studentId: STUDENTS[studentIndex].id,
          })),
        ),
        skipDuplicates: true,
      });

      await tx.homeworkResource.createMany({
        data: [
          {
            workspaceId: NILE_WORKSPACE_ID,
            homeworkId: HOMEWORK[0].id,
            fileId: FILE_SEEDS[0].id,
          },
        ],
        skipDuplicates: true,
      });
    },
    TX_OPTIONS,
  );
}

async function seedNotesAndFollowUps(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      const notes = [
        {
          id: fid(0xb1, 1),
          studentId: STUDENTS[0].id,
          body: "أحمد متحمس للمادة ويشارك بانتظام. يحتاج إلى تدريب إضافي على مسائل الأعداد المركبة.",
          authorId: OWNER_USER_ID,
          createdAt: daysAgo(12, 19),
        },
        {
          id: fid(0xb1, 2),
          studentId: STUDENTS[2].id,
          body: "تغيّب مرتين متتاليتين. تواصلت مع ولي الأمر ووعد بمتابعة الحضور.",
          authorId: ASSISTANT_USER_ID,
          createdAt: daysAgo(8, 17),
        },
        {
          id: fid(0xb1, 3),
          studentId: STUDENTS[5].id,
          body: "تحسن ملحوظ في حل مسائل نيوتن بعد الحصة الإضافية.",
          authorId: OWNER_USER_ID,
          createdAt: daysAgo(3, 20),
        },
        {
          id: fid(0xb1, 4),
          studentId: STUDENTS[8].id,
          body: "مستوى ممتاز في العزم، وتحتاج فقط إلى مراجعة الوحدات.",
          authorId: OWNER_USER_ID,
          createdAt: daysAgo(1, 21),
        },
      ];
      for (const note of notes) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          studentId: note.studentId,
          body: note.body,
          authorId: note.authorId,
          createdAt: note.createdAt,
        };
        await tx.studentNote.upsert({
          where: { id: note.id },
          create: { id: note.id, ...data },
          update: { body: data.body, authorId: data.authorId },
        });
      }

      const followUps = [
        {
          id: fid(0xb2, 1),
          studentId: STUDENTS[2].id,
          ownerUserId: OWNER_USER_ID,
          title: "متابعة غياب متكرر",
          note: "غياب مرتين في آخر ثلاث حصص.",
          dueAt: daysAhead(2, 12),
          status: "open" as const,
          outcome: null,
          resolvedAt: null,
          createdBy: OWNER_USER_ID,
          createdAt: daysAgo(6, 10),
        },
        {
          id: fid(0xb2, 2),
          studentId: STUDENTS[6].id,
          ownerUserId: ASSISTANT_USER_ID,
          title: "تأخر في تسليم الواجبات",
          note: "تسليم متأخر لآخر واجبين.",
          dueAt: daysAgo(1, 12),
          status: "open" as const,
          outcome: null,
          resolvedAt: null,
          createdBy: ASSISTANT_USER_ID,
          createdAt: daysAgo(4, 11),
        },
        {
          id: fid(0xb2, 3),
          studentId: STUDENTS[9].id,
          ownerUserId: OWNER_USER_ID,
          title: "تحسن بعد جلسة إضافية",
          note: "الطالبة تحسنت في الاختبار الأخير، ونستمر في المتابعة.",
          dueAt: null,
          status: "resolved" as const,
          outcome: "monitoring" as const,
          resolvedAt: daysAgo(2, 18),
          createdBy: OWNER_USER_ID,
          createdAt: daysAgo(9, 9),
        },
      ];
      for (const followUp of followUps) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          studentId: followUp.studentId,
          ownerUserId: followUp.ownerUserId,
          title: followUp.title,
          note: followUp.note,
          dueAt: followUp.dueAt,
          status: followUp.status,
          outcome: followUp.outcome,
          resolvedAt: followUp.resolvedAt,
          createdBy: followUp.createdBy,
          createdAt: followUp.createdAt,
        };
        await tx.studentFollowUp.upsert({
          where: { id: followUp.id },
          create: { id: followUp.id, ...data },
          update: data,
        });
      }

      const events = [
        {
          id: fid(0xb3, 1),
          followUpId: followUps[0].id,
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          action: "created",
          outcome: null,
          createdAt: daysAgo(6, 10),
        },
        {
          id: fid(0xb3, 2),
          followUpId: followUps[0].id,
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          action: "contacted",
          outcome: "contacted" as const,
          createdAt: daysAgo(5, 18),
        },
        {
          id: fid(0xb3, 3),
          followUpId: followUps[1].id,
          actorUserId: ASSISTANT_USER_ID,
          actorDisplayName: "أ. عمر السيد",
          action: "created",
          outcome: null,
          createdAt: daysAgo(4, 11),
        },
        {
          id: fid(0xb3, 4),
          followUpId: followUps[1].id,
          actorUserId: ASSISTANT_USER_ID,
          actorDisplayName: "أ. عمر السيد",
          action: "no_answer",
          outcome: "no_answer" as const,
          createdAt: daysAgo(3, 16),
        },
        {
          id: fid(0xb3, 5),
          followUpId: followUps[2].id,
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          action: "created",
          outcome: null,
          createdAt: daysAgo(9, 9),
        },
        {
          id: fid(0xb3, 6),
          followUpId: followUps[2].id,
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          action: "resolved",
          outcome: "monitoring" as const,
          createdAt: daysAgo(2, 18),
        },
      ];
      for (const event of events) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          followUpId: event.followUpId,
          actorUserId: event.actorUserId,
          actorDisplayName: event.actorDisplayName,
          action: event.action,
          outcome: event.outcome,
          createdAt: event.createdAt,
        };
        await tx.studentFollowUpEvent.upsert({
          where: { id: event.id },
          create: { id: event.id, ...data },
          update: data,
        });
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 6. In-app notifications and the WhatsApp outbox (truthful states only).
// ---------------------------------------------------------------------------

async function seedNotificationsAndMessaging(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      const notifications = [
        {
          id: fid(0xc1, 1),
          studentId: STUDENTS[0].id,
          guardianId: fid(0x52, 1),
          type: "attendance_absent" as const,
          title: "تسجيل غياب",
          body: "تم تسجيل غياب أحمد محمود في حصة رياضيات — السبت 4 مساءً.",
          isRead: false,
          readAt: null,
          entityType: "student",
          entityId: STUDENTS[0].id,
          metadata: { sessionId: fid(0x71, 1), date: isoDate(addDays(todayInCairo(), -7)) },
          createdAt: daysAgo(7, 17),
        },
        {
          id: fid(0xc1, 2),
          studentId: STUDENTS[1].id,
          guardianId: fid(0x52, 2),
          type: "attendance_present" as const,
          title: "تسجيل حضور",
          body: "تم تسجيل حضور مريم خالد في حصة رياضيات — السبت 4 مساءً.",
          isRead: true,
          readAt: daysAgo(2, 20),
          entityType: "student",
          entityId: STUDENTS[1].id,
          metadata: { sessionId: fid(0x71, 3) },
          createdAt: daysAgo(2, 17),
        },
        {
          id: fid(0xc1, 3),
          studentId: STUDENTS[4].id,
          guardianId: fid(0x52, 5),
          type: "homework_assigned" as const,
          title: "واجب جديد",
          body: "تم إعطاء واجب «تطبيق على قانون نيوتن الثاني» لعمر طارق. موعد التسليم بعد يومين.",
          isRead: false,
          readAt: null,
          entityType: "homework",
          entityId: HOMEWORK[1].id,
          metadata: { dueAt: daysAhead(2, 20).toISOString() },
          createdAt: daysAgo(4, 18),
        },
        {
          id: fid(0xc1, 4),
          studentId: STUDENTS[7].id,
          guardianId: fid(0x52, 8),
          type: "exam_result" as const,
          title: "نتيجة اختبار",
          body: "نتيجة فاطمة عادل في اختبار العزم والاتزان: 13/15.",
          isRead: false,
          readAt: null,
          entityType: "assessment",
          entityId: fid(0x81, 4),
          metadata: { score: 13, maxScore: 15 },
          createdAt: daysAgo(6, 21),
        },
        {
          id: fid(0xc1, 5),
          studentId: STUDENTS[10].id,
          guardianId: fid(0x52, 11),
          type: "session_cancelled" as const,
          title: "إلغاء حصة",
          body: "تم إلغاء حصة ميكانيكا — الثلاثاء 5 مساءً لظرف طارئ.",
          isRead: true,
          readAt: daysAgo(1, 9),
          entityType: "teaching_session",
          entityId: fid(0x71, 25),
          metadata: null,
          createdAt: daysAgo(2, 8),
        },
        {
          id: fid(0xc1, 6),
          studentId: STUDENTS[0].id,
          guardianId: fid(0x52, 1),
          type: "general" as const,
          title: "تذكير بموعد المراجعة",
          body: "مراجعة الوحدة الثانية يوم السبت القادم بعد الحصة.",
          isRead: false,
          readAt: null,
          entityType: null,
          entityId: null,
          metadata: null,
          createdAt: daysAgo(1, 19),
        },
      ];
      for (const notification of notifications) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          studentId: notification.studentId,
          guardianId: notification.guardianId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          isRead: notification.isRead,
          readAt: notification.readAt,
          entityType: notification.entityType,
          entityId: notification.entityId,
          metadata:
            notification.metadata === null
              ? Prisma.DbNull
              : (notification.metadata as Prisma.InputJsonValue),
          createdAt: notification.createdAt,
        };
        await tx.notification.upsert({
          where: { id: notification.id },
          create: { id: notification.id, ...data },
          update: data,
        });
      }

      const outbox: Array<{
        id: string;
        studentIndex: number;
        type: "attendance_absent" | "homework_assigned" | "session_cancelled";
        templateKey: "attendance_absent" | "homework_assigned" | "session_cancelled";
        vars: Record<string, string>;
        status: "pending" | "cancelled";
        cancelledAt: Date | null;
        createdAt: Date;
      }> = [
        {
          id: fid(0xc2, 1),
          studentIndex: 1,
          type: "attendance_absent" as const,
          templateKey: "attendance_absent",
          vars: {
            guardianName: "خالد سعيد",
            studentName: "مريم خالد",
            groupName: GROUPS[0].name,
            date: isoDate(addDays(todayInCairo(), -7)),
          },
          status: "pending" as const,
          cancelledAt: null,
          createdAt: daysAgo(7, 17),
        },
        {
          id: fid(0xc2, 2),
          studentIndex: 4,
          type: "homework_assigned" as const,
          templateKey: "homework_assigned",
          vars: {
            guardianName: "طارق منير",
            studentName: "عمر طارق",
            groupName: GROUPS[1].name,
            dueDate: isoDate(addDays(todayInCairo(), 2)),
          },
          status: "pending" as const,
          cancelledAt: null,
          createdAt: daysAgo(4, 18),
        },
        {
          id: fid(0xc2, 3),
          studentIndex: 10,
          type: "session_cancelled" as const,
          templateKey: "session_cancelled",
          vars: {
            guardianName: "حسن علي",
            groupName: GROUPS[2].name,
            date: isoDate(addDays(todayInCairo(), 1)),
          },
          status: "cancelled" as const,
          cancelledAt: daysAgo(2, 9),
          createdAt: daysAgo(2, 8),
        },
      ];
      for (const message of outbox) {
        const student = STUDENTS[message.studentIndex];
        const guardianId = fid(0x52, message.studentIndex + 1);
        const body = renderTemplate(message.templateKey as Parameters<typeof renderTemplate>[0], "ar", message.vars);
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          studentId: student.id,
          guardianId,
          channel: "whatsapp" as const,
          type: message.type,
          templateKey: message.templateKey,
          locale: "ar",
          to: student.parentPhone,
          body,
          status: message.status,
          attempts: 0,
          maxAttempts: 5,
          nextRetryAt: null,
          provider: "none",
          providerMessageId: null,
          lastError: null,
          errorDetails: Prisma.DbNull,
          idempotencyKey: `demo-outbox-${message.studentIndex + 1}-${message.type}`,
          metadata: Prisma.DbNull,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          cancelledAt: message.cancelledAt,
          createdAt: message.createdAt,
        };
        await tx.messageOutbox.upsert({
          where: { id: message.id },
          create: { id: message.id, ...data },
          update: data,
        });
      }

      const logs = [
        {
          id: fid(0xc3, 1),
          outboxId: outbox[0].id,
          action: "enqueued",
          status: "pending" as const,
          details: { reason: "attendance_absent", channel: "whatsapp" },
          error: null,
          createdAt: daysAgo(7, 17),
        },
        {
          id: fid(0xc3, 2),
          outboxId: outbox[1].id,
          action: "enqueued",
          status: "pending" as const,
          details: { reason: "homework_assigned", channel: "whatsapp" },
          error: null,
          createdAt: daysAgo(4, 18),
        },
        {
          id: fid(0xc3, 3),
          outboxId: outbox[2].id,
          action: "enqueued",
          status: "pending" as const,
          details: { reason: "session_cancelled", channel: "whatsapp" },
          error: null,
          createdAt: daysAgo(2, 8),
        },
        {
          id: fid(0xc3, 4),
          outboxId: outbox[2].id,
          action: "cancelled",
          status: "cancelled" as const,
          details: { reason: "المعلمة ألغت الإرسال بعد تعديل نص الرسالة." },
          error: null,
          createdAt: daysAgo(2, 9),
        },
      ];
      for (const log of logs) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          outboxId: log.outboxId,
          action: log.action,
          status: log.status,
          details: log.details as Prisma.InputJsonValue,
          error: log.error,
          createdAt: log.createdAt,
        };
        await tx.notificationLog.upsert({
          where: { id: log.id },
          create: { id: log.id, ...data },
          update: data,
        });
      }

      const settingsData = {
        workspaceId: NILE_WORKSPACE_ID,
        enabled: true,
        provider: "none",
        providerConfig: Prisma.DbNull,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursEnabled: true,
        rateLimitPerHour: 100,
        dailyLimit: 1000,
        templateOverrides: Prisma.DbNull,
      };
      await tx.notificationSettings.upsert({
        where: { workspaceId: NILE_WORKSPACE_ID },
        create: { id: fid(0xc4, 1), ...settingsData },
        update: settingsData,
      });
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 7. One closed online exam with auto-graded and manually graded attempts.
// ---------------------------------------------------------------------------

const EXAM_ID = fid(0xd1, 1);

type ExamQuestionSeed = {
  id: string;
  orderIndex: number;
  questionType: "mcq_single" | "true_false" | "short_answer" | "essay";
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctAnswerJson: Prisma.InputJsonValue;
  explanation: string | null;
  points: number;
  autoGradable: boolean;
};

const EXAM_QUESTIONS: ExamQuestionSeed[] = [
  {
    id: fid(0xd2, 1),
    orderIndex: 0,
    questionType: "mcq_single",
    prompt: "ما هي قيمة i²؟",
    options: [
      { id: "opt-a", text: "1" },
      { id: "opt-b", text: "-1" },
      { id: "opt-c", text: "i" },
      { id: "opt-d", text: "0" },
    ],
    correctAnswerJson: { kind: "mcq_single", optionId: "opt-b" },
    explanation: "الوحدة التخيلية i معرّفة بحيث i² = -1.",
    points: 5,
    autoGradable: true,
  },
  {
    id: fid(0xd2, 2),
    orderIndex: 1,
    questionType: "true_false",
    prompt: "العدد المركب 3 + 0i هو عدد حقيقي.",
    options: [
      { id: "true", text: "صحيح" },
      { id: "false", text: "خطأ" },
    ],
    correctAnswerJson: { kind: "true_false", value: true },
    explanation: "جزؤه التخيلي يساوي صفرًا، لذا فهو عدد حقيقي.",
    points: 3,
    autoGradable: true,
  },
  {
    id: fid(0xd2, 3),
    orderIndex: 2,
    questionType: "short_answer",
    prompt: "ما هو modulus العدد المركب 3 + 4i؟",
    options: [],
    correctAnswerJson: {
      kind: "short_answer",
      acceptedAnswers: ["5", "٥"],
      caseSensitive: false,
    },
    explanation: "المقياس = الجذر التربيعي لمجموع مربعي الجزأين = 5.",
    points: 4,
    autoGradable: true,
  },
  {
    id: fid(0xd2, 4),
    orderIndex: 3,
    questionType: "essay",
    prompt: "اشرح خطوات حل المعادلة x² + 4 = 0 في مجموعة الأعداد المركبة.",
    options: [],
    correctAnswerJson: { kind: "manual" },
    explanation: null,
    points: 8,
    autoGradable: false,
  },
];

type ExamAttemptSeed = {
  id: string;
  studentIndex: number;
  status: "graded" | "manual_pending" | "submitted";
  answers: Record<string, unknown>;
  essayScore: number | null;
  gradingNote: string | null;
};

const EXAM_ATTEMPTS: ExamAttemptSeed[] = [
  {
    id: fid(0xd3, 1),
    studentIndex: 0,
    status: "graded",
    answers: {
      [fid(0xd2, 1)]: { optionId: "opt-b" },
      [fid(0xd2, 2)]: { value: true },
      [fid(0xd2, 3)]: { text: "5" },
      [fid(0xd2, 4)]: {
        text: "ننقل 4 للطرف الآخر فتصبح x² = -4، ثم نأخذ الجذر فنحصل على x = ±2i.",
      },
    },
    essayScore: 6,
    gradingNote: "خطوات صحيحة، وينقصها ذكر أن i² = -1 صراحة.",
  },
  {
    id: fid(0xd3, 2),
    studentIndex: 1,
    status: "manual_pending",
    answers: {
      [fid(0xd2, 1)]: { optionId: "opt-a" },
      [fid(0xd2, 2)]: { value: true },
      [fid(0xd2, 3)]: { text: "7" },
      [fid(0xd2, 4)]: {
        text: "أفصل الجزء الحقيقي والتخيلي ثم أحل المعادلة.",
      },
    },
    essayScore: null,
    gradingNote: null,
  },
  {
    id: fid(0xd3, 3),
    studentIndex: 2,
    status: "submitted",
    answers: {
      [fid(0xd2, 1)]: { optionId: "opt-b" },
      [fid(0xd2, 2)]: { value: false },
      [fid(0xd2, 3)]: { text: "5" },
    },
    essayScore: null,
    gradingNote: null,
  },
];

async function seedOnlineExam(): Promise<void> {
  const availableFrom = daysAgo(9, 18);
  const availableUntil = new Date(availableFrom.getTime() + 60 * 60000);

  await withScope(
    scope,
    async (tx) => {
      const maxScore = EXAM_QUESTIONS.reduce((sum, question) => sum + question.points, 0);
      const examData = {
        workspaceId: NILE_WORKSPACE_ID,
        groupId: GROUPS[0].id,
        assessmentId: null,
        title: "اختبار إلكتروني — الأعداد المركبة",
        description: "اختبار قصير على الوحدة الأولى، مغلق بعد انتهاء النافذة الزمنية.",
        instructions: "أجب على جميع الأسئلة. لا يمكن إعادة المحاولة.",
        assignmentScope: "group" as const,
        status: "closed" as const,
        availableFrom,
        availableUntil,
        durationMinutes: 30,
        maxAttempts: 1,
        resultVisibility: "after_manual_publish" as const,
        resultsPublishedAt: daysAgo(7, 20),
        maxScore,
        publishedAt: daysAgo(10, 9),
        closedAt: availableUntil,
        createdByUserId: OWNER_USER_ID,
      };
      await tx.onlineExam.upsert({
        where: { id: EXAM_ID },
        create: { id: EXAM_ID, ...examData },
        update: examData,
      });

      for (const question of EXAM_QUESTIONS) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          examId: EXAM_ID,
          orderIndex: question.orderIndex,
          questionType: question.questionType,
          prompt: question.prompt,
          optionsJson: question.options as unknown as Prisma.InputJsonValue,
          correctAnswerJson: question.correctAnswerJson,
          explanation: question.explanation,
          points: question.points,
          autoGradable: question.autoGradable,
        };
        await tx.onlineExamQuestion.upsert({
          where: { id: question.id },
          create: { id: question.id, ...data },
          update: data,
        });
      }

      const gradable: GradableQuestion[] = EXAM_QUESTIONS.map((question) => ({
        id: question.id,
        questionType: question.questionType,
        points: question.points,
        autoGradable: question.autoGradable,
        correctAnswerJson: question.correctAnswerJson,
      }));

      for (const [attemptIndex, attempt] of EXAM_ATTEMPTS.entries()) {
        const student = STUDENTS[attempt.studentIndex];
        const responsesByQuestionId = new Map<string, unknown>(Object.entries(attempt.answers));
        const evaluation = evaluateExamResponses(gradable, responsesByQuestionId);
        const submittedAt = new Date(availableFrom.getTime() + 28 * 60000);
        const totalScore =
          attempt.essayScore === null ? null : round2(evaluation.autoScore + attempt.essayScore);
        const attemptData = {
          workspaceId: NILE_WORKSPACE_ID,
          examId: EXAM_ID,
          studentId: student.id,
          attemptNumber: 1,
          status: attempt.status,
          startedAt: availableFrom,
          deadlineAt: new Date(availableFrom.getTime() + 30 * 60000),
          submittedAt,
          submissionIdempotencyKey: fid(0xd5, attemptIndex + 1),
          autoScore: evaluation.autoScore,
          manualScore: attempt.essayScore,
          totalScore,
          gradedAt: attempt.status === "graded" ? daysAgo(7, 20) : null,
          gradedByUserId: attempt.status === "graded" ? OWNER_USER_ID : null,
          gradingNote: attempt.gradingNote,
        };
        await tx.onlineExamAttempt.upsert({
          where: { id: attempt.id },
          create: { id: attempt.id, ...attemptData },
          update: attemptData,
        });

        for (const [questionIndex, question] of EXAM_QUESTIONS.entries()) {
          const answer = attempt.answers[question.id];
          if (answer === undefined) continue;
          const evaluated = evaluation.perQuestion.find(
            (row) => row.questionId === question.id,
          );
          const responseData = {
            workspaceId: NILE_WORKSPACE_ID,
            attemptId: attempt.id,
            questionId: question.id,
            answerJson: answer as Prisma.InputJsonValue,
            isCorrect: evaluated?.isCorrect ?? null,
            autoAwardedPoints: evaluated?.autoAwardedPoints ?? null,
            manualAwardedPoints:
              question.questionType === "essay" ? attempt.essayScore : null,
            teacherFeedback:
              question.questionType === "essay" && attempt.essayScore !== null
                ? "حل منظم، راجع إشارة الجذر."
                : null,
            savedAt: submittedAt,
          };
          await tx.onlineExamResponse.upsert({
            where: {
              attemptId_questionId: {
                attemptId: attempt.id,
                questionId: question.id,
              },
            },
            create: {
              id: fid(0xd4, attemptIndex * 10 + questionIndex + 1),
              ...responseData,
            },
            update: responseData,
          });
        }
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 8. A published public feedback form and a draft assessment form.
// ---------------------------------------------------------------------------

const FEEDBACK_FORM_ID = fid(0xe1, 1);
const DRAFT_FORM_ID = fid(0xe1, 2);

const FEEDBACK_SECTION_ONE = fid(0xe2, 1);
const FEEDBACK_SECTION_TWO = fid(0xe2, 2);
const DRAFT_SECTION_ONE = fid(0xe2, 3);

const FEEDBACK_OPTIONS = {
  excellent: fid(0xe4, 1),
  good: fid(0xe4, 2),
  acceptable: fid(0xe4, 3),
  poor: fid(0xe4, 4),
  schedule: fid(0xe4, 5),
  homework: fid(0xe4, 6),
  communication: fid(0xe4, 7),
  content: fid(0xe4, 8),
};

const FEEDBACK_QUESTIONS = {
  name: fid(0xe3, 1),
  communication: fid(0xe3, 2),
  rating: fid(0xe3, 3),
  improvements: fid(0xe3, 4),
  notes: fid(0xe3, 5),
};

const DRAFT_QUESTIONS = {
  level: fid(0xe3, 6),
  oralScore: fid(0xe3, 7),
  assessedOn: fid(0xe3, 8),
  group: fid(0xe3, 9),
  time: fid(0xe3, 10),
};

async function seedForms(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      const feedbackSettings = {
        allowMultipleSubmissions: false,
        shuffleQuestions: false,
        showProgressBar: true,
      };
      const feedbackData = {
        workspaceId: NILE_WORKSPACE_ID,
        title: "استبيان رضا أولياء الأمور",
        description: "رأيك يساعدنا على تحسين التجربة. الردود مجهولة الهوية.",
        status: "published" as const,
        submissionMode: "anonymous" as const,
        isPublic: true,
        publicSlug: "parent-feedback-2026",
        acceptingResponses: true,
        confirmationMessage: "شكرًا لك، تم استلام ردك.",
        settingsJson: feedbackSettings,
        createdByUserId: OWNER_USER_ID,
        publishedAt: daysAgo(15, 10),
        archivedAt: null,
      };
      await tx.form.upsert({
        where: { id: FEEDBACK_FORM_ID },
        create: { id: FEEDBACK_FORM_ID, ...feedbackData },
        update: feedbackData,
      });

      const draftData = {
        workspaceId: NILE_WORKSPACE_ID,
        title: "تقييم مستوى الطالب — نهاية الوحدة",
        description: "نموذج داخلي يُستخدم أثناء مراجعة الوحدة الثانية.",
        status: "draft" as const,
        submissionMode: "identified" as const,
        isPublic: false,
        publicSlug: null,
        acceptingResponses: true,
        confirmationMessage: null,
        settingsJson: { allowMultipleSubmissions: false, shuffleQuestions: false, showProgressBar: true },
        createdByUserId: OWNER_USER_ID,
        publishedAt: null,
        archivedAt: null,
      };
      await tx.form.upsert({
        where: { id: DRAFT_FORM_ID },
        create: { id: DRAFT_FORM_ID, ...draftData },
        update: draftData,
      });

      const sections = [
        {
          id: FEEDBACK_SECTION_ONE,
          formId: FEEDBACK_FORM_ID,
          title: "بيانات عامة",
          description: "معلومات اختيارية تساعدنا على فهم الردود.",
          orderIndex: 1,
          pageBreakBefore: false,
        },
        {
          id: FEEDBACK_SECTION_TWO,
          formId: FEEDBACK_FORM_ID,
          title: "تقييم التجربة",
          description: null,
          orderIndex: 2,
          pageBreakBefore: true,
        },
        {
          id: DRAFT_SECTION_ONE,
          formId: DRAFT_FORM_ID,
          title: "أسئلة التقييم",
          description: null,
          orderIndex: 1,
          pageBreakBefore: false,
        },
      ];
      for (const section of sections) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          formId: section.formId,
          title: section.title,
          description: section.description,
          orderIndex: section.orderIndex,
          pageBreakBefore: section.pageBreakBefore,
        };
        await tx.formSection.upsert({
          where: { id: section.id },
          create: { id: section.id, ...data },
          update: data,
        });
      }

      const questions = [
        {
          id: FEEDBACK_QUESTIONS.name,
          formId: FEEDBACK_FORM_ID,
          sectionId: FEEDBACK_SECTION_ONE,
          orderIndex: 1,
          questionType: "short_answer" as const,
          prompt: "اسم الطالب (اختياري)",
          description: null,
          isRequired: false,
          configJson: { minLength: 0, maxLength: 120, placeholder: "اكتب الاسم" },
        },
        {
          id: FEEDBACK_QUESTIONS.communication,
          formId: FEEDBACK_FORM_ID,
          sectionId: FEEDBACK_SECTION_ONE,
          orderIndex: 2,
          questionType: "multiple_choice" as const,
          prompt: "كيف تقيّم مستوى التواصل؟",
          description: null,
          isRequired: true,
          configJson: { shuffleOptions: false },
        },
        {
          id: FEEDBACK_QUESTIONS.rating,
          formId: FEEDBACK_FORM_ID,
          sectionId: FEEDBACK_SECTION_TWO,
          orderIndex: 3,
          questionType: "rating" as const,
          prompt: "ما تقييمك لتنظيم الحصص؟",
          description: null,
          isRequired: true,
          configJson: { max: 5, icon: "star" },
        },
        {
          id: FEEDBACK_QUESTIONS.improvements,
          formId: FEEDBACK_FORM_ID,
          sectionId: FEEDBACK_SECTION_TWO,
          orderIndex: 4,
          questionType: "checkboxes" as const,
          prompt: "ما الجوانب التي تود تحسينها؟",
          description: null,
          isRequired: false,
          configJson: { shuffleOptions: false },
        },
        {
          id: FEEDBACK_QUESTIONS.notes,
          formId: FEEDBACK_FORM_ID,
          sectionId: FEEDBACK_SECTION_TWO,
          orderIndex: 5,
          questionType: "long_answer" as const,
          prompt: "ملاحظات إضافية",
          description: null,
          isRequired: false,
          configJson: { minLength: 0, maxLength: 2000, rows: 5 },
        },
        {
          id: DRAFT_QUESTIONS.level,
          formId: DRAFT_FORM_ID,
          sectionId: DRAFT_SECTION_ONE,
          orderIndex: 1,
          questionType: "linear_scale" as const,
          prompt: "قيّم مستوى الطالب في الوحدة",
          description: null,
          isRequired: true,
          configJson: { min: 1, max: 5, minLabel: "ضعيف", maxLabel: "ممتاز" },
        },
        {
          id: DRAFT_QUESTIONS.oralScore,
          formId: DRAFT_FORM_ID,
          sectionId: DRAFT_SECTION_ONE,
          orderIndex: 2,
          questionType: "number" as const,
          prompt: "درجة الاختبار الشفهي",
          description: null,
          isRequired: false,
          configJson: { min: 0, max: 20, integer: true },
        },
        {
          id: DRAFT_QUESTIONS.assessedOn,
          formId: DRAFT_FORM_ID,
          sectionId: DRAFT_SECTION_ONE,
          orderIndex: 3,
          questionType: "date" as const,
          prompt: "تاريخ التقييم",
          description: null,
          isRequired: false,
          configJson: { minDate: null, maxDate: null },
        },
        {
          id: DRAFT_QUESTIONS.group,
          formId: DRAFT_FORM_ID,
          sectionId: DRAFT_SECTION_ONE,
          orderIndex: 4,
          questionType: "dropdown" as const,
          prompt: "المجموعة",
          description: null,
          isRequired: true,
          configJson: { shuffleOptions: false },
        },
        {
          id: DRAFT_QUESTIONS.time,
          formId: DRAFT_FORM_ID,
          sectionId: DRAFT_SECTION_ONE,
          orderIndex: 5,
          questionType: "time" as const,
          prompt: "وقت الحصة",
          description: null,
          isRequired: false,
          configJson: { minTime: null, maxTime: null },
        },
      ];
      for (const question of questions) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          formId: question.formId,
          sectionId: question.sectionId,
          orderIndex: question.orderIndex,
          questionType: question.questionType,
          prompt: question.prompt,
          description: question.description,
          isRequired: question.isRequired,
          configJson: question.configJson as Prisma.InputJsonValue,
        };
        await tx.formQuestion.upsert({
          where: { id: question.id },
          create: { id: question.id, ...data },
          update: data,
        });
      }

      const options = [
        { id: FEEDBACK_OPTIONS.excellent, questionId: FEEDBACK_QUESTIONS.communication, label: "ممتاز", orderIndex: 1 },
        { id: FEEDBACK_OPTIONS.good, questionId: FEEDBACK_QUESTIONS.communication, label: "جيد", orderIndex: 2 },
        { id: FEEDBACK_OPTIONS.acceptable, questionId: FEEDBACK_QUESTIONS.communication, label: "مقبول", orderIndex: 3 },
        { id: FEEDBACK_OPTIONS.poor, questionId: FEEDBACK_QUESTIONS.communication, label: "ضعيف", orderIndex: 4 },
        { id: FEEDBACK_OPTIONS.schedule, questionId: FEEDBACK_QUESTIONS.improvements, label: "المواعيد", orderIndex: 1 },
        { id: FEEDBACK_OPTIONS.homework, questionId: FEEDBACK_QUESTIONS.improvements, label: "الواجبات", orderIndex: 2 },
        { id: FEEDBACK_OPTIONS.communication, questionId: FEEDBACK_QUESTIONS.improvements, label: "التواصل", orderIndex: 3 },
        { id: FEEDBACK_OPTIONS.content, questionId: FEEDBACK_QUESTIONS.improvements, label: "المحتوى", orderIndex: 4 },
        { id: fid(0xe4, 9), questionId: DRAFT_QUESTIONS.group, label: GROUPS[0].name, orderIndex: 1 },
        { id: fid(0xe4, 10), questionId: DRAFT_QUESTIONS.group, label: GROUPS[1].name, orderIndex: 2 },
        { id: fid(0xe4, 11), questionId: DRAFT_QUESTIONS.group, label: GROUPS[2].name, orderIndex: 3 },
        { id: fid(0xe4, 12), questionId: DRAFT_QUESTIONS.group, label: GROUPS[3].name, orderIndex: 4 },
      ];
      for (const option of options) {
        const data = {
          workspaceId: NILE_WORKSPACE_ID,
          questionId: option.questionId,
          label: option.label,
          orderIndex: option.orderIndex,
        };
        await tx.formQuestionOption.upsert({
          where: { id: option.id },
          create: { id: option.id, ...data },
          update: data,
        });
      }

      const logicData = {
        workspaceId: NILE_WORKSPACE_ID,
        formId: FEEDBACK_FORM_ID,
        sourceQuestionId: FEEDBACK_QUESTIONS.communication,
        operator: "equals" as const,
        comparisonJson: { optionId: FEEDBACK_OPTIONS.poor },
        action: "require" as const,
        targetQuestionId: FEEDBACK_QUESTIONS.notes,
        targetSectionId: null,
      };
      await tx.formQuestionLogic.upsert({
        where: { id: fid(0xe5, 1) },
        create: { id: fid(0xe5, 1), ...logicData },
        update: logicData,
      });

      const submissions = [
        {
          id: fid(0xe6, 1),
          submittedAt: daysAgo(12, 20),
          answers: [
            { questionId: FEEDBACK_QUESTIONS.name, valueJson: { text: "أحمد م." } },
            { questionId: FEEDBACK_QUESTIONS.communication, valueJson: { optionId: FEEDBACK_OPTIONS.good } },
            { questionId: FEEDBACK_QUESTIONS.rating, valueJson: { rating: 5 } },
            {
              questionId: FEEDBACK_QUESTIONS.improvements,
              valueJson: { optionIds: [FEEDBACK_OPTIONS.schedule, FEEDBACK_OPTIONS.communication] },
            },
            {
              questionId: FEEDBACK_QUESTIONS.notes,
              valueJson: { text: "التنظيم ممتاز، ونتمنى إرسال تذكير قبل الحصة بيوم." },
            },
          ],
        },
        {
          id: fid(0xe6, 2),
          submittedAt: daysAgo(8, 13),
          answers: [
            { questionId: FEEDBACK_QUESTIONS.communication, valueJson: { optionId: FEEDBACK_OPTIONS.acceptable } },
            { questionId: FEEDBACK_QUESTIONS.rating, valueJson: { rating: 4 } },
            {
              questionId: FEEDBACK_QUESTIONS.improvements,
              valueJson: { optionIds: [FEEDBACK_OPTIONS.homework] },
            },
          ],
        },
        {
          id: fid(0xe6, 3),
          submittedAt: daysAgo(3, 21),
          answers: [
            { questionId: FEEDBACK_QUESTIONS.name, valueJson: { text: "ولي أمر طالبة" } },
            { questionId: FEEDBACK_QUESTIONS.communication, valueJson: { optionId: FEEDBACK_OPTIONS.poor } },
            { questionId: FEEDBACK_QUESTIONS.rating, valueJson: { rating: 2 } },
            {
              questionId: FEEDBACK_QUESTIONS.improvements,
              valueJson: {
                optionIds: [
                  FEEDBACK_OPTIONS.schedule,
                  FEEDBACK_OPTIONS.homework,
                  FEEDBACK_OPTIONS.content,
                ],
              },
            },
            {
              questionId: FEEDBACK_QUESTIONS.notes,
              valueJson: { text: "نحتاج تواصلًا أسرع بخصوص الغياب وتحديث المواعيد." },
            },
          ],
        },
      ];
      for (const [submissionIndex, submission] of submissions.entries()) {
        const submissionData = {
          workspaceId: NILE_WORKSPACE_ID,
          formId: FEEDBACK_FORM_ID,
          submissionMode: "anonymous" as const,
          studentId: null,
          submittedByUserId: null,
          submissionToken: fid(0xe8, submissionIndex + 1),
          dedupeKey: null,
          submittedAt: submission.submittedAt,
          archivedAt: null,
        };
        await tx.formSubmission.upsert({
          where: { id: submission.id },
          create: { id: submission.id, ...submissionData },
          update: submissionData,
        });

        for (const [answerIndex, answer] of submission.answers.entries()) {
          const answerData = {
            workspaceId: NILE_WORKSPACE_ID,
            submissionId: submission.id,
            questionId: answer.questionId,
            valueJson: answer.valueJson as Prisma.InputJsonValue,
          };
          await tx.formAnswer.upsert({
            where: {
              submissionId_questionId: {
                submissionId: submission.id,
                questionId: answer.questionId,
              },
            },
            create: {
              id: fid(0xe7, submissionIndex * 10 + answerIndex + 1),
              ...answerData,
            },
            update: answerData,
          });
        }
      }
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// 9. Portals, invitations, report export, and audit history.
// ---------------------------------------------------------------------------

const PARENT_PORTAL_USER_ID = fid(0xac, 1);
const STUDENT_PORTAL_USER_ID = fid(0xac, 2);

async function seedPortalUsers(passwordHash: string): Promise<void> {
  const db = getDb();
  const portalUsers = [
    {
      id: PARENT_PORTAL_USER_ID,
      name: "خالد سعيد",
      email: "parent.khaled@kashkol.local",
    },
    {
      id: STUDENT_PORTAL_USER_ID,
      name: "أحمد محمود",
      email: "student.ahmed@kashkol.local",
    },
  ];
  for (const user of portalUsers) {
    await db.user.upsert({
      where: { email: user.email },
      create: { ...user, emailVerified: true },
      update: { name: user.name, emailVerified: true },
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
      update: { password: passwordHash },
    });
    await db.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, locale: "ar", theme: "system" },
      update: {},
    });
  }
}

async function seedPortalsInvitationsReportsAndAudit(): Promise<void> {
  await withScope(
    scope,
    async (tx) => {
      const parentGrantData = {
        workspaceId: NILE_WORKSPACE_ID,
        portalUserId: PARENT_PORTAL_USER_ID,
        studentId: STUDENTS[0].id,
        guardianId: fid(0x52, 1),
        kind: "parent" as const,
        permissions: DEFAULT_PARENT_PERMISSIONS as unknown as Prisma.InputJsonValue,
        issuedBy: OWNER_USER_ID,
        issuedAt: daysAgo(20, 11),
        expiresAt: null,
        revokedAt: null,
      };
      await tx.portalGrant.upsert({
        where: {
          portalUserId_studentId_kind: {
            portalUserId: PARENT_PORTAL_USER_ID,
            studentId: STUDENTS[0].id,
            kind: "parent",
          },
        },
        create: { id: fid(0xad, 1), ...parentGrantData },
        update: parentGrantData,
      });

      const studentGrantData = {
        workspaceId: NILE_WORKSPACE_ID,
        portalUserId: STUDENT_PORTAL_USER_ID,
        studentId: STUDENTS[0].id,
        guardianId: null,
        kind: "student" as const,
        permissions: DEFAULT_STUDENT_PERMISSIONS as unknown as Prisma.InputJsonValue,
        issuedBy: OWNER_USER_ID,
        issuedAt: daysAgo(20, 11),
        expiresAt: null,
        revokedAt: null,
      };
      await tx.portalGrant.upsert({
        where: {
          portalUserId_studentId_kind: {
            portalUserId: STUDENT_PORTAL_USER_ID,
            studentId: STUDENTS[0].id,
            kind: "student",
          },
        },
        create: { id: fid(0xad, 2), ...studentGrantData },
        update: studentGrantData,
      });

      const portalInvitationData = {
        workspaceId: NILE_WORKSPACE_ID,
        studentId: STUDENTS[1].id,
        guardianId: fid(0x52, 2),
        kind: "parent" as const,
        email: "guardian.2@kashkol.local",
        permissions: {} as Prisma.InputJsonValue,
        tokenHash: createHash("sha256").update("demo-portal-invitation-token-2").digest("hex"),
        status: "pending" as const,
        issuedByUserId: OWNER_USER_ID,
        expiresAt: daysAhead(1, 9),
        lastSentAt: daysAgo(0, 9),
        acceptedAt: null,
        acceptedByUserId: null,
        revokedAt: null,
      };
      await tx.portalInvitation.upsert({
        where: { id: fid(0xae, 1) },
        create: { id: fid(0xae, 1), ...portalInvitationData },
        update: portalInvitationData,
      });

      const workspaceInvitationData = {
        workspaceId: NILE_WORKSPACE_ID,
        email: "new.assistant@kashkol.local",
        role: "assistant" as const,
        grants: [
          { resource: "students", action: "read" },
          { resource: "attendance", action: "write" },
          { resource: "homework", action: "write" },
        ] as unknown as Prisma.InputJsonValue,
        tokenHash: createHash("sha256").update("demo-workspace-invitation-token").digest("hex"),
        status: "pending" as const,
        invitedByUserId: OWNER_USER_ID,
        expiresAt: daysAhead(3, 10),
        lastSentAt: daysAgo(1, 10),
        acceptedAt: null,
        acceptedByUserId: null,
        revokedAt: null,
      };
      await tx.workspaceInvitation.upsert({
        where: { id: fid(0xab, 1) },
        create: { id: fid(0xab, 1), ...workspaceInvitationData },
        update: workspaceInvitationData,
      });

      const reportId = fid(0xf1, 1);
      const reportData = {
        workspaceId: NILE_WORKSPACE_ID,
        type: "attendance",
        query: {
          type: "attendance",
          from: isoDate(addDays(todayInCairo(), -30)),
          to: isoDate(todayInCairo()),
          page: 1,
          pageSize: 25,
        } as Prisma.InputJsonValue,
        status: "queued" as const,
        requestedBy: OWNER_USER_ID,
        filename: `kashkol-attendance-${reportId}.csv`,
        storageKey: null,
        failureCode: null,
        createdAt: daysAgo(1, 8),
        completedAt: null,
      };
      await tx.reportExport.upsert({
        where: { id: reportId },
        create: { id: reportId, ...reportData },
        update: reportData,
      });

      const auditEvents = [
        {
          id: fid(0xaa, 1),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "workspace",
          entityId: NILE_WORKSPACE_ID,
          action: "workspace.created",
          diff: { name: "أكاديمية النيل" },
          createdAt: daysAgo(90, 10),
        },
        {
          id: fid(0xaa, 2),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "subject",
          entityId: BASE_SUBJECT_ID,
          action: "subject.created",
          diff: { name: "الرياضيات" },
          createdAt: daysAgo(88, 10),
        },
        {
          id: fid(0xaa, 3),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "group",
          entityId: BASE_GROUP_ID,
          action: "group.created",
          diff: { name: GROUPS[0].name, slots: 1 },
          createdAt: daysAgo(85, 12),
        },
        {
          id: fid(0xaa, 4),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "student",
          entityId: STUDENTS[1].id,
          action: "student.created",
          diff: { firstName: STUDENTS[1].firstName, lastName: STUDENTS[1].lastName },
          createdAt: daysAgo(74, 11),
        },
        {
          id: fid(0xaa, 5),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "teaching_session",
          entityId: fid(0x71, 1),
          action: "session.completed",
          diff: { status: "completed" },
          createdAt: daysAgo(21, 18),
        },
        {
          id: fid(0xaa, 6),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "attendance_mark",
          entityId: fid(0x72, 1),
          action: "attendance.saved",
          diff: { sessionId: fid(0x71, 1), marked: 4 },
          createdAt: daysAgo(21, 17),
        },
        {
          id: fid(0xaa, 7),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "attendance_mark",
          entityId: fid(0x72, 1),
          action: "attendance.corrected",
          diff: { oldMark: "absent", newMark: "present" },
          createdAt: daysAgo(2, 20),
        },
        {
          id: fid(0xaa, 8),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "assessment",
          entityId: ASSESSMENTS[1].id,
          action: "assessment.graded",
          diff: { title: ASSESSMENTS[1].title, scores: 4 },
          createdAt: daysAgo(9, 19),
        },
        {
          id: fid(0xaa, 9),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "homework",
          entityId: HOMEWORK[0].id,
          action: "homework.assigned",
          diff: { title: HOMEWORK[0].title, groupId: GROUPS[0].id },
          createdAt: daysAgo(3, 18),
        },
        {
          id: fid(0xaa, 10),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "payment",
          entityId: fid(0x91, 1),
          action: "payment.recorded",
          diff: { amountMinor: GROUPS[0].pricePerStudentMinor, method: "cash" },
          createdAt: daysAgo(31, 12),
        },
        {
          id: fid(0xaa, 11),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "payment",
          entityId: fid(0x91, 101),
          action: "payment.voided",
          diff: { reason: "سُجّل المبلغ مرتين بالخطأ." },
          createdAt: daysAgo(20, 13),
        },
        {
          id: fid(0xaa, 12),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "file",
          entityId: FILE_SEEDS[0].id,
          action: "file.uploaded",
          diff: { title: FILE_SEEDS[0].title, scope: FILE_SEEDS[0].scope },
          createdAt: daysAgo(18, 9),
        },
        {
          id: fid(0xaa, 13),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "form",
          entityId: FEEDBACK_FORM_ID,
          action: "form.published",
          diff: { title: "استبيان رضا أولياء الأمور", publicSlug: "parent-feedback-2026" },
          createdAt: daysAgo(15, 10),
        },
        {
          id: fid(0xaa, 14),
          actorUserId: ASSISTANT_USER_ID,
          actorDisplayName: "أ. عمر السيد",
          actorType: "user" as const,
          entityType: "form_submission",
          entityId: fid(0xe6, 2),
          action: "form.submission_received",
          diff: { formId: FEEDBACK_FORM_ID, mode: "anonymous" },
          createdAt: daysAgo(8, 13),
        },
        {
          id: fid(0xaa, 15),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "online_exam",
          entityId: EXAM_ID,
          action: "exam.results_published",
          diff: { title: "اختبار إلكتروني — الأعداد المركبة" },
          createdAt: daysAgo(7, 20),
        },
        {
          id: fid(0xaa, 16),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "message_outbox",
          entityId: fid(0xc2, 3),
          action: "message.cancelled",
          diff: { reason: "أُلغي الإرسال بعد تعديل النص." },
          createdAt: daysAgo(2, 9),
        },
        {
          id: fid(0xaa, 17),
          actorUserId: OWNER_USER_ID,
          actorDisplayName: "أ. منى عبد الرحمن",
          actorType: "user" as const,
          entityType: "report_export",
          entityId: reportId,
          action: "report.export_requested",
          diff: { type: "attendance" },
          createdAt: daysAgo(1, 8),
        },
      ];
      // The audit table is append-only (a database trigger rejects UPDATE and
      // DELETE), so re-runs insert with `skipDuplicates` instead of upserting.
      await tx.auditEvent.createMany({
        data: auditEvents.map((event, index) => ({
          id: event.id,
          workspaceId: NILE_WORKSPACE_ID,
          actorUserId: event.actorUserId,
          actorDisplayName: event.actorDisplayName,
          actorType: event.actorType,
          entityType: event.entityType,
          entityId: event.entityId,
          action: event.action,
          diff: event.diff as Prisma.InputJsonValue,
          requestId: `demo-request-${index + 1}`,
          ipHash: null,
          createdAt: event.createdAt,
        })),
        skipDuplicates: true,
      });
    },
    TX_OPTIONS,
  );
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  assertLocalSeedTarget(process.env);

  const passwordHash = await hashPassword(DEV_PASSWORD);

  await seedSubjectsGroupsAndPeople();
  await seedSessionsAndAttendance();
  await seedAssessmentsAndHomework();
  await seedPayments();
  await seedFiles();
  await seedNotesAndFollowUps();
  await seedNotificationsAndMessaging();
  await seedOnlineExam();
  await seedForms();
  await seedPortalUsers(passwordHash);
  await seedPortalsInvitationsReportsAndAudit();

  console.log("Demo seed complete — Nile Academy now has data for every feature.");
  console.log("");
  console.log("Teacher workspace (owner):");
  console.log("  demo.owner@kashkol.local      — owner, Nile Academy");
  console.log("  demo.assistant@kashkol.local  — assistant, Nile Academy");
  console.log("");
  console.log("Parent and student portals:");
  console.log("  parent.khaled@kashkol.local   — parent of أحمد محمود");
  console.log("  student.ahmed@kashkol.local   — student portal for أحمد محمود");
  console.log("");
  console.log(`Password for every demo account: ${DEV_PASSWORD}`);
  console.log("");
  console.log("Truthful limits of this data set:");
  console.log("  • Messages are pending or cancelled — nothing is marked sent or delivered.");
  console.log("  • The report export is queued — no file is fabricated.");
  console.log("  • Video lessons are absent because VIDEO_PROVIDER_DRIVER=none.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
