import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { localeFromHeader } from "@/i18n/request";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  billingQuerySchema,
  createBillingSubmissionSchema,
} from "@/modules/billing/schemas";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { getTeacherBilling, submitBillingPayment } from "@/modules/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  const locale = localeFromHeader(request.headers.get("accept-language"));
  try {
    const { scope } = await requireStaffSession();
    const query = billingQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!query.success) return billingValidationResponse(query.error, requestId);
    return billingJson(
      await getTeacherBilling(scope, query.data, new Date(), locale),
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  const locale = localeFromHeader(request.headers.get("accept-language"));
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const body = await request.json().catch(() => null);
    const parsed = createBillingSubmissionSchema.safeParse(body);
    if (!parsed.success) return billingValidationResponse(parsed.error, requestId);
    return billingJson(
      await submitBillingPayment(
        scope,
        parsed.data,
        { requestId, ipHash: null },
        new Date(),
        locale,
      ),
      requestId,
      201,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
