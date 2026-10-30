"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";

type Student = { id: string; firstName: string; lastName: string };
type Owner = { id: string; name: string };
type Reason = {
  rule: "repeated_absences" | "overdue_homework" | "declining_assessments";
  sources: Array<{ id: string; type: string; label: string; date: string }>;
  details: Record<string, number | string>;
};
type Flag = { student: Student; reasons: Reason[] };
type FollowUp = {
  id: string;
  student: Student;
  owner: Owner;
  title: string;
  note: string | null;
  dueAt: string | null;
  status: "open" | "resolved";
  outcome: string | null;
  resolvedAt: string | null;
  createdAt: string;
  history: Array<{ actor: string; action: string; outcome: string | null; createdAt: string }>;
};
type Dashboard = {
  flags: Flag[];
  followUps: FollowUp[];
  sourceAccess: { attendance: boolean; homework: boolean; assessments: boolean };
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

export function FollowUpsClient({
  initialDashboard,
  students,
  owners,
  locale,
  canWrite,
}: {
  initialDashboard: Dashboard;
  students: Student[];
  owners: Owner[];
  locale: string;
  canWrite: boolean;
}) {
  const t = useTranslations("Academics.followups");
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function reload() {
    setDashboard(await requestJson<Dashboard>("/api/follow-ups"));
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(false);
    try {
      const dueAt = String(form.get("dueAt") ?? "");
      await requestJson("/api/follow-ups", "POST", {
        studentId: String(form.get("studentId")),
        ownerUserId: String(form.get("ownerUserId")),
        title: String(form.get("title") ?? ""),
        note: String(form.get("note") ?? "").trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      formElement.reset();
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function resolveTask(id: string, form: HTMLFormElement) {
    const outcome = String(new FormData(form).get("outcome"));
    setBusy(true);
    setError(false);
    try {
      await requestJson(`/api/follow-ups/${id}`, "PATCH", { outcome });
      await reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <h2 className="ui-card-title">{t("flagsTitle")}</h2>
          <p className="text-sm text-muted">{t("rulesIntro")}</p>
          <p className="text-xs text-muted">
            {t("sourceAccess", {
              attendance: dashboard.sourceAccess.attendance ? t("available") : t("notAvailable"),
              homework: dashboard.sourceAccess.homework ? t("available") : t("notAvailable"),
              assessments: dashboard.sourceAccess.assessments ? t("available") : t("notAvailable"),
            })}
          </p>
          {dashboard.flags.length === 0 ? <p>{t("emptyFlags")}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard.flags.map(({ student, reasons }) => (
              <article className="rounded-lg border border-border p-4" key={student.id}>
                <h3 className="font-semibold">
                  {student.firstName} {student.lastName}
                </h3>
                {reasons.map((reason, index) => (
                  <div className="mt-3 text-sm" key={`${reason.rule}-${index}`}>
                    <strong>{t(`rules.${reason.rule}`)}</strong>
                    <p className="text-muted">{formatDetails(t, reason)}</p>
                    <ul className="mt-1 list-inside list-disc">
                      {reason.sources.map((source) => (
                        <li key={`${source.type}-${source.id}`}>
                          <span>{source.label}</span> ·{" "}
                          <time dateTime={source.date}>
                            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                              new Date(source.date),
                            )}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </CardBody>
      </Card>

      {canWrite ? (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="ui-card-title">{t("createTitle")}</h2>
            <form onSubmit={createTask} className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{t("student")}</span>
                <Select name="studentId" required defaultValue="">
                  <option value="" disabled>
                    {t("chooseStudent")}
                  </option>
                  {students.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.firstName} {student.lastName}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("owner")}</span>
                <Select name="ownerUserId" required defaultValue={owners[0]?.id ?? ""}>
                  {owners.map((owner) => (
                    <option value={owner.id} key={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("taskTitle")}</span>
                <Input name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("dueDate")}</span>
                <Input name="dueAt" type="datetime-local" />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>{t("privateNote")}</span>
                <Textarea name="note" maxLength={2000} rows={3} />
              </label>
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={busy || students.length === 0 || owners.length === 0}
                >
                  {busy ? t("saving") : t("createTask")}
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
        <h2 className="ui-card-title">{t("historyTitle")}</h2>
        {dashboard.followUps.length === 0 ? (
          <p className="text-sm text-muted">{t("emptyHistory")}</p>
        ) : null}
        {dashboard.followUps.map((followUp) => (
          <Card key={followUp.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {followUp.student.firstName} {followUp.student.lastName} · {followUp.title}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("ownerAndDue", {
                      owner: followUp.owner.name,
                      due: followUp.dueAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(followUp.dueAt))
                        : t("noDueDate"),
                    })}
                  </p>
                  {followUp.note ? <p className="mt-2 text-sm">{followUp.note}</p> : null}
                </div>
                <strong className="text-sm">{t(`status.${followUp.status}`)}</strong>
              </div>
              {followUp.status === "open" && canWrite ? (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void resolveTask(followUp.id, event.currentTarget);
                  }}
                >
                  <Select name="outcome" aria-label={t("outcome")}>
                    <option value="contacted">{t("outcomes.contacted")}</option>
                    <option value="no_answer">{t("outcomes.no_answer")}</option>
                    <option value="monitoring">{t("outcomes.monitoring")}</option>
                    <option value="no_action">{t("outcomes.no_action")}</option>
                    <option value="other">{t("outcomes.other")}</option>
                  </Select>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {t("markResolved")}
                  </Button>
                </form>
              ) : followUp.status === "resolved" ? (
                <p className="text-sm">
                  {t("resolvedOutcome", {
                    outcome: followUp.outcome ? t(`outcomes.${followUp.outcome}`) : "—",
                  })}
                </p>
              ) : null}
              <ol className="space-y-1 border-s border-border ps-4 text-xs text-muted">
                {followUp.history.map((entry, index) => (
                  <li key={`${followUp.id}-${index}`}>
                    {entry.actor} · {t(`historyActions.${entry.action}`)}
                    {entry.outcome ? ` · ${t(`outcomes.${entry.outcome}`)}` : ""}
                    {" · "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.createdAt))}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ))}
      </section>
    </div>
  );
}

function formatDetails(
  t: ReturnType<typeof useTranslations<"Academics.followups">>,
  reason: Reason,
) {
  if (reason.rule === "repeated_absences") {
    return t("details.repeatedAbsences", {
      count: Number(reason.details.consecutiveAbsences),
      threshold: Number(reason.details.threshold),
      group: String(reason.details.group),
    });
  }
  if (reason.rule === "overdue_homework") {
    return t("details.overdueHomework", { due: String(reason.details.dueAt) });
  }
  return t("details.decliningAssessments", {
    previous: Number(reason.details.previousAveragePercent),
    recent: Number(reason.details.recentAveragePercent),
  });
}
