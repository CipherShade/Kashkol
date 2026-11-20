"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { VisibleNavGroup } from "@/lib/navigation/nav";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

type SelectableWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "assistant";
};

type SidebarProps = {
  groups: VisibleNavGroup[];
  workspace: { id: string; name: string; slug: string; roleLabel: string };
  workspaces: SelectableWorkspace[];
  user: { name: string; email: string };
  settingsVisible: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceSwitcher({
  workspace,
  workspaces,
}: {
  workspace: { id: string; name: string; slug: string; roleLabel: string };
  workspaces: SelectableWorkspace[];
}) {
  const t = useTranslations("Shell");
  const workspaceT = useTranslations("Workspace");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function selectWorkspace(workspaceId: string) {
    setBusyId(workspaceId);
    setFailed(false);
    try {
      const response = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
        cache: "no-store",
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }

      // A full document load is deliberate: every workspace-scoped component
      // state is discarded, so data from the previous workspace cannot bleed.
      // The absolute URL keeps the navigation inside this origin.
      window.location.assign(new URL(`/${locale}/app`, window.location.origin).toString());
    } catch {
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  }

  const roleLabel = (role: SelectableWorkspace["role"]) =>
    role === "owner" ? workspaceT("roleOwner") : workspaceT("roleAssistant");

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setFailed(false);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button type="button" className="app-sidebar-context app-context-trigger" aria-label={t("switchWorkspace")}>
          <span className="app-context-initial" aria-hidden="true">
            {workspace.name.trim().slice(0, 1)}
          </span>
          <span className="app-context-copy">
            <span className="app-context-label">{t("workspaceLabel")}</span>
            <span className="app-context-name">{workspace.name}</span>
            <span className="app-context-meta">
              <Badge tone="outline" icon="staff">
                {workspace.roleLabel}
              </Badge>
              <bdi className="app-context-slug ui-code">{workspace.slug}</bdi>
              <Icon name="chevronDown" size={14} className="app-context-switch-icon" />
            </span>
          </span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay" />
        <DialogPrimitive.Content className="ui-dialog-content" data-size="sm">
          <div className="ui-dialog-header">
            <div>
              <DialogPrimitive.Title className="ui-dialog-title">
                {t("switchWorkspace")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="ui-dialog-description">
                {t("switchWorkspaceHint")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("closeWorkspaceSwitcher")}>
                <Icon name="x" size={18} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="ui-dialog-body">
            {failed ? (
              <Alert tone="danger" live="alert">
                {t("switchWorkspaceFailed")}
              </Alert>
            ) : null}
            <div className="app-workspace-options">
              {workspaces.map((item) => {
                const active = item.id === workspace.id;
                const busy = busyId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="app-workspace-option"
                    data-active={active}
                    disabled={active || busyId !== null}
                    aria-current={active ? "true" : undefined}
                    aria-busy={busy}
                    onClick={() => void selectWorkspace(item.id)}
                  >
                    <span className="app-workspace-option-initial" aria-hidden="true">
                      {item.name.trim().slice(0, 1)}
                    </span>
                    <span className="app-workspace-option-copy">
                      <span className="app-workspace-option-name">{item.name}</span>
                      <bdi className="app-workspace-option-slug ui-code">{item.slug}</bdi>
                    </span>
                    <Badge tone="outline">{roleLabel(item.role)}</Badge>
                    {active ? <Icon name="check" size={16} title={t("currentWorkspace")} /> : null}
                  </button>
                );
              })}
            </div>
            <Link href="/workspace/new" className="app-workspace-create" onClick={() => setOpen(false)}>
              <Icon name="plus" size={16} />
              <span>{t("createAnotherWorkspace")}</span>
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NavList({
  groups,
  mobile,
  onNavigate,
}: {
  groups: VisibleNavGroup[];
  mobile: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("Shell");

  return (
    <>
      {groups.map((group) => (
        <div className="app-nav-group" key={group.key}>
          <p className="app-nav-group-label">{group.label}</p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const content = (
              <>
                <Icon name={item.icon} size={18} />
                <span className="app-nav-label">{item.label}</span>
                {item.planned ? (
                  <Badge tone="accent" icon="clock" className="app-nav-planned">
                    {t("plannedWithMilestone", { milestone: item.milestone })}
                  </Badge>
                ) : null}
              </>
            );

            if (mobile) {
              return (
                <DialogPrimitive.Close asChild key={item.key}>
                  <Link
                    href={item.href}
                    className="app-nav-item"
                    data-active={active}
                    data-planned={item.planned}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {content}
                  </Link>
                </DialogPrimitive.Close>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className="app-nav-item"
                data-active={active}
                data-planned={item.planned}
                aria-current={active ? "page" : undefined}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function SidebarBody({
  groups,
  workspace,
  workspaces,
  user,
  settingsVisible,
  mobile,
  onNavigate,
}: Omit<SidebarProps, "mobileOpen" | "onMobileOpenChange"> & {
  mobile: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Shell");
  const app = useTranslations("App");
  const pathname = usePathname();
  const accountActive = pathname === "/app/account";

  const accountLink = (
    <Link
      href="/app/account"
      className="app-sidebar-footer-link"
      data-active={accountActive}
      aria-current={accountActive ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon name="user" size={18} />
      <span>{t("account")}</span>
    </Link>
  );

  const settingsLink = settingsVisible ? (
    <Link
      href="/app/settings"
      className="app-sidebar-footer-link"
      data-active={pathname === "/app/settings"}
      aria-current={pathname === "/app/settings" ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon name="gear" size={18} />
      <span>{t("settings")}</span>
    </Link>
  ) : null;

  return (
    <>
      <div className="app-sidebar-brand">
        <span className="app-brand-mark">
          <Icon name="target" size={20} />
        </span>
        <span className="app-brand-text">
          <Link href="/app" className="app-brand-name" onClick={onNavigate}>
            {app("name")}
          </Link>
          <span className="app-brand-tagline">{app("tagline")}</span>
        </span>
      </div>

      <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />

      <nav className="app-sidebar-nav" aria-label={t("primaryNav")}>
        <NavList groups={groups} mobile={mobile} onNavigate={onNavigate} />
      </nav>

      <div className="app-sidebar-footer">
        {accountLink}
        {settingsLink}
        <p className="app-version" title={user.email}>
          {t("footerNote")}
        </p>
      </div>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  const t = useTranslations("Shell");
  const { mobileOpen, onMobileOpenChange, ...bodyProps } = props;

  return (
    <>
      <aside className="app-sidebar" aria-label={t("sidebarLandmark")}>
        <SidebarBody {...bodyProps} mobile={false} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="app-drawer-overlay" />
          <DialogPrimitive.Content className="app-drawer-content">
            <div className="app-drawer-header">
              <DialogPrimitive.Title className="app-drawer-title">
                {t("navigationTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="ui-visually-hidden">
                {t("navigationDescription")}
              </DialogPrimitive.Description>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("closeNav")}>
                  <Icon name="x" size={18} />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="app-drawer-nav">
              <SidebarBody
                {...bodyProps}
                mobile
                onNavigate={() => onMobileOpenChange(false)}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
