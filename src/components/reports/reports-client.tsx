"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { currentTerm, previousTerm, type TermView } from "@/modules/terms/resolution";

type ReportType = "attendance" | "enrollment" | "academics" | "homework" | "payments" | "sessionRevenue";
type ReportFormat = "csv" | "xlsx" | "pdf";
const exportFormats: ReportFormat[] = ["csv", "xlsx", "pdf"];
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

type PeriodChoice = "current" | "custom" | string;

export function ReportsClient({
  availableTypes,
  groups,
  students,
  terms,
  defaultTermId,
  defaultPreviousTermId,
  today,
  defaultFrom,
  defaultTo,
  locale,
}: {
  availableTypes: ReportType[];
  groups: Array<{ id: string; name: string; grade: string | null }>;
  students: Array<{ id: string; name: string; grade: string | null }>;
  terms: TermView[];
  defaultTermId: string | null;
  defaultPreviousTermId: string | null;
  today: string;
  defaultFrom: string;
  defaultTo: string;
  locale: string;
}) {
  const t = useTranslations("Reports");
  const tt = useTranslations("AcademicTerms");
  const [type, setType] = useState<ReportType>(availableTypes[0]);
  const [period, setPeriod] = useState<PeriodChoice>(terms.length > 0 ? "current" : "custom");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [compare, setCompare] = useState(false);
  const [previousResult, setPreviousResult] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "submitting" | "queued" | "processing" | "ready" | "failed"
  >("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);

  function selectedGrade(gId = groupId, sId = studentId): string | null {
    return (
      groups.find((group) => group.id === gId)?.grade ??
      students.find((student) => student.id === sId)?.grade ??
      null
    );
  }

  function resolvedTerm(choice: PeriodChoice = period, gId = groupId, sId = studentId): TermView | null {
    if (choice === "custom") return null;
    if (choice === "current") return currentTerm(terms, today, selectedGrade(gId, sId));
    return terms.find((term) => term.id === choice) ?? null;
  }

  function comparisonTerm(): TermView | null {
    const current = resolvedTerm();
    if (!current) return null;
    if (current.id === defaultTermId && defaultPreviousTermId) {
      const seeded = terms.find((term) => term.id === defaultPreviousTermId);
      if (seeded) return seeded;
    }
    return previousTerm(terms, current, selectedGrade());
  }

  function applyPeriod(choice: PeriodChoice, gId = groupId, sId = studentId) {
    setPeriod(choice);
    const term = resolvedTerm(choice, gId, sId);
    if (term) {
      setFrom(term.startDate);
      setTo(term.endDate);
    } else {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
    setResult(null);
    setPreviousResult(null);
  }

  function params(nextPage: number, range?: { from: string; to: string }) {
    const values = new URLSearchParams({ type });
    const rangeFrom = range?.from ?? from;
    const rangeTo = range?.to ?? to;
    if (rangeFrom) values.set("from", rangeFrom);
    if (rangeTo) values.set("to", rangeTo);
    if (groupId) values.set("groupId", groupId);
    if (studentId) values.set("studentId", studentId);
    values.set("page", String(nextPage));
    values.set("pageSize", "50");
    return values;
  }

  async function fetchReport(range?: { from: string; to: string }): Promise<ReportResult> {
    const response = await fetch(`/api/reports?${params(1, range)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Report could not be loaded");
    return (await response.json()) as ReportResult;
  }

  async function load(nextPage: number) {
    setBusy(true);
    setError(false);
    try {
      const values = params(nextPage);
      const response = await fetch(`/api/reports?${values}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Report could not be loaded");
      setResult(await response.json());
      setPage(nextPage);

      const previous = compare ? comparisonTerm() : null;
      if (previous) {
        try {
          setPreviousResult(await fetchReport({ from: previous.startDate, to: previous.endDate }));
        } catch {
          setPreviousResult(null);
        }
      } else {
        setPreviousResult(null);
      }
    } catch {
      setResult(null);
      setPreviousResult(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function exportParams() {
    const values = new URLSearchParams({ type });
    if (from) values.set("from", from);
    if (to) values.set("to", to);
    if (groupId) values.set("groupId", groupId);
    if (studentId) values.set("studentId", studentId);
    values.set("limit", "5000");
    values.set("locale", locale);
    return values;
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
        body: JSON.stringify({ ...Object.fromEntries(exportParams().entries()), format }),
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
  const previous = compare ? comparisonTerm() : null;
  const numberFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB");
  const delta = result && previousResult ? result.pagination.total - previousResult.pagination.total : null;

  function renderTable(data: ReportResult) {
    return (
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
            {data.items.map((row, index) => (
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
    );
  }

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
                  setPreviousResult(null);
                }}
              >
                {availableTypes.map((option) => (
                  <option key={option} value={option}>{t(`types.${option}`)}</option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("period")}</span>
              <Select value={period} onChange={(event) => applyPeriod(event.currentTarget.value)}>
                {terms.length > 0 ? <option value="current">{t("currentTerm")}</option> : null}
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} · {term.grade ?? tt("allGrades")}
                  </option>
                ))}
                <option value="custom">{t("customRange")}</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("from")}</span>
              <Input
                type="date"
                value={from}
                readOnly={period !== "custom"}
                onChange={(event) => setFrom(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("to")}</span>
              <Input
                type="date"
                value={to}
                readOnly={period !== "custom"}
                onChange={(event) => setTo(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("group")}</span>
              {groups.length > 0 ? (
                <Select
                  value={groupId}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setGroupId(next);
                    if (period !== "custom") applyPeriod(period, next, studentId);
                  }}
                >
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
                <Select
                  value={studentId}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setStudentId(next);
                    if (period !== "custom") applyPeriod(period, groupId, next);
                  }}
                >
                  <option value="">{t("allStudents")}</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </Select>
              ) : (
                <Input value={studentId} onChange={(event) => setStudentId(event.currentTarget.value)} placeholder={t("filterId")} />
              )}
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("format")}</span>
              <Select
                value={format}
                onChange={(event) => setFormat(event.currentTarget.value as ReportFormat)}
              >
                {exportFormats.map((option) => (
                  <option key={option} value={option}>{t(`formats.${option}`)}</option>
                ))}
              </Select>
            </label>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={compare}
                  disabled={!previous}
                  onChange={(event) => setCompare(event.currentTarget.checked)}
                />
                {t("comparePrevious")}
              </label>
              {terms.length === 0 ? <p className="text-xs text-muted-foreground">{t("noTerms")}</p> : null}
            </div>
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
                    : t("export")}
                </Button>
              ) : null}
            </div>
          </form>
          {compare ? <p className="mt-2 text-xs text-muted-foreground">{t("exportScopeHint")}</p> : null}
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
          {t("downloadFile", { format: t(`formats.${format}`) })}
        </a>
      ) : null}
      {exportError ? (
        <div role="alert" className="grid gap-1 text-sm text-destructive">
          <p>{t("exportFailed")}</p>
          {format === "pdf" ? <p>{t("exportPdfFailedHint")}</p> : null}
        </div>
      ) : null}
      {result ? (
        <>
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
                renderTable(result)
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

          {previous && previousResult ? (
            <Card>
              <CardBody>
                <h2 className="mb-2 text-lg font-semibold">
                  {t("comparisonTitle", { term: previous.name })}
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  {t("comparisonRowCount", { count: numberFormat.format(previousResult.pagination.total) })}
                  {delta !== null ? ` · ${t("deltaRows", { count: numberFormat.format(delta) })}` : ""}
                </p>
                {previousResult.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("comparisonEmpty")}</p>
                ) : (
                  renderTable(previousResult)
                )}
              </CardBody>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
