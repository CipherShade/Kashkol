"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";

type Settings = {
  preferences: {
    enabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  };
  provider: string;
  providerConfigured: boolean;
};

export function NotificationPreferencesForm({
  canWrite,
}: {
  canWrite: boolean;
}) {
  const t = useTranslations("MessagingSettings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/messaging/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("loadFailed");
        return (await response.json()) as Settings;
      })
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setEnabled(value.preferences.enabled);
        setQuietEnabled(value.preferences.quietHoursEnabled);
        setStart(value.preferences.quietHoursStart ?? "");
        setEnd(value.preferences.quietHoursEnd ?? "");
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
      const response = await fetch("/api/messaging/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          quietHoursEnabled: quietEnabled,
          quietHoursStart: quietEnabled ? start : null,
          quietHoursEnd: quietEnabled ? end : null,
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("saveFailed");
      const value = (await response.json()) as Settings;
      setSettings(value);
      setSaved(true);
    } catch {
      setError("saveFailed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="app-muted" role="status">{t("loading")}</p>;
  if (!settings) return <Alert tone="danger" live="alert">{t(error ?? "loadFailed")}</Alert>;

  return (
    <form className="ui-form-stack" onSubmit={save}>
      {error ? <Alert tone="danger" live="alert">{t(error)}</Alert> : null}
      {saved ? <Alert tone="success" live="status">{t("saved")}</Alert> : null}
      {!canWrite ? <Alert tone="warning" icon="lock">{t("readOnly")}</Alert> : null}
      <p className="app-muted">
        {t("providerStatus", {
          provider: settings.provider,
          status: settings.providerConfigured ? t("configured") : t("notConfigured"),
        })}
      </p>
      <label className="ui-checkbox-row">
        <input
          type="checkbox"
          className="ui-checkbox"
          checked={enabled}
          disabled={!canWrite || busy}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        <span>{t("enabled")}</span>
      </label>
      <label className="ui-checkbox-row">
        <input
          type="checkbox"
          className="ui-checkbox"
          checked={quietEnabled}
          disabled={!canWrite || busy}
          onChange={(event) => setQuietEnabled(event.currentTarget.checked)}
        />
        <span>{t("quietHours")}</span>
      </label>
      {quietEnabled ? (
        <div className="ui-form-row">
          <Field
            type="time"
            name="quietHoursStart"
            label={t("quietStart")}
            value={start}
            disabled={!canWrite || busy}
            required
            onChange={(event) => setStart(event.currentTarget.value)}
          />
          <Field
            type="time"
            name="quietHoursEnd"
            label={t("quietEnd")}
            value={end}
            disabled={!canWrite || busy}
            required
            onChange={(event) => setEnd(event.currentTarget.value)}
          />
        </div>
      ) : null}
      {canWrite ? (
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" disabled={busy}>{t(busy ? "saving" : "save")}</Button>
        </div>
      ) : null}
    </form>
  );
}
