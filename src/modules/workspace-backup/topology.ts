/**
 * FK ordering helpers for workspace restore (ADR-0039).
 *
 * The graph comes from PostgreSQL's own catalog, so a new tenant table with a
 * foreign key is ordered correctly without editing a hand-maintained list.
 * Self-references are ignored: a row never depends on itself being inserted
 * before it exists.
 */
export type ForeignKeyEdge = {
  child: string;
  parent: string;
  childColumns: readonly string[];
  parentColumns: readonly string[];
};

export function topologicalOrder(
  tables: readonly string[],
  edges: readonly ForeignKeyEdge[],
): string[] {
  const known = new Set(tables);
  const indegree = new Map(tables.map((table) => [table, 0]));
  const children = new Map(tables.map((table) => [table, [] as string[]]));

  for (const edge of edges) {
    if (
      edge.child === edge.parent ||
      !known.has(edge.child) ||
      !known.has(edge.parent) ||
      edge.childColumns.length !== edge.parentColumns.length ||
      edge.childColumns.length === 0
    ) {
      continue;
    }
    children.get(edge.parent)?.push(edge.child);
    indegree.set(edge.child, (indegree.get(edge.child) ?? 0) + 1);
  }

  const queue = tables.filter((table) => (indegree.get(table) ?? 0) === 0);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const table = queue.shift() as string;
    ordered.push(table);
    for (const child of children.get(table) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (ordered.length !== tables.length) {
    throw new Error("WORKSPACE_ARCHIVE_FK_CYCLE");
  }
  return ordered;
}

/**
 * Foreign keys from tables that a restore retains. A mutable parent row that
 * one of these rows points at must not be deleted, or the restore would break
 * append-only financial and attendance evidence.
 */
export function retainedParentGuards(
  table: string,
  edges: readonly ForeignKeyEdge[],
  retainedTables: ReadonlySet<string>,
): ForeignKeyEdge[] {
  return edges.filter(
    (edge) =>
      edge.parent === table &&
      edge.child !== table &&
      retainedTables.has(edge.child),
  );
}

/**
 * Every child that could still hold a reference when the parent is deleted.
 *
 * A mutable child is normally deleted first, but a row pinned by append-only
 * history survives; guarding all children makes that case safe without
 * changing the child-first order.
 */
export function parentGuards(
  table: string,
  edges: readonly ForeignKeyEdge[],
  tenantTables: ReadonlySet<string>,
): ForeignKeyEdge[] {
  return edges.filter(
    (edge) =>
      edge.parent === table &&
      edge.child !== table &&
      tenantTables.has(edge.child),
  );
}
