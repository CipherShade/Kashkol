import { redactDiff } from "@/modules/audit/redact";

/**
 * Platform audit diffs use the same deny-list redactor as tenant audit diffs.
 * A typed "stated reason" is required by `F-P3-03`, but it must not become a
 * place to persist a student name, phone number, or free-text note in an audit
 * diff. The operator-facing `platform_audit_event.reason` column remains the
 * explicit reason ticket; only the structured diff is redacted.
 */
export function redactedPlatformDiff(value: unknown): unknown {
  return redactDiff(value);
}
