import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { searchFieldErrors, searchQuerySchema } from "@/modules/search/schemas";
import { searchWorkspace } from "@/modules/search/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const url = new URL(request.url);
    const parsed = searchQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: searchFieldErrors(parsed.error),
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const data = await searchWorkspace(scope, parsed.data);
    return NextResponse.json(data, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
