interface ApiErrorPayload {
  error?: {
    messageKey?: unknown;
  };
}

/**
 * Reads the stable `error.messageKey` from an API failure without ever
 * touching the raw database message or a stack trace.
 *
 * This module has no React dependency so it can be unit tested directly.
 */
export async function readErrorMessageKey(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as ApiErrorPayload;
    const key = body.error?.messageKey;
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}
