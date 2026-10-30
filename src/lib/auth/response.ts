/**
 * Better Auth's HTTP sign-in response includes the session token in its JSON
 * body, because the library supports non-cookie clients. Kashkol does not: the
 * token must live only in the HttpOnly cookie. This wrapper removes every
 * session token field from a JSON auth response while preserving the
 * `Set-Cookie` headers and the status code.
 */

const TOKEN_KEYS = new Set(["token", "sessionToken", "accessToken", "refreshToken", "idToken"]);

function strip(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = strip(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: next, changed };
  }
  if (!value || typeof value !== "object") return { value, changed: false };

  let changed = false;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (TOKEN_KEYS.has(key)) {
      changed = true;
      continue;
    }
    const result = strip(child);
    changed ||= result.changed;
    output[key] = result.value;
  }
  return { value: output, changed };
}

export async function sanitizeAuthResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  if (response.status === 204 || response.status === 205) return response;

  // Read a clone: if the body has no token we must return the original
  // response with its stream still usable.
  let parsed: unknown;
  try {
    parsed = await response.clone().json();
  } catch {
    return response;
  }

  const result = strip(parsed);
  if (!result.changed) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return Response.json(result.value, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
