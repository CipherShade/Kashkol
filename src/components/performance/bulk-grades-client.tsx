"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/form";
import { formatPerformanceDate } from "./performance-format";

type GroupOption = { id: string; name: string };

type FormData = {
  group: { id: string; name: string; subjectName: string | null };
  students: Array<{ id: string; name: string }>;
  assessments: Array<{
    id: string;
    title: string;
    date: string;
    type: string;
    maxScore: number;
    extraCreditAllowance: number | null;
    lockedAt: string | null;
    scores: Array<{ studentId: string; score: number | null; status: string; note: string | null }>;
  }>;
};

type GradeRow = { status: string; score: string; note: string };

type SubmitResult = {
  savedCount: number;
  skippedCount: number;
  results: Array<{ studentId: string; outcome: string; reasonKey?: string }>;
};

function rowsFromAssessment(data: FormData | null, assessmentId: string): Record<string, GradeRow> {
  const rows: Record<string, GradeRow> = {};
  if (!data) return rows;
  const assessment = data.assessments.find((item) => item.id === assessmentId);
  for (const student of data.students) {
    const existing = assessment?.scores.find((score) => score.studentId === student.id);
    rows[student.id] = {
      status: existing?.status ?? "graded",
      score: existing?.score === null || existing?.score === undefined ? "" : String(existing.score),
      note: existing?.note ?? "",
    };
  }
  return rows;
}

