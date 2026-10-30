"use client";

import { useTranslations } from "next-intl";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Icon } from "@/components/ui/icon";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { Tooltip } from "@/components/ui/tooltip";
import type { PreferredTheme } from "@/lib/theme";
import { ProfileMenu } from "./profile-menu";
import { TopbarSearch } from "./topbar-search";

export function Topbar({
  labels,
  locale,
  user,
  roleLabel,
  settingsVisible,
  searchVisible,
  initialTheme,
  onOpenNav,
}: {
  labels: Readonly<Record<string, string>>;
  locale: string;
  user: { name: string; email: string };
  roleLabel: string;
  settingsVisible: boolean;
  searchVisible: boolean;
  initialTheme: PreferredTheme;
  onOpenNav: () => void;
}) {
  const t = useTranslations("Shell");

  return (
    <header className="app-topbar">
      <div className="app-topbar-start">
        <Tooltip label={t("openNav")}>
          <button
            type="button"
            className="ui-button app-nav-toggle"
            data-variant="ghost"
            data-size="icon"
            aria-label={t("openNav")}
            aria-haspopup="dialog"
            onClick={onOpenNav}
          >
            <Icon name="menu" size={19} />
          </button>
        </Tooltip>
        <Breadcrumbs labels={labels} label={t("breadcrumbs")} />
      </div>
      {searchVisible ? <TopbarSearch /> : null}
      <div className="app-topbar-actions">
        <LanguageSwitch />
        <ThemeSwitch initialTheme={initialTheme} />
        <ProfileMenu
          user={user}
          locale={locale}
          roleLabel={roleLabel}
          settingsVisible={settingsVisible}
        />
      </div>
    </header>
  );
}
