import { NextRequest } from "next/server";
import { processOutboxBatch } from "@/modules/messaging";

export async function POST(req: NextRequest) {
  // Simple worker endpoint for processing outbox
  // In production, this would be called by a separate worker process
  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 10;
    const results = await processOutboxBatch(limit);
    return Response.json({ data: results });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
