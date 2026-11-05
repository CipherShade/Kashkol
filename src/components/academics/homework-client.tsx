"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";

type Student = { id: string; firstName: string; lastName: string };
type Group = { id: string; name: string };
type Resource = { id: string; displayName: string };
type Submission = {
  id: string;
  student: Student;
  status: "not_submitted" | "submitted" | "late" | "excused";
  teacherFeedback: string | null;
  score: number | null;
  submittedAt: string | null;
};
type Assignment = {
  id: string;
  group: Group | null;
  title: string;
  instructions: string | null;
  dueAt: string;
  maxScore: number | null;
  resources: Resource[];
  totalStudents: number;
  completedStudents: number;
  completionPercent: number | null;
  submissions: Submission[];
};

function localDateTimeValue(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function send(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error("request failed");
}

export function HomeworkClient({
  initialAssignments,
  groups,
  students,
  resources,
  locale,
  canWriteHomework,
  canReadGrades,
  canEditGrades,
}: {
  initialAssignments: Assignment[];
  groups: Group[];
  students: Student[];
  resources: Resource[];
  locale: string;
  canWriteHomework: boolean;
  canReadGrades: boolean;
  canEditGrades: boolean;
}) {
  const t = useTranslations("Academics.homework");
  const router = useRouter();
  const [mode, setMode] = useState<"group" | "students">(groups.length > 0 ? "group" : "students");
  const [assignments, setAssignments] = useState(initialAssignments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(false);
    const form = new FormData(formElement);
    const body = {
      groupId: mode === "group" ? String(form.get("groupId")) : null,
      studentIds: mode === "students" ? selectedStudents : undefined,
      title: String(form.get("title") ?? ""),
      instructions: String(form.get("instructions") ?? "").trim() || null,
      dueAt: new Date(String(form.get("dueAt"))).toISOString(),
      resourceFileIds: selectedResources,
      maxScore: String(form.get("maxScore") ?? "") ? Number(form.get("maxScore")) : null,
    };
    try {
      await send("/api/homework", "POST", body);
      setSelectedStudents([]);
      setSelectedResources([]);
      formElement.reset();
      router.refresh();
      const response = await fetch("/api/homework", { cache: "no-store" });
      if (!response.ok) throw new Error("reload failed");
      setAssignments(await response.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmission(homeworkId: string, studentId: string, form: HTMLFormElement) {
    setBusy(true);
    setError(false);
    const values = new FormData(form);
    const rawScore = String(values.get("score") ?? "");
    const body: { status: string; teacherFeedback: string | null; score?: number | null } = {
      status: String(values.get("status")),
      teacherFeedback: String(values.get("feedback") ?? "").trim() || null,
    };
    if (form.elements.namedItem("score")) body.score = rawScore ? Number(rawScore) : null;
    try {
      await send(`/api/homework/${homeworkId}/submissions/${studentId}`, "PATCH", body);
      const response = await fetch("/api/homework", { cache: "no-store" });
      if (!response.ok) throw new Error("reload failed");
      setAssignments(await response.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function archive(homeworkId: string) {
    setBusy(true);
    setError(false);
    try {
      await send(`/api/homework/${homeworkId}`, "PATCH", { archived: true });
      setAssignments((current) => current.filter((assignment) => assignment.id !== homeworkId));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function editAssignment(homeworkId: string, form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true);
    setError(false);
    try {
      await send(`/api/homework/${homeworkId}`, "PATCH", {
        title: String(values.get("title") ?? ""),
        instructions: String(values.get("instructions") ?? "").trim() || null,
        dueAt: new Date(String(values.get("dueAt"))).toISOString(),
      });
      setEditingId(null);
      const response = await fetch("/api/homework", { cache: "no-store" });
      if (!response.ok) throw new Error("reload failed");
      setAssignments(await response.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canWriteHomework ? (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="ui-card-title">{t("createTitle")}</h2>
            <p className="text-sm text-muted">{t("noOnlineSubmission")}</p>
            <form onSubmit={createAssignment} className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{t("assignmentType")}</span>
                <Select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "group" | "students")}
                >
                  {groups.length > 0 ? <option value="group">{t("groupAssignment")}</option> : null}
                  <option value="students">{t("selectedStudents")}</option>
                </Select>
              </label>
              {mode === "group" ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("group")}</span>
                  <Select name="groupId" required defaultValue="">
                    <option value="" disabled>
                      {t("chooseGroup")}
                    </option>
                    {groups.map((group) => (
                      <option value={group.id} key={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <label className="grid gap-1 text-sm">
                  <span>{t("students")}</span>
                  <Select
                    multiple
                    value={selectedStudents}
                    onChange={(event) =>
                      setSelectedStudents(
                        Array.from(event.target.selectedOptions, (option) => option.value),
                      )
                    }
                    required
                    aria-describedby="homework-student-help"
                  >
                    {students.map((student) => (
                      <option value={student.id} key={student.id}>
                        {student.firstName} {student.lastName}
                      </option>
                    ))}
                  </Select>
                  <span id="homework-student-help" className="text-xs text-muted">
                    {t("selectMultipleHelp")}
                  </span>
                </label>
              )}
              <label className="grid gap-1 text-sm">
                <span>{t("titleLabel")}</span>
                <Input name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("dueDate")}</span>
                <Input name="dueAt" type="datetime-local" required />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("instructions")}</span>
                <Textarea name="instructions" maxLength={4000} rows={3} />
              </label>
              {canEditGrades ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("maxScore")}</span>
                  <Input name="maxScore" type="number" min="0.01" step="0.01" />
                </label>
              ) : null}
              {resources.length > 0 ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("resources")}</span>
                  <Select
                    multiple
                    value={selectedResources}
                    onChange={(event) =>
                      setSelectedResources(
                        Array.from(event.target.selectedOptions, (option) => option.value),
                      )
                    }
                  >
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.displayName}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
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
      <section className="space-y-4" aria-label={t("assignments")}>
        <h2 className="ui-card-title">{t("assignments")}</h2>
        {assignments.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        {assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{assignment.title}</h3>
                  <p className="text-sm text-muted">
                    {assignment.group?.name ?? t("selectedStudents")} ·{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(assignment.dueAt))}
                  </p>
                  {assignment.instructions ? (
                    <p className="mt-2 text-sm">{assignment.instructions}</p>
                  ) : null}
                  {assignment.resources.map((resource) => (
                    <span className="me-2 text-xs text-muted" key={resource.id}>
                      {resource.displayName}
                    </span>
                  ))}
                </div>
                <div className="text-sm">
                  {t("completion", {
                    completed: assignment.completedStudents,
                    total: assignment.totalStudents,
                    percent:
                      assignment.completionPercent === null
                        ? "—"
                        : Math.round(assignment.completionPercent),
                  })}
                  <div
                    className="mt-1 h-2 w-40 rounded bg-muted"
                    role="progressbar"
                    aria-label={t("completionBar")}
                    aria-valuenow={assignment.completionPercent ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${assignment.completionPercent ?? 0}%` }}
                    />
                  </div>
                </div>
                {canWriteHomework ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => archive(assignment.id)}
                    >
                      {t("archive")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        setEditingId(editingId === assignment.id ? null : assignment.id)
                      }
                    >
                      {editingId === assignment.id ? t("cancelEdit") : t("edit")}
                    </Button>
                  </>
                ) : null}
              </div>
              {canWriteHomework && editingId === assignment.id ? (
                <form
                  className="grid gap-3 md:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void editAssignment(assignment.id, event.currentTarget);
                  }}
                >
                  <Input
                    name="title"
                    defaultValue={assignment.title}
                    required
                    maxLength={160}
                    aria-label={t("titleLabel")}
                  />
                  <Input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={localDateTimeValue(assignment.dueAt)}
                    required
                    aria-label={t("dueDate")}
                  />
                  <Textarea
                    name="instructions"
                    defaultValue={assignment.instructions ?? ""}
                    maxLength={4000}
                    aria-label={t("instructions")}
                  />
                  <Button type="submit" disabled={busy}>
                    {t("saveEdit")}
                  </Button>
                </form>
              ) : null}
              <div className="divide-y divide-border">
                {assignment.submissions.map((submission) => (
                  <form
                    key={submission.id}
                    className="grid gap-2 py-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveSubmission(
                        assignment.id,
                        submission.student.id,
                        event.currentTarget,
                      );
                    }}
                  >
                    <strong className="text-sm">
                      {submission.student.firstName} {submission.student.lastName}
                    </strong>
                    <Select
                      name="status"
                      defaultValue={submission.status}
                      disabled={!canWriteHomework}
                      aria-label={t("status")}
                    >
                      <option value="not_submitted">{t("notSubmitted")}</option>
                      <option value="submitted">{t("submitted")}</option>
                      <option value="late">{t("late")}</option>
                      <option value="excused">{t("excused")}</option>
                    </Select>
                    <Input
                      name="feedback"
                      defaultValue={submission.teacherFeedback ?? ""}
                      disabled={!canWriteHomework}
                      placeholder={t("feedback")}
                    />
                    {assignment.maxScore !== null && canReadGrades ? (
                      canWriteHomework && canEditGrades ? (
                        <Input
                          name="score"
                          type="number"
                          min="0"
                          max={assignment.maxScore}
                          step="0.01"
                          defaultValue={submission.score ?? ""}
                          aria-label={t("score")}
                        />
                      ) : (
                        <span className="text-sm">
                          {t("gradeDisplay", {
                            score: submission.score === null ? "—" : submission.score,
                            max: assignment.maxScore,
                          })}
                        </span>
                      )
                    ) : null}
                    {canWriteHomework ? (
                      <Button type="submit" variant="secondary" disabled={busy}>
                        {t("saveStatus")}
                      </Button>
                    ) : null}
                  </form>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </section>
    </div>
  );
}
