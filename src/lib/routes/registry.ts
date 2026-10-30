/**
 * The declarative route registry (ADR-0012).
 *
 * Every `src/app/**\/route.ts` file must have one entry here. The generated
 * permission and tenant-isolation matrices are derived from this list, so a
 * route that skips the registry fails `npm run lint:rules`.
 */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RouteAccess = "public" | "session" | "workspace" | "capability";

export type RouteEntry = {
  /** The Next.js route path, including dynamic segments. */
  path: string;
  methods: HttpMethod[];
  access: RouteAccess;
  /** True when the handler must run inside a tenant transaction. */
  tenantScoped: boolean;
  description: string;
};

export const ROUTES: RouteEntry[] = [
  {
    path: "/healthz",
    methods: ["GET"],
    access: "public",
    tenantScoped: false,
    description: "Liveness probe. Checks no dependency and never restarts on a database outage.",
  },
  {
    path: "/readyz",
    methods: ["GET"],
    access: "public",
    tenantScoped: false,
    description: "Readiness probe. Checks configuration, database reachability, and migrations.",
  },
  {
    path: "/api/auth/[...all]",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    access: "public",
    tenantScoped: false,
    description: "Better Auth handler. Sessions are resolved by the auth service, not by the URL.",
  },
  {
    path: "/api/workspace",
    methods: ["GET", "PATCH"],
    access: "workspace",
    tenantScoped: true,
    description:
      "Workspace overview and profile. The workspace id comes from the session; the body and query cannot name one.",
  },
  {
    path: "/api/team",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List workspace members and invitations, or send an owner-authorized assistant invitation.",
  },
  {
    path: "/api/team/invitations/accept",
    methods: ["POST"],
    access: "session",
    tenantScoped: true,
    description: "Accept a single-use invitation after verified sign-in with the invited email.",
  },
  {
    path: "/api/team/invitations/[invitationId]/resend",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Rotate and resend a pending invitation token.",
  },
  {
    path: "/api/team/invitations/[invitationId]/revoke",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Revoke a pending invitation before it is accepted.",
  },
  {
    path: "/api/team/members/[memberId]/permissions",
    methods: ["PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Replace an assistant permission set and revoke stale sessions.",
  },
  {
    path: "/api/team/members/[memberId]/suspend",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Suspend an assistant and revoke their active sessions.",
  },
  {
    path: "/api/team/members/[memberId]/reactivate",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Reactivate a suspended assistant without restoring removed grants.",
  },
  {
    path: "/api/team/members/[memberId]",
    methods: ["DELETE"],
    access: "workspace",
    tenantScoped: true,
    description: "Remove a member, revoke sessions, and retain immutable audit history.",
  },
  {
    path: "/api/audit",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Read a redacted audit projection when the caller has audit:read.",
  },
  {
    path: "/api/search",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description:
      "Search the session workspace's students and groups. Each result type requires its own read permission.",
  },
  {
    path: "/api/portal/students/[studentId]",
    methods: ["GET"],
    access: "session",
    tenantScoped: true,
    description:
      "Portal student projection. Access is checked against the linked student ids before any read.",
  },
  {
    path: "/api/students",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List, filter, paginate and create students within the session workspace.",
  },
  {
    path: "/api/students/[studentId]",
    methods: ["GET", "PATCH", "DELETE"],
    access: "workspace",
    tenantScoped: true,
    description: "Get profile details, update, or archive a student.",
  },
  {
    path: "/api/students/import/preview",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Parse and validate a CSV/XLSX spreadsheet without committing mutations.",
  },
  {
    path: "/api/students/import/commit",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Atomically commit validated students from spreadsheet import.",
  },
  {
    path: "/api/students/export",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Export student list to sanitized CSV or XLSX.",
  },
  {
    path: "/api/payments",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Read a payment ledger and balances, or append a manual receipt.",
  },
  {
    path: "/api/payments/adjustments",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Append an auditable payment discount, refund, or correction.",
  },
  {
    path: "/api/payments/fees",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Append a monthly group or student fee convention.",
  },
  {
    path: "/api/reports",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Read a filtered and paginated tenant-scoped report.",
  },
  {
    path: "/api/reports/export",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Queue an authorized, filtered tenant-scoped CSV export.",
  },
  {
    path: "/api/reports/exports/[exportId]",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Read a report-export job and issue a short-lived download link when ready.",
  },
  {
    path: "/api/worker/reports",
    methods: ["POST"],
    access: "public",
    tenantScoped: false,
    description: "Process queued report exports using the dedicated worker token.",
  },
  {
    path: "/api/students/template",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Download CSV or XLSX sample import template in Arabic or English.",
  },
  {
    path: "/api/groups",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List, filter, and create teaching groups within the workspace.",
  },
  {
    path: "/api/groups/[groupId]",
    methods: ["GET", "PATCH", "DELETE"],
    access: "workspace",
    tenantScoped: true,
    description: "Get group details, update configuration, or archive group.",
  },
  {
    path: "/api/groups/[groupId]/enroll",
    methods: ["POST", "DELETE"],
    access: "workspace",
    tenantScoped: true,
    description: "Enroll or remove a student from the group.",
  },
  {
    path: "/api/groups/[groupId]/transfer",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Transfer student to another group with historic records preserved.",
  },
  {
    path: "/api/sessions",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List sessions by range, create one-off sessions, or generate recurring sessions.",
  },
  {
    path: "/api/sessions/[sessionId]",
    methods: ["GET", "PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Get session details, reschedule, or cancel a session with an audit trail.",
  },
  {
    path: "/api/sessions/[sessionId]/attendance",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Get session roster and manage attendance marks for a session.",
  },
  {
    path: "/api/sessions/[sessionId]/attendance/qr",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Issue or rotate QR attendance tokens for a session.",
  },
  {
    path: "/api/files",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description:
      "List and upload workspace learning materials; metadata is scoped to the session workspace.",
  },
  {
    path: "/api/files/[fileId]",
    methods: ["PATCH", "DELETE"],
    access: "workspace",
    tenantScoped: true,
    description: "Rename, organize, archive, restore, or delete one workspace material.",
  },
  {
    path: "/api/files/[fileId]/scan",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Scan a pending private object with the configured ClamAV service.",
  },
  {
    path: "/api/files/[fileId]/download",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Reauthorize staff access and issue a short-lived private download URL.",
  },
  {
    path: "/api/files/local-download",
    methods: ["GET"],
    access: "capability",
    tenantScoped: false,
    description: "Development-only download endpoint for a signed, expiring local-storage token.",
  },
  {
    path: "/api/portal/files/[fileId]/download",
    methods: ["GET"],
    access: "session",
    tenantScoped: true,
    description: "Reauthorize the linked parent/student against a shared file before signing.",
  },
  {
    path: "/api/homework",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List, create, and record teacher-managed homework and per-student status.",
  },
  {
    path: "/api/homework/resources",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "List clean, permitted workspace files that can be attached to homework.",
  },
  {
    path: "/api/homework/[homeworkId]",
    methods: ["PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Edit or archive a homework assignment without deleting its record history.",
  },
  {
    path: "/api/homework/[homeworkId]/submissions/[studentId]",
    methods: ["PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Record one student's homework status, private feedback, or grade.",
  },
  {
    path: "/api/assessments",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "List paper assessments, student results, and create assessments.",
  },
  {
    path: "/api/assessments/[assessmentId]",
    methods: ["GET", "PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Read a paper assessment roster or lock/unlock its marks.",
  },
  {
    path: "/api/assessments/[assessmentId]/results/[studentId]",
    methods: ["PUT"],
    access: "workspace",
    tenantScoped: true,
    description: "Set or correct one student's paper-assessment result.",
  },
  {
    path: "/api/follow-ups",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "View source-backed attention flags and follow-up history, or create a task.",
  },
  {
    path: "/api/follow-ups/[followUpId]",
    methods: ["PATCH"],
    access: "workspace",
    tenantScoped: true,
    description: "Resolve a follow-up with an explicit outcome.",
  },
  {
    path: "/api/attendance/scan",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Scan a QR token to mark attendance.",
  },
  {
    path: "/api/messaging/outbox",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "List message outbox entries for inspection and retry.",
  },
  {
    path: "/api/messaging/outbox/[id]/retry",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Retry a failed message in the outbox.",
  },
  {
    path: "/api/messaging/guardians",
    methods: ["GET", "POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Manage authorized guardians for students.",
  },
  {
    path: "/api/attendance/notifications/enqueue",
    methods: ["POST"],
    access: "workspace",
    tenantScoped: true,
    description: "Enqueue attendance notification to guardian.",
  },
  {
    path: "/api/worker/outbox",
    methods: ["POST"],
    access: "session",
    tenantScoped: false,
    description: "Process message outbox batch (worker).",
  },
  {
    path: "/api/messaging/settings",
    methods: ["GET", "PUT"],
    access: "workspace",
    tenantScoped: true,
    description: "Notification settings and provider config status.",
  },
  {
    path: "/api/messaging/logs",
    methods: ["GET"],
    access: "workspace",
    tenantScoped: true,
    description: "Delivery logs (sanitized).",
  },
  {
    path: "/api/messaging/webhook",
    methods: ["GET", "POST"],
    access: "public",
    tenantScoped: false,
    description: "Provider webhook with signature verification.",
  },
];

export function findRoute(path: string): RouteEntry | undefined {
  return ROUTES.find((route) => route.path === path);
}
