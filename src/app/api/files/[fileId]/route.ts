import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse, AppError } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { requireStaffSession } from "@/modules/identity/session";
import {
  archiveMaterial,
  archiveMaterialSchema,
  deleteMaterial,
  updateMaterial,
  updateMaterialSchema,
} from "@/modules/files";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { fileId } = await context.params;
    const body = await request.json();
    const archived = archiveMaterialSchema.safeParse(body);
    if (archived.success) {
      return NextResponse.json(await archiveMaterial(scope, fileId, archived.data.archived, { requestId }), {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      });
    }
    const parsed = updateMaterialSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              messageKey: "errors.validationFailed",
              fields: fieldErrorsFrom(parsed.error),
              requestId,
            },
          },
          { status: 422, headers: { "x-request-id": requestId } },
        );
      }
      throw new AppError("VALIDATION_FAILED");
    }
    return NextResponse.json(await updateMaterial(scope, fileId, parsed.data, { requestId }), {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const { fileId } = await context.params;
    await deleteMaterial(scope, fileId, { requestId });
    return new NextResponse(null, {
      status: 204,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
