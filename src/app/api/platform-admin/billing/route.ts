import { localeFromHeader } from "@/i18n/request";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getPlatformBillingOverview } from "@/modules/billing";
import { billingAdminQuerySchema } from "@/modules/billing/schemas";
import { billingJson, billingValidationResponse } from "@/modules/billing/http";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  const locale = localeFromHeader(request.headers.get("accept-language"));
  try {
    const admin = await requirePlatformAdminContext();
    const query = billingAdminQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!query.success) return billingValidationResponse(query.error, requestId);
    return billingJson(
      await getPlatformBillingOverview(admin, query.data, locale),
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
