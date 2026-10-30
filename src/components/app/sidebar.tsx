"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { VisibleNavGroup } from "@/lib/navigation/nav";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SidebarProps = {
  groups: VisibleNavGroup[];
  workspace: { name: string; slug: string; roleLabel: string };
  user: { name: string; email: string };
  settingsVisible: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
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
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
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

  return (
    <>
      <div className="app-sidebar-brand">
        <span className="app-brand-mark">
          <Icon name="target" size={19} />
        </span>
        <span className="app-brand-text">
          <Link href="/app" className="app-brand-name" onClick={onNavigate}>
            {app("name")}
          </Link>
          <span className="app-brand-tagline">{app("tagline")}</span>
        </span>
      </div>

      <div className="app-sidebar-context" aria-label={t("workspaceContext")}>
        <span className="app-context-label">{t("workspaceLabel")}</span>
        <span className="app-context-name">{workspace.name}</span>
        <span className="app-context-meta">
          <Badge tone="outline" icon="staff">
            {workspace.roleLabel}
          </Badge>
          <bdi className="app-context-slug ui-code">{workspace.slug}</bdi>
        </span>
      </div>

      <nav className="app-sidebar-nav" aria-label={t("primaryNav")}>
        <NavList groups={groups} mobile={mobile} onNavigate={onNavigate} />
      </nav>

      <div className="app-sidebar-footer">
        <Link
          href="/app/account"
          className="app-sidebar-footer-link"
          data-active={accountActive}
          aria-current={accountActive ? "page" : undefined}
          onClick={onNavigate}
        >
          <Icon name="user" size={17} />
          <span>{t("account")}</span>
        </Link>
        {settingsVisible ? (
          <Link
            href="/app/settings"
            className="app-sidebar-footer-link"
            data-active={pathname === "/app/settings"}
            aria-current={pathname === "/app/settings" ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon name="gear" size={17} />
            <span>{t("settings")}</span>
          </Link>
        ) : null}
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
