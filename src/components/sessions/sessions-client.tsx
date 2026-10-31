"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Field, FormField, SubmitButton } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  cancelSessionAction,
  completeSessionAction,
  createOneOffSessionAction,
  rescheduleSessionAction,
  startSessionAction,
  updateSessionAction,
} from "@/app/actions/sessions";
import { initialFormState } from "@/lib/forms/action-state";
import type { GroupListItem } from "@/modules/groups/repository";

export type SessionItem = {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  startsAt: string | Date;
  endsAt: string | Date | null;
  status: "scheduled" | "started" | "completed" | "cancelled";
  isOneOff: boolean;
  cancelledAt: string | Date | null;
  hasAttendance: boolean;
  room?: string | null;
  location?: string | null;
  notes?: string | null;
  seriesId?: string | null;
};

type ViewMode = "week" | "agenda" | "month";

function startOfWeekSaturday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatTime(d: Date, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toTimeString().slice(0, 5);
  }
}

export function SessionsClient({ groups, initialSessions }: { groups: GroupListItem[]; initialSessions: SessionItem[] }) {
  const t = useTranslations("Sessions");
  const tRoot = useTranslations();
  const locale = useLocale();
  const push = useToast();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [sessions] = useState<SessionItem[]>(initialSessions);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [createState, createAction] = useFormState(createOneOffSessionAction, initialFormState);
  const [rescheduleState, rescheduleAction] = useFormState(rescheduleSessionAction, initialFormState);
  const [cancelState, cancelAction] = useFormState(cancelSessionAction, initialFormState);
  const [updateState, updateAction] = useFormState(updateSessionAction, initialFormState);
  const [startState, startSessionFormAction] = useFormState(startSessionAction, initialFormState);
  const [completeState, completeSessionFormAction] = useFormState(completeSessionAction, initialFormState);

  useEffect(() => {
    if (createState.status === "success") {
      push({ title: createState.noticeKey ? tRoot(createState.noticeKey) : t("sessionCreated") });
    }
    if (rescheduleState.status === "success") {
      push({ title: rescheduleState.noticeKey ? tRoot(rescheduleState.noticeKey) : t("sessionRescheduled") });
    }
    if (cancelState.status === "success") {
      push({ title: cancelState.noticeKey ? tRoot(cancelState.noticeKey) : t("sessionCancelled") });
    }
    if (updateState.status === "success") {
      push({ title: updateState.noticeKey ? tRoot(updateState.noticeKey) : t("sessionUpdated") });
    }
    if (startState.status === "success") {
      push({ title: startState.noticeKey ? tRoot(startState.noticeKey) : t("sessionStarted") });
    }
    if (completeState.status === "success") {
      push({ title: completeState.noticeKey ? tRoot(completeState.noticeKey) : t("sessionCompleted") });
    }
  }, [createState, rescheduleState, cancelState, updateState, startState, completeState, t, tRoot, push]);

  const weekStart = useMemo(() => startOfWeekSaturday(currentDate), [currentDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    for (const day of weekDays) {
      map.set(day.toISOString().slice(0, 10), []);
    }
    for (const s of sessions) {
      const d = new Date(s.startsAt);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [sessions, weekDays]);

  const goToPrev = () => setCurrentDate((d) => addDays(d, view === "week" ? -7 : -1));
  const goToNext = () => setCurrentDate((d) => addDays(d, view === "week" ? 7 : 1));
  const goToToday = () => setCurrentDate(new Date());

  const getDateKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
  const todayKey = getDateKey(new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPrev}>
            <Icon name="chevron-left" size={16} />
            {t("previousWeek")}
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("today")}
          </Button>
          <Button variant="outline" size="sm" onClick={goToNext}>
            {t("nextWeek")}
            <Icon name="chevron-right" size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            {t("thisWeek")}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            items={[
              { value: "week", label: t("weekView") },
              { value: "agenda", label: t("agendaView") },
              { value: "month", label: t("monthView") },
            ]}
            value={view}
            onValueChange={(v) => setView(v as ViewMode)}
            label={t("pageTitle")}
          >
            <span />
          </Tabs>
          <Dialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            title={t("createSession")}
            trigger={
              <Button size="sm">
                <Icon name="plus" size={16} />
                {t("createSession")}
              </Button>
            }
          >
            <form action={createAction} className="space-y-3">
              <FormField label={t("group")}>
                <select name="groupId" required className="ui-select">
                  <option value="">{t("group")}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <Field label={t("startsAtTime")} name="startsAt" type="datetime-local" required />
              <Field label={t("endsAt")} name="endsAt" type="datetime-local" />
              <Field label={t("room")} name="room" />
              <Field label={t("location")} name="location" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  {t("cancel")}
                </Button>
                <SubmitButton idleKey="Sessions.save" />
              </div>
            </form>
          </Dialog>
        </div>
      </div>

      {view === "week" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = getDateKey(day);
            const daySessions = sessionsByDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <Card key={key} className={isToday ? "ring-1 ring-primary" : ""}>
                <CardHeader title={day.toLocaleDateString(locale, { weekday: "long" })} description={day.toLocaleDateString(locale, { month: "short", day: "numeric" })} />
                <CardBody className="space-y-2">
                  {daySessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("noSessions")}</p>
                  ) : (
                    daySessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSession(s)}
                        className="w-full rounded-md border p-2 text-start text-sm hover:bg-accent"
                        style={{ borderLeft: `4px solid ${s.groupColor || "#3b82f6"}` }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{formatTime(new Date(s.startsAt), locale)}</div>
                          <span className="text-xs text-muted-foreground">{t(s.status)}</span>
                        </div>
                        <div className="text-sm">{s.groupName}</div>
                        {s.isOneOff ? <div className="text-xs text-muted-foreground">{t("oneOff")}</div> : null}
                      </button>
                    ))
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {view === "agenda" && (
        <Card>
          <CardHeader title={t("agendaView")} />
          <CardBody className="space-y-2">
            {sessions.length === 0 ? (
              <EmptyState title={t("noSessions")} />
            ) : (
              [...sessions]
                .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSession(s)}
                    className="flex w-full items-center justify-between rounded-md border p-3 text-start hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-10 rounded" style={{ backgroundColor: s.groupColor || "#3b82f6" }} />
                      <div>
                        <div className="font-medium">{s.groupName}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.startsAt).toLocaleString(locale)} {s.endsAt ? `- ${formatTime(new Date(s.endsAt), locale)}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{t(s.status)}</div>
                  </button>
                ))
            )}
          </CardBody>
        </Card>
      )}

      {view === "month" && (
        <Card>
          <CardHeader title={t("monthView")} />
          <CardBody>
            <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
          </CardBody>
        </Card>
      )}

      {selectedSession && (
        <Dialog
          open={!!selectedSession}
          onOpenChange={(open) => !open && setSelectedSession(null)}
          title={selectedSession.groupName}
          description={new Date(selectedSession.startsAt).toLocaleString(locale)}
        >
          <div className="space-y-3">
            <div className="text-sm">
              <div>
                {t("status")}: {t(selectedSession.status)}
              </div>
              {selectedSession.room ? (
                <div>
                  {t("room")}: {selectedSession.room}
                </div>
              ) : null}
              {selectedSession.location ? (
                <div>
                  {t("location")}: {selectedSession.location}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedSession.status === "scheduled" && (
                <form action={startSessionFormAction}>
                  <input type="hidden" name="id" value={selectedSession.id} />
                  <Button type="submit" size="sm">
                    {t("startSession")}
                  </Button>
                </form>
              )}
              {(selectedSession.status === "scheduled" || selectedSession.status === "started") && (
                <form action={completeSessionFormAction}>
                  <input type="hidden" name="id" value={selectedSession.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("completeSession")}
                  </Button>
                </form>
              )}
            </div>

            <form action={updateAction} className="space-y-2">
              <input type="hidden" name="id" value={selectedSession.id} />
              <Field label={t("room")} name="room" defaultValue={selectedSession.room ?? ""} />
              <Field label={t("location")} name="location" defaultValue={selectedSession.location ?? ""} />
              <Field label={t("notes")} name="notes" defaultValue={selectedSession.notes ?? ""} />
              <SubmitButton idleKey="Sessions.editSession" />
            </form>

            <form action={rescheduleAction} className="space-y-2">
              <input type="hidden" name="id" value={selectedSession.id} />
              <Field label={t("startsAtTime")} name="startsAt" type="datetime-local" required />
              <Field label={t("endsAt")} name="endsAt" type="datetime-local" />
              <Field label={t("reason")} name="reason" required />
              {selectedSession.seriesId ? (
                <FormField label={t("scope")}>
                  <select name="scope" defaultValue="single" className="ui-select">
                    <option value="single">{t("rescheduleSingle")}</option>
                    <option value="series">{t("rescheduleSeries")}</option>
                  </select>
                </FormField>
              ) : null}
              <SubmitButton idleKey="Sessions.reschedule" />
            </form>

            <form action={cancelAction} className="space-y-2">
              <input type="hidden" name="id" value={selectedSession.id} />
              <Field label={t("reason")} name="reason" required />
              {selectedSession.seriesId ? (
                <FormField label={t("scope")}>
                  <select name="scope" defaultValue="single" className="ui-select">
                    <option value="single">{t("cancelSingle")}</option>
                    <option value="series">{t("cancelSeries")}</option>
                  </select>
                </FormField>
              ) : null}
              <SubmitButton idleKey="Sessions.cancelSession" />
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
