import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { runPlatformBillingCycle } from "@/modules/billing";
import { billingJson } from "@/modules/billing/http";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const admin = await requirePlatformAdminContext();
    return billingJson(await runPlatformBillingCycle(admin), requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
