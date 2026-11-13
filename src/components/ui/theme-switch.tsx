"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveThemePreference } from "@/app/actions/preferences";
import { initialThemePreference, type PreferredTheme } from "@/lib/theme";
import {
  applyThemePreference,
  initialThemeFromDocument,
  subscribeThemeChanges,
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
  // The theme picked in this session. It wins over the value only the browser
  // can see, and it is the only state this control owns.
  const [choice, setChoice] = useState<"light" | "dark" | "system" | null>(null);

  // The server renders only the preference it knows; localStorage and the
  // resolved OS theme are invisible to it. `useSyncExternalStore` renders the
  // server snapshot while hydrating and the browser snapshot afterwards, so the
  // first client render always equals the server markup. Reading the document
  // during that first render instead made the server say "Theme: System" and
  // the client say "Theme: Dark" — a fatal hydration error.
  const getBrowserTheme = useCallback(
    () => initialThemeFromDocument(initialTheme),
    [initialTheme],
  );
  const getServerTheme = useCallback(
    () => initialThemePreference(initialTheme),
    [initialTheme],
  );
  const browserTheme = useSyncExternalStore(
    subscribeThemeChanges,
    getBrowserTheme,
    getServerTheme,
  );
  const theme = choice ?? browserTheme;

  useEffect(() => {
    if (theme !== "system") return;
    return watchSystemTheme(() => {
      applyThemePreference("system");
    });
  }, [theme]);

  function change(next: string) {
    if (next !== "light" && next !== "dark" && next !== "system") return;
    setChoice(next);
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
