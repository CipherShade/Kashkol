"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Format = "csv" | "xlsx" | "pdf";

export function ParentPerformanceReportClient({
  studentId,
  from,
  to,
  locale,
}: {
  studentId: string;
  from?: string;
  to?: string;
  locale: "ar" | "en";
}) {
  const t = useTranslations("Performance.parent");
  const errors = useTranslations("errors");
  const [busy, setBusy] = useState<Format | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = new URLSearchParams({
    studentId,
    locale,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  function errorLabel(key: string | undefined): string {
    if (key === "Performance.errors.parentGradesHidden") return t("noAccess");
    if (key === "errors.pdfRendererNotConfigured") return errors("pdfRendererNotConfigured");
    if (key === "errors.pdfRendererFailed") return errors("pdfRendererFailed");
    return t("noReport");
  }

  async function download(format: Format) {
    setBusy(format);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/portal/parent/performance?${query.toString()}&format=${format}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { messageKey?: string };
        } | null;
        setMessage(errorLabel(body?.error?.messageKey));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `performance-report-${studentId}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage(t("noReport"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={busy !== null} onClick={() => void download("csv")}>
          {busy === "csv" ? t("apply") : t("exportCsv")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void download("xlsx")}>
          {busy === "xlsx" ? t("apply") : t("exportXlsx")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void download("pdf")}>
          {busy === "pdf" ? t("apply") : t("exportPdf")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("publishedOnly")}</p>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
