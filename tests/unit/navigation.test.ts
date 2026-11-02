import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV_GROUPS,
  PLANNED_MODULES,
  allNavigationHrefs,
  findPlannedModule,
  isDevelopmentBuild,
  visibleNavGroups,
} from "@/lib/navigation/nav";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { permissionKey, type Scope } from "@/modules/tenancy/types";

function ownerScope(): Scope {
  return {
    workspaceId: "workspace-1",
    actorUserId: "user-1",
    actorDisplayName: "Owner",
    role: "owner",
    permissions: new Set(),
  };
}

function assistantScope(
  grants: Array<[Parameters<typeof permissionKey>[0], Parameters<typeof permissionKey>[1]]>,
): Scope {
  return {
    workspaceId: "workspace-1",
    actorUserId: "user-2",
    actorDisplayName: "Assistant",
    role: "assistant",
    permissions: new Set(grants.map(([resource, action]) => permissionKey(resource, action))),
  };
}

const label = (key: string) => key;
const labels = {
  "/app": "Dashboard",
  "/app/settings": "Settings",
  "/app/students": "Students",
  "/app/account": "Account",
};

function hrefs(groups: ReturnType<typeof visibleNavGroups>): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.href));
}

describe("application navigation", () => {
  it("shows only built modules in a production build", () => {
    const groups = visibleNavGroups(ownerScope(), { includePlanned: false, label });
    expect(hrefs(groups)).toEqual([
      "/app",
      "/app/students",
      "/app/groups",
      "/app/sessions",
      "/app/homework",
      "/app/assessments",
      "/app/reports",
      "/app/follow-ups",
      "/app/files",
      "/app/team",
      "/app/audit",
      "/app/payments",
      "/app/settings",
    ]);
    expect(isDevelopmentBuild("production")).toBe(false);
    expect(isDevelopmentBuild("development")).toBe(true);
  });

  it("filters planned modules by the server-issued permission", () => {
    const groups = visibleNavGroups(assistantScope([["sessions", "read"]]), {
      includePlanned: true,
      label,
    });
    const visible = hrefs(groups);
    expect(visible).toContain("/app/sessions");
    expect(visible).not.toContain("/app/homework");
    expect(visible).not.toContain("/app/team");
    expect(visible).not.toContain("/app/settings");
  });

  it("hides team, audit, financial, and business screens without their own grants", () => {
    const groups = visibleNavGroups(assistantScope([]), {
      includePlanned: true,
      label,
    });
    const visible = hrefs(groups);
    expect(visible).not.toContain("/app/team");
    expect(visible).not.toContain("/app/audit");
    expect(visible).not.toContain("/app/payments");
    expect(visible).not.toContain("/app/reports");
    expect(visible).not.toContain("/app/students");
    expect(visible).not.toContain("/app/groups");
  });

  it("hides the settings entry from a member without settings:read", () => {
    const groups = visibleNavGroups(assistantScope([["students", "read"]]), {
      includePlanned: false,
      label,
    });
    expect(hrefs(groups)).toEqual([
      "/app",
      "/app/students",
      "/app/reports",
      "/app/follow-ups",
    ]);
  });

  it("keeps the owner's full development navigation and marks planned entries", () => {
    const groups = visibleNavGroups(ownerScope(), { includePlanned: true, label });
    const planned = groups.flatMap((group) => group.items).filter((item) => item.planned);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((item) => item.milestone.startsWith("M"))).toBe(true);
    expect(PLANNED_MODULES.size).toBe(planned.length);
  });

  it("resolves every planned slug and rejects a built or unknown slug", () => {
    expect(findPlannedModule("sessions")).toBeUndefined();
    expect(findPlannedModule("parent-updates")?.href).toBe("/app/parent-updates");
    expect(findPlannedModule("students")).toBeUndefined();
    expect(findPlannedModule("groups")).toBeUndefined();
    expect(findPlannedModule("settings")).toBeUndefined();
    expect(findPlannedModule("not-a-module")).toBeUndefined();
  });

  it("wires every navigation target to a page file", () => {
    const appRoot = path.join(process.cwd(), "src", "app", "[locale]", "app");
    for (const href of allNavigationHrefs()) {
      if (href === "/app") {
        expect(fs.existsSync(path.join(appRoot, "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/settings") {
        expect(fs.existsSync(path.join(appRoot, "settings", "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/team" || href === "/app/audit") {
        expect(fs.existsSync(path.join(appRoot, href.replace("/app/", ""), "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/students") {
        expect(fs.existsSync(path.join(appRoot, "students", "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/groups") {
        expect(fs.existsSync(path.join(appRoot, "groups", "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/files") {
        expect(fs.existsSync(path.join(appRoot, "files", "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/reports" || href === "/app/payments") {
        expect(fs.existsSync(path.join(appRoot, href.replace("/app/", ""), "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/homework" || href === "/app/assessments" || href === "/app/follow-ups") {
        expect(fs.existsSync(path.join(appRoot, href.replace("/app/", ""), "page.tsx"))).toBe(true);
        continue;
      }
      if (href === "/app/sessions") {
        expect(fs.existsSync(path.join(appRoot, "sessions", "page.tsx"))).toBe(true);
        continue;
      }
      expect(findPlannedModule(href.replace("/app/", ""))).toBeDefined();
      expect(fs.existsSync(path.join(appRoot, "[...module]", "page.tsx"))).toBe(true);
    }
    expect(fs.existsSync(path.join(appRoot, "account", "page.tsx"))).toBe(true);
  });

  it("carries every navigation label in both catalogues", () => {
    const catalogues = ["ar", "en"].map((locale) =>
      JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8")),
    );
    for (const catalogue of catalogues) {
      for (const group of NAV_GROUPS) {
        expect(catalogue.Nav.groups[group.labelKey.replace("groups.", "")]).toBeTruthy();
        for (const item of group.items) {
          expect(catalogue.Nav.items[item.labelKey.replace("items.", "")]).toBeTruthy();
          if (item.status === "planned") {
            expect(catalogue.Planned.modules[item.key]).toBeTruthy();
          }
        }
      }
    }
  });
});

describe("breadcrumbs", () => {
  it("renders a single current crumb on the dashboard", () => {
    expect(buildBreadcrumbs("/app", labels)).toEqual([
      { label: "Dashboard", current: true, ancestor: false },
    ]);
  });

  it("renders ancestors as links and the last segment as current", () => {
    expect(buildBreadcrumbs("/app/settings", labels)).toEqual([
      { href: "/app", label: "Dashboard", current: false, ancestor: true },
      { href: undefined, label: "Settings", current: true, ancestor: false },
    ]);
  });

  it("ignores a query string and a trailing slash", () => {
    expect(buildBreadcrumbs("/app/students/?tab=1", labels)).toEqual([
      { href: "/app", label: "Dashboard", current: false, ancestor: true },
      { href: undefined, label: "Students", current: true, ancestor: false },
    ]);
  });
});
