import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { BulkGradesClient } from "@/components/performance/bulk-grades-client";
import { PerformanceSettingsClient } from "@/components/performance/performance-settings-client";
import { StudentPerformanceActions } from "@/components/performance/student-performance-actions";
import { ParentPerformanceReportClient } from "@/components/portal/parent-performance-report-client";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const settings = {
  enabled: true,
  minAssessments: 3,
  averageBelowPercent: 60,
  consecutiveDeclines: 2,
  weakTopicPercent: 60,
};

describe("performance settings UI", () => {
  it("disables thresholds without write permission and enables them with it", () => {
    const readOnly = render(
      <PerformanceSettingsClient initialSettings={settings} canWrite={false} />,
    );
    expect(readOnly).toContain("Risk rules");
    expect(readOnly).toContain("disabled");
    expect(readOnly).not.toContain(">Save thresholds</button>");

    const writable = render(<PerformanceSettingsClient initialSettings={settings} canWrite />);
    expect(writable).toContain(">Save thresholds</button>");
    expect(writable).toContain('value="60"');
  });
});

describe("bulk grade entry UI", () => {
  const initialData = {
    group: { id: "group-1", name: "Group A", subjectName: null },
    students: [{ id: "student-1", name: "Lina Ahmed" }],
    assessments: [
      {
        id: "assessment-1",
        title: "Paper 1",
        date: "2026-02-01",
        type: "paper_exam",
        maxScore: 100,
        extraCreditAllowance: null,
        lockedAt: null,
        scores: [
          { studentId: "student-1", score: 80, status: "graded", note: null },
        ],
      },
    ],
  };

  it("renders real roster rows and preserves the loaded score", () => {
    const html = render(
      <BulkGradesClient
        groups={[{ id: "group-1", name: "Group A" }]}
        initialGroupId="group-1"
        initialData={initialData}
        locale="en"
        canWrite
      />,
    );
    expect(html).toContain("Lina Ahmed");
    expect(html).toContain("Paper 1");
    expect(html).toContain('value="80"');
    expect(html).toContain(">Graded</option>");
    expect(html).toContain(">Missing</option>");
    expect(html).toContain(">Excused</option>");
    expect(html).toContain(">Not taken</option>");
  });

  it("shows the empty state when a group has no students", () => {
    const html = render(
      <BulkGradesClient
        groups={[{ id: "group-1", name: "Group A" }]}
        initialGroupId="group-1"
        initialData={{ ...initialData, students: [] }}
        locale="en"
        canWrite
      />,
    );
    expect(html).toContain("This group has no active enrolled students.");
  });
});

describe("student performance actions UI", () => {
  it("shows rule evidence, acknowledgement, and paper topic entry", () => {
    const html = render(
      <StudentPerformanceActions
        studentId="student-1"
        risks={[
          {
            ruleKey: "low_average",
            riskKey: "a".repeat(64),
            title: "Average below threshold",
            description: "Average is below 60%.",
            action: "Review recent papers.",
            threshold: 60,
            detectedAt: "2026-02-01",
            evidenceIds: ["score-1"],
            acknowledgedAt: null,
          },
        ]}
        assessments={[{ id: "assessment-1", title: "Paper 1", date: "2026-02-01", maxScore: 100 }]}
        locale="en"
        canWrite
      />,
    );
    expect(html).toContain("low_average");
    expect(html).toContain("score-1");
    expect(html).toContain("Acknowledge");
    expect(html).toContain("Correct count");
    expect(html).toContain("Incorrect count");
    expect(html).toContain("Paper 1");
  });
});

describe("parent report export UI", () => {
  it("offers CSV, XLSX, and PDF through the authorized endpoint only", () => {
    const html = render(
      <ParentPerformanceReportClient studentId="student-1" from="2026-01-01" locale="en" />,
    );
    expect(html).toContain("Download CSV");
    expect(html).toContain("Download XLSX");
    expect(html).toContain("Download PDF");
    expect(html).toContain("Only finalized and published grades are included.");
    expect(html).not.toContain("sent");
  });
});
