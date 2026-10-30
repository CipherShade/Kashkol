"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  MenuHeader,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
} from "@/components/ui/dropdown-menu";

export function ProfileMenu({
  user,
  locale,
  roleLabel,
  settingsVisible,
}: {
  user: { name: string; email: string };
  locale: string;
  roleLabel: string;
  settingsVisible: boolean;
}) {
  const t = useTranslations("Shell");
  const formId = `sign-out-${useId().replaceAll(":", "")}`;

  return (
    <>
      <DropdownMenu
        label={t("profileMenuLabel", { name: user.name })}
        trigger={
          <button type="button" className="app-profile-trigger">
            <Avatar name={user.name} size="sm" />
            <span className="app-profile-name">{user.name}</span>
            <Icon name="chevronDown" size={14} className="app-profile-chevron" />
          </button>
        }
      >
        <MenuHeader>
          <span className="ui-menu-header-name">{user.name}</span>
          <span className="ui-menu-header-meta">
            <bdi>{user.email}</bdi>
          </span>
          <span className="ui-menu-header-meta">{roleLabel}</span>
        </MenuHeader>
        <MenuSeparator />
        <MenuLinkItem href="/app/account" icon="user">
          {t("account")}
        </MenuLinkItem>
        {settingsVisible ? (
          <MenuLinkItem href="/app/settings" icon="gear">
            {t("settings")}
          </MenuLinkItem>
        ) : null}
        <MenuSeparator />
        <MenuItem asChild>
          <button type="submit" form={formId} data-tone="danger">
            <Icon name="logout" size={16} className="ui-menu-item-icon" />
            <span>{t("signOut")}</span>
          </button>
        </MenuItem>
      </DropdownMenu>
      <form id={formId} action={signOutAction} hidden>
        <input type="hidden" name="locale" value={locale} />
      </form>
    </>
  );
}
