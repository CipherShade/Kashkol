import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getStudentImportTemplate } from "@/modules/students/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";

    const buffer = await getStudentImportTemplate(format, locale);

    const filename =
      locale === "ar"
        ? `kashkol-students-template.${format}`
        : `kashkol-students-template.${format}`;

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
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
