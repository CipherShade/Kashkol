import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  updateGroupSchema,
  fieldErrorsFrom,
} from "@/modules/groups/schemas";
import {
  archiveGroup,
  getGroup,
  updateGroup,
} from "@/modules/groups/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const { groupId } = await params;
    const group = await getGroup(scope, groupId);
    return NextResponse.json(group, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { groupId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = updateGroupSchema.safeParse({ ...body, id: groupId });

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

    const updated = await updateGroup(scope, parsed.data, { requestId });
    return NextResponse.json(updated, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const { groupId } = await params;

    const archived = await archiveGroup(scope, groupId, { requestId });
    return NextResponse.json(archived, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
