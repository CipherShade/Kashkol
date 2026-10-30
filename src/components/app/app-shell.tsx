"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { VisibleNavGroup } from "@/lib/navigation/nav";
import type { PreferredTheme } from "@/lib/theme";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  groups,
  labels,
  locale,
  workspace,
  user,
  roleLabel,
  settingsVisible,
  searchVisible,
  initialTheme,
}: {
  children: ReactNode;
  groups: VisibleNavGroup[];
  labels: Readonly<Record<string, string>>;
  locale: string;
  workspace: { name: string; slug: string };
  user: { name: string; email: string };
  roleLabel: string;
  settingsVisible: boolean;
  searchVisible: boolean;
  initialTheme: PreferredTheme;
}) {
  const t = useTranslations("Shell");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-skip-link">
        {t("skipToContent")}
      </a>
      <Sidebar
        groups={groups}
        workspace={{ ...workspace, roleLabel }}
        user={user}
        settingsVisible={settingsVisible}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="app-main">
        <Topbar
          labels={labels}
          locale={locale}
          user={user}
          roleLabel={roleLabel}
          settingsVisible={settingsVisible}
          searchVisible={searchVisible}
          initialTheme={initialTheme}
          onOpenNav={() => setMobileOpen(true)}
        />
        <main className="app-content" id="main-content" tabIndex={-1} aria-label={t("mainLandmark")}>
          {children}
        </main>
      </div>
    </div>
  );
}
