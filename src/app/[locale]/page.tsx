import NextLink from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { directionForLocale, type AppLocale } from "@/i18n/routing";
import { getReadiness, type CheckState, type ReadinessCheck } from "@/lib/health/readiness";
import { getOptionalUser } from "@/modules/identity/session";

export const dynamic = "force-dynamic";

type StatusPageProps = {
  params: Promise<{ locale: string }>;
};

const STATE_LABEL_KEYS: Record<CheckState, "stateOk" | "stateFail" | "stateUnknown"> = {
  ok: "stateOk",
  fail: "stateFail",
  unknown: "stateUnknown",
};

function otherLocale(locale: AppLocale): AppLocale {
  return locale === "ar" ? "en" : "ar";
}

export default async function StatusPage({ params }: StatusPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;

  const t = await getTranslations("Status");
  const readiness = await getReadiness();
  const user = await getOptionalUser().catch(() => null);
  const switchTo = otherLocale(appLocale);
  const dateFormatter = new Intl.DateTimeFormat(appLocale, {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const checks: Array<{ label: string; check: ReadinessCheck }> = [
    { label: t("configuration"), check: readiness.checks.config },
    { label: t("database"), check: readiness.checks.database },
    { label: t("migrations"), check: readiness.checks.migrations },
  ];

  return (
    <main className="status-page">
      <div className="status-shell">
        <header className="status-header">
          <div>
            <p className="status-eyebrow">{t("eyebrow")}</p>
            <h1 className="status-title">{t("title")}</h1>
            <p className="status-subtitle">{t("subtitle")}</p>
          </div>
          <span className="status-badge" data-state={readiness.status === "ready" ? "ok" : "fail"}>
            {readiness.status === "ready" ? t("ready") : t("notReady")}
          </span>
        </header>

        <section className="status-card" aria-labelledby="status-environment">
          <h2 id="status-environment">{t("environment")}</h2>
          <div className="status-grid">
            <div>
              <p className="status-meta">
                <strong>{t("environment")}:</strong> <code>{readiness.appEnv}</code>
              </p>
              <p className="status-meta">
                <strong>{t("locale")}:</strong> <code>{appLocale}</code>
              </p>
              <p className="status-meta">
                <strong>{t("direction")}:</strong>{" "}
                {directionForLocale(appLocale) === "rtl" ? t("directionRtl") : t("directionLtr")}
              </p>
            </div>
            <div>
              <p className="status-meta">
                <strong>{t("generatedAt")}:</strong>{" "}
                {dateFormatter.format(new Date(readiness.timestamp))}
              </p>
              <p className="status-meta">
                <strong>{t("endpoints")}:</strong> <NextLink href="/healthz">/healthz</NextLink> ·{" "}
                <NextLink href="/readyz">/readyz</NextLink>
              </p>
            </div>
          </div>
        </section>

        <section className="status-card" aria-labelledby="status-checks">
          <h2 id="status-checks">{t("checks")}</h2>
          <ul className="status-checks">
            {checks.map(({ label, check }) => (
              <li className="status-check" key={label}>
                <span className="status-check-label">{label}</span>
                <span className="status-badge" data-state={check.state}>
                  {t(STATE_LABEL_KEYS[check.state])}
                </span>
                <code className="status-check-detail">{check.detail}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="status-card">
          <h2>{t("endpoints")}</h2>
          <ul className="status-links">
            <li>
              <NextLink href="/healthz">{t("liveness")} — /healthz</NextLink>
            </li>
            <li>
              <NextLink href="/readyz">{t("readiness")} — /readyz</NextLink>
            </li>
          </ul>
        </section>

        <footer className="status-footer">
          <p className="status-note">{t("scopeNote")}</p>
          <span className="status-links">
            <Link href={user ? "/app" : "/sign-in"} locale={appLocale}>
              {user ? t("enterApp") : t("signIn")}
            </Link>
            <Link href="/" locale={switchTo} aria-label={t("languageSwitchAria")}>
              {t("languageSwitch")}
            </Link>
          </span>
        </footer>
      </div>
    </main>
  );
}
