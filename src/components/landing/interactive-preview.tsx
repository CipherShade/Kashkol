"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";

type TabId = "attendance" | "sessions" | "homework";
type AttendanceStatus = "present" | "absent" | "late" | "excused";

interface StudentState {
  id: number;
  nameKey: "student1" | "student2" | "student3";
  status: AttendanceStatus;
}

export function LandingInteractivePreview() {
  const t = useTranslations("Landing.hero.preview");
  const [activeTab, setActiveTab] = useState<TabId>("attendance");

  const [students, setStudents] = useState<StudentState[]>([
    { id: 1, nameKey: "student1", status: "present" },
    { id: 2, nameKey: "student2", status: "absent" },
    { id: 3, nameKey: "student3", status: "late" },
  ]);

  const [score, setScore] = useState<number>(9);

  const presentCount = students.filter((s) => s.status === "present").length;
  const attendanceRate = Math.round((presentCount / students.length) * 100);

  function updateStatus(studentId: number, status: AttendanceStatus) {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status } : s)),
    );
  }

  return (
    <div className="landing-preview__wrapper">
      {/* Floating decorative levitating badges & student classroom notes */}
      <div className="landing-sticky-note landing-sticky-note--student" aria-hidden="true">
        <span>{t("noteScore")}</span>
      </div>

      <div className="landing-sticky-note landing-sticky-note--session" aria-hidden="true">
        <span>{t("noteTime")}</span>
      </div>

      <div className="landing-float-badge landing-float-badge--bottom" aria-hidden="true">
        <span className="landing-float-badge__icon">
          <Icon name="shield" size={15} />
        </span>
        <span className="landing-float-badge__text">{t("badgePrivacy")}</span>
      </div>

      {/* Main Interactive Preview Frame */}
      <div className="landing-preview__frame">
        {/* Chrome Bar */}
        <div className="landing-preview__chrome">
          <div className="landing-preview__chrome-start">
            <span className="landing-preview__dots" aria-hidden="true">
              <span className="landing-preview__dot landing-preview__dot--red" />
              <span className="landing-preview__dot landing-preview__dot--yellow" />
              <span className="landing-preview__dot landing-preview__dot--green" />
            </span>
            <div className="landing-preview__live-tag">
              <span className="landing-preview__pulse-dot" aria-hidden="true" />
              <span>{t("liveBadge")}</span>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="landing-preview__tabs" role="tablist" aria-label="Interactive demo tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "attendance"}
              className={`landing-preview__tab ${activeTab === "attendance" ? "is-active" : ""}`}
              onClick={() => setActiveTab("attendance")}
            >
              <Icon name="check" size={14} />
              <span>{t("tabAttendance")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "sessions"}
              className={`landing-preview__tab ${activeTab === "sessions" ? "is-active" : ""}`}
              onClick={() => setActiveTab("sessions")}
            >
              <Icon name="calendar" size={14} />
              <span>{t("tabSessions")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "homework"}
              className={`landing-preview__tab ${activeTab === "homework" ? "is-active" : ""}`}
              onClick={() => setActiveTab("homework")}
            >
              <Icon name="book" size={14} />
              <span>{t("tabHomework")}</span>
            </button>
          </div>
        </div>

        {/* Workspace Canvas */}
        <div className="landing-preview__canvas">
          {/* Rail Sidebar */}
          <div className="landing-preview__rail" aria-hidden="true">
            <span className="landing-preview__rail-brand">
              <Icon name="grid" size={17} />
            </span>
            <div className="landing-preview__rail-items">
              <span
                className={`landing-preview__rail-item ${
                  activeTab === "attendance" ? "is-active" : ""
                }`}
              >
                <Icon name="check" size={15} />
              </span>
              <span
                className={`landing-preview__rail-item ${
                  activeTab === "sessions" ? "is-active" : ""
                }`}
              >
                <Icon name="calendar" size={15} />
              </span>
              <span
                className={`landing-preview__rail-item ${
                  activeTab === "homework" ? "is-active" : ""
                }`}
              >
                <Icon name="book" size={15} />
              </span>
              <span className="landing-preview__rail-item">
                <Icon name="bar" size={15} />
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="landing-preview__body">
            {activeTab === "attendance" && (
              <div className="landing-demo__panel landing-demo__panel--active" role="tabpanel">
                <div className="landing-demo__header">
                  <div className="landing-demo__header-info">
                    <span className="landing-demo__badge">{t("groupTitle")}</span>
                    <p className="landing-demo__hint">{t("attendanceHint")}</p>
                  </div>
                  <div className="landing-demo__stat-pill">
                    <span className="landing-demo__stat-label">{t("rateLabel")}</span>
                    <strong className="landing-demo__stat-value">{attendanceRate}%</strong>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="landing-demo__progress" aria-hidden="true">
                  <div
                    className="landing-demo__progress-fill"
                    style={{ inlineSize: `${attendanceRate}%` }}
                  />
                </div>

                {/* Student Roster Cards */}
                <div className="landing-demo__roster">
                  {students.map((student) => (
                    <div
                      key={student.id}
                      className={`landing-demo__student ${
                        student.status === "present" ? "is-present" : ""
                      }`}
                    >
                      <div className="landing-demo__student-info">
                        <span className="landing-demo__avatar" aria-hidden="true">
                          <Icon name="user" size={15} />
                        </span>
                        <span className="landing-demo__name">{t(student.nameKey)}</span>
                      </div>

                      <div className="landing-demo__actions" role="group" aria-label={t(student.nameKey)}>
                        <button
                          type="button"
                          className={`landing-demo__status-btn landing-demo__status-btn--present ${
                            student.status === "present" ? "is-selected" : ""
                          }`}
                          onClick={() => updateStatus(student.id, "present")}
                          title={t("statusPresent")}
                        >
                          <Icon name="check" size={13} />
                          <span>{t("statusPresent")}</span>
                        </button>
                        <button
                          type="button"
                          className={`landing-demo__status-btn landing-demo__status-btn--absent ${
                            student.status === "absent" ? "is-selected" : ""
                          }`}
                          onClick={() => updateStatus(student.id, "absent")}
                          title={t("statusAbsent")}
                        >
                          <Icon name="x" size={13} />
                          <span>{t("statusAbsent")}</span>
                        </button>
                        <button
                          type="button"
                          className={`landing-demo__status-btn landing-demo__status-btn--late ${
                            student.status === "late" ? "is-selected" : ""
                          }`}
                          onClick={() => updateStatus(student.id, "late")}
                          title={t("statusLate")}
                        >
                          <Icon name="clock" size={13} />
                          <span>{t("statusLate")}</span>
                        </button>
                        <button
                          type="button"
                          className={`landing-demo__status-btn landing-demo__status-btn--excused ${
                            student.status === "excused" ? "is-selected" : ""
                          }`}
                          onClick={() => updateStatus(student.id, "excused")}
                          title={t("statusExcused")}
                        >
                          <span>{t("statusExcused")}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "sessions" && (
              <div className="landing-demo__panel landing-demo__panel--active" role="tabpanel">
                <div className="landing-demo__sessions-list">
                  <div className="landing-demo__session-card landing-demo__session-card--active">
                    <div className="landing-demo__session-header">
                      <span className="landing-demo__session-tag">
                        <Icon name="clock" size={13} />
                        {t("sessionPhysicsTime")}
                      </span>
                      <span className="landing-demo__session-live">
                        <span className="landing-demo__pulse-dot" />
                        Live
                      </span>
                    </div>
                    <h4 className="landing-demo__session-title">{t("sessionPhysics")}</h4>
                    <button
                      type="button"
                      className="landing-demo__start-btn"
                      onClick={() => setActiveTab("attendance")}
                    >
                      <Icon name="check" size={14} />
                      <span>{t("sessionStart")}</span>
                    </button>
                  </div>

                  <div className="landing-demo__session-card">
                    <div className="landing-demo__session-header">
                      <span className="landing-demo__session-tag">
                        <Icon name="clock" size={13} />
                        {t("sessionChemTime")}
                      </span>
                    </div>
                    <h4 className="landing-demo__session-title">{t("sessionChem")}</h4>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "homework" && (
              <div className="landing-demo__panel landing-demo__panel--active" role="tabpanel">
                <div className="landing-demo__hw-card">
                  <div className="landing-demo__hw-top">
                    <span className="landing-demo__badge">{t("groupTitle")}</span>
                    <span className="landing-demo__hw-sub">{t("hwSubmissions")}</span>
                  </div>
                  <h4 className="landing-demo__hw-title">{t("hwTitle")}</h4>

                  <div className="landing-demo__hw-score-box">
                    <div className="landing-demo__hw-score-row">
                      <span>{t("hwGradeSample")}</span>
                      <strong className="landing-demo__hw-score-val">{score} / 10</strong>
                    </div>

                    <div className="landing-demo__score-slider-wrap">
                      <input
                        type="range"
                        min="5"
                        max="10"
                        value={score}
                        onChange={(e) => setScore(Number(e.target.value))}
                        className="landing-demo__score-slider"
                        aria-label={t("hwGradeSample")}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
