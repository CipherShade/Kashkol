import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { GuardianRelation, MessageStatus, NotificationType } from "@/generated/prisma/client";

export async function getGuardianForStudent(
  scope: Scope,
  studentId: string,
  guardianId?: string,
) {
  return withScope(scope, async (tx) => {
    if (guardianId) {
      return tx.guardian.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          id: guardianId,
          studentId,
          isAuthorized: true,
          optOut: false,
        },
      });
    }
    // Get primary authorized guardian
    return tx.guardian.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        studentId,
        isAuthorized: true,
        optOut: false,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  });
}

export async function createGuardian(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: {
    studentId: string;
    firstName: string;
    lastName: string;
    relation?: GuardianRelation | string;
    phoneE164: string;
    email?: string | null;
    isPrimary?: boolean;
    isAuthorized?: boolean;
    optOut?: boolean;
    consentGiven?: boolean;
  },
) {
  const id = crypto.randomUUID();
  return tx.guardian.create({
    data: {
      id,
      workspaceId,
      studentId: data.studentId,
      firstName: data.firstName,
      lastName: data.lastName,
      relation: (data.relation as GuardianRelation) || "other",
      phoneE164: data.phoneE164,
      email: data.email ?? null,
      isPrimary: data.isPrimary ?? false,
      isAuthorized: data.isAuthorized ?? true,
      optOut: data.optOut ?? false,
      consentGiven: data.consentGiven ?? false,
      consentAt: data.consentGiven ? new Date() : null,
    },
  });
}

export async function enqueueMessageTx(
  tx: Prisma.TransactionClient,
  data: {
    workspaceId: string;
    studentId: string;
    guardianId?: string | null;
    type: NotificationType | string;
    templateKey: string;
    locale: string;
    to: string;
    body: string;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
    nextRetryAt?: Date;
  },
) {
  const id = crypto.randomUUID();
  const nextRetryAt = data.nextRetryAt ?? new Date();
  return tx.messageOutbox.create({
    data: {
      id,
      workspaceId: data.workspaceId,
      studentId: data.studentId,
      guardianId: data.guardianId || null,
      type: data.type as NotificationType,
      templateKey: data.templateKey,
      locale: data.locale,
      to: data.to,
      body: data.body,
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt,
      provider: "fake",
      idempotencyKey: data.idempotencyKey,
      metadata: data.metadata ?? Prisma.JsonNull,
    },
  });
}

export async function getPendingMessages(
  tx: Prisma.TransactionClient,
  limit: number = 10,
) {
  return tx.messageOutbox.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    orderBy: [{ nextRetryAt: "asc" }],
    take: limit,
  });
}

export async function updateMessageStatus(
  tx: Prisma.TransactionClient,
  outboxId: string,
  update: {
    status: MessageStatus | string;
    attempts?: number;
    providerMessageId?: string | null;
    lastError?: string | null;
    sentAt?: Date | null;
    deliveredAt?: Date | null;
    failedAt?: Date | null;
    nextRetryAt?: Date | null;
    cancelledAt?: Date | null;
    errorDetails?: Prisma.InputJsonValue | null;
  },
) {
  return tx.messageOutbox.update({
    where: { id: outboxId },
    data: update as Prisma.MessageOutboxUpdateInput,
  });
}

export type OutboxFilters = {
  status?: MessageStatus | string;
  limit?: number;
  offset?: number;
};

export async function getOutboxForWorkspace(scope: Scope, filters: OutboxFilters = {}) {
  return withScope(scope, async (tx) => {
    const where: Prisma.MessageOutboxWhereInput = { workspaceId: scope.workspaceId };
    if (filters.status) {
      where.status = filters.status as MessageStatus;
    }
    const [items, total] = await Promise.all([
      tx.messageOutbox.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: { student: { select: { firstName: true, lastName: true } }, guardian: true },
      }),
      tx.messageOutbox.count({ where }),
    ]);
    return { items, total };
  });
}

const NOTIFICATION_SETTINGS_SELECT = {
  enabled: true,
  provider: true,
  providerConfig: true,
  quietHoursEnabled: true,
  quietHoursStart: true,
  quietHoursEnd: true,
} as const;

/** Quiet hours are interpreted in the workspace's configured time zone. */
export async function getNotificationTimezone(
  scope: Pick<Scope, "workspaceId">,
): Promise<string> {
  return withScope(scope, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: { timezone: true },
    });
    return settings?.timezone ?? "Africa/Cairo";
  });
}

export async function getNotificationLocale(
  scope: Pick<Scope, "workspaceId">,
): Promise<"ar" | "en"> {
  return withScope(scope, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: { locale: true },
    });
    return settings?.locale ?? "ar";
  });
}

export async function findNotificationSettings(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.notificationSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: NOTIFICATION_SETTINGS_SELECT,
    }),
  );
}

/** Read the preferences inside a caller's tenant transaction. */
export async function findNotificationSettingsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  return tx.notificationSettings.findUnique({
    where: { workspaceId },
    select: NOTIFICATION_SETTINGS_SELECT,
  });
}

export async function upsertNotificationSettingsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  preferences: {
    enabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  },
) {
  return tx.notificationSettings.upsert({
    where: { workspaceId },
    create: {
      id: crypto.randomUUID(),
      workspaceId,
      ...preferences,
    },
    update: {
      ...preferences,
    },
    select: NOTIFICATION_SETTINGS_SELECT,
  });
}
