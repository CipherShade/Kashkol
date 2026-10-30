"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";

type Group = { id: string; name: string };
type Student = { id: string; firstName: string; lastName: string };
type Assessment = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  type: "paper_exam" | "quiz" | "test" | "other";
  note: string | null;
  date: string;
  maxScore: number;
  extraCreditAllowance: number | null;
  lockedAt: Date | string | null;
  summary: {
    gradedCount: number;
    averagePercent: number | null;
    highestPercent: number | null;
    lowestPercent: number | null;
  };
  scores: Array<{ studentId: string; score: number | null; status: string; note: string | null }>;
};
type Result = {
  score: number | null;
  status: string;
  note: string | null;
  updatedAt: string | null;
};
type AssessmentDetail = Assessment & { roster: Array<{ student: Student; result: Result }> };
type GroupStudentSummary = {
  student: Student;
  averagePercent: number | null;
  trend: "improving" | "steady" | "declining" | "insufficient_data";
  gradedCount: number;
};
type AssessmentCollection = {
  assessments: Assessment[];
  groupSummary: GroupStudentSummary[] | null;
};
type History = {
  history: Array<{
    assessmentId: string;
    title: string;
    date: string;
    group: Group;
    maxScore: number;
    score: number | null;
    status: string;
    percentage: number | null;
    note: string | null;
  }>;
  averagePercent: number | null;
  trend: "improving" | "steady" | "declining" | "insufficient_data";
};

async function requestJson<T>(path: string, method?: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("request failed");
  return response.json();
}

