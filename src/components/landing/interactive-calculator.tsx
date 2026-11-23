"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";

export function LandingInteractiveCalculator({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("Landing.calculator");
  const landingT = useTranslations("Landing");
  const studentsId = useId();
  const sessionsId = useId();

  const [students, setStudents] = useState<number>(90);
  const [sessions, setSessions] = useState<number>(8);

  // Time saved estimate grounded in teacher real-world averages:
  // 1. ~30 mins per session manual roll call + fee collection reduced to < 2 mins => ~0.46 hrs saved per session
  // 2. 2-4 hrs weekly on homework grading + parent WhatsApp follow-up => ~0.033 hrs per student per week
  // 3. ~3 hrs monthly for progress reports & grade cards => ~0.75 hrs saved per week
  const hoursSavedWeekly = Math.max(
    3,
    Math.round(0.75 + (sessions * 0.46) + (students * 0.033))
  );

  return (
    <section className="landing-section landing-calculator-section" aria-labelledby="calc-title">
      <div className="landing-container">
        <div className="landing-calculator">
          {/* Section Header */}
          <div className="landing-calculator__header">
            <p className="landing-eyebrow">
              <span className="landing-eyebrow__pulse" aria-hidden="true" />
              <span>{t("eyebrow")}</span>
            </p>
            <h2 id="calc-title" className="landing-h2">
              {t("title")}
            </h2>
            <p className="landing-sub">{t("subtitle")}</p>
          </div>

          <div className="landing-calculator__grid">
            {/* Sliders Container */}
            <div className="landing-calculator__controls">
              {/* Students Slider */}
              <div className="landing-calculator__field">
                <div className="landing-calculator__field-top">
                  <label htmlFor={studentsId} className="landing-calculator__label">
                    <Icon name="users" size={17} />
                    <span>{t("studentsLabel")}</span>
                  </label>
                  <span className="landing-calculator__val-badge">
                    <strong>{students}</strong> {t("studentsUnit")}
                  </span>
                </div>
                <input
                  id={studentsId}
                  type="range"
                  min="15"
                  max="450"
                  step="5"
                  value={students}
                  onChange={(e) => setStudents(Number(e.target.value))}
                  className="landing-calculator__slider"
                />
                <div className="landing-calculator__scale">
                  <span>15</span>
                  <span>150</span>
                  <span>300</span>
                  <span>450+</span>
                </div>
              </div>

              {/* Sessions Slider */}
              <div className="landing-calculator__field">
                <div className="landing-calculator__field-top">
                  <label htmlFor={sessionsId} className="landing-calculator__label">
                    <Icon name="calendar" size={17} />
                    <span>{t("sessionsLabel")}</span>
                  </label>
                  <span className="landing-calculator__val-badge">
                    <strong>{sessions}</strong> {t("sessionsUnit")}
                  </span>
                </div>
                <input
                  id={sessionsId}
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={sessions}
                  onChange={(e) => setSessions(Number(e.target.value))}
                  className="landing-calculator__slider"
                />
                <div className="landing-calculator__scale">
                  <span>2</span>
                  <span>8</span>
                  <span>16</span>
                  <span>24</span>
                </div>
              </div>
            </div>

            {/* Results Display */}
            <div className="landing-calculator__result">
              <div className="landing-calculator__stat-card landing-calculator__stat-card--hero">
                <span className="landing-calculator__stat-icon">
                  <Icon name="clock" size={24} />
                </span>
                <div className="landing-calculator__stat-num-row">
                  <strong className="landing-calculator__big-num">{hoursSavedWeekly}</strong>
                  <span className="landing-calculator__big-unit">{t("savedHoursUnit")}</span>
                </div>
                <p className="landing-calculator__stat-desc">{t("savedHoursLabel")}</p>
              </div>

              <div className="landing-calculator__stat-row">
                <div className="landing-calculator__stat-card">
                  <span className="landing-calculator__mini-icon">
                    <Icon name="checkCircle" size={16} />
                  </span>
                  <strong className="landing-calculator__stat-val">{t("checkinSpeedVal")}</strong>
                  <span className="landing-calculator__stat-meta">{t("checkinSpeedLabel")}</span>
                </div>

                <div className="landing-calculator__stat-card">
                  <span className="landing-calculator__mini-icon">
                    <Icon name="shield" size={16} />
                  </span>
                  <strong className="landing-calculator__stat-val">{t("accuracyVal")}</strong>
                  <span className="landing-calculator__stat-meta">{t("accuracyLabel")}</span>
                </div>
              </div>

              <div className="landing-calculator__breakdown">
                <p className="landing-calculator__breakdown-title">{t("breakdownTitle")}</p>
                <ul className="landing-calculator__breakdown-list">
                  <li className="landing-calculator__breakdown-item">
                    <Icon name="checkCircle" size={14} />
                    <span>{t("breakdownSession")}</span>
                  </li>
                  <li className="landing-calculator__breakdown-item">
                    <Icon name="checkCircle" size={14} />
                    <span>{t("breakdownHomework")}</span>
                  </li>
                  <li className="landing-calculator__breakdown-item">
                    <Icon name="checkCircle" size={14} />
                    <span>{t("breakdownReports")}</span>
                  </li>
                </ul>
              </div>

              <div className="landing-calculator__cta-row">
                <Link
                  href={signedIn ? "/app" : "/sign-up"}
                  className="ui-button landing-btn--primary-shimmer"
                  data-variant="primary"
                >
                  <span>{signedIn ? landingT("openApp") : landingT("createAccount")}</span>
                  <Icon name="arrowRight" size={17} directional />
                </Link>
                <span className="landing-calculator__cta-note">{t("ctaPrompt")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
