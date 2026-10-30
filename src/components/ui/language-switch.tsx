"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE, PREFERENCE_COOKIE_MAX_AGE } from "@/lib/theme";
import { saveLocalePreference } from "@/app/actions/preferences";
import { Icon } from "./icon";
import { DropdownMenu, MenuLabel, MenuRadioGroup, MenuRadioItem } from "./dropdown-menu";

export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Language");
  const common = useTranslations("Common");
  const [pending, startTransition] = useTransition();

  const target = locale === "ar" ? "en" : "ar";
  const targetName = target === "ar" ? common("arabic") : common("english");

  function change(next: string) {
    if (next !== "ar" && next !== "en") return;
    if (next === locale) return;

    // The cookie is written before navigation so a failed request never loses
    // the choice; the server action then stores it for the signed-in account.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; SameSite=Lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";

    const query = typeof window === "undefined" ? "" : window.location.search;
    const href = query ? `${pathname}${query}` : pathname;

    startTransition(async () => {
      try {
        await saveLocalePreference(next);
      } catch {
        // The browser-level cookie already carries the choice.
      }
      router.replace(href, { locale: next });
    });
  }

  return (
    <DropdownMenu
      label={t("label")}
      trigger={
        <button
          type="button"
          className="language-switch"
          aria-label={t("switchTo", { language: targetName })}
          disabled={pending}
          aria-busy={pending}
        >
          <Icon name="globe" size={15} />
          <bdi>{targetName}</bdi>
          <Icon name="chevronDown" size={13} />
        </button>
      }
    >
      <MenuLabel>{t("label")}</MenuLabel>
      <MenuRadioGroup value={locale} onValueChange={change}>
        <MenuRadioItem value="ar">{common("arabic")}</MenuRadioItem>
        <MenuRadioItem value="en">{common("english")}</MenuRadioItem>
      </MenuRadioGroup>
    </DropdownMenu>
  );
}
