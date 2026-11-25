import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { ParentPortalClient } from "@/components/portal/parent-portal-client";
import {
  PortalNotificationsPanel,
  type PortalNotificationItem,
} from "@/components/portal/portal-notifications-panel";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const childSummary = {
  grantId: "grant-1",
  studentId: "student-1",
  firstName: "Lina",
  lastName: "Ahmed",
  grade: null,
  teachingName: "Mona",
  primarySubject: null,
  groups: [],
  unreadNotificationsCount: 0,
  permissions: {
    showAttendance: true,
    showGrades: true,
    showHomework: true,
    showResources: true,
    showSchedule: true,
    showNotifications: true,
  },
};

const childDetail = {
  ...childSummary,
  kind: "parent" as const,
  student: {
    id: "student-1",
    firstName: "Lina",
    lastName: "Ahmed",
    grade: null,
  },
  teacher: {
    teachingName: "Mona",
    primarySubject: null,
    currency: "EGP",
    timezone: "Africa/Cairo",
  },
  groups: [],
  attendance: null,
  grades: null,
  homework: null,
  resources: null,
  schedule: null,
  notifications: null,
};

describe("teacher parent-portal preview", () => {
  it("renders the real portal tree with a persistent preview banner", () => {
    const html = render(
      <ParentPortalClient
        userEmail=""
        userName=""
        childrenList={[childSummary]}
        initialChild={childDetail}
        isPreview
      />,
    );

    expect(html).toContain("Preview only");
    expect(html).toContain("Teacher preview");
    expect(html).toContain("Parent Portal");
    expect(html).not.toContain(">Sign out</button>");
  });

  it("disables portal notification mutations in preview", () => {
    const notification: PortalNotificationItem = {
      id: "notification-1",
      type: "general",
      title: "A prepared update",
      body: "No parent action needed",
      isRead: false,
      readAt: null,
      createdAt: "2026-11-24T10:00:00.000Z",
    };

    const html = render(
      <PortalNotificationsPanel
        initialNotifications={[notification]}
        readOnly
      />,
    );

    expect(html).toContain("A prepared update");
    expect(html).toContain("disabled");
    expect(html).not.toContain(">Enable push</button>");
  });
});
