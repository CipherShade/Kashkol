"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import listPlugin from "@fullcalendar/react/list";
import interactionPlugin from "@fullcalendar/react/interaction";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { SessionListItem } from "@/modules/sessions/repository";

export type CalendarViewMode = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

export function FullCalendarWrapper() {
  const locale = useLocale();
  const t = useTranslations("Sessions");
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarViewMode>("timeGridWeek");
  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const from = useMemo(() => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (view === "timeGridWeek") { d.setDate(d.getDate() - d.getDay() + (locale === "ar" ? 6 : 1)); }
    return d;
  }, [date, view, locale]);

  const to = useMemo(() => {
    const d = new Date(from); d.setDate(from.getDate() + 6); d.setHours(23, 59, 59, 999);
    return d;
  }, [from]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`);
        const json = await r.json();
        setItems(Array.isArray(json) ? json : (json.items || []));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [from, to]);

  const events = useMemo(() => {
    return items.map((s) => ({
      id: s.id,
      title: s.groupName || t("sessionTitle") || "Session",
      start: new Date(s.startsAt).toISOString(),
      end: s.endsAt ? new Date(s.endsAt).toISOString() : undefined,
      extendedProps: {
        status: s.status,
        groupColor: s.groupColor || "#1C5223",
        sessionId: s.id,
        seriesId: (s as Record<string, unknown>).seriesId as string | null ?? null,
      },
      color: s.groupColor || "#1C5223",
      textColor: "#F3F2EB",
    }));
  }, [items, t]);

  const filteredEvents = useMemo(() => {
    let ev = events;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      ev = ev.filter((e) =>
        (e.title || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) {
      ev = ev.filter((e) => e.extendedProps?.status === filterStatus);
    }
    return ev;
  }, [events, search, filterStatus]);

  const handleEventDrop = useCallback(async (info: { event: { id: string; start: Date | null; end?: Date | null }; revert: () => void }) => {
    const id = info.event.id;
    const startsAt = info.event.start ? info.event.start.toISOString() : new Date().toISOString();
    const endsAt = info.event.end ? info.event.end.toISOString() : null;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          startsAt,
          endsAt,
          scope: (info.event as { extendedProps?: { seriesId?: string | null } }).extendedProps
            ?.seriesId
            ? "series"
            : "single",
        }),
      });
      if (!res.ok) {
        info.revert();
        alert(t("conflict") || "Scheduling conflict");
      }
    } catch {
      info.revert();
    }
  }, [t]);

  const handleEventResize = useCallback(async (info: { event: { id: string; start: Date | null; end?: Date | null }; revert: () => void }) => {
    return handleEventDrop({ ...info, event: info.event, revert: info.revert });
  }, [handleEventDrop]);

  const handleDateClick = useCallback(async (arg: { date: Date; startStr?: string }) => {
    if (!window.confirm(t("createSessionConfirm") || "Create session here?")) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupId: "",
          startsAt: arg.date.toISOString(),
          endsAt: new Date(arg.date.getTime() + 60 * 60 * 1000).toISOString(),
          scope: "single",
        }),
      });
      if (res.ok) {
        const session = await res.json();
        setItems((prev) => [...prev, session]);
      } else {
        alert(t("createFailed") || "Failed to create session");
      }
    } catch {
      alert(t("createFailed") || "Failed to create session");
    }
  }, [t]);

  const handleEventClick = useCallback((info: { event: { id: string } }) => {
    window.open(`/app/sessions/${encodeURIComponent(info.event.id)}`, "_blank");
  }, []);

  const handleNav = useCallback((action: "prev" | "next" | "today") => {
    setDate((d) => {
      const base = new Date(d); base.setHours(0, 0, 0, 0);
      if (action === "today") return new Date();
      const delta = action === "prev" ? -1 : 1;
      if (view === "dayGridMonth") { base.setMonth(base.getMonth() + delta); }
      else if (view === "timeGridWeek" || view === "listWeek") { base.setDate(base.getDate() + delta * 7); }
      else { base.setDate(base.getDate() + delta); }
      return base;
    });
  }, [view]);

  const viewOptions: { key: CalendarViewMode; label: string }[] = [
    { key: "dayGridMonth", label: t("monthView") || "Month" },
    { key: "timeGridWeek", label: t("weekView") || "Week" },
    { key: "timeGridDay", label: t("dayView") || "Day" },
    { key: "listWeek", label: t("agendaView") || "Agenda" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" dir={locale === "ar" ? "rtl" : "ltr"}>
        <Spinner className="w-10 h-10 text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handleNav("prev")} aria-label="Previous">
            <Icon name="chevronRight" size={16} className={locale === "ar" ? "rotate-180" : ""} />
          </Button>
          <span className="text-sm font-semibold text-[var(--ink)] whitespace-nowrap min-w-[12rem]">
            {date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric", day: "numeric" })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => handleNav("next")} aria-label="Next">
            <Icon name="chevronLeft" size={16} className={locale === "ar" ? "rotate-180" : ""} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleNav("today")}>{t("today") || "Today"}</Button>
        </div>
        <div className="flex items-center gap-2">
          {viewOptions.map((v) => (
            <Button
              key={v.key}
              type="button"
              size="sm"
              variant={view === v.key ? "primary" : "outline"}
              onClick={() => setView(v.key)}
              className="text-xs"
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder") || "Search sessions..."}
          className="ui-input h-9 text-xs flex-1 min-w-[200px] bg-[var(--surface-2)] border-[var(--border)]"
        />
        <Button type="button" size="sm" variant={filterStatus ? "primary" : "outline"} onClick={() => setFilterStatus(null)}>
          {t("allSessions") || "All"}
        </Button>
        <Button type="button" size="sm" variant={filterStatus === "scheduled" ? "primary" : "outline"} onClick={() => setFilterStatus("scheduled")}>
          {t("scheduled") || "Scheduled"}
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-md bg-[var(--surface)]">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          initialDate={date}
          headerToolbar={false}
          events={filteredEvents}
          eventDisplay="block"
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: locale === "en",
          }}
          locale={locale === "ar" ? "ar" : "en"}
          direction={locale === "ar" ? "rtl" : "ltr"}
          height="auto"
          eventContent={() => null}
          eventClass="fullcalendar-event"
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          allDaySlot={false}
          selectable={true}
          editable={true}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          nowIndicator={true}
        />
      </div>
    </div>
  );
}
