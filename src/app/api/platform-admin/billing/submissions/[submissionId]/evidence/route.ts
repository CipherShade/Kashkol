import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { billingValidationResponse } from "@/modules/billing/http";
import { billingEvidenceQuerySchema } from "@/modules/billing/schemas";
import { getPlatformBillingEvidenceDownload } from "@/modules/billing";
import { requirePlatformAdminContext } from "@/modules/platform-admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ submissionId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const admin = await requirePlatformAdminContext();
    const query = billingEvidenceQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!query.success) return billingValidationResponse(query.error, requestId);
    const { submissionId } = await context.params;
    const download = await getPlatformBillingEvidenceDownload(
      admin,
      query.data,
      submissionId,
      { requestId, ipHash: null },
    );
    return new NextResponse(new Uint8Array(download.bytes), {
      headers: {
        "content-type": download.contentType,
        "content-length": String(download.bytes.byteLength),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
