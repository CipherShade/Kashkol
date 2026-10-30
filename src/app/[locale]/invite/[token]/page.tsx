import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/feedback";
import { AcceptInvitation } from "@/components/workspace/accept-invitation";
import { getVerifiedSession } from "@/modules/identity/session";
import { invitationTokenSchema } from "@/modules/tenancy/schemas";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Team" });
  return { title: t("invitePageTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const validToken = invitationTokenSchema.safeParse(token);
  const t = await getTranslations("Team");
  const session = await getVerifiedSession();

  return (
    <section className="auth-card" aria-labelledby="invitation-title">
      <h1 id="invitation-title" className="auth-title">{t("invitePageTitle")}</h1>
      <p className="auth-subtitle">{t("invitePageSubtitle")}</p>
      {!validToken.success ? (
        <Alert tone="danger">{t("errors.invitationInvalid")}</Alert>
      ) : session ? (
        <>
          <p className="app-muted"><bdi>{session.user.email}</bdi></p>
          <AcceptInvitation token={validToken.data} />
        </>
      ) : (
        <div className="ui-form-stack">
          <Alert tone="info">{t("signInFirst")}</Alert>
          <div className="ui-form-actions">
            <Link href="/sign-in" className="ui-button" data-variant="primary" rel="noreferrer">
              {t("signIn")}
            </Link>
            <Link href="/sign-up" className="ui-button" data-variant="secondary" rel="noreferrer">
              {t("createAccount")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
