import { getAuth } from "@/lib/auth/auth";
import { sanitizeAuthResponse } from "@/lib/auth/response";

export const dynamic = "force-dynamic";

/**
 * The Better Auth handler, wrapped so a JSON auth response never carries the
 * session token. The token remains in the HttpOnly cookie set by the library.
 */
async function handle(request: Request): Promise<Response> {
  return sanitizeAuthResponse(await getAuth().handler(request));
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
