/**
 * Audit diff redaction (`ARCHITECTURE.md` §11.2 A3/A4, `F-P0-07` AC-7).
 *
 * An audit event records *what changed*, never a credential, a token, a free
 * text body, or an unnecessary personal identifier. The redactor is a deny
 * list plus bounded output: unknown future keys are kept only if they are not
 * sensitive, and no value can exceed 200 characters.
 */

const SENSITIVE_KEY =
  /(password|passwd|secret|token|hash|authorization|cookie|session|body|note|message|content|file|email|phone|otp|code|reason)/i;

const MAX_DEPTH = 4;
const MAX_ARRAY = 50;
const MAX_STRING = 200;

export function redactDiff(value: unknown): unknown {
  return redact(value, 0, new WeakSet<object>());
}

function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (typeof value !== "object") return undefined;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const redacted = redact(child, depth + 1, seen);
    if (redacted !== undefined) output[key] = redacted;
  }
  return output;
}

/** True when a key is one the redactor removes. Exposed for the audit test. */
export function isSensitiveAuditKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}
