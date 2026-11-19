import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getServerEnv } from "@/lib/config/env";
import { requireStudentPortalContext } from "@/modules/identity/session";
import {
  MAX_HOMEWORK_SUBMISSION_FILES,
  submitStudentHomeworkWithFiles,
  type HomeworkFileUpload,
} from "@/modules/portals";

export const dynamic = "force-dynamic";

async function readUploads(request: Request): Promise<HomeworkFileUpload[]> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return [];

  const form = await request.formData();
  const entries = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (entries.length > MAX_HOMEWORK_SUBMISSION_FILES) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.homeworkSubmissionFileLimit",
      fields: { files: ["tooMany"] },
    });
  }

  return Promise.all(
    entries.map(async (entry) => ({
      filename: entry.name,
      mime: entry.type,
      sizeBytes: entry.size,
      body: Buffer.from(await entry.arrayBuffer()),
    })),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ homeworkId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);

    const portal = await requireStudentPortalContext();
    const { homeworkId } = await params;
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const uploads = await readUploads(request);

    const submission = await submitStudentHomeworkWithFiles(
      portal,
      homeworkId,
      studentId,
      uploads,
      new Date(),
      requestId,
    );
    return NextResponse.json(
      { submission },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
