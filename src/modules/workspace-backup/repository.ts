import { Prisma } from "@/generated/prisma/client";
import { TENANT_TABLES } from "@/lib/db/tenant-tables";
import { withScope } from "@/lib/db/scope";
import type { ForeignKeyEdge } from "./topology";
import { parentGuards, topologicalOrder } from "./topology";
import { ARCHIVE_TABLES, RETAINED_TABLES } from "./tables";

type Tx = Prisma.TransactionClient;

type CatalogEdge = {
  child: string;
  parent: string;
  child_columns: string[];
  parent_columns: string[];
};

export { ARCHIVE_TABLES, RETAINED_TABLES };

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Every registered tenant row, read through the caller's tenant transaction. */
export async function loadTenantRowsTx(
  tx: Tx,
  workspaceId: string,
): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {};
  for (const table of TENANT_TABLES) {
    const identifier = Prisma.raw(quote(table));
    const rows = await tx.$queryRaw<{ row: unknown }[]>(
      Prisma.sql`SELECT row_to_json(t) AS row FROM ${identifier} t WHERE workspace_id = ${workspaceId}::uuid`,
    );
    result[table] = rows.map((entry) => entry.row);
  }
  return result;
}

/** Foreign keys between registered tenant tables, read from the catalog. */
export async function getForeignKeysTx(tx: Tx): Promise<ForeignKeyEdge[]> {
  const tables = [...TENANT_TABLES];
  const rows = await tx.$queryRaw<CatalogEdge[]>(
    Prisma.sql`
      SELECT c.conrelid::regclass::text AS child,
             c.confrelid::regclass::text AS parent,
             array_agg(ac.attname ORDER BY k.ord)::text[] AS child_columns,
             array_agg(ap.attname ORDER BY k.ord)::text[] AS parent_columns
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY
        AS k(child_att, parent_att, ord)
      JOIN pg_attribute ac ON ac.attrelid = c.conrelid AND ac.attnum = k.child_att
      JOIN pg_attribute ap ON ap.attrelid = c.confrelid AND ap.attnum = k.parent_att
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND replace(c.conrelid::regclass::text, '\"', '') = ANY(${tables}::text[])
        AND replace(c.confrelid::regclass::text, '\"', '') = ANY(${tables}::text[])
      GROUP BY c.conrelid, c.confrelid
    `,
  );
  // `regclass::text` quotes reserved identifiers such as "group"; the tenant
  // registry uses bare names. Normalise once here so the FK graph is complete.
  const bare = (name: string) => name.replace(/^"|"$/g, "");
  return rows.map((row) => ({
    child: bare(row.child),
    parent: bare(row.parent),
    childColumns: row.child_columns,
    parentColumns: row.parent_columns,
  }));
}

/** Column names for each tenant table, used by pre-flight row-shape validation. */
export async function getTableColumnsTx(tx: Tx): Promise<Record<string, string[]>> {
  const tables = [...TENANT_TABLES];
  const rows = await tx.$queryRaw<{ table_name: string; column_name: string }[]>(
    Prisma.sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${tables}::text[])
      ORDER BY table_name, ordinal_position
    `,
  );
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    (result[row.table_name] ??= []).push(row.column_name);
  }
  return result;
}

/** Delete mutable rows, keeping every row referenced by retained history. */
export async function clearMutableRowsTx(
  tx: Tx,
  workspaceId: string,
  edges: readonly ForeignKeyEdge[],
): Promise<void> {
  const order = topologicalOrder([...ARCHIVE_TABLES], edges).reverse();
  for (const table of order) {
    if (RETAINED_TABLES.has(table)) continue;
    const guards = parentGuards(table, edges, new Set<string>(TENANT_TABLES))
      .map((edge) => {
        const comparison = edge.childColumns
          .map(
            (column, index) =>
              `g.${quote(column)} = t.${quote(edge.parentColumns[index] ?? column)}`,
          )
          .join(" AND ");
        return `NOT EXISTS (SELECT 1 FROM ${quote(edge.child)} g WHERE ${comparison})`;
      })
      .join(" AND ");
    const sql = `DELETE FROM ${quote(table)} t WHERE t.workspace_id = $1::uuid${
      guards ? ` AND ${guards}` : ""
    }`;
    await tx.$executeRawUnsafe(sql, workspaceId);
  }
}

/** Insert archived rows parent-first; conflicts are counted, never hidden. */
export async function insertArchivedRowsTx(
  tx: Tx,
  rows: Record<string, unknown[]>,
  edges: readonly ForeignKeyEdge[],
): Promise<Record<string, number>> {
  const order = topologicalOrder([...ARCHIVE_TABLES], edges);
  const applied: Record<string, number> = {};
  for (const table of order) {
    const archived = rows[table] ?? [];
    if (archived.length === 0) continue;
    const identifier = quote(table);
    const sql = `INSERT INTO ${identifier}
      SELECT * FROM jsonb_populate_recordset(NULL::${identifier}, $1::jsonb)
      ON CONFLICT DO NOTHING`;
    applied[table] = await tx.$executeRawUnsafe(sql, JSON.stringify(archived));
  }
  return applied;
}

export async function countTenantRowsTx(
  tx: Tx,
  workspaceId: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of ARCHIVE_TABLES) {
    const rows = await tx.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*)::bigint AS count FROM ${Prisma.raw(quote(table))} WHERE workspace_id = ${workspaceId}::uuid`,
    );
    result[table] = Number(rows[0]?.count ?? 0);
  }
  return result;
}

