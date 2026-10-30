import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { firstForwardedIp } from "@/lib/http/csrf";
import { newRequestId } from "@/lib/http/request-id";
import { hashIp } from "@/modules/identity/hash";

export type ActionRequestContext = {
  requestId: string;
  ipHash: string | null;
};

/**
 * Build the audit context for a server action. The request id comes from the
 * proxy when present; the IP is stored only as a keyed hash.
 */
export async function actionRequestContext(): Promise<ActionRequestContext> {
  const requestHeaders = await headers();
  const env = getServerEnv();
  return {
    requestId: requestHeaders.get("x-request-id") ?? newRequestId(),
    ipHash: hashIp(firstForwardedIp(requestHeaders), env.BETTER_AUTH_SECRET),
  };
}
