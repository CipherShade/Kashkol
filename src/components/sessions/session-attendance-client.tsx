"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, EmptyState, ErrorState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { formatReport } from "@/modules/attendance/report";
import { useToast } from "@/components/ui/toast";
import type { SessionRevenueSummary } from "@/modules/payments/session-revenue";
import { QrScannerPanel } from "./qr-scanner-panel";

export type AttendanceSession = {
  id: string;
  groupName: string;
  groupColor: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "started" | "completed" | "cancelled";
  room: string | null;
  location: string | null;
  isOneOff?: boolean;
  seriesId?: string | null;
  pricePerStudentMinor?: number | null;
};

export type AttendanceMarkValue = "present" | "absent" | "late" | "excused";

export type HomeworkCompletionStatus = "completed" | "not_completed" | "not_applicable";

export type SessionHomework = {
  id: string;
  title: string;
  dueAt: string | null;
};

export type AttendanceRosterStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  mark: AttendanceMarkValue | null;
  source: "manual" | "qr" | null;
  recordedAt: string | null;
  paymentVerified?: boolean;
  isCrossSeason?: boolean;
  primaryGroupId?: string | null;
  primaryGroupName?: string | null;
  homeworkStatus?: HomeworkCompletionStatus | null;
};

type RosterResponse = {
  session: {
    id: string;
    status: string;
    group: { name: string; color: string };
    startsAt: string;
    endsAt: string | null;
    room: string | null;
    location: string | null;
  };
  roster: AttendanceRosterStudent[];
  homework: SessionHomework | null;
  canRecordHomework: boolean;
};

const MARKS: AttendanceMarkValue[] = ["present", "late", "absent", "excused"];

function formatTime(d: Date, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toTimeString().slice(0, 5);
  }
}

function errorMessageKey(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((payload) => {
      const error = (payload as { error?: { messageKey?: string } } | null)?.error;
      return typeof error?.messageKey === "string" ? error.messageKey : fallback;
    })
    .catch(() => fallback);
}

