"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  ATTENDANCE_STATUSES,
  attendanceSummary,
  type AttendanceStatus,
  type DemoStudent,
} from "@/lib/landing/demo";

type Screen = "overview" | "attendance" | "schedule";

const SCREENS: readonly Screen[] = ["overview", "attendance", "schedule"];

const INITIAL_STUDENTS: readonly DemoStudent[] = [
  { id: 1, status: "present" },
  { id: 2, status: "absent" },
  { id: 3, status: "late" },
];

const STATUS_ICONS: Record<AttendanceStatus, IconName> = {
  present: "check",
  absent: "x",
  late: "clock",
  excused: "info",
};

const STATUS_LABEL_KEYS: Record<AttendanceStatus, string> = {
  present: "statusPresent",
  absent: "statusAbsent",
  late: "statusLate",
  excused: "statusExcused",
};

const SESSIONS = [
  { key: "session1", marker: "", chipKey: "active" },
  { key: "session2", marker: "is-muted", chipKey: "upcoming" },
] as const;

/**
 * An interactive product illustration, not a portal into a real workspace.
 * Every state change is local to this component and uses synthetic records;
 * the visible caption says so in both locales (`ADR-0053`).
 */
export function LandingInteractiveWorkspace() {
  const t = useTranslations("Landing.hero");
  const baseId = useId();
  const [screen, setScreen] = useState<Screen>("overview");
  const [students, setStudents] = useState<DemoStudent[]>(() =>
    INITIAL_STUDENTS.map((student) => ({ ...student })),
  );
  const [selectedSession, setSelectedSession] = useState(0);

  const summary = attendanceSummary(students);
  const tabId = (value: Screen) => `${baseId}-tab-${value}`;
  const panelId = (value: Screen) => `${baseId}-panel-${value}`;

  function changeStatus(studentId: number, status: AttendanceStatus) {
    setStudents((current) =>
      current.map((student) => (student.id === studentId ? { ...student, status } : student)),
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = SCREENS.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextScreen = SCREENS[nextIndex];
    setScreen(nextScreen);
    document.getElementById(tabId(nextScreen))?.focus();
  }

  return (
    <div className="landing-hero-mock landing-v2-mock" data-demo="interactive">
      <div className="landing-v2-mock__top">
        <div className="landing-v2-mock__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="landing-v2-mock__title">{t("mock.title")}</p>
        <span className="landing-v2-mock__status">{t("mock.status")}</span>
      </div>

      <div className="landing-v2-mock__tabs" role="tablist" aria-label={t("demo.label")}>
        {SCREENS.map((value, index) => (
          <button
            key={value}
            id={tabId(value)}
            type="button"
            role="tab"
            aria-selected={screen === value}
            aria-controls={panelId(value)}
            className={`landing-v2-mock__tab${screen === value ? " is-active" : ""}`}
            onClick={() => setScreen(value)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {t(`demo.tabs.${value}`)}
          </button>
        ))}
      </div>

      <div
        className="landing-v2-mock__panel"
        id={panelId("overview")}
        role="tabpanel"
        aria-labelledby={tabId("overview")}
        hidden={screen !== "overview"}
        tabIndex={0}
      >
        <div className="landing-v2-mock__stats">
          <div className="landing-v2-mock__stat">
            <span className="landing-v2-mock__stat-label">{t("mock.students")}</span>
            <strong>{t("mock.studentsValue")}</strong>
            <small>{t("mock.studentsNote")}</small>
          </div>
          <div className="landing-v2-mock__stat">
            <span className="landing-v2-mock__stat-label">{t("mock.sessions")}</span>
            <strong>{t("mock.sessionsValue")}</strong>
            <small>{t("mock.sessionsNote")}</small>
          </div>
          <div className="landing-v2-mock__stat">
            <span className="landing-v2-mock__stat-label">{t("mock.attendance")}</span>
            <strong>{summary.rate}%</strong>
            <small>
              {t("demo.sampleRoster", {
                present: summary.present,
                total: summary.total,
              })}
            </small>
          </div>
        </div>

        <div className="landing-v2-mock__schedule">
          <div className="landing-v2-mock__schedule-head">
            <span className="landing-v2-mock__schedule-title">
              <Icon name="calendar" size={15} />
              {t("mock.scheduleTitle")}
            </span>
            <span className="landing-v2-mock__time">{t("mock.time")}</span>
          </div>

          {SESSIONS.map((session) => (
            <div key={session.key} className="landing-v2-mock__session">
              <span
                className={`landing-v2-mock__marker${session.marker ? ` ${session.marker}` : ""}`}
                aria-hidden="true"
              />
              <div>
                <p className="landing-v2-mock__session-title">{t(`mock.${session.key}Title`)}</p>
                <p className="landing-v2-mock__session-meta">{t(`mock.${session.key}Meta`)}</p>
              </div>
              <span
                className={`landing-v2-mock__chip${session.chipKey === "upcoming" ? " is-muted" : ""}`}
              >
                {t(`mock.${session.chipKey}`)}
              </span>
            </div>
          ))}
        </div>

        <div className="landing-v2-mock__alert">
          <Icon name="alert" size={20} />
          <div>
            <p className="landing-v2-mock__alert-title">{t("mock.alertTitle")}</p>
            <p className="landing-v2-mock__alert-body">{t("mock.alertBody")}</p>
          </div>
          <span className="landing-v2-mock__alert-action">{t("mock.alertAction")}</span>
        </div>
      </div>

      <div
        className="landing-v2-mock__panel"
        id={panelId("attendance")}
        role="tabpanel"
        aria-labelledby={tabId("attendance")}
        hidden={screen !== "attendance"}
        tabIndex={0}
      >
        <p className="landing-v2-mock__hint">{t("demo.hint")}</p>

        <div className="landing-v2-mock__rate">
          <span>{t("demo.rateLabel")}</span>
          <strong aria-live="polite">{summary.rate}%</strong>
          <small>
            {t("demo.sampleRoster", {
              present: summary.present,
              total: summary.total,
            })}
          </small>
        </div>

        <div className="landing-v2-mock__roster">
          {students.map((student, index) => {
            const nameKey = `demo.student${index + 1}` as const;
            return (
              <div className="landing-v2-mock__student" key={student.id}>
                <span className="landing-v2-mock__student-name">
                  <Icon name="user" size={14} />
                  {t(nameKey)}
                </span>
                <div className="landing-v2-mock__statuses" role="group" aria-label={t(nameKey)}>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      data-status={status}
                      aria-pressed={student.status === status}
                      className="landing-v2-mock__status"
                      onClick={() => changeStatus(student.id, status)}
                    >
                      <Icon name={STATUS_ICONS[status]} size={12} />
                      <span>{t(`demo.${STATUS_LABEL_KEYS[status]}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="landing-v2-mock__panel"
        id={panelId("schedule")}
        role="tabpanel"
        aria-labelledby={tabId("schedule")}
        hidden={screen !== "schedule"}
        tabIndex={0}
      >
        <p className="landing-v2-mock__hint">{t("demo.scheduleHint")}</p>
        <div className="landing-v2-mock__schedule">
          {SESSIONS.map((session, index) => (
            <div
              key={session.key}
              className={`landing-v2-mock__session${selectedSession === index ? " is-selected" : ""}`}
            >
              <span
                className={`landing-v2-mock__marker${session.marker ? ` ${session.marker}` : ""}`}
                aria-hidden="true"
              />
              <div>
                <p className="landing-v2-mock__session-title">{t(`mock.${session.key}Title`)}</p>
                <p className="landing-v2-mock__session-meta">{t(`mock.${session.key}Meta`)}</p>
              </div>
              <button
                type="button"
                aria-pressed={selectedSession === index}
                className="landing-v2-mock__session-action"
                onClick={() => setSelectedSession(index)}
              >
                {selectedSession === index ? t("demo.selected") : t("demo.select")}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="landing-v2-mock__primary-action"
          onClick={() => setScreen("attendance")}
        >
          <Icon name="check" size={14} />
          {t("demo.sessionReview")}
        </button>
      </div>
    </div>
  );
}