export function AssessmentsClient({
  initialAssessments,
  groups,
  students,
  locale,
  canWriteGrades,
}: {
  initialAssessments: AssessmentCollection;
  groups: Group[];
  students: Student[];
  locale: string;
  canWriteGrades: boolean;
}) {
  const t = useTranslations("Academics.assessments");
  const router = useRouter();
  const [assessments, setAssessments] = useState(initialAssessments.assessments);
  const [groupSummary, setGroupSummary] = useState(initialAssessments.groupSummary);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function reload() {
    const query = selectedGroup ? `?groupId=${encodeURIComponent(selectedGroup)}` : "";
    const updated = await requestJson<AssessmentCollection>(`/api/assessments${query}`);
    setAssessments(updated.assessments);
    setGroupSummary(updated.groupSummary);
    if (detail) setDetail(await requestJson<AssessmentDetail>(`/api/assessments/${detail.id}`));
  }

  async function filterGroup(groupId: string) {
    setSelectedGroup(groupId);
    setBusy(true);
    setError(false);
    try {
      const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
      const updated = await requestJson<AssessmentCollection>(`/api/assessments${query}`);
      setAssessments(updated.assessments);
      setGroupSummary(updated.groupSummary);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function createAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(false);
    try {
      await requestJson("/api/assessments", "POST", {
        groupId: String(form.get("groupId")),
        title: String(form.get("title") ?? ""),
        type: String(form.get("type")),
        date: String(form.get("date")),
        note: String(form.get("note") ?? "").trim() || null,
        maxScore: Number(form.get("maxScore")),
        extraCreditAllowance: String(form.get("extraCreditAllowance") ?? "")
          ? Number(form.get("extraCreditAllowance"))
          : null,
      });
      formElement.reset();
      await reload();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function openAssessment(id: string) {
    setBusy(true);
    setError(false);
    try {
      setDetail(await requestJson<AssessmentDetail>(`/api/assessments/${id}`));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(assessmentId: string, studentId: string, form: HTMLFormElement) {
    const values = new FormData(form);
    const status = String(values.get("status"));
    const rawScore = String(values.get("score") ?? "");
    setBusy(true);
    setError(false);
    try {
      await requestJson(`/api/assessments/${assessmentId}/results/${studentId}`, "PUT", {
        status,
        score: status === "graded" ? Number(rawScore) : null,
        note: String(values.get("note") ?? "").trim() || null,
      });
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function lockAssessment(assessment: Assessment) {
    setBusy(true);
    setError(false);
    try {
      if (assessment.lockedAt) {
        const reason = window.prompt(t("unlockReasonPrompt"));
        if (!reason?.trim()) return;
        await requestJson(`/api/assessments/${assessment.id}`, "PATCH", {
          action: "unlock",
          reason,
        });
      } else {
        await requestJson(`/api/assessments/${assessment.id}`, "PATCH", { action: "lock" });
      }
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function loadStudentHistory(studentId: string) {
    setBusy(true);
    setError(false);
    try {
      setHistory(
        await requestJson<History>(`/api/assessments?studentId=${encodeURIComponent(studentId)}`),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canWriteGrades ? (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="ui-card-title">{t("createTitle")}</h2>
            <form onSubmit={createAssessment} className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{t("group")}</span>
                <Select name="groupId" required defaultValue="">
                  <option value="" disabled>
                    {t("chooseGroup")}
                  </option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("titleLabel")}</span>
                <Input name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("type")}</span>
                <Select name="type" defaultValue="paper_exam">
                  <option value="paper_exam">{t("types.paper_exam")}</option>
                  <option value="quiz">{t("types.quiz")}</option>
                  <option value="test">{t("types.test")}</option>
                  <option value="other">{t("types.other")}</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("date")}</span>
                <Input name="date" type="date" required />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("maximum")}</span>
                <Input
                  name="maxScore"
                  type="number"
                  min="0.01"
                  max="9999.99"
                  step="0.01"
                  required
                  defaultValue="100"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("extraCreditAllowance")}</span>
                <Input
                  name="extraCreditAllowance"
                  type="number"
                  min="0"
                  max="9999.99"
                  step="0.01"
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>{t("note")}</span>
                <Textarea name="note" maxLength={2000} rows={2} />
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? t("saving") : t("create")}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      ) : null}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ui-card-title">{t("historyTitle")}</h2>
          <Select
            aria-label={t("group")}
            value={selectedGroup}
            onChange={(event) => void filterGroup(event.target.value)}
          >
            <option value="">{t("allGroups")}</option>
            {groups.map((group) => (
              <option value={group.id} key={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
        {assessments.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        {assessments.map((assessment) => (
          <Card key={assessment.id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                className="text-start"
                onClick={() => openAssessment(assessment.id)}
              >
                <strong>{assessment.title}</strong>
                <span className="ms-2 text-sm text-muted">
                  {assessment.groupName} ·{" "}
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                    new Date(assessment.date),
                  )}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {t("summary", {
                    average:
                      assessment.summary.averagePercent === null
                        ? "—"
                        : `${assessment.summary.averagePercent.toFixed(1)}%`,
                    high:
                      assessment.summary.highestPercent === null
                        ? "—"
                        : `${assessment.summary.highestPercent.toFixed(1)}%`,
                    low:
                      assessment.summary.lowestPercent === null
                        ? "—"
                        : `${assessment.summary.lowestPercent.toFixed(1)}%`,
                    graded: assessment.summary.gradedCount,
                  })}
                </span>
              </button>
              <span className="text-sm">{assessment.lockedAt ? t("locked") : ""}</span>
              {canWriteGrades ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => lockAssessment(assessment)}
                >
                  {assessment.lockedAt ? t("unlock") : t("lock")}
                </Button>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </section>

      {groupSummary ? (
        <Card>
          <CardBody className="space-y-3">
            <h2 className="ui-card-title">{t("groupSummaryTitle")}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupSummary.map(({ student, averagePercent, trend, gradedCount }) => (
                <p className="rounded border border-border p-3 text-sm" key={student.id}>
                  <strong>
                    {student.firstName} {student.lastName}
                  </strong>
                  <span className="block text-muted">
                    {t("studentAverageTrend", {
                      average: averagePercent === null ? "—" : `${averagePercent.toFixed(1)}%`,
                      trend: t(`trends.${trend}`),
                      count: gradedCount,
                    })}
                  </span>
                </p>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {detail ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="ui-card-title">
                  {detail.title} · {detail.groupName}
                </h2>
                <p className="text-sm text-muted">
                  {t("summary", {
                    average:
                      detail.summary.averagePercent === null
                        ? "—"
                        : `${detail.summary.averagePercent.toFixed(1)}%`,
                    high:
                      detail.summary.highestPercent === null
                        ? "—"
                        : `${detail.summary.highestPercent.toFixed(1)}%`,
                    low:
                      detail.summary.lowestPercent === null
                        ? "—"
                        : `${detail.summary.lowestPercent.toFixed(1)}%`,
                    graded: detail.summary.gradedCount,
                  })}
                </p>
                {detail.lockedAt ? <p className="text-sm text-muted">{t("locked")}</p> : null}
              </div>
              <Button variant="secondary" onClick={() => setDetail(null)}>
                {t("close")}
              </Button>
            </div>
            <div className="divide-y divide-border">
              {detail.roster.map(({ student, result }) => (
                <form
                  key={student.id}
                  className="grid gap-2 py-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveResult(detail.id, student.id, event.currentTarget);
                  }}
                >
                  <strong className="text-sm">
                    {student.firstName} {student.lastName}
                  </strong>
                  <Select
                    name="status"
                    defaultValue={result.status}
                    disabled={!canWriteGrades || Boolean(detail.lockedAt)}
                    aria-label={t("resultStatus")}
                  >
                    <option value="graded">{t("resultStatuses.graded")}</option>
                    <option value="missing">{t("resultStatuses.missing")}</option>
                    <option value="excused">{t("resultStatuses.excused")}</option>
                    <option value="not_taken">{t("resultStatuses.not_taken")}</option>
                  </Select>
                  <Input
                    name="score"
                    type="number"
                    min="0"
                    max={detail.maxScore + (detail.extraCreditAllowance ?? 0)}
                    step="0.01"
                    defaultValue={result.score ?? ""}
                    disabled={!canWriteGrades || Boolean(detail.lockedAt)}
                    aria-label={t("score")}
                  />
                  <Input
                    name="note"
                    defaultValue={result.note ?? ""}
                    maxLength={1000}
                    disabled={!canWriteGrades || Boolean(detail.lockedAt)}
                    placeholder={t("studentNote")}
                  />
                  {canWriteGrades ? (
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={busy || Boolean(detail.lockedAt)}
                    >
                      {t("saveResult")}
                    </Button>
                  ) : null}
                </form>
              ))}
            </div>
            <p className="text-xs text-muted">{t("missingAverageRule")}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <h2 className="ui-card-title">{t("studentHistoryTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t("student")} id="assessment-history-student" defaultValue="">
              <option value="" disabled>
                {t("chooseStudent")}
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const select = document.getElementById(
                  "assessment-history-student",
                ) as HTMLSelectElement | null;
                if (select?.value) void loadStudentHistory(select.value);
              }}
            >
              {t("showHistory")}
            </Button>
          </div>
          {history ? (
            <div className="space-y-2">
              <p>
                {t("averageTrend", {
                  average:
                    history.averagePercent === null ? "—" : `${history.averagePercent.toFixed(1)}%`,
                  trend: t(`trends.${history.trend}`),
                })}
              </p>
              {history.history.map((item) => (
                <p className="text-sm" key={item.assessmentId}>
                  {item.date} · {item.group.name} · {item.title}:{" "}
                  {item.score === null
                    ? t(`resultStatuses.${item.status}`)
                    : `${item.score}/${item.maxScore} (${item.percentage?.toFixed(1)}%)`}
                </p>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
