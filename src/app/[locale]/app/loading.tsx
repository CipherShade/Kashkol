import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/feedback";

export default async function AppLoading() {
  const t = await getTranslations("Common");
  return (
    <div role="status" aria-live="polite">
      <span className="ui-visually-hidden">{t("loading")}</span>
      <PageSkeleton />
    </div>
  );
}