export function BulkGradesClient({
  groups,
  initialGroupId,
  initialData,
  locale,
  canWrite,
}: {
  groups: GroupOption[];
  initialGroupId: string;
  initialData: FormData | null;
  locale: string;
  canWrite: boolean;
}) {
  const t = useTranslations("Performance.bulk");
  const router = useRouter();
  const firstAssessment = initialData?.assessments[0];
  const [assessmentId, setAssessmentId] = useState(firstAssessment?.id ?? "");
  const [title, setTitle] = useState(firstAssessment?.title ?? "");
  const [type, setType] = useState(firstAssessment?.type ?? "paper_exam");
  const [date, setDate] = useState(firstAssessment?.date ?? "");
  const [maxScore, setMaxScore] = useState(String(firstAssessment?.maxScore ?? 100));
  const [extraCredit, setExtraCredit] = useState(
    firstAssessment?.extraCreditAllowance === null || firstAssessment?.extraCreditAllowance === undefined
      ? ""
      : String(firstAssessment.extraCreditAllowance),
  );
  const [rows, setRows] = useState<Record<string, GradeRow>>(() =>
    rowsFromAssessment(initialData, firstAssessment?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function applyAssessment(id: string) {
    const assessment = initialData?.assessments.find((item) => item.id === id);
    setAssessmentId(id);
    setTitle(assessment?.title ?? "");
    setType(assessment?.type ?? "paper_exam");
    setDate(assessment?.date ?? "");
    setMaxScore(String(assessment?.maxScore ?? 100));
    setExtraCredit(assessment?.extraCreditAllowance === null || assessment?.extraCreditAllowance === undefined ? "" : String(assessment.extraCreditAllowance));
    setRows(rowsFromAssessment(initialData, id));
    setResult(null);
    setError(false);
  }

  function updateRow(studentId: string, patch: Partial<GradeRow>) {
    setRows((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? { status: "graded", score: "", note: "" }), ...patch },
    }));
  }

  function outcomeLabel(outcome: string): string {
    if (outcome === "saved") return t("saved");
    if (outcome === "updated") return t("updated");
    if (outcome === "unchanged") return t("unchanged");
    return t("skipped");
  }

  function reasonLabel(reasonKey: string | undefined): string {
    if (reasonKey === "Performance.bulkErrors.notEnrolled") return t("reason.notEnrolled");
    if (reasonKey === "Performance.bulkErrors.scoreRequired") return t("reason.scoreRequired");
    if (reasonKey === "Performance.bulkErrors.scoreExceedsMaximum") return t("reason.scoreExceedsMaximum");
    if (reasonKey === "Performance.bulkErrors.scoreNotAllowed") return t("reason.scoreNotAllowed");
    return reasonKey ?? "—";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      const response = await fetch("/api/performance/bulk-grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupId: initialGroupId,
          ...(assessmentId ? { assessmentId } : {}),
          title,
          type,
          date,
          maxScore: Number(maxScore),
          extraCreditAllowance: extraCredit.trim() ? Number(extraCredit) : null,
          scores: (initialData?.students ?? []).map((student) => {
            const row = rows[student.id] ?? { status: "graded", score: "", note: "" };
            return {
              studentId: student.id,
              status: row.status,
              score: row.status === "graded" && row.score.trim() ? Number(row.score) : null,
              note: row.note.trim() || null,
            };
          }),
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setResult((await response.json()) as SubmitResult);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody>
          <form method="get" className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <FormField label={t("selectGroup")}>
              <Select name="groupId" defaultValue={initialGroupId} required>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" variant="secondary">
              {t("apply")}
            </Button>
          </form>
        </CardBody>
      </Card>

      {!initialData ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-foreground">{t("loadError")}</p>
          </CardBody>
        </Card>
      ) : initialData.students.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-foreground">{t("noStudents")}</p>
          </CardBody>
        </Card>
      ) : (
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Card>
            <CardHeader title={t("assessment")} titleId="bulk-assessment-title" />
            <CardBody className="grid gap-3 md:grid-cols-3">
              <FormField label={t("assessment")}>
                <Select
                  value={assessmentId}
                  onChange={(event) => applyAssessment(event.target.value)}
                  disabled={!canWrite || busy}
                >
                  <option value="">{t("newAssessment")}</option>
                  {initialData.assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title} · {formatPerformanceDate(assessment.date, locale)}
                      {assessment.lockedAt ? " · 🔒" : ""}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t("titleLabel")}>
                <Input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite || busy} />
              </FormField>
              <FormField label={t("typeLabel")}>
                <Select value={type} onChange={(event) => setType(event.target.value)} disabled={!canWrite || busy}>
                  <option value="paper_exam">{t("types.paper_exam")}</option>
                  <option value="test">{t("types.test")}</option>
                  <option value="other">{t("types.other")}</option>
                </Select>
              </FormField>
              <FormField label={t("dateLabel")}>
                <Input type="date" required value={date} onChange={(event) => setDate(event.target.value)} disabled={!canWrite || busy} />
              </FormField>
              <FormField label={t("maxScore")}>
                <Input type="number" min={0.01} max={9999.99} step="0.01" required value={maxScore} onChange={(event) => setMaxScore(event.target.value)} disabled={!canWrite || busy} />
              </FormField>
              <FormField label={t("extraCredit")}>
                <Input type="number" min={0} max={9999.99} step="0.01" value={extraCredit} onChange={(event) => setExtraCredit(event.target.value)} disabled={!canWrite || busy} />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
            <div className="ui-table-scroll" role="region" aria-label={t("title")} tabIndex={0}>
              <table className="ui-table">
                <caption className="ui-visually-hidden">{t("title")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("student")}</th>
                    <th scope="col">{t("status")}</th>
                    <th scope="col">{t("score")}</th>
                    <th scope="col">{t("note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {initialData.students.map((student) => {
                    const row = rows[student.id] ?? { status: "graded", score: "", note: "" };
                    return (
                      <tr key={student.id}>
                        <td>{student.name}</td>
                        <td>
                          <Select
                            aria-label={`${t("status")} — ${student.name}`}
                            value={row.status}
                            onChange={(event) => updateRow(student.id, { status: event.target.value })}
                            disabled={!canWrite || busy}
                          >
                            <option value="graded">{t("statuses.graded")}</option>
                            <option value="missing">{t("statuses.missing")}</option>
                            <option value="excused">{t("statuses.excused")}</option>
                            <option value="not_taken">{t("statuses.not_taken")}</option>
                          </Select>
                        </td>
                        <td>
                          <Input
                            aria-label={`${t("score")} — ${student.name}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.score}
                            onChange={(event) => updateRow(student.id, { score: event.target.value })}
                            disabled={!canWrite || busy || row.status !== "graded"}
                          />
                        </td>
                        <td>
                          <Input
                            aria-label={`${t("note")} — ${student.name}`}
                            maxLength={1000}
                            value={row.note}
                            onChange={(event) => updateRow(student.id, { note: event.target.value })}
                            disabled={!canWrite || busy}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
          </Card>

          {canWrite ? (
            <div>
              <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
                {busy ? t("saving") : t("save")}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t("loadError")}
            </p>
          ) : null}
          {result ? (
            <Card>
              <CardHeader title={t("resultTitle")} titleId="bulk-result-title" />
              <CardBody className="grid gap-2">
                <p role="status" className="text-sm">
                  {t("success")} · {t("savedCount", { count: result.savedCount })} · {t("skippedCount", { count: result.skippedCount })}
                </p>
                <ul className="grid gap-1 text-sm">
                  {result.results.map((row) => {
                    const student = initialData.students.find((item) => item.id === row.studentId);
                    return (
                      <li key={row.studentId}>
                        {student?.name ?? row.studentId}: {outcomeLabel(row.outcome)}
                        {row.reasonKey ? ` — ${reasonLabel(row.reasonKey)}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </form>
      )}
    </div>
  );
}
