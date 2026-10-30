import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { studentQuerySchema } from "@/modules/students/schemas";
import { exportStudents } from "@/modules/students/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const { scope } = await requireStaffSession();
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";

    const rawParams = Object.fromEntries(url.searchParams.entries());
    const parsed = studentQuerySchema.safeParse(rawParams);

    const buffer = await exportStudents(
      scope,
      parsed.success
        ? parsed.data
        : {
            showArchived: false,
            page: 1,
            pageSize: 5000,
            status: "all",
            sortBy: "name",
            sortOrder: "asc",
          },
      format,
      locale,
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename =
      locale === "ar"
        ? `kashkol-students-${dateStr}.${format}`
        : `kashkol-students-${dateStr}.${format}`;

    const mime =
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": mime,
        "content-disposition": `attachment; filename="${filename}"`,
        "x-request-id": requestId,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
