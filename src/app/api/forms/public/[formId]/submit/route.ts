import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { assertRateLimit } from "@/lib/http/rate-limit";
import { getClientIp } from "@/lib/http/rate-limit";
import { submitFormResponsePublic } from "@/modules/forms/service";
import { findFormDetailByPublicId } from "@/modules/forms/repository";
import { formPublicSubmissionSchema } from "@/modules/forms/schemas";

export const dynamic = "force-dynamic";

function notFound(requestId: string) {
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        messageKey: "errors.formNotFound",
        requestId,
      },
    },
    { status: 404, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();

  try {
    const { formId } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }

    const parsed = formPublicSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: parsed.error.flatten().fieldErrors,
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    // Rate-limit public submissions per form + client IP.
    const ip = getClientIp(request);
    assertRateLimit(`public_submit:${formId}:${ip}`, 10, 60_000);

    const result = await submitFormResponsePublic(formId, parsed.data, { requestId });

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
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();

  try {
    const { formId } = await context.params;
    const form = await findFormDetailByPublicId(formId);
    if (
      !form ||
      !form.isPublic ||
      form.status !== "published" ||
      !form.acceptingResponses ||
      form.archivedAt
    ) {
      return notFound(requestId);
    }

    return NextResponse.json(
      {
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
      },
      {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
