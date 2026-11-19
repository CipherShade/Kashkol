import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { fieldErrorsFrom, updateTermSchema } from "@/modules/terms/schemas";
import { deleteTerm, getTerm, updateTerm } from "@/modules/terms/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

type RouteContext = { params: Promise<{ termId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const { termId } = await params;
    const term = await getTerm(scope, termId);
    return NextResponse.json(term, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { termId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = updateTermSchema.safeParse(body);
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

    const term = await updateTerm(scope, termId, parsed.data, { requestId });
    return NextResponse.json(term, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { termId } = await params;
    await deleteTerm(scope, termId, { requestId });
    return new NextResponse(null, {
      status: 204,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
