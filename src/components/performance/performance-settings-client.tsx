"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, FormField, Input } from "@/components/ui/form";
import { requestPerformanceJson } from "./client-request";

export type PerformanceSettingsValue = {
  enabled: boolean;
  minAssessments: number;
  averageBelowPercent: number;
  consecutiveDeclines: number;
  weakTopicPercent: number;
};

export function PerformanceSettingsClient({
  initialSettings,
  canWrite,
}: {
  initialSettings: PerformanceSettingsValue;
  canWrite: boolean;
}) {
  const t = useTranslations("Performance.settings");
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  function numberValue(key: keyof Omit<PerformanceSettingsValue, "enabled">, value: string) {
    const parsed = Number(value);
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      const result = await requestPerformanceJson<PerformanceSettingsValue>(
        "/api/performance/settings",
        "PATCH",
        settings,
      );
      setSettings(result);
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("title")} description={t("hint")} titleId="performance-settings-title" />
      <CardBody>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void save(event)}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.enabled}
              disabled={!canWrite || busy}
              onChange={(event) => {
                setSaved(false);
                setSettings((current) => ({ ...current, enabled: event.target.checked }));
              }}
            />
            <span>{t("enabled")}</span>
          </label>
          <FormField label={t("minAssessments")}>
            <Input
              type="number"
              min={2}
              max={20}
              required
              disabled={!canWrite || busy}
              value={settings.minAssessments}
              onChange={(event) => numberValue("minAssessments", event.target.value)}
            />
          </FormField>
          <FormField label={t("averageBelowPercent")}>
            <Input
              type="number"
              min={1}
              max={100}
              required
              disabled={!canWrite || busy}
              value={settings.averageBelowPercent}
              onChange={(event) => numberValue("averageBelowPercent", event.target.value)}
            />
          </FormField>
          <FormField label={t("consecutiveDeclines")}>
            <Input
              type="number"
              min={1}
              max={10}
              required
              disabled={!canWrite || busy}
              value={settings.consecutiveDeclines}
              onChange={(event) => numberValue("consecutiveDeclines", event.target.value)}
            />
          </FormField>
          <FormField label={t("weakTopicPercent")}>
            <Input
              type="number"
              min={1}
              max={100}
              required
              disabled={!canWrite || busy}
              value={settings.weakTopicPercent}
              onChange={(event) => numberValue("weakTopicPercent", event.target.value)}
            />
          </FormField>
          {canWrite ? (
            <div className="flex items-end md:col-span-2">
              <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
                {busy ? t("saving") : t("save")}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {t("error")}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-success md:col-span-2">
              {t("saved")}
            </p>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}
