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

type OnlineExamSummaryItem = {
  id: string;
  groupId: string;
  groupName: string;
  assessmentId: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  assignScope: "group" | "students";
  status: "draft" | "published" | "closed" | "archived";
  resultVisibility: "after_manual_publish" | "immediate_after_submit" | "after_window_close";
  availableFrom: string;
  availableUntil: string;
  durationMinutes: number | null;
  maxAttempts: number;
  maxScore: number;
  questionCount: number;
  attemptsSummary: {
    totalAttempts: number;
    submittedCount: number;
    gradedCount: number;
  };
  assignedStudents: Student[];
  publishedAt: string | null;
  resultsPublishedAt: string | null;
  createdAt: string;
};

type OnlineExamDetailPayload = {
  exam: {
    id: string;
    groupId: string;
    groupName: string;
    assessmentId: string | null;
    title: string;
    description: string | null;
    instructions: string | null;
    assignScope: "group" | "students";
    status: "draft" | "published" | "closed" | "archived";
    resultVisibility: "after_manual_publish" | "immediate_after_submit" | "after_window_close";
    availableFrom: string;
    availableUntil: string;
    durationMinutes: number | null;
    maxAttempts: number;
    maxScore: number;
    publishedAt: string | null;
    resultsPublishedAt: string | null;
    assignedStudents: Student[];
    questions: Array<{
      id: string;
      position: number;
      type: "mcq_single" | "true_false" | "short_answer" | "essay";
      prompt: string;
      points: number;
      options: unknown;
      answerKey: unknown;
      explanation: string | null;
    }>;
    attempts: Array<{
      id: string;
      student: Student;
      attemptNumber: number;
      status: "in_progress" | "submitted" | "graded";
      startedAt: string;
      submittedAt: string | null;
      gradedAt: string | null;
      autoScore: number | null;
      manualScore: number | null;
      totalScore: number | null;
      responses: Array<{
        id: string;
        questionId: string;
        answer: unknown;
        isCorrect: boolean | null;
        pointsAwarded: number | null;
        teacherFeedback: string | null;
      }>;
    }>;
  };
};

