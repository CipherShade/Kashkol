import { headers } from "next/headers";
import { z } from "zod";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { reviewPlatformBillingSubmission } from "@/modules/billing";
import { reviewBillingSubmissionSchema } from "@/modules/billing/schemas";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

const reviewRequestSchema = reviewBillingSubmissionSchema.extend({
  workspaceId: z.string().uuid(),
});

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
    const parsed = reviewRequestSchema.safeParse(body);
    if (!parsed.success) return billingValidationResponse(parsed.error, requestId);
    const { workspaceId, ...review } = parsed.data;
    return billingJson(
      await reviewPlatformBillingSubmission(admin, workspaceId, submissionId, review, {
        requestId,
        ipHash: null,
      }),
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
