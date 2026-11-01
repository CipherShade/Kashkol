/**
 * Non-public platform administrator provisioning CLI (`F-P3-03`).
 *
 * Usage:
 *   npx tsx scripts/platform-admin.ts list
 *   npx tsx scripts/platform-admin.ts grant --email <email> --reason "<ticket / reason>"
 *   npx tsx scripts/platform-admin.ts revoke --email <email> --reason "<ticket / reason>"
 *
 * Security invariants:
 * - Never executed automatically on user sign-up or deployment.
 * - Never grants access to an unverified email account.
 * - Requires an explicit operator reason and writes an append-only row in
 *   `platform_audit_event`.
 */
import { config as loadEnv } from "dotenv";
import { disconnectDb, getDb } from "../src/lib/db/client";
import { newRequestId } from "../src/lib/http/request-id";
import { newUuidV7 } from "../src/lib/id";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  let email = "";
  let reason = "";

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--email" && rest[i + 1]) {
      email = rest[i + 1].trim().toLowerCase();
      i += 1;
    } else if (arg === "--reason" && rest[i + 1]) {
      reason = rest[i + 1].trim();
      i += 1;
    }
  }

  return { command, email, reason };
}

async function main() {
  const { command, email, reason } = parseArgs(process.argv.slice(2));
  const db = getDb();

  if (command === "list") {
    const admins = await db.platformAdmin.findMany({
      include: {
        user: {
          select: { id: true, email: true, name: true, emailVerified: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (admins.length === 0) {
      console.log("No platform administrators provisioned.");
      return;
    }

    for (const row of admins) {
      const state = row.revokedAt ? `REVOKED (${row.revokedAt.toISOString()})` : "ACTIVE";
      console.log(
        `${state}\t${row.user.email}\t${row.user.name}\tuserId=${row.userId}\treason="${row.grantReason}"`,
      );
    }
    return;
  }

  if (command !== "grant" && command !== "revoke") {
    console.error(
      "Usage: npx tsx scripts/platform-admin.ts <list|grant|revoke> [--email <email> --reason <reason>]",
    );
    process.exitCode = 1;
    return;
  }

  if (!email || !email.includes("@")) {
    console.error("Error: --email <verified-user-email> is required.");
    process.exitCode = 1;
    return;
  }

  if (!reason || reason.length < 5) {
    console.error("Error: --reason <ticket or operational justification> (min 5 chars) is required.");
    process.exitCode = 1;
    return;
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, emailVerified: true },
  });

  if (!user) {
    console.error(`Error: No user account found for "${email}".`);
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const requestId = newRequestId();

  if (command === "grant") {
    if (!user.emailVerified) {
      console.error(`Error: User "${email}" does not have a verified email address.`);
      process.exitCode = 1;
      return;
    }

    await db.$transaction(async (tx) => {
      const record = await tx.platformAdmin.upsert({
        where: { userId: user.id },
        create: {
          id: newUuidV7(),
          userId: user.id,
          grantedByUserId: "cli_runbook",
          grantReason: reason,
          revokedAt: null,
          revokedByUserId: null,
          revokeReason: null,
          createdAt: now,
        },
        update: {
          grantedByUserId: "cli_runbook",
          grantReason: reason,
          revokedAt: null,
          revokedByUserId: null,
          revokeReason: null,
        },
      });

      await tx.platformAuditEvent.create({
        data: {
          id: newUuidV7(),
          actorUserId: null,
          actorDisplayName: "CLI Runbook Operator",
          targetWorkspaceId: null,
          entityType: "platform_admin",
          entityId: record.id,
          action: "platform_admin.role_granted",
          reason,
          diff: {
            targetUserId: user.id,
            targetEmail: user.email,
            reason,
          },
          requestId,
          createdAt: now,
        },
      });
    });

    console.log(`Granted platform-admin role to ${user.email} (userId=${user.id}).`);
    return;
  }

  if (command === "revoke") {
    const existing = await db.platformAdmin.findUnique({
      where: { userId: user.id },
      select: { id: true, revokedAt: true },
    });

    if (!existing || existing.revokedAt) {
      console.error(`Error: User "${email}" does not hold an active platform-admin role.`);
      process.exitCode = 1;
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.platformAdmin.update({
        where: { userId: user.id },
        data: {
          revokedAt: now,
          revokedByUserId: "cli_runbook",
          revokeReason: reason,
        },
      });

      await tx.platformAuditEvent.create({
        data: {
          id: newUuidV7(),
          actorUserId: null,
          actorDisplayName: "CLI Runbook Operator",
          targetWorkspaceId: null,
          entityType: "platform_admin",
          entityId: existing.id,
          action: "platform_admin.role_revoked",
          reason,
          diff: {
            targetUserId: user.id,
            targetEmail: user.email,
            reason,
          },
          requestId,
          createdAt: now,
        },
      });
    });

    console.log(`Revoked platform-admin role from ${user.email} (userId=${user.id}).`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unexpected error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