export function SessionAttendanceClient({
  session: initialSession,
  initialRoster,
  checkinPathPrefix,
  canSeeFinancials,
  homework,
  canRecordHomework,
}: {
  session: AttendanceSession;
  initialRoster: AttendanceRosterStudent[];
  checkinPathPrefix: string;
  canSeeFinancials: boolean;
  homework: SessionHomework | null;
  canRecordHomework: boolean;
}) {
  const t = useTranslations("Sessions.attendance");
  const tSessions = useTranslations("Sessions");
  const tRoot = useTranslations();
  const locale = useLocale();
  const push = useToast();

  const [session, setSession] = useState<AttendanceSession>(initialSession);
  const [roster, setRoster] = useState<AttendanceRosterStudent[]>(initialRoster);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [correction, setCorrection] = useState<{
    student: AttendanceRosterStudent;
    mark: AttendanceMarkValue;
    reason: string;
  } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  // Per-student offline homework completion state, seeded from the roster and
  // reconciled with the server on every refresh. Optimistic; lost only on reload.
  const [homeworkState, setHomeworkState] = useState<Record<string, HomeworkCompletionStatus | null>>(
    () => Object.fromEntries(initialRoster.map((r) => [r.studentId, r.homeworkStatus ?? null])),
  );
  const [revenue, setRevenue] = useState<SessionRevenueSummary | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState(false);

  const isOpen = session.status === "scheduled" || session.status === "started";

  const fetchRevenue = useCallback(async () => {
    if (!canSeeFinancials) {
      setRevenue(null);
      setRevenueLoading(false);
      setRevenueError(false);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${session.id}/revenue`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRevenue((await res.json()) as SessionRevenueSummary);
      setRevenueError(false);
    } catch {
      setRevenueError(true);
    } finally {
      setRevenueLoading(false);
    }
  }, [canSeeFinancials, session.id]);

  useEffect(() => {
    // Defer so no synchronous cascading render happens on mount.
    const task = () => void fetchRevenue();
    void task();
  }, [fetchRevenue]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sessions/${session.id}/attendance`, { cache: "no-store" });
    if (!res.ok) {
      push({ title: tRoot(await errorMessageKey(res, "errors.unknown")), tone: "danger" });
      return;
    }
    const data = (await res.json()) as RosterResponse;
    setRoster(data.roster);
    setSession((prev) => ({ ...prev, status: data.session.status as AttendanceSession["status"] }));
    setHomeworkState(
      Object.fromEntries(data.roster.map((r) => [r.studentId, r.homeworkStatus ?? null])),
    );
    await fetchRevenue();
  }, [session.id, push, tRoot, fetchRevenue]);

  const summary = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0, unrecorded: 0, total: roster.length };
    for (const student of roster) {
      if (!student.mark) counts.unrecorded += 1;
      else counts[student.mark] += 1;
    }
    return counts;
  }, [roster]);

  const payTogglesEnabled = canSeeFinancials && !!revenue && revenue.pricePerStudentMinor != null;

  const togglePayment = useCallback(
    async (student: AttendanceRosterStudent) => {
      const newVerified = !student.paymentVerified;
      setRoster((prev) =>
        prev.map((s) => (s.studentId === student.studentId ? { ...s, paymentVerified: newVerified } : s)),
      );
      try {
        const res = await fetch(`/api/sessions/${session.id}/attendance/${student.studentId}/payment`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verified: newVerified }),
        });
        if (!res.ok) throw new Error();
        push({
          title: newVerified ? t("paymentVerified") : t("paymentNotVerified"),
          tone: "success",
        });
        await fetchRevenue();
      } catch {
        setRoster((prev) =>
          prev.map((s) => (s.studentId === student.studentId ? { ...s, paymentVerified: !newVerified } : s)),
        );
        push({ title: t("paymentToggleFailed"), tone: "danger" });
        await fetchRevenue();
      }
    },
    [session.id, push, t, fetchRevenue],
  );

  const toggleHomework = useCallback(
    async (student: AttendanceRosterStudent, status: "completed" | "not_completed") => {
      // One-tap yes/no against the latest active homework for this group,
      // stored as a single offline `homework_completion_mark` row linked to
      // this session. Optimistic like the payment and attendance toggles.
      if (!homework || !canRecordHomework || busy) return;
      const previous = homeworkState[student.studentId] ?? null;
      setHomeworkState((prev) => ({ ...prev, [student.studentId]: status }));
      try {
        const response = await fetch(`/api/sessions/${session.id}/homework/${homework.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ marks: [{ studentId: student.studentId, status }] }),
        });
        if (!response.ok) throw new Error("homework_toggle_failed");
      } catch {
        setHomeworkState((prev) => ({ ...prev, [student.studentId]: previous }));
        push({ title: t("homeworkToggleFailed"), tone: "danger" });
      }
    },
    [homework, canRecordHomework, busy, homeworkState, session.id, push, t],
  );

  const handleScanSuccess = useCallback(
    (data: {
      student: { id: string; firstName: string; lastName: string };
      mark: { id: string; mark: string; paymentVerified: boolean; isCrossSeason: boolean };
      isCrossSeason: boolean;
    }) => {
      setRoster((prev) => {
        const existing = prev.find((s) => s.studentId === data.student.id);
        if (existing) {
          return prev.map((s) =>
            s.studentId === data.student.id
              ? {
                  ...s,
                  mark: data.mark.mark as AttendanceMarkValue,
                  source: "qr",
                  recordedAt: new Date().toISOString(),
                  paymentVerified: data.mark.paymentVerified,
                  isCrossSeason: data.isCrossSeason,
                }
              : s,
          );
        }
        return [
          ...prev,
          {
            studentId: data.student.id,
            firstName: data.student.firstName,
            lastName: data.student.lastName,
            mark: data.mark.mark as AttendanceMarkValue,
            source: "qr",
            recordedAt: new Date().toISOString(),
            paymentVerified: data.mark.paymentVerified,
            isCrossSeason: true,
            primaryGroupId: null,
            primaryGroupName: null,
          },
        ];
      });
    },
    [],
  );

  function summaryText(counts: typeof summary): string {
    return [
      `${t("mark_present")} ${counts.present}`,
      `${t("mark_late")} ${counts.late}`,
      `${t("mark_absent")} ${counts.absent}`,
      `${t("mark_excused")} ${counts.excused}`,
      `${t("unrecorded")} ${counts.unrecorded}`,
    ].join(" · ");
  }

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<{ ok: boolean; data?: Record<string, unknown> }> => {
      const res = await fetch(`/api/sessions/${session.id}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return { ok: true, data: (await res.json()) as Record<string, unknown> };
      }
      push({ title: tRoot(await errorMessageKey(res, "errors.unknown")), tone: "danger" });
      return { ok: false };
    },
    [session.id, push, tRoot],
  );

  const saveMark = useCallback(
    async (student: AttendanceRosterStudent, mark: AttendanceMarkValue) => {
      // Optimistic: flip the roster row immediately so taps feel instant. The
      // server returns ok/conflict only; on conflict the row rolls back to its
      // prior state and a toast reports it. A full refetch per tap would push a
      // round trip back to the network's current latency budget.
      const recordedAtIso = new Date().toISOString();
      setRoster((prev) =>
        prev.map((s) =>
          s.studentId === student.studentId
            ? { ...s, mark, source: "manual", recordedAt: recordedAtIso }
            : s,
        ),
      );
      const { ok } = await post({ action: "mark", studentId: student.studentId, mark });
      if (!ok) {
        setRoster((prev) =>
          prev.map((s) =>
            s.studentId === student.studentId
              ? { ...s, mark: null, source: null, recordedAt: null }
              : s,
          ),
        );
        return;
      }
      void fetchRevenue();
    },
    [post, fetchRevenue],
  );

  const markAllPresent = useCallback(async () => {
    setBusy(true);
    try {
      const { ok } = await post({ action: "mark_all_present" });
      if (ok) {
        push({ title: t("marksSaved") });
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [post, push, t, refresh]);

  const startAttendance = useCallback(async () => {
    // One-tap "Start attendance": start the session and jump straight into
    // the scan flow. The scanner is already open by then, so the assistant
    // can register students immediately.
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        push({ title: tSessions("sessionStarted"), tone: "success" });
        await refresh();
        setShowScanner(true);
      } else {
        push({ title: tRoot(await errorMessageKey(res, "errors.unknown")), tone: "danger" });
      }
    } finally {
      setBusy(false);
    }
  }, [session.id, push, tSessions, tRoot, refresh]);

  const closeSession = useCallback(
    async (confirmIncomplete: boolean) => {
      setBusy(true);
      try {
        const { ok, data } = await post({ action: "close", confirmIncomplete });
        if (ok) {
          push({ title: t("sessionClosed") });
          await refresh();
          if (data) {
            const payload = data as {
              summary?: Record<string, number>;
            };
            if (payload.summary && isOpen) setConfirmClose(false);
          }
          setConfirmClose(false);
        }
      } finally {
        setBusy(false);
      }
    },
    [post, push, t, refresh, isOpen],
  );

  const reportText = useMemo(() => {
    const lang = (locale === "ar" ? "ar" : "en") as "ar" | "en";
    return formatReport({
      locale: lang,
      workspaceName: session.groupName || "Kashkol",
      groupName: session.groupName || "",
      sessionDate: new Date(session.startsAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US"),
      sessionTime: session.endsAt ? new Date(session.endsAt).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US") : null,
      roster: roster.map((r) => ({
        studentId: r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        mark: r.mark,
      })),
    });
  }, [roster, session, locale]);

  const handleCopyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setShowReport(false);
      push({ title: locale === "ar" ? "تم نسخ التقرير" : "Report copied", tone: "success" });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      push({ title: locale === "ar" ? "فشل النسخ" : "Copy failed", tone: "danger" });
    }
  }, [reportText, locale, push]);

  const submitCorrection = useCallback(async () => {
    if (!correction || correction.reason.trim().length === 0) return;
    setBusy(true);
    try {
      const { ok } = await post({
        action: "correct",
        studentId: correction.student.studentId,
        newMark: correction.mark,
        reason: correction.reason.trim(),
      });
      if (ok) {
        push({ title: t("markCorrected") });
        setCorrection(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [correction, post, push, t, refresh]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title={t("rosterTitle")}
              description={`${new Date(session.startsAt).toLocaleString(locale)}${
                session.endsAt ? ` – ${formatTime(new Date(session.endsAt), locale)}` : ""
              }`}
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isOpen && (
                  <Button
                    size="sm"
                    variant={showScanner ? "primary" : "outline"}
                    onClick={() => setShowScanner((prev) => !prev)}
                    disabled={busy}
                  >
                    <Icon name="qr" size={16} />
                    {showScanner ? t("stopCamera") : t("scanQr")}
                  </Button>
                )}
                {isOpen && (
                  <Button size="sm" variant="outline" onClick={() => void markAllPresent()} disabled={busy}>
                    <Icon name="check" size={16} />
                    {t("allPresent")}
                  </Button>
                )}
                {session.status === "scheduled" && (
                  <Button size="sm" onClick={() => void startAttendance()} disabled={busy}>
                    <Icon name="qr" size={16} />
                    {t("startAttendance")}
                  </Button>
                )}
                {isOpen && (
                  <Button size="sm" onClick={() => setConfirmClose(true)} disabled={busy}>
                    {t("closeSession")}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={busy}>
                  {t("refresh")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReport(true)} disabled={busy || roster.length === 0}>
                  <Icon name="clipboard" size={16} />
                  {locale === "ar" ? "نسخ التقرير" : "Copy report"}
                </Button>
              </div>

              {showScanner && (
                <div className="mb-4">
                  <QrScannerPanel
                    sessionId={session.id}
                    onScanSuccess={handleScanSuccess}
                    onClose={() => setShowScanner(false)}
                  />
                </div>
              )}

              {canSeeFinancials && revenueLoading && (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {t("loadingRevenue")}
                </div>
              )}
              {canSeeFinancials && !revenueLoading && revenueError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <span>{t("revenueUnavailable")}</span>
                  <Button size="sm" variant="outline" onClick={() => void fetchRevenue()}>
                    {t("revenueRetry")}
                  </Button>
                </div>
              )}
              {canSeeFinancials && !revenueLoading && !revenueError && revenue && revenue.pricePerStudentMinor != null && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon name="creditCard" size={16} />
                      {t("sessionPrice")}: {(revenue.pricePerStudentMinor / 100).toFixed(2)} {t("priceUnit")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {roster.filter((s) => s.paymentVerified && (s.mark === "present" || s.mark === "late")).length} / {revenue.eligibleAttendanceCount} {t("paidStudentsCount")}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded bg-background p-2 border">
                      <div className="text-muted-foreground">{t("expectedRevenue")}</div>
                      <div className="font-semibold text-sm">{((revenue.expectedRevenueMinor ?? 0) / 100).toFixed(2)} {t("priceUnit")}</div>
                    </div>
                    <div className="rounded bg-background p-2 border">
                      <div className="text-muted-foreground">{t("collectedRevenue")}</div>
                      <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">{(revenue.collectedRevenueMinor / 100).toFixed(2)} {t("priceUnit")}</div>
                    </div>
                    <div className="rounded bg-background p-2 border">
                      <div className="text-muted-foreground">{t("outstandingRevenue")}</div>
                      <div className="font-semibold text-sm text-amber-600 dark:text-amber-400">{((revenue.outstandingRevenueMinor ?? 0) / 100).toFixed(2)} {t("priceUnit")}</div>
                    </div>
                  </div>
                </div>
              )}

              {roster.length === 0 ? (
                <EmptyState icon="users" title={t("noStudents")} description={t("noStudentsHint")} />
              ) : (
                <ul className="ui-attendance-list">
                  {roster.map((student) => (
                    <li
                      key={student.studentId}
                      className="ui-attendance-row"
                      data-cross-season={student.isCrossSeason ? "true" : undefined}
                    >
                      <div className="min-w-40 flex-1">
                        <div className="flex items-center gap-2 font-medium text-sm">
                          <span>{student.firstName} {student.lastName}</span>
                          {student.isCrossSeason && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              {student.primaryGroupName ? `${t("crossSeasonBadge")} (${student.primaryGroupName})` : t("crossSeasonBadge")}
                            </span>
                          )}
                        </div>
                        {student.mark && student.recordedAt ? (
                          <div className="text-xs text-muted-foreground">
                            {student.source === "qr" ? (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="checkCircle" size={12} />
                                {t("sourceQr")}
                              </span>
                            ) : (
                              t("sourceManual")
                            )}
                            {" · "}
                            {new Date(student.recordedAt).toLocaleString(locale)}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">{t("unrecorded")}</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {payTogglesEnabled && (
                          <button
                            type="button"
                            disabled={!isOpen || busy}
                            onClick={() => void togglePayment(student)}
                            className={
                              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors " +
                              (student.paymentVerified
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted")
                            }
                            title={student.paymentVerified ? t("paymentVerified") : t("paymentNotVerified")}
                          >
                            <Icon name={student.paymentVerified ? "checkCircle" : "creditCard"} size={14} />
                            <span>{student.paymentVerified ? t("paid") : t("unpaid")}</span>
                          </button>
                        )}
                        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t("rosterTitle")}>
                          {MARKS.map((mark) => (
                            <button
                              key={mark}
                              type="button"
                              role="radio"
                              aria-checked={student.mark === mark}
                              disabled={!isOpen || busy}
                              onClick={() => {
                                if (!isOpen) return;
                                if (student.mark === null || student.mark === undefined) {
                                  void saveMark(student, mark);
                                  return;
                                }
                                setCorrection({ student, mark, reason: "" });
                              }}
                              className={"ui-attendance-mark" + (student.mark === mark ? " is-active" : "")}
                              data-mark={mark}
                            >
                              {t(`mark_${mark}`)}
                            </button>
                          ))}
                        </div>
                        {homework && canRecordHomework && isOpen && (
                          <div
                            className="ui-attendance-hw"
                            role="group"
                            aria-label={homework.title}
                            title={t("homeworkQuestion", { title: homework.title })}
                          >
                            <button
                              type="button"
                              className="ui-attendance-hw-button"
                              data-state={homeworkState[student.studentId] === "completed" ? "completed" : undefined}
                              aria-pressed={homeworkState[student.studentId] === "completed"}
                              disabled={busy}
                              onClick={() => void toggleHomework(student, "completed")}
                            >
                              ✓ {t("homeworkYes")}
                            </button>
                            <button
                              type="button"
                              className="ui-attendance-hw-button"
                              data-state={homeworkState[student.studentId] === "not_completed" ? "not_completed" : undefined}
                              aria-pressed={homeworkState[student.studentId] === "not_completed"}
                              disabled={busy}
                              onClick={() => void toggleHomework(student, "not_completed")}
                            >
                              ✕ {t("homeworkNo")}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="ui-summary-chips">
                <span data-tone="present">{t("mark_present")}: {summary.present}</span>
                <span data-tone="late">{t("mark_late")}: {summary.late}</span>
                <span data-tone="absent">{t("mark_absent")}: {summary.absent}</span>
                <span data-tone="excused">{t("mark_excused")}: {summary.excused}</span>
                <span>{t("unrecorded")}: {summary.unrecorded}</span>
              </div>
            </CardBody>
          </Card>
        </div>

        <QrPanel sessionId={session.id} open={isOpen} checkinPathPrefix={checkinPathPrefix} />
      </div>

      <Dialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t("closeConfirmTitle")}
      >
        <div className="space-y-3">
          <p className="text-sm">{summaryText(summary)}</p>
          {summary.unrecorded > 0 ? (
            <Alert tone="warning" title={t("incompleteWarning", { count: summary.unrecorded })}>
              {t("closeConfirmBody")}
            </Alert>
          ) : (
            <Alert tone="info">{t("closeConfirmBody")}</Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmClose(false)}>
              {t("closeKeepOpen")}
            </Button>
            <Button
              type="button"
              onClick={() => void closeSession(summary.unrecorded > 0)}
              disabled={busy}
            >
              {t("closeConfirmSubmit")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!correction}
        onOpenChange={(open) => !open && setCorrection(null)}
        title={t("correctionTitle")}
      >
        <div className="space-y-3">
          {correction ? (
            <>
              <p className="text-sm">
                {correction.student.firstName} {correction.student.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{t("correctionHint")}</p>
              <Field
                label={t("correctionReasonLabel")}
                name="correction-reason"
                required
                value={correction.reason}
                onChange={(e) => setCorrection({ ...correction, reason: e.target.value })}
                maxLength={500}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCorrection(null)}>
                  {t("cancelCorrection")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void submitCorrection()}
                  disabled={busy || correction.reason.trim().length === 0}
                >
                  {t("correctionSubmit")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>

      <Dialog open={showReport} onOpenChange={setShowReport} title={locale === "ar" ? "تقرير الحضور" : "Attendance Report"}>
        <div className="space-y-3">
          <div className="max-h-[22rem] overflow-y-auto rounded-md border bg-muted p-3 whitespace-pre-wrap text-sm font-sans leading-relaxed">
            {reportText}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => void handleCopyReport()}
              disabled={busy || copied}
            >
              <Icon name="clipboard" size={16} />
              {copied
                ? (locale === "ar" ? "تم النسخ!" : "Copied!")
                : (locale === "ar" ? "نسخ التقرير" : "Copy to clipboard")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

type QrPhase =
  | "idle"
  | "busy"
  | "active"
  | "error";

function QrPanel({
  sessionId,
  open,
  checkinPathPrefix,
}: {
  sessionId: string;
  open: boolean;
  checkinPathPrefix: string;
}) {
  const t = useTranslations("Sessions.attendance");
  const tRoot = useTranslations();
  const [phase, setPhase] = useState<QrPhase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const issue = useCallback(async () => {
    setPhase("busy");
    setErrorKey(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/attendance/qr`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ttlMinutes: 30 }),
      });
      if (!res.ok) {
        setPhase("error");
        setErrorKey(await errorMessageKey(res, "errors.unknown"));
        return;
      }
      const data = (await res.json()) as { token: string; expiresAt: string };
      const url = `${window.location.origin}${checkinPathPrefix}?checkin=${data.token}`;
      const qrcode = (await import("qrcode-generator")).default;
      const qr = qrcode(0, "L");
      qr.addData(url);
      qr.make();
      setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
      setToken(data.token);
      setExpiresAt(new Date(data.expiresAt).getTime());
      setNow(Date.now());
      setPhase("active");
    } catch {
      setPhase("error");
      setErrorKey("errors.unknown");
    }
  }, [sessionId, checkinPathPrefix]);

  if (!open) {
    return (
      <Card>
        <CardHeader title={t("qrTitle")} />
        <CardBody>
          <Alert tone="info" title={t("qrNotAvailable")} description={t("qrNotAvailableHint")} />
        </CardBody>
      </Card>
    );
  }

  const remaining = phase === "active" && expiresAt ? Math.max(0, expiresAt - now) : 0;
  const remainingText = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;
  const expired = phase === "active" && remaining === 0;

  return (
    <Card>
      <CardHeader title={t("qrTitle")} description={t("qrSessionLabel")} />
      <CardBody className="space-y-3">
        {phase === "active" && token ? (
          <>
            <div className="flex justify-center rounded-md bg-white p-3" role="img" aria-label={t("qrTitle")}>
              {svg ? <span style={{ inlineSize: "192px" }} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-xs text-muted-foreground">{t("qrPayloadHint")}</p>
              <p className="text-xs text-muted-foreground">{t("qrPresentOnlyHint")}</p>
              <p className="flex items-center gap-1 text-xs font-medium">
                <Icon name="alert" size={12} />
                {expired ? t("qrExpired") : t("qrExpiresIn", { time: remainingText })}
              </p>
              <p className="text-xs text-muted-foreground">{t("qrRotationHint")}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void issue()}>
              {t("rotateQr")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("qrIdleHint")}</p>
            {phase === "error" ? <ErrorState title={tRoot(errorKey ?? "errors.unknown")} /> : null}
            <Button size="sm" onClick={() => void issue()} disabled={phase === "busy"}>
              <Icon name="check" size={16} />
              {phase === "busy" ? t("qrIssuing") : t("issueQr")}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
