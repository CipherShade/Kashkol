import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/ui/language-switch";

/**
 * The slim announcement strip above the sticky header. It carries only product
 * facts: the workspace is for independent teachers and keeps the core records
 * together. No support channel, release number, trial or delivery promise is
 * claimed.
 */
export async function LandingAnnouncement() {
  const t = await getTranslations("Landing.topBar");

  return (
    <aside className="landing-v2-topbar">
      <div className="landing-container landing-v2-topbar__inner">
        <p className="landing-v2-topbar__badge">
          <span className="landing-v2-topbar__dot" aria-hidden="true" />
          <span>{t("badge")}</span>
        </p>
        <div className="landing-v2-topbar__end">
          <p className="landing-v2-topbar__note">{t("note")}</p>
          <LanguageSwitch />
        </div>
      </div>
    </aside>
  );
}
