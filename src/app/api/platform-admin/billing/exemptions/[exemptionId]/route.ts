import { headers } from "next/headers";
import { z } from "zod";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import {
  revokePlatformBillingExemption,
  updatePlatformBillingExemption,
} from "@/modules/billing";
import {
  billingAuditReasonCodeSchema,
  updateBillingExemptionSchema,
} from "@/modules/billing/schemas";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

const mutateSchema = z.discriminatedUnion("operation", [
  updateBillingExemptionSchema.extend({
    operation: z.literal("update"),
    workspaceId: z.string().uuid(),
  }),
  z.object({
    operation: z.literal("revoke"),
    workspaceId: z.string().uuid(),
    reasonCode: billingAuditReasonCodeSchema,
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ exemptionId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const admin = await requirePlatformAdminContext();
    const { exemptionId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = mutateSchema.safeParse(body);
    if (!parsed.success) return billingValidationResponse(parsed.error, requestId);
    const meta = { requestId, ipHash: null };

    if (parsed.data.operation === "revoke") {
      return billingJson(
        await revokePlatformBillingExemption(
          admin,
          parsed.data.workspaceId,
          exemptionId,
          parsed.data.reasonCode,
          meta,
        ),
        requestId,
      );
    }

    if (!parsed.data.workspaceId) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { workspaceId: ["required"] },
      });
    }
    const { operation: _operation, workspaceId, ...input } = parsed.data;
    return billingJson(
      await updatePlatformBillingExemption(admin, workspaceId, exemptionId, input, meta),
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
