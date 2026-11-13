"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";

type ReportType = "attendance" | "enrollment" | "academics" | "homework" | "payments" | "sessionRevenue";
type ReportResult = {
  type: ReportType;
  items: Array<Record<string, string | number | null>>;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

const columns: Record<ReportType, string[]> = {
  attendance: ["date", "group", "student", "attendance", "sessionStatus"],
  enrollment: ["student", "group", "enrolledOn", "leftOn"],
  academics: ["date", "group", "student", "assessment", "score", "maximum", "status"],
  homework: ["dueDate", "group", "student", "homework", "status", "updatedAt"],
  payments: [
    "date",
    "student",
    "kind",
    "amountEgp",
    "period",
    "purpose",
    "method",
    "referenceNumber",
    "reason",
    "balanceImpactEgp",
    "status",
  ],
  sessionRevenue: [
    "date",
    "group",
    "priceEgp",
    "attended",
    "expectedEgp",
    "collectedEgp",
  ],
};

export function ReportsClient({
  availableTypes,
  groups,
  students,
  defaultFrom,
  defaultTo,
  locale,
}: {
  availableTypes: ReportType[];
  groups: Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string }>;
  defaultFrom: string;
  defaultTo: string;
  locale: string;
}) {
  const t = useTranslations("Reports");
  const [type, setType] = useState<ReportType>(availableTypes[0]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "submitting" | "queued" | "processing" | "ready" | "failed"
  >("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);

  function params(nextPage: number, exportLimit?: boolean) {
    const values = new URLSearchParams({ type });
    if (from) values.set("from", from);
    if (to) values.set("to", to);
    if (groupId) values.set("groupId", groupId);
    if (studentId) values.set("studentId", studentId);
    if (exportLimit) {
      values.set("limit", "5000");
      values.set("locale", locale);
    } else {
      values.set("page", String(nextPage));
      values.set("pageSize", "50");
    }
    return values;
  }

  async function load(nextPage: number) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/reports?${params(nextPage)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Report could not be loaded");
      setResult(await response.json());
      setPage(nextPage);
    } catch {
      setResult(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function startExport() {
    setExportStatus("submitting");
    setExportError(false);
    setDownloadUrl(null);
    setExportJobId(null);
    try {
      const response = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(params(1, true).entries())),
      });
      if (!response.ok) throw new Error("Export request failed");
      const payload: { data: { id: string; status: "queued" } } = await response.json();
      setExportJobId(payload.data.id);
      setExportStatus(payload.data.status);
    } catch {
      setExportStatus("failed");
      setExportError(true);
    }
  }

  useEffect(() => {
    if (!exportJobId || !["queued", "processing"].includes(exportStatus)) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/reports/exports/${exportJobId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Export status could not be loaded");
        const payload: {
          data: {
            status: "queued" | "processing" | "ready" | "failed";
            downloadUrl: string | null;
          };
        } = await response.json();
        if (!active) return;
        setExportStatus(payload.data.status);
        setDownloadUrl(payload.data.downloadUrl);
        if (payload.data.status === "failed") setExportError(true);
        if (payload.data.status === "queued" || payload.data.status === "processing") {
          timeout = setTimeout(poll, 2000);
        }
      } catch {
        if (active) {
          setExportStatus("failed");
          setExportError(true);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [exportJobId, exportStatus]);

  const fields = columns[type];

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              void load(1);
            }}
          >
            <label className="grid gap-1 text-sm">
              <span>{t("reportType")}</span>
              <Select
                value={type}
                onChange={(event) => {
                  setType(event.currentTarget.value as ReportType);
                  setResult(null);
                }}
              >
                {availableTypes.map((option) => (
                  <option key={option} value={option}>{t(`types.${option}`)}</option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("from")}</span>
              <Input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("to")}</span>
              <Input type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("group")}</span>
              {groups.length > 0 ? (
                <Select value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)}>
                  <option value="">{t("allGroups")}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </Select>
              ) : (
                <Input value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)} placeholder={t("filterId")} />
              )}
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("student")}</span>
              {students.length > 0 ? (
                <Select value={studentId} onChange={(event) => setStudentId(event.currentTarget.value)}>
                  <option value="">{t("allStudents")}</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </Select>
              ) : (
                <Input value={studentId} onChange={(event) => setStudentId(event.currentTarget.value)} placeholder={t("filterId")} />
              )}
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={busy}>{busy ? t("loading") : t("runReport")}</Button>
              {result ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={exportStatus === "submitting" || exportStatus === "queued" || exportStatus === "processing"}
                  onClick={() => void startExport()}
                >
                  {exportStatus === "submitting" || exportStatus === "queued" || exportStatus === "processing"
                    ? t("exportPreparing")
                    : t("exportCsv")}
                </Button>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      {error ? <p role="alert" className="text-sm text-destructive">{t("requestError")}</p> : null}
      {exportStatus === "queued" || exportStatus === "processing" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t(`exportStates.${exportStatus}`)}
        </p>
      ) : null}
      {exportStatus === "ready" && downloadUrl ? (
        <a className="ui-button" data-variant="secondary" href={downloadUrl}>
          {t("exportDownload")}
        </a>
      ) : null}
      {exportError ? (
        <p role="alert" className="text-sm text-destructive">{t("exportFailed")}</p>
      ) : null}
      {result ? (
        <Card>
          <CardBody>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t(`types.${type}`)}</h2>
              <p className="text-sm text-muted-foreground">
                {t("rowCount", { count: result.pagination.total })}
              </p>
            </div>
            {result.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr>
                      {fields.map((field) => (
                        <th key={field} className="p-2 text-start">{t(`columns.${field}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((row, index) => (
                      <tr key={`${index}-${String(row.student ?? row.group ?? "")}`} className="border-t border-border">
                        {fields.map((field) => (
                          <td key={field} className="max-w-64 p-2 align-top">
                            {row[field] === null || row[field] === "" ? "—" : String(row[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.pagination.pageCount > 1 ? (
              <nav className="mt-4 flex items-center justify-between" aria-label={t("pagination")}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1 || busy}
                  onClick={() => void load(page - 1)}
                >
                  {t("previous")}
                </Button>
                <span className="text-sm">{t("pageOf", { page, pageCount: result.pagination.pageCount })}</span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= result.pagination.pageCount || busy}
                  onClick={() => void load(page + 1)}
                >
                  {t("next")}
                </Button>
              </nav>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
