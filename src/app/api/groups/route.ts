import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStaffSession } from "@/modules/identity/session";
import {
  createGroupSchema,
  groupQuerySchema,
  fieldErrorsFrom,
} from "@/modules/groups/schemas";
import {
  checkGroupSlotConflicts,
  createGroup,
  getGroups,
} from "@/modules/groups/service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    const parsed = groupQuerySchema.safeParse(rawParams);

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

    const groups = await getGroups(scope, parsed.data);
    return NextResponse.json(groups, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const { scope } = await requireStaffSession();
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = createGroupSchema.safeParse(body);

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

    // Check slot conflicts
    const ignoreConflicts = body.ignoreConflicts === true;
    if (!ignoreConflicts) {
      const conflicts = await checkGroupSlotConflicts(scope, {
        weekday: parsed.data.weekday,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime ?? null,
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            conflictWarning: true,
            conflicts,
          },
          { status: 200, headers: { "x-request-id": requestId } },
        );
      }
    }

    const group = await createGroup(scope, parsed.data, { requestId });
    return NextResponse.json(
      { conflictWarning: false, group },
      { status: 201, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
