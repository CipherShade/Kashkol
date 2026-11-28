import { headers } from "next/headers";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { MAX_FILE_SIZE_BYTES } from "@/modules/files";
import { requireStaffSession } from "@/modules/identity/session";
import { billingJson } from "@/modules/billing/http";
import { uploadBillingEvidence } from "@/modules/billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_SIZE_BYTES + 512 * 1024) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.fileSizeInvalid" });
    }
    const formData = await request.formData();
    const upload = formData.get("file");
    if (!(upload instanceof File)) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }
    const body = Buffer.from(await upload.arrayBuffer());
    return billingJson(
      await uploadBillingEvidence(
        scope,
        { body, mime: upload.type, filename: upload.name, sizeBytes: upload.size },
        { requestId, ipHash: null },
      ),
      requestId,
      201,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
