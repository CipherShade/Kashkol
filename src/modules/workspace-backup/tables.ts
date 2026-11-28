import { TENANT_TABLES } from "@/lib/db/tenant-tables";

/**
 * Rows a restore keeps from the *live* workspace instead of applying from the
 * archive (ADR-0039, ADR-0043). These tables are still written to the export for
 * portability, but the application role cannot delete or rewrite them: the
 * audit log, collected session receipts, attendance corrections, note history
 * and the job rows that describe the restore itself.
 */
export const RETAINED_TABLES: ReadonlySet<string> = new Set<string>([
  "audit_event",
  "attendance_revision",
  "payment",
  "session_revision",
  "student_note",
  // Published assessment marks are locked by a database trigger; re-inserting
  // them through normal DML is impossible once locked, so the live evidence is
  // retained rather than silently skipped (ADR-0039).
  "assessment",
  "assessment_score",
  "workspace_archive_job",
  // Platform billing is a separate append-only money domain (ADR-0045/0047).
  // A workspace restore must never rewrite activation, exemptions, usage,
  // ledger, invoices, submissions, or review decisions.
  "workspace_billing_state",
  "billing_exemption",
  "billing_usage_snapshot",
  "billing_usage_student",
  "billing_ledger_entry",
  "billing_invoice",
  "billing_invoice_line_item",
  "billing_invoice_credit",
  "billing_payment_submission",
  "billing_review_event",
]);

/** Tables a restore deletes and re-inserts from the archive. */
export const ARCHIVE_TABLES: readonly string[] = TENANT_TABLES.filter(
  (table) => !RETAINED_TABLES.has(table),
);