/** Tenant-scoped orphan scan; any result aborts the restore transaction. */
export async function findOrphansTx(
  tx: Tx,
  workspaceId: string,
  edges: readonly ForeignKeyEdge[],
): Promise<string[]> {
  const known = new Set<string>(ARCHIVE_TABLES);
  const problems: string[] = [];
  for (const edge of edges) {
    if (
      edge.child === edge.parent ||
      !known.has(edge.child) ||
      !known.has(edge.parent)
    ) {
      continue;
    }
    const join = edge.childColumns
      .map(
        (column, index) =>
          `c.${quote(column)} = p.${quote(edge.parentColumns[index] ?? column)}`,
      )
      .join(" AND ");
    // A composite FK with any NULL child column is not enforced by PostgreSQL
    // (MATCH SIMPLE), so only fully populated references can be orphans.
    const childPresent = edge.childColumns
      .map((column) => `c.${quote(column)} IS NOT NULL`)
      .join(" AND ");
    const parentMissing = edge.parentColumns
      .map((column) => `p.${quote(column)} IS NULL`)
      .join(" AND ");
    const sql = `SELECT count(*)::bigint AS count FROM ${quote(edge.child)} c
      LEFT JOIN ${quote(edge.parent)} p ON ${join}
      WHERE c.workspace_id = $1::uuid AND (${childPresent}) AND (${parentMissing})`;
    const rows = await tx.$queryRawUnsafe<{ count: bigint }[]>(sql, workspaceId);
    if (Number(rows[0]?.count ?? 0) > 0) problems.push(edge.child);
  }
  return [...new Set(problems)];
}

// ---------------------------------------------------------------------------
// Job persistence
// ---------------------------------------------------------------------------

export type ArchiveJobInput = {
  id: string;
  workspaceId: string;
  kind: "backup" | "restore";
  requestedBy: string;
  storageKey: string;
  schemaVersion: string;
  preview?: unknown;
};

export async function createArchiveJobTx(tx: Tx, input: ArchiveJobInput) {
  return tx.workspaceArchiveJob.create({
    data: {
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      requestedBy: input.requestedBy,
      storageKey: input.storageKey,
      schemaVersion: input.schemaVersion,
      ...(input.preview ? { preview: input.preview as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function findArchiveJob(
  workspaceId: string,
  jobId: string,
) {
  return withScope({ workspaceId }, (tx) =>
    tx.workspaceArchiveJob.findFirst({
      where: { workspaceId, id: jobId },
    }),
  );
}

export async function findArchiveJobTx(tx: Tx, workspaceId: string, jobId: string) {
  return tx.workspaceArchiveJob.findFirst({ where: { workspaceId, id: jobId } });
}

export async function claimArchiveJobTx(
  tx: Tx,
  workspaceId: string,
  limit: number,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "workspace_archive_job"
    WHERE "workspace_id" = ${workspaceId}::uuid
      AND ("status" = 'queued'
        OR ("status" = 'processing' AND "locked_at" < NOW() - INTERVAL '5 minutes'))
    ORDER BY "created_at"
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
  for (const row of rows) {
    await tx.workspaceArchiveJob.update({
      where: { workspaceId_id: { workspaceId, id: row.id } },
      data: { status: "processing", lockedAt: new Date(), attempts: { increment: 1 } },
    });
  }
  return rows.map((row) => row.id);
}

export async function completeArchiveJobTx(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  input: { storageKey?: string; result: unknown },
) {
  return tx.workspaceArchiveJob.updateMany({
    where: { workspaceId, id: jobId, status: "processing" },
    data: {
      status: "succeeded",
      ...(input.storageKey ? { storageKey: input.storageKey } : {}),
      result: input.result as Prisma.InputJsonValue,
      completedAt: new Date(),
      lockedAt: null,
      failureCode: null,
    },
  });
}

export async function failArchiveJobTx(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  failureCode: string,
) {
  return tx.workspaceArchiveJob.updateMany({
    where: { workspaceId, id: jobId, status: "processing" },
    data: {
      status: "failed",
      failureCode,
      completedAt: new Date(),
      lockedAt: null,
    },
  });
}

export async function isWorkspaceOwnerTx(
  tx: Tx,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const member = await tx.workspaceMember.findFirst({
    where: { workspaceId, userId, role: "owner", status: "active", removedAt: null },
    select: { id: true },
  });
  return member !== null;
}

export async function findOwnerEmailTx(tx: Tx, workspaceId: string): Promise<string | null> {
  const member = await tx.workspaceMember.findFirst({
    where: { workspaceId, role: "owner", status: "active", removedAt: null },
    select: { user: { select: { email: true } } },
  });
  return member?.user.email ?? null;
}
