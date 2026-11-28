import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { releasePlatformBillingReference } from "@/modules/billing";
import { releaseBillingReferenceSchema } from "@/modules/billing/schemas";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

const releaseRequestSchema = releaseBillingReferenceSchema.omit({ submissionId: true });

export async function POST(
  request: Request,
  context: { params: Promise<{ submissionId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const admin = await requirePlatformAdminContext();
    const { submissionId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = releaseRequestSchema.safeParse(body);
    if (!parsed.success) return billingValidationResponse(parsed.error, requestId);
    return billingJson(
      await releasePlatformBillingReference(
        admin,
        { ...parsed.data, submissionId },
        { requestId, ipHash: null },
      ),
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