type DraftQuestion = {
  type: "mcq_single" | "true_false" | "short_answer" | "essay";
  prompt: string;
  points: number;
  mcqOptionA: string;
  mcqOptionB: string;
  correctOptionId: "a" | "b";
  trueFalseAnswer: boolean;
  acceptedAnswers: string;
  explanation: string;
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
  initialOnlineExams = [],
  groups,
  students,
  locale,
  canWriteGrades,
}: {
  initialAssessments: AssessmentCollection;
  initialOnlineExams?: OnlineExamSummaryItem[];
  groups: Group[];
  students: Student[];
  locale: string;
  canWriteGrades: boolean;
}) {
  const t = useTranslations("Academics.assessments");
  const te = useTranslations("Academics.onlineExams");
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<"paper" | "online">("paper");
  const [assessments, setAssessments] = useState(initialAssessments.assessments);
  const [groupSummary, setGroupSummary] = useState(initialAssessments.groupSummary);
  const [onlineExams, setOnlineExams] = useState<OnlineExamSummaryItem[]>(initialOnlineExams);
  const [examDetail, setExamDetail] = useState<OnlineExamDetailPayload["exam"] | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    {
      type: "mcq_single",
      prompt: "",
      points: 10,
      mcqOptionA: "",
      mcqOptionB: "",
      correctOptionId: "a",
      trueFalseAnswer: true,
      acceptedAnswers: "",
      explanation: "",
    },
  ]);
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

  async function reloadOnlineExams() {
    const updated = await requestJson<{ exams: OnlineExamSummaryItem[] }>("/api/exams");
    setOnlineExams(updated.exams);
    if (examDetail) {
      const refreshed = await requestJson<OnlineExamDetailPayload>(`/api/exams/${examDetail.id}`);
      setExamDetail(refreshed.exam);
    }
    await reload();
  }

  async function createOnlineExamHandler(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const assignScope = String(data.get("assignScope") ?? "group");
    const durationRaw = String(data.get("durationMinutes") ?? "").trim();

    const formattedQuestions = draftQuestions.map((q) => {
      if (q.type === "mcq_single") {
        return {
          type: "mcq_single" as const,
          prompt: q.prompt.trim(),
          points: Number(q.points),
          options: [
            { id: "a", text: q.mcqOptionA.trim() },
            { id: "b", text: q.mcqOptionB.trim() },
          ],
          answerKey: { correctOptionId: q.correctOptionId },
          explanation: q.explanation.trim() || null,
        };
      }
      if (q.type === "true_false") {
        return {
          type: "true_false" as const,
          prompt: q.prompt.trim(),
          points: Number(q.points),
          answerKey: { correctBoolean: q.trueFalseAnswer },
          explanation: q.explanation.trim() || null,
        };
      }
      if (q.type === "short_answer") {
        return {
          type: "short_answer" as const,
          prompt: q.prompt.trim(),
          points: Number(q.points),
          answerKey: {
            acceptedAnswers: q.acceptedAnswers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            caseSensitive: false,
          },
          explanation: q.explanation.trim() || null,
        };
      }
      return {
        type: "essay" as const,
        prompt: q.prompt.trim(),
        points: Number(q.points),
        explanation: q.explanation.trim() || null,
      };
    });

    setBusy(true);
    setError(false);
    try {
      await requestJson("/api/exams", "POST", {
        groupId: String(data.get("groupId")),
        title: String(data.get("title") ?? "").trim(),
        description: String(data.get("description") ?? "").trim() || null,
        instructions: String(data.get("instructions") ?? "").trim() || null,
        assignScope,
        studentIds: assignScope === "students" ? data.getAll("studentIds").map(String) : [],
        availableFrom: new Date(String(data.get("availableFrom"))).toISOString(),
        availableUntil: new Date(String(data.get("availableUntil"))).toISOString(),
        durationMinutes: durationRaw ? Number(durationRaw) : null,
        maxAttempts: Number(data.get("maxAttempts") ?? 1),
        resultVisibility: String(data.get("resultVisibility") ?? "after_manual_publish"),
        questions: formattedQuestions,
      });
      formEl.reset();
      await reloadOnlineExams();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function openOnlineExam(examId: string) {
    setBusy(true);
    setError(false);
    try {
      const loaded = await requestJson<OnlineExamDetailPayload>(`/api/exams/${examId}`);
      setExamDetail(loaded.exam);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function updateOnlineExamAction(
    examId: string,
    action: "publish" | "close" | "publish_results",
  ) {
    setBusy(true);
    setError(false);
    try {
      await requestJson(`/api/exams/${examId}`, "PATCH", { action });
      await reloadOnlineExams();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function submitAttemptGrading(
    examId: string,
    attemptId: string,
    formEl: HTMLFormElement,
    questions: OnlineExamDetailPayload["exam"]["questions"],
  ) {
    const formData = new FormData(formEl);
    const reason = String(formData.get("reason") ?? "").trim() || undefined;
    const grades = questions.map((q) => ({
      questionId: q.id,
      pointsAwarded: Number(formData.get(`points_${q.id}`) ?? 0),
      teacherFeedback: String(formData.get(`feedback_${q.id}`) ?? "").trim() || null,
    }));

    setBusy(true);
    setError(false);
    try {
      await requestJson(`/api/exams/${examId}/attempts/${attemptId}/grade`, "POST", {
        grades,
        reason,
      });
      await reloadOnlineExams();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant={activeMode === "paper" ? "primary" : "secondary"}
          onClick={() => setActiveMode("paper")}
        >
          {te("tabPaper")}
        </Button>
        <Button
          type="button"
          variant={activeMode === "online" ? "primary" : "secondary"}
          onClick={() => setActiveMode("online")}
        >
          {te("tabOnline")}
        </Button>
      </div>

      {activeMode === "paper" ? (
        <>
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
        </>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-2">
              <h2 className="text-sm font-semibold">{te("honestyNoticeTitle")}</h2>
              <p className="text-sm text-muted">{te("honestyNoticeBody")}</p>
            </CardBody>
          </Card>

          {canWriteGrades ? (
            <Card>
              <CardBody className="space-y-4">
                <h2 className="ui-card-title">{te("createTitle")}</h2>
                <form
                  onSubmit={(event) => void createOnlineExamHandler(event)}
                  className="grid gap-4 md:grid-cols-2"
                >
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
                    <span>{te("titleLabel")}</span>
                    <Input name="title" required maxLength={160} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{te("assignScopeLabel")}</span>
                    <Select name="assignScope" defaultValue="group">
                      <option value="group">{te("scopeGroup")}</option>
                      <option value="students">{te("scopeStudents")}</option>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{t("student")}</span>
                    <select
                      name="studentIds"
                      multiple
                      className="ui-input"
                      size={Math.min(4, Math.max(2, students.length))}
                    >
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.firstName} {student.lastName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{te("availableFromLabel")}</span>
                    <Input name="availableFrom" type="datetime-local" required />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{te("availableUntilLabel")}</span>
                    <Input name="availableUntil" type="datetime-local" required />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{te("durationMinutesLabel")}</span>
                    <Input name="durationMinutes" type="number" min="1" max="360" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{te("maxAttemptsLabel")}</span>
                    <Input
                      name="maxAttempts"
                      type="number"
                      min="1"
                      max="10"
                      required
                      defaultValue="1"
                    />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span>{te("resultVisibilityLabel")}</span>
                    <Select name="resultVisibility" defaultValue="after_manual_publish">
                      <option value="after_manual_publish">{te("visibilityManual")}</option>
                      <option value="immediate_after_submit">{te("visibilityImmediate")}</option>
                      <option value="after_window_close">{te("visibilityWindowClose")}</option>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span>{te("instructionsLabel")}</span>
                    <Textarea name="instructions" maxLength={4000} rows={2} />
                  </label>

                  <div className="space-y-4 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{te("questionsSectionTitle")}</h3>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setDraftQuestions((prev) => [
                            ...prev,
                            {
                              type: "mcq_single",
                              prompt: "",
                              points: 10,
                              mcqOptionA: "",
                              mcqOptionB: "",
                              correctOptionId: "a",
                              trueFalseAnswer: true,
                              acceptedAnswers: "",
                              explanation: "",
                            },
                          ])
                        }
                      >
                        {te("addQuestionAction")}
                      </Button>
                    </div>

                    {draftQuestions.map((q, index) => (
                      <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm">#{index + 1}</strong>
                          {draftQuestions.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                setDraftQuestions((prev) => prev.filter((_, i) => i !== index))
                              }
                            >
                              {te("removeQuestionAction")}
                            </Button>
                          ) : null}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            <span>{te("questionTypeLabel")}</span>
                            <Select
                              value={q.type}
                              onChange={(e) => {
                                const val = e.target.value as DraftQuestion["type"];
                                setDraftQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === index ? { ...item, type: val } : item,
                                  ),
                                );
                              }}
                            >
                              <option value="mcq_single">{te("qType.mcq_single")}</option>
                              <option value="true_false">{te("qType.true_false")}</option>
                              <option value="short_answer">{te("qType.short_answer")}</option>
                              <option value="essay">{te("qType.essay")}</option>
                            </Select>
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span>{te("questionPointsLabel")}</span>
                            <Input
                              type="number"
                              min="0.5"
                              max="1000"
                              step="0.5"
                              value={q.points}
                              onChange={(e) => {
                                const pts = Number(e.target.value);
                                setDraftQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === index ? { ...item, points: pts } : item,
                                  ),
                                );
                              }}
                              required
                            />
                          </label>
                          <label className="grid gap-1 text-sm md:col-span-2">
                            <span>{te("questionPromptLabel")}</span>
                            <Input
                              value={q.prompt}
                              onChange={(e) => {
                                const prompt = e.target.value;
                                setDraftQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === index ? { ...item, prompt } : item,
                                  ),
                                );
                              }}
                              required
                            />
                          </label>

                          {q.type === "mcq_single" ? (
                            <>
                              <label className="grid gap-1 text-sm">
                                <span>{te("mcqOptionLabel", { index: 1 })}</span>
                                <Input
                                  value={q.mcqOptionA}
                                  onChange={(e) => {
                                    const mcqOptionA = e.target.value;
                                    setDraftQuestions((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, mcqOptionA } : item,
                                      ),
                                    );
                                  }}
                                  required
                                />
                              </label>
                              <label className="grid gap-1 text-sm">
                                <span>{te("mcqOptionLabel", { index: 2 })}</span>
                                <Input
                                  value={q.mcqOptionB}
                                  onChange={(e) => {
                                    const mcqOptionB = e.target.value;
                                    setDraftQuestions((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, mcqOptionB } : item,
                                      ),
                                    );
                                  }}
                                  required
                                />
                              </label>
                              <label className="grid gap-1 text-sm">
                                <span>{te("correctOptionLabel")}</span>
                                <Select
                                  value={q.correctOptionId}
                                  onChange={(e) => {
                                    const correctOptionId = e.target.value as "a" | "b";
                                    setDraftQuestions((prev) =>
                                      prev.map((item, i) =>
                                        i === index ? { ...item, correctOptionId } : item,
                                      ),
                                    );
                                  }}
                                >
                                  <option value="a">A</option>
                                  <option value="b">B</option>
                                </Select>
                              </label>
                            </>
                          ) : null}

                          {q.type === "true_false" ? (
                            <label className="grid gap-1 text-sm">
                              <span>{te("correctOptionLabel")}</span>
                              <Select
                                value={q.trueFalseAnswer ? "true" : "false"}
                                onChange={(e) => {
                                  const trueFalseAnswer = e.target.value === "true";
                                  setDraftQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === index ? { ...item, trueFalseAnswer } : item,
                                    ),
                                  );
                                }}
                              >
                                <option value="true">{te("trueLabel")}</option>
                                <option value="false">{te("falseLabel")}</option>
                              </Select>
                            </label>
                          ) : null}

                          {q.type === "short_answer" ? (
                            <label className="grid gap-1 text-sm md:col-span-2">
                              <span>{te("acceptedAnswersLabel")}</span>
                              <Input
                                value={q.acceptedAnswers}
                                onChange={(e) => {
                                  const acceptedAnswers = e.target.value;
                                  setDraftQuestions((prev) =>
                                    prev.map((item, i) =>
                                      i === index ? { ...item, acceptedAnswers } : item,
                                    ),
                                  );
                                }}
                                required
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-2">
                    <Button type="submit" disabled={busy}>
                      {busy ? t("saving") : te("createDraftAction")}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardBody className="space-y-4">
              <h2 className="ui-card-title">{te("listTitle")}</h2>
              {onlineExams.length === 0 ? (
                <p className="text-sm text-muted">{te("empty")}</p>
              ) : (
                <div className="space-y-3">
                  {onlineExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{exam.title}</strong>
                          <span className="rounded border border-border px-2 py-0.5 text-xs">
                            {te(`status.${exam.status}`)}
                          </span>
                          {exam.resultsPublishedAt ? (
                            <span className="rounded border border-border px-2 py-0.5 text-xs font-semibold">
                              {te("resultsPublishedBadge")}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted">
                          {exam.groupName} ·{" "}
                          {te("attemptsSummary", {
                            submitted: exam.attemptsSummary.submittedCount,
                            total: exam.attemptsSummary.totalAttempts,
                            maxScore: exam.maxScore,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void openOnlineExam(exam.id)}
                        >
                          {te("previewAction")}
                        </Button>
                        {canWriteGrades && exam.status === "draft" ? (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void updateOnlineExamAction(exam.id, "publish")}
                          >
                            {te("publishExamAction")}
                          </Button>
                        ) : null}
                        {canWriteGrades && exam.status === "published" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void updateOnlineExamAction(exam.id, "close")}
                          >
                            {te("closeExamAction")}
                          </Button>
                        ) : null}
                        {canWriteGrades && !exam.resultsPublishedAt ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void updateOnlineExamAction(exam.id, "publish_results")}
                          >
                            {te("publishResultsAction")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {examDetail ? (
            <Card>
              <CardBody className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="ui-card-title">
                      {te("teacherPreviewTitle")}: {examDetail.title}
                    </h2>
                    <p className="text-xs text-muted">
                      {examDetail.groupName} · {te(`status.${examDetail.status}`)}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setExamDetail(null)}>
                    {t("close")}
                  </Button>
                </div>

                <div className="space-y-3">
                  {examDetail.questions.map((q) => (
                    <div key={q.id} className="rounded border border-border p-3 text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <strong>
                          {q.position}. {q.prompt}
                        </strong>
                        <span className="text-xs text-muted">
                          {q.points} pts · {te(`qType.${q.type}`)}
                        </span>
                      </div>
                      {q.explanation ? (
                        <p className="text-xs text-muted">{q.explanation}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">{te("attemptsSectionTitle")}</h3>
                  {examDetail.attempts.length === 0 ? (
                    <p className="text-sm text-muted">{te("noAttempts")}</p>
                  ) : (
                    examDetail.attempts.map((attempt) => (
                      <form
                        key={attempt.id}
                        className="rounded-lg border border-border p-4 space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitAttemptGrading(
                            examDetail.id,
                            attempt.id,
                            e.currentTarget,
                            examDetail.questions,
                          );
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm">
                            {attempt.student.firstName} {attempt.student.lastName} (#
                            {attempt.attemptNumber})
                          </strong>
                          <span className="text-xs text-muted">
                            {te(`attemptStatus.${attempt.status}`)} ·{" "}
                            {attempt.totalScore ?? "—"} / {examDetail.maxScore}
                          </span>
                        </div>

                        {examDetail.questions.map((q) => {
                          const resp = attempt.responses.find((r) => r.questionId === q.id);
                          return (
                            <div
                              key={q.id}
                              className="grid gap-2 border-t border-border pt-2 md:grid-cols-3 text-xs"
                            >
                              <div>
                                <p className="font-semibold">{q.prompt}</p>
                                <p className="text-muted">
                                  {JSON.stringify(resp?.answer ?? null)}
                                </p>
                              </div>
                              <label className="grid gap-1">
                                <span>
                                  {te("pointsAwardedLabel")} (max {q.points})
                                </span>
                                <Input
                                  name={`points_${q.id}`}
                                  type="number"
                                  min="0"
                                  max={q.points}
                                  step="0.25"
                                  defaultValue={resp?.pointsAwarded ?? 0}
                                  disabled={!canWriteGrades || attempt.status === "in_progress"}
                                />
                              </label>
                              <label className="grid gap-1">
                                <span>{te("teacherFeedbackLabel")}</span>
                                <Input
                                  name={`feedback_${q.id}`}
                                  defaultValue={resp?.teacherFeedback ?? ""}
                                  disabled={!canWriteGrades || attempt.status === "in_progress"}
                                />
                              </label>
                            </div>
                          );
                        })}

                        {attempt.status === "graded" ? (
                          <label className="grid gap-1 text-xs">
                            <span>{te("correctionReasonLabel")}</span>
                            <Input name="reason" required maxLength={500} />
                          </label>
                        ) : null}

                        {canWriteGrades && attempt.status !== "in_progress" ? (
                          <Button type="submit" variant="secondary" disabled={busy}>
                            {te("saveGradesAction")}
                          </Button>
                        ) : null}
                      </form>
                    ))
                  )}
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
