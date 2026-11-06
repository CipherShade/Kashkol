import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { submitFormResponsePublic } from "@/modules/forms/service";
import { findFormDetailByPublicId } from "@/modules/forms/repository";
import { formPublicUploadSchema, submitFormResponseSchema } from "@/modules/forms/schemas";
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
    const body = await request.json();
    const input = submitFormResponseSchema.parse(body);

    const result = await submitFormResponsePublic(formId, input, { requestId });

    return NextResponse.json(result, {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const { formId } = await context.params;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const form = await findFormDetailByPublicId(formId);
  if (!form || form.status !== "published" || !form.acceptingResponses || form.archivedAt) {
    return NextResponse.json({ error: { code: "NOT_FOUND", messageKey: "errors.formNotFound", requestId } }, { status: 404 });
  }

  return NextResponse.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      status: form.status,
      submissionMode: form.submissionMode,
      isPublic: form.isPublic,
      publicSlug: form.publicSlug,
      acceptingResponses: form.acceptingResponses,
      confirmationMessage: form.confirmationMessage ?? null,
      settings: form.settingsJson,
      sections: form.sections,
      questions: form.questions,
      logicRules: form.logicRules,
      createdAt: form.createdAt,
      publishedAt: form.publishedAt,
    },
  });
}
