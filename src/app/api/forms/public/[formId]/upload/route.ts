import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { findFormDetailByPublicId } from "@/modules/forms/repository";
import { getFileStorageAdapter, getMalwareScanAdapter } from "@/modules/files/adapters";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { cookies } from "next/headers";
import { crypto } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const { formId } = await context.params;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const form = await findFormDetailByPublicId(formId);
    if (!form || form.status !== "published" || !form.acceptingResponses) {
      return NextResponse.json({ error: { code: "NOT_FOUND", messageKey: "errors.formNotFound", requestId } }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const questionId = formData.get("questionId") as string | null;

    if (!file || !questionId) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", messageKey: "errors.fileRequired", requestId } }, { status: 422 });
    }

    // Validate question belongs to form
    if (!form.questions.some((q) => q.id === questionId && q.questionType === "file_upload")) {
      return NextResponse.json({ error: { code: "VALIDATION_FAILED", messageKey: "errors.formUnknownQuestion", requestId } }, { status: 422 });
    }

    // Sync malware scan
    const buffer = Buffer.from(await file.arrayBuffer());
    const scanResult = await getMalwareScanAdapter().scan(buffer);
    if (!scanResult.clean) {
      return NextResponse.json({ error: { code: "FORBIDDEN", messageKey: "errors.fileNotScanned", requestId } }, { status: 403 });
    }

    // Store file
    const fileId = newUuidV7();
    const extension = file.name.split(".").pop() ?? "bin";
    const storageKey = `ws/${form.workspaceId}/${fileId}.${extension}`;
    const storage = getFileStorageAdapter();
    await storage.put({ key: storageKey, body: buffer, contentType: file.type });

    // Create provenance record
    await withScope({ workspaceId: form.workspaceId }, async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          workspaceId: form.workspaceId,
          scope: "form_upload",
          title: file.name,
          storageKey,
          sizeBytes: file.size,
          mime: file.type,
          scanStatus: "clean",
          uploadedBy: "system",
        },
      });

      await tx.formUpload.create({
        data: {
          id: newUuidV7(),
          workspaceId: form.workspaceId,
          formId,
          questionId,
          fileId,
          uploadSessionHash: "session-hash-placeholder",
        },
      });
    });

    return NextResponse.json({ fileId }, { status: 201 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
