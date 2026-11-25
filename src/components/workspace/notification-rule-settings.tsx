"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";

type Rules = {
  atRiskEnabled: boolean;
  unrecordedSessionEnabled: boolean;
  homeworkDueSoonEnabled: boolean;
  assessmentPendingGradesEnabled: boolean;
  cooldownHours: number;
};

type Settings = { rules: Rules; emailDigestEnabled: boolean };

const DEFAULT_RULES: Rules = {
  atRiskEnabled: true,
  unrecordedSessionEnabled: true,
  homeworkDueSoonEnabled: true,
  assessmentPendingGradesEnabled: true,
  cooldownHours: 24,
};

/** F-P2-07: workspace rule switches and the explicit email-digest opt-in. */
export function NotificationRuleSettingsForm({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("NotificationRules");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [digest, setDigest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications/rules-settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("loadFailed");
        return (await response.json()) as Settings;
      })
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setRules(value.rules);
        setDigest(value.emailDigestEnabled);
      })
      .catch(() => {
        if (active) setError("loadFailed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/notifications/rules-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules, emailDigestEnabled: digest }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("saveFailed");
      const value = (await response.json()) as Settings;
      setSettings(value);
      setRules(value.rules);
      setDigest(value.emailDigestEnabled);
      setSaved(true);
    } catch {
      setError("saveFailed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: keyof Pick<
    Rules,
    | "atRiskEnabled"
    | "unrecordedSessionEnabled"
    | "homeworkDueSoonEnabled"
    | "assessmentPendingGradesEnabled"
  >) =>
    setRules((current) => ({ ...current, [key]: !current[key] }));

  if (loading) return <p className="app-muted" role="status">{t("loading")}</p>;
  if (!settings) return <Alert tone="danger" live="alert">{t(error ?? "loadFailed")}</Alert>;

  const switches: {
    key: Parameters<typeof toggle>[0];
    label: string;
  }[] = [
    { key: "atRiskEnabled", label: t("atRisk") },
    { key: "unrecordedSessionEnabled", label: t("unrecorded") },
    { key: "homeworkDueSoonEnabled", label: t("homeworkDue") },
    { key: "assessmentPendingGradesEnabled", label: t("pendingGrades") },
  ];

  return (
    <form className="ui-form-stack" onSubmit={save}>
      {error ? <Alert tone="danger" live="alert">{t(error)}</Alert> : null}
      {saved ? <Alert tone="success" live="status">{t("saved")}</Alert> : null}
      {!canWrite ? <Alert tone="warning" icon="lock">{t("readOnly")}</Alert> : null}
      {switches.map(({ key, label }) => (
        <label className="ui-checkbox-row" key={key}>
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={rules[key]}
            disabled={!canWrite || busy}
            onChange={() => toggle(key)}
          />
          <span>{label}</span>
        </label>
      ))}
      <div className="ui-form-row">
        <Field
          type="number"
          name="cooldownHours"
          label={t("cooldownHours")}
          min={1}
          max={168}
          value={String(rules.cooldownHours)}
          disabled={!canWrite || busy}
          onChange={(event) =>
            setRules((current) => ({
              ...current,
              cooldownHours: Number(event.currentTarget.value),
            }))
          }
        />
      </div>
      <label className="ui-checkbox-row">
        <input
          type="checkbox"
          className="ui-checkbox"
          checked={digest}
          disabled={!canWrite || busy}
          onChange={(event) => setDigest(event.currentTarget.checked)}
        />
        <span>{t("emailDigest")}</span>
      </label>
      <p className="app-muted">{t("digestHint")}</p>
      {canWrite ? (
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {t(busy ? "saving" : "save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
