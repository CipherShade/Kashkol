import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { CompletePhoneForm } from "@/components/auth/forms";
import { Icon } from "@/components/ui/icon";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/http/errors";
import { getStaffGate } from "@/modules/identity/session";

type PageProps = { params: Promise<{ locale: string }> };

/**
 * First-time social accounts arrive here with a verified session but no phone.
 * The form uses that session's user id; it never accepts an id from the client.
 */
export default async function CompletePhonePage({ params }: PageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  try {
    const gate = await getStaffGate();
    if (gate.state === "anonymous") redirect(`/${locale}/sign-in`);
    if (gate.state === "staff") redirect(`/${locale}/app`);
  } catch (error) {
    const reason =
      error instanceof AppError && error.messageKey === "errors.portalActor"
        ? "portal"
        : "forbidden";
    redirect(`/${locale}/sign-in?error=${reason}`);
  }

  const t = await getTranslations("Auth");

  return (
    <section className="auth-card auth-centered-card" aria-labelledby="complete-phone-title">
      <div className="auth-centered-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h2 id="complete-phone-title" className="auth-title">
        {t("completePhoneTitle")}
      </h2>
      <p className="auth-subtitle">{t("completePhoneSubtitle")}</p>
      <CompletePhoneForm locale={locale} />
      <p className="auth-centered-trust">
        <Icon name="shield" size={16} />
        <span>{t("secureWorkspace")}</span>
      </p>
    </section>
  );
}
