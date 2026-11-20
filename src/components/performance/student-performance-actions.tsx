"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/form";
import { formatPerformanceDate } from "./performance-format";
import { requestPerformanceJson } from "./client-request";

export type RiskActionItem = {
  ruleKey: "low_average" | "declining_trend" | "weak_topic";
  riskKey: string;
  title: string;
  description: string;
  action: string;
  threshold: number;
  detectedAt: string;
  evidenceIds: string[];
  acknowledgedAt: string | null;
};

export type PaperAssessmentItem = {
  id: string;
  title: string;
  date: string;
  maxScore: number;
};

type TopicDraft = { topic: string; correctCount: string; incorrectCount: string };

async function failureMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { messageKey?: string } };
    return body.error?.messageKey ?? null;
  } catch {
    return null;
  }
}

export function StudentPerformanceActions({
  studentId,
  risks,
  assessments,
  from,
  to,
  locale,
  canWrite,
}: {
  studentId: string;
  risks: RiskActionItem[];
  assessments: PaperAssessmentItem[];
  from?: string;
  to?: string;
  locale: string;
  canWrite: boolean;
}) {
  const t = useTranslations("Performance");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState(assessments[0]?.id ?? "");
  const [topics, setTopics] = useState<TopicDraft[]>([
    { topic: "", correctCount: "0", incorrectCount: "0" },
  ]);
  const [note, setNote] = useState("");

  const period = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  function errorMessage(key: string | null): string {
    if (key === "Performance.errors.staleRisk") return t("errors.staleRisk");
    if (key === "Performance.errors.paperOnly") return t("errors.paperOnly");
    return t("error");
  }

  async function acknowledgeRisk(event: React.FormEvent<HTMLFormElement>, risk: RiskActionItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const createFollowUp = form.get("createFollowUp") === "on";
    const dueAtRaw = String(form.get("dueAt") ?? "").trim();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/performance/risks/acknowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId,
          ruleKey: risk.ruleKey,
          riskKey: risk.riskKey,
          title: risk.title,
          ...period,
          note: String(form.get("note") ?? "").trim() || null,
          createFollowUp,
          dueAt: createFollowUp && dueAtRaw ? new Date(dueAtRaw).toISOString() : null,
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        setError(errorMessage(await failureMessage(response)));
        return;
      }
      setSuccess(t("risks.saveSuccess"));
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveTopics(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assessmentId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/performance/students/${encodeURIComponent(studentId)}/topic-results`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assessmentId,
            topics: topics.map((topic) => ({
              topic: topic.topic.trim(),
              correctCount: Number(topic.correctCount),
              incorrectCount: Number(topic.incorrectCount),
            })),
          }),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        setError(errorMessage(await failureMessage(response)));
        return;
      }
      setSuccess(t("profile.topicsSaved"));
      setTopics([{ topic: "", correctCount: "0", incorrectCount: "0" }]);
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await requestPerformanceJson("/api/performance/report-notes", "POST", {
        studentId,
        body: note.trim(),
      });
      setSuccess(t("profile.noteSaved"));
      setNote("");
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={t("risks.title")} titleId="performance-risks-title" />
        <CardBody className="grid gap-3">
          {!canWrite ? (
            <p className="text-sm text-muted-foreground">{t("needWritePermission")}</p>
          ) : null}
          {risks.length === 0 ? <p className="text-sm">{t("risks.noRisks")}</p> : null}
          {risks.map((risk) => (
            <article key={risk.riskKey} className="rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">{risk.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{risk.description}</p>
              <dl className="mt-2 grid gap-1 text-xs">
                <div>
                  <dt className="inline font-semibold">{t("risks.rule")}: </dt>
                  <dd className="inline">{risk.ruleKey}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{t("risks.threshold")}: </dt>
                  <dd className="inline">{risk.threshold}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{t("risks.detectedAt")}: </dt>
                  <dd className="inline">{formatPerformanceDate(risk.detectedAt, locale)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{t("risks.suggestion")}: </dt>
                  <dd className="inline">{risk.action}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{t("risks.evidence")}: </dt>
                  <dd className="inline">{risk.evidenceIds.join(", ") || "—"}</dd>
                </div>
              </dl>
              {risk.acknowledgedAt ? (
                <p className="mt-2 text-xs font-semibold">
                  {t("risks.acknowledged")} · {formatPerformanceDate(risk.acknowledgedAt, locale)}
                </p>
              ) : canWrite ? (
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) => void acknowledgeRisk(event, risk)}
                >
                  <FormField label={t("risks.note")}>
                    <Textarea name="note" rows={2} maxLength={2000} disabled={busy} />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="createFollowUp" disabled={busy} />
                    <span>{t("risks.createFollowUp")}</span>
                  </label>
                  <FormField label={t("risks.followUpTitle")}>
                    <Input name="title" required defaultValue={risk.title} disabled={busy} />
                  </FormField>
                  <FormField label={t("risks.dueAt")}>
                    <Input name="dueAt" type="datetime-local" disabled={busy} />
                  </FormField>
                  <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
                    {busy ? t("risks.acknowledging") : t("risks.acknowledge")}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader
            title={t("profile.topicFormTitle")}
            description={t("profile.topicFormHint")}
            titleId="performance-topics-title"
          />
          <CardBody>
            {assessments.length === 0 ? (
              <p className="text-sm">{t("profile.noPaperAssessments")}</p>
            ) : canWrite ? (
              <form className="grid gap-3" onSubmit={(event) => void saveTopics(event)}>
                <FormField label={t("profile.assessment")}>
                  <Select
                    value={assessmentId}
                    onChange={(event) => setAssessmentId(event.target.value)}
                    required
                  >
                    <option value="">{t("profile.selectAssessment")}</option>
                    {assessments.map((assessment) => (
                      <option key={assessment.id} value={assessment.id}>
                        {assessment.title} · {formatPerformanceDate(assessment.date, locale)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {topics.map((topic, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-3">
                    <FormField label={t("profile.topic")}>
                      <Input
                        required
                        maxLength={120}
                        value={topic.topic}
                        onChange={(event) =>
                          setTopics((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, topic: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </FormField>
                    <FormField label={t("profile.correctCount")}>
                      <Input
                        type="number"
                        min={0}
                        required
                        value={topic.correctCount}
                        onChange={(event) =>
                          setTopics((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, correctCount: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </FormField>
                    <FormField label={t("profile.incorrectCount")}>
                      <Input
                        type="number"
                        min={0}
                        required
                        value={topic.incorrectCount}
                        onChange={(event) =>
                          setTopics((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, incorrectCount: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </FormField>
                    {topics.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="md:col-span-3"
                        onClick={() =>
                          setTopics((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        {t("profile.removeTopic")}
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setTopics((current) => [
                      ...current,
                      { topic: "", correctCount: "0", incorrectCount: "0" },
                    ])
                  }
                >
                  {t("profile.addTopic")}
                </Button>
                <Button type="submit" variant="primary" disabled={busy || !assessmentId} aria-busy={busy}>
                  {t("profile.saveTopics")}
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("profile.shareableNotes")}
            description={t("profile.shareableNoteHint")}
            titleId="performance-notes-title"
          />
          <CardBody>
            {canWrite ? (
              <form className="grid gap-3" onSubmit={(event) => void saveNote(event)}>
                <FormField label={t("profile.noteBody")}>
                  <Textarea
                    required
                    maxLength={2000}
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </FormField>
                <Button type="submit" variant="primary" disabled={busy || !note.trim()} aria-busy={busy}>
                  {t("profile.saveNote")}
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive xl:col-span-2">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm xl:col-span-2">
          {success}
        </p>
      ) : null}
    </div>
  );
}
