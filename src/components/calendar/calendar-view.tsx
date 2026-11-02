"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { SessionListItem } from "@/modules/sessions/repository";

const DAYS_LABEL_ARB = ["سبت", "أحد", "اثن", "ثلاث", "أربع", "خميس", "جمعة"];
const DAYS_LABEL_ENG = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function startOfWeekSaturday(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function CalendarView() {
  const locale = useLocale();
  const t = useTranslations("sessions");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const from = useMemo(() => {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const d = startOfWeekSaturday(base);
    d.setDate(d.getDate() + offset * 7);
    return d;
  }, [offset]);

  const to = useMemo(() => {
    const d = new Date(from); d.setDate(from.getDate() + 6);
    d.setHours(23, 59, 59, 999);
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

  const grid = useMemo(() => {
    const days: Array<{ date: Date; label: string; items: SessionListItem[] }> = [];
    const cursor = new Date(from); cursor.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const isoDay = cursor.toISOString().slice(0, 10);
      days.push({
        date: new Date(cursor),
        label: (locale === "ar" ? DAYS_LABEL_ARB : DAYS_LABEL_ENG)[cursor.getDay()],
        items: items.filter((s) => new Date(s.startsAt).toISOString().slice(0, 10) === isoDay),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [from, to, items, locale]);

  return (
    <div className="w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
            <Icon name="chevron-right" size={16} className={locale === "ar" ? "rotate-180" : ""} />
          </Button>
          <span className="text-sm font-medium whitespace-nowrap">
            {from.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "short", day: "numeric" })} —{" "}
            {to.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o + 1)} aria-label="Next week">
            <Icon name="chevron-left" size={16} className={locale === "ar" ? "rotate-180" : ""} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner className="w-8 h-8" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2" data-testid="calendar-grid">
          {grid.map((day) => (
            <Card key={day.date.toISOString()} className="min-h-[140px] bg-card border shadow-sm">
              <CardBody className="p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${day.date.getDay() === 5 || day.date.getDay() === 6 ? "text-muted-foreground" : "text-foreground"}`}>
                    {day.label}
                  </span>
                  <span className="text-[10px] opacity-60">{day.date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short" })}</span>
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  {day.items.length === 0 && (
                    <span className="text-[11px] text-muted-foreground italic">{t("noSessions") || "No sessions"}</span>
                  )}
                  {day.items.map((s) => (
                    <Link
                      key={s.id}
                      href={`/app/sessions/${s.id}`}
                      className="group block rounded-md px-2 py-1 text-xs leading-snug border transition-colors bg-primary/5 hover:bg-primary/10 border-primary/20 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      style={{ borderInlineStartColor: s.groupColor || "#6366f1", borderInlineStartWidth: "3px" }}
                    >
                      <div className="font-semibold truncate">{s.groupName}</div>
                      <div className="opacity-80 text-[11px]">{formatTime(new Date(s.startsAt))} — {s.endsAt ? formatTime(new Date(s.endsAt)) : ""}</div>
                      {s.status !== "scheduled" && (
                        <div className="text-[10px] font-medium opacity-70">{s.status}</div>
                      )}
                    </Link>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
