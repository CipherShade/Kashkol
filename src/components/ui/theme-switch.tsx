"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveThemePreference } from "@/app/actions/preferences";
import type { PreferredTheme } from "@/lib/theme";
import {
  applyThemePreference,
  initialThemeFromDocument,
  watchSystemTheme,
} from "@/lib/theme-client";
import { Icon, type IconName } from "./icon";
import { DropdownMenu, MenuLabel, MenuRadioGroup, MenuRadioItem } from "./dropdown-menu";
import { useToast } from "./toast";

const ICONS: Record<"light" | "dark" | "system", IconName> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
};

export function ThemeSwitch({ initialTheme }: { initialTheme: PreferredTheme }) {
  const t = useTranslations("Theme");
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() =>
    initialThemeFromDocument(initialTheme),
  );

  useEffect(() => {
    if (theme !== "system") return;
    return watchSystemTheme(() => {
      applyThemePreference("system");
    });
  }, [theme]);

  function change(next: string) {
    if (next !== "light" && next !== "dark" && next !== "system") return;
    setTheme(next);
    applyThemePreference(next);
    const label = t(next);
    startTransition(async () => {
      try {
        const result = await saveThemePreference(next);
        if (result.ok) toast({ title: t("saved", { theme: label }), tone: "success" });
      } catch {
        // The local theme is already applied; persistence can be retried.
      }
    });
  }

  return (
    <DropdownMenu
      label={t("label")}
      trigger={
        <button
          type="button"
          className="theme-switch"
          aria-label={t("current", { theme: t(theme) })}
          title={t("current", { theme: t(theme) })}
        >
          <Icon name={ICONS[theme]} size={17} />
        </button>
      }
    >
      <MenuLabel>{t("label")}</MenuLabel>
      <MenuRadioGroup value={theme} onValueChange={change}>
        <MenuRadioItem value="system" icon="monitor">
          {t("system")}
        </MenuRadioItem>
        <MenuRadioItem value="light" icon="sun">
          {t("light")}
        </MenuRadioItem>
        <MenuRadioItem value="dark" icon="moon">
          {t("dark")}
        </MenuRadioItem>
      </MenuRadioGroup>
    </DropdownMenu>
  );
}
