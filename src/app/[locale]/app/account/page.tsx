import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignOutButton, SignOutEverywhereDialog } from "@/components/app/account-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { Link } from "@/i18n/navigation";
import { getPreferredTheme } from "@/modules/identity/preferences";
import { requireStaffSession } from "@/modules/identity/session";
import { getCallerMembership, getWorkspaceIdentity } from "@/modules/tenancy/service";
import { isAllowed } from "@/modules/tenancy/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  return { title: t("title") };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { user, scope } = await requireStaffSession();
  const t = await getTranslations("Account");
  const shell = await getTranslations("Shell");

  const [membership, workspace, preferredTheme] = await Promise.all([
    getCallerMembership(scope),
    getWorkspaceIdentity(scope),
    getPreferredTheme().catch(() => null),
  ]);

  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const roleLabel =
    membership.role === "owner" ? t("roleOwner") : t("roleAssistant");
  const canSeeSettings = isAllowed(scope, "settings", "read");

  return (
    <div className="app-page">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          canSeeSettings ? (
            <Link href="/app/settings" className="ui-button" data-variant="secondary">
              <Icon name="gear" size={16} />
              <span>{shell("settings")}</span>
            </Link>
          ) : null
        }
      />

      <div className="app-account-grid">
        <Card labelledBy="account-profile-title">
          <CardHeader title={t("profileSection")} titleId="account-profile-title" />
          <CardBody>
            <div className="app-person">
              <Avatar name={user.name} size="lg" />
              <span className="app-person-text">
                <span className="app-person-name">{user.name}</span>
                <span className="app-person-meta">
                  <bdi>{user.email}</bdi>
                </span>
              </span>
            </div>
            <dl className="app-fact-list">
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("email")}</dt>
                <dd className="app-fact-value">
                  <bdi className="ui-ltr">{user.email}</bdi>
                </dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("emailStatus")}</dt>
                <dd className="app-fact-value">
                  {membership.user.emailVerified ? (
                    <Badge tone="success" icon="checkCircle">
                      {t("emailVerified")}
                    </Badge>
                  ) : (
                    <Badge tone="warn" icon="alert">
                      {t("emailUnverified")}
                    </Badge>
                  )}
                </dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("role")}</dt>
                <dd className="app-fact-value">
                  <Badge tone={membership.role === "owner" ? "primary" : "outline"} icon="staff">
                    {roleLabel}
                  </Badge>
                </dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("workspace")}</dt>
                <dd className="app-fact-value">{workspace.name}</dd>
              </div>
              <div className="app-fact-row">
                <dt className="app-fact-label">{t("memberSince")}</dt>
                <dd className="app-fact-value">{dateFormat.format(membership.joinedAt)}</dd>
              </div>
            </dl>
            <p className="app-inline-note">
              <Icon name="info" size={15} />
              <span>{t("profileReadOnly")}</span>
            </p>
          </CardBody>
        </Card>

        <Card labelledBy="account-preferences-title">
          <CardHeader
            title={t("preferencesSection")}
            titleId="account-preferences-title"
            description={t("preferencesHint")}
          />
          <CardBody>
            <div className="ui-form-stack">
              <div className="ui-field">
                <span className="ui-label">{t("languageLabel")}</span>
                <LanguageSwitch />
                <span className="ui-hint">{t("languageHint")}</span>
              </div>
              <div className="ui-field">
                <span className="ui-label">{t("themeLabel")}</span>
                <ThemeSwitch initialTheme={preferredTheme ?? "system"} />
                <span className="ui-hint">{t("themeHint")}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card labelledBy="account-security-title">
        <CardHeader
          title={t("securitySection")}
          titleId="account-security-title"
          description={t("securityHint")}
        />
        <CardBody>
          <ul className="app-checklist">
            <li className="app-checklist-item">
              <span className="app-checklist-label">{t("sessionPolicySliding")}</span>
            </li>
            <li className="app-checklist-item">
              <span className="app-checklist-label">{t("sessionPolicyIdle")}</span>
            </li>
            <li className="app-checklist-item">
              <span className="app-checklist-label">{t("sessionPolicyAbsolute")}</span>
            </li>
          </ul>
          <p className="app-note">{t("securityNote")}</p>
          <div className="ui-form-actions">
            <SignOutButton locale={locale} />
            <SignOutEverywhereDialog locale={locale} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
