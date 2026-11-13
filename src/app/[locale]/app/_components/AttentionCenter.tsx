"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import type { AttentionStudent, DashboardAlert } from "@/modules/dashboard/schemas";

type AttentionCenterProps = {
  students: AttentionStudent[];
  alerts: DashboardAlert[];
};

export function AttentionCenter({ students, alerts }: AttentionCenterProps) {
  const t = useTranslations("Dashboard");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const categories = [
    { key: "all", label: t("attentionCategoryAll") },
    { key: "absences", label: t("attentionCategoryAbsences") },
    { key: "grades", label: t("attentionCategoryGrades") },
    { key: "homework", label: t("attentionCategoryHomework") },
  ];

  const filteredStudents =
    filterCategory === "all"
      ? students
      : students.filter((s) => s.category === filterCategory);

  const categoryIconMap: Record<AttentionStudent["category"], IconName> = {
    absences: "clock",
    grades: "bar",
    homework: "book",
  };

  return (
    <Card labelledBy="attention-center-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="alert" size={20} />
            <span>{t("attentionTitle")}</span>
            {students.length > 0 ? (
              <Badge tone="danger">
                {t("attentionStudentCount", { count: students.length })}
              </Badge>
            ) : null}
          </div>
        }
        titleId="attention-center-title"
        description={t("attentionSubtitle")}
        actions={
          <div style={{ display: "flex", gap: "4px" }}>
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setFilterCategory(cat.key)}
                className="ui-button"
                data-variant={filterCategory === cat.key ? "secondary" : "ghost"}
                data-size="sm"
              >
                {cat.label}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        {/* Compact Alerts Section */}
        {alerts.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  backgroundColor:
                    alert.tone === "danger"
                      ? "var(--danger-tint, #fcebeb)"
                      : alert.tone === "warn"
                        ? "var(--warn-tint, #fbf2de)"
                        : "var(--surface-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      color:
                        alert.tone === "danger"
                          ? "var(--danger, #dc5a5a)"
                          : alert.tone === "warn"
                            ? "var(--warn, #d4932f)"
                            : "var(--primary)",
                    }}
                  >
                    <Icon name={alert.tone === "danger" ? "alert" : "info"} size={18} />
                  </span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--ink)" }}>
                      {alert.title}
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "var(--muted)" }}>
                      {alert.message}
                    </p>
                  </div>
                </div>
                {alert.link ? (
                  <Link
                    href={alert.link}
                    className="ui-button"
                    data-variant="ghost"
                    data-size="sm"
                    style={{ flexShrink: 0 }}
                  >
                    <span>{t("viewAction")}</span>
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Attention Students List */}
        {filteredStudents.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.875rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "var(--success)" }}>
              <Icon name="checkCircle" size={24} />
            </span>
            <p style={{ margin: 0, fontWeight: 500 }}>{t("attentionEmptyMessage")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredStudents.map((item) => (
              <div
                key={`${item.studentId}-${item.category}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "200px" }}>
                  <Avatar name={item.studentName} size="sm" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.9375rem" }}>
                        {item.studentName}
                      </span>
                      <Badge tone={item.severity === "danger" ? "danger" : "warn"}>
                        {item.supportingInfo}
                      </Badge>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "2px" }}>
                      <span>{item.groupName}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Badge tone="neutral" icon={categoryIconMap[item.category]}>
                    {t(`attentionCategory_${item.category}`)}
                  </Badge>

                  <Link
                    href={`/app/students/${item.studentId}`}
                    className="ui-button"
                    data-variant="secondary"
                    data-size="sm"
                  >
                    <Icon name="user" size={14} />
                    <span>{t("viewStudentProfile")}</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
