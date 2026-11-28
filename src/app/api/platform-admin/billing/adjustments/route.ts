import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { createPlatformBillingAdjustment } from "@/modules/billing";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { createBillingAdjustmentSchema } from "@/modules/billing/schemas";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const admin = await requirePlatformAdminContext();
    const body = await request.json().catch(() => null);
    const parsed = createBillingAdjustmentSchema.safeParse(body);
    if (!parsed.success) return billingValidationResponse(parsed.error, requestId);
    return billingJson(
      await createPlatformBillingAdjustment(admin, parsed.data, {
        requestId,
        ipHash: null,
      }),
      requestId,
      201,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
