import type { IconName } from "@/components/ui/icon";
import { isAllowed, type PermissionAction, type PermissionResource, type Scope } from "@/modules/tenancy/types";

export type NavStatus = "available" | "planned";
export type Milestone = "M0" | "M1" | "M2" | "M3";

export type NavItem = {
  key: string;
  href: string;
  labelKey: string;
  icon: IconName;
  status: NavStatus;
  milestone: Milestone;
  /** The server-side permission that must be held to see the entry. */
  permission?: { resource: PermissionResource; action: PermissionAction };
  /** One or more permissions that can expose a mixed capability screen. */
  anyPermission?: ReadonlyArray<{ resource: PermissionResource; action: PermissionAction }>;
  /** The requirement flow the module implements, shown on the planned page. */
  flow?: string;
};

export type NavGroup = {
  key: string;
  labelKey: string;
  items: NavItem[];
};

export type VisibleNavGroup = {
  key: string;
  label: string;
  items: Array<{
    key: string;
    href: string;
    label: string;
    icon: IconName;
    planned: boolean;
    milestone: Milestone;
  }>;
};

/**
 * The application navigation. Planned entries are rendered with an explicit
 * "Planned" badge only in a development build.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    labelKey: "groups.overview",
    items: [
      {
        key: "dashboard",
        href: "/app",
        labelKey: "items.dashboard",
        icon: "grid",
        status: "available",
        milestone: "M0",
      },
    ],
  },
  {
    key: "manage",
    labelKey: "groups.manage",
    items: [
      {
        key: "students",
        href: "/app/students",
        labelKey: "items.students",
        icon: "users",
        status: "available",
        milestone: "M1",
        permission: { resource: "students", action: "read" },
        flow: "F-P1-02",
      },
      {
        key: "groups",
        href: "/app/groups",
        labelKey: "items.groups",
        icon: "layers",
        status: "available",
        milestone: "M1",
        permission: { resource: "groups", action: "read" },
        flow: "F-P1-04",
      },
      {
        key: "sessions",
        href: "/app/sessions",
        labelKey: "items.sessions",
        icon: "calendar",
        status: "available",
        milestone: "M1",
        permission: { resource: "sessions", action: "read" },
        flow: "F-P1-05",
      },
    ],
  },
  {
    key: "teaching",
    labelKey: "groups.teaching",
    items: [
      {
        key: "homework",
        href: "/app/homework",
        labelKey: "items.homework",
        icon: "book",
        status: "available",
        milestone: "M1",
        permission: { resource: "homework", action: "read" },
        flow: "F-P1-08",
      },
      {
        key: "assessments",
        href: "/app/assessments",
        labelKey: "items.assessments",
        icon: "edit",
        status: "available",
        milestone: "M1",
        permission: { resource: "grades", action: "read" },
        flow: "F-P1-09",
      },
    ],
  },
  {
    key: "insights",
    labelKey: "groups.insights",
    items: [
      {
        key: "reports",
        href: "/app/reports",
        labelKey: "items.reports",
        icon: "bar",
        status: "available",
        milestone: "M1",
        anyPermission: [
          { resource: "attendance", action: "read" },
          { resource: "students", action: "read" },
          { resource: "grades", action: "read" },
          { resource: "homework", action: "read" },
          { resource: "payments", action: "read" },
        ],
        flow: "F-P1-12",
      },
      {
        key: "followUps",
        href: "/app/follow-ups",
        labelKey: "items.followUps",
        icon: "activity",
        status: "available",
        milestone: "M2",
        permission: { resource: "students", action: "read" },
        flow: "F-P2-06",
      },
      {
        key: "files",
        href: "/app/files",
        labelKey: "items.files",
        icon: "file",
        status: "available",
        milestone: "M1",
        permission: { resource: "files", action: "read" },
        flow: "F-P1-11",
      },
    ],
  },
  {
    key: "communication",
    labelKey: "groups.communication",
    items: [
      {
        key: "parent-updates",
        href: "/app/parent-updates",
        labelKey: "items.parentUpdates",
        icon: "whatsapp",
        status: "planned",
        milestone: "M1",
        permission: { resource: "messages", action: "read" },
        flow: "F-P1-10",
      },
    ],
  },
  {
    key: "team",
    labelKey: "groups.team",
    items: [
      {
        key: "team",
        href: "/app/team",
        labelKey: "items.team",
        icon: "staff",
        status: "available",
        milestone: "M2",
        permission: { resource: "team", action: "read" },
        flow: "F-P2-01",
      },
      {
        key: "audit",
        href: "/app/audit",
        labelKey: "items.audit",
        icon: "activity",
        status: "available",
        milestone: "M2",
        permission: { resource: "audit", action: "read" },
        flow: "F-P0-07",
      },
    ],
  },
  {
    key: "billing",
    labelKey: "groups.billing",
    items: [
      {
        key: "payments",
        href: "/app/payments",
        labelKey: "items.payments",
        icon: "creditCard",
        status: "available",
        milestone: "M2",
        permission: { resource: "payments", action: "read" },
        flow: "F-P2-04",
      },
    ],
  },
  {
    key: "workspace",
    labelKey: "groups.workspace",
    items: [
      {
        key: "settings",
        href: "/app/settings",
        labelKey: "items.settings",
        icon: "gear",
        status: "available",
        milestone: "M0",
        permission: { resource: "settings", action: "read" },
      },
    ],
  },
];

/** The catch-all route resolves a slug to exactly one planned module. */
export const PLANNED_MODULES: ReadonlyMap<string, NavItem> = new Map(
  NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => item.status === "planned")
    .map((item) => [item.href.replace("/app/", ""), item]),
);

export const PLANNED_MODULE_SLUGS = [...PLANNED_MODULES.keys()];

export function isDevelopmentBuild(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

export function findPlannedModule(slug: string): NavItem | undefined {
  return PLANNED_MODULES.get(slug);
}

/**
 * Filter the navigation by the server-issued scope and the build environment.
 * This is presentation only; every route repeats the authorization check. A
 * hidden link is never the permission boundary.
 */
export function visibleNavGroups(
  scope: Scope,
  options: { includePlanned: boolean; label: (key: string) => string },
): VisibleNavGroup[] {
  const output: VisibleNavGroup[] = [];
  for (const group of NAV_GROUPS) {
    const items = group.items
      .filter((item) => {
        if (item.status === "planned" && !options.includePlanned) return false;
        if (item.permission && !isAllowed(scope, item.permission.resource, item.permission.action)) {
          return false;
        }
        if (
          item.anyPermission &&
          !item.anyPermission.some(({ resource, action }) => isAllowed(scope, resource, action))
        ) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        key: item.key,
        href: item.href,
        label: options.label(item.labelKey),
        icon: item.icon,
        planned: item.status === "planned",
        milestone: item.milestone,
      }));
    if (items.length > 0) {
      output.push({ key: group.key, label: options.label(group.labelKey), items });
    }
  }
  return output;
}

/** Every navigation target, used by the route-wiring test. */
export function allNavigationHrefs(): string[] {
  return NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
}
