"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import type { RestorePreview } from "@/modules/workspace-backup/schemas";

type JobStatus = "queued" | "processing" | "succeeded" | "failed";

type JobView = {
  status: JobStatus;
  messageKey: string | null;
  downloadUrl: string | null;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { messageKey?: string } };
    return body.error?.messageKey ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * F-P2-11 / F22: owner-only export and a restore that is previewed, typed and
 * queued. The component never claims success before the job reports it.
 */
export function DataBackupClient() {
  const t = useTranslations("Workspace.data");
  const te = useTranslations();
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupJobId, setBackupJobId] = useState<string | null>(null);
  const [backup, setBackup] = useState<JobView | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [restore, setRestore] = useState<JobView | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const poll = useCallback(async (jobId: string, setter: (value: JobView) => void) => {
    try {
      const response = await fetch(`/api/workspace/archive/${jobId}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: { status: JobStatus; messageKey: string | null; downloadUrl: string | null };
      };
      setter({
        status: body.data.status,
        messageKey: body.data.messageKey,
        downloadUrl: body.data.downloadUrl,
      });
      return body.data.status === "succeeded" || body.data.status === "failed";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!backupJobId) return;
    let active = true;
    const timer: { id?: ReturnType<typeof setInterval> } = {};
    const tick = async () => {
      const done = await poll(backupJobId, (value) => {
        if (active) setBackup(value);
      });
      if (done && active && timer.id) clearInterval(timer.id);
    };
    void tick();
    timer.id = setInterval(tick, 2000);
    return () => {
      active = false;
      if (timer.id) clearInterval(timer.id);
    };
  }, [backupJobId, poll]);

  useEffect(() => {
    if (!restoreJobId) return;
    let active = true;
    const timer: { id?: ReturnType<typeof setInterval> } = {};
    const tick = async () => {
      const done = await poll(restoreJobId, (value) => {
        if (active) setRestore(value);
      });
      if (done && active && timer.id) clearInterval(timer.id);
    };
    void tick();
    timer.id = setInterval(tick, 2000);
    return () => {
      active = false;
      if (timer.id) clearInterval(timer.id);
    };
  }, [restoreJobId, poll]);

  async function startBackup() {
    setBackupBusy(true);
    setBackupError(null);
    setBackup(null);
    try {
      const response = await fetch("/api/workspace/backup", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "errors.internal"));
      const body = (await response.json()) as { data: { id: string } };
      setBackupJobId(body.data.id);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "errors.internal");
    } finally {
      setBackupBusy(false);
    }
  }

  async function startPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPreviewBusy(true);
    setPreviewError(null);
    setPreview(null);
    setConfirmation("");
    setRestore(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/workspace/restore/preview", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await readError(response, "data.archiveInvalid"));
      const body = (await response.json()) as { data: RestorePreview };
      setPreview(body.data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "data.archiveInvalid");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function startRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview?.uploadId || confirmation !== "RESTORE" || !preview.applicable) return;
    setRestoreBusy(true);
    setRestoreError(null);
    setRestore(null);
    try {
      const response = await fetch("/api/workspace/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId: preview.uploadId,
          confirmation,
          fingerprint: preview.fingerprint,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "data.restoreFailed"));
      const body = (await response.json()) as { data: { id: string } };
      setRestoreJobId(body.data.id);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "data.restoreFailed");
    } finally {
      setRestoreBusy(false);
    }
  }

  const backupState = backup?.status ?? (backupBusy || backupJobId ? "processing" : "idle");
  const restoreState = restore?.status ?? (restoreBusy || restoreJobId ? "processing" : "idle");

  return (
    <div className="ui-form-stack">
      {backupError ? <Alert tone="danger" live="alert">{te(backupError)}</Alert> : null}
      {previewError ? <Alert tone="danger" live="alert">{te(previewError)}</Alert> : null}
      {restoreError ? <Alert tone="danger" live="alert">{te(restoreError)}</Alert> : null}

      <section className="app-page-section">
        <h3 className="app-section-title">{t("exportTitle")}</h3>
        <p className="app-muted">{t("exportDescription")}</p>
        <Button type="button" onClick={startBackup} disabled={backupBusy || backupJobId !== null}>
          {backupState === "idle" ? t("exportAction") : t("exporting")}
        </Button>
        {backupJobId ? (
          <div role="status">
            <p className="app-muted">
              {backup?.status === "succeeded"
                ? t("exportReady")
                : backup?.status === "failed"
                  ? te(backup.messageKey ?? "Workspace.data.exportFailed")
                  : backupState === "queued"
                    ? t("exportQueued")
                    : t("exportProcessing")}
            </p>
            {backup?.status === "succeeded" && backup.downloadUrl ? (
              <a className="ui-button" href={`/api/workspace/archive/${backupJobId}/download`}>
                {t("download")}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="app-page-section">
        <h3 className="app-section-title">{t("restoreTitle")}</h3>
        <p className="app-muted">{t("restoreDescription")}</p>
        <form onSubmit={startPreview} className="ui-form-stack">
          <Field
            type="file"
            name="archive"
            label={t("restoreChoose")}
            accept="application/json,.json"
            onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          />
          <Button type="submit" disabled={!file || previewBusy || restoreJobId !== null}>
            {previewBusy ? t("previewing") : t("previewTitle")}
          </Button>
        </form>

        {preview ? (
          <div className="app-page-section" role="status">
            {preview.applicable ? (
              <Alert tone="success">{t("previewApplicable")}</Alert>
            ) : (
              <Alert tone="danger" live="alert">{t("previewNotApplicable")}</Alert>
            )}
            <p className="app-muted">
              {t("previewRows")}: {preview.totalRows} · {t("previewTables")}: {preview.tables.length}
            </p>
            <p className="app-muted">
              {t("schemaVersion")}: {preview.schemaVersion} · {t("generatedAt")}: {preview.generatedAt}
            </p>
            <p className="app-muted">
              {t("fingerprint")}: <code>{preview.fingerprint}</code>
            </p>
            {preview.retainedTables.length > 0 ? (
              <p className="app-muted">
                {t("previewRetained")}: {preview.retainedTables.join(", ")}
              </p>
            ) : null}
            {preview.missingFileObjects > 0 ? (
              <p className="app-muted">
                {t("missingObjects")}: {preview.missingFileObjects}
              </p>
            ) : null}
            {preview.unapplicable.length > 0 ? (
              <p className="app-muted">
                {t("previewUnapplicable")}: {preview.unapplicable.length} ·{" "}
                {preview.unapplicable
                  .map((entry) => `${entry.table}: ${t(`reasons.${entry.reason}`)}`)
                  .join("; ")}
              </p>
            ) : null}

            {preview.applicable && preview.uploadId ? (
              <form onSubmit={startRestore} className="ui-form-stack">
                <p className="app-note">{t("confirmationHint")}</p>
                <Field
                  type="text"
                  name="confirmation"
                  label={t("confirmLabel")}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.currentTarget.value)}
                />
                <Button
                  type="submit"
                  variant="danger"
                  disabled={confirmation !== "RESTORE" || restoreBusy || restoreJobId !== null}
                >
                  {restoreBusy ? t("restoring") : t("restoreAction")}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {restoreJobId ? (
          <div role="status">
            <p className="app-muted">
              {restore?.status === "succeeded"
                ? t("restored")
                : restore?.status === "failed"
                  ? te(restore.messageKey ?? "Workspace.data.restoreFailed")
                  : restoreState === "queued"
                    ? t("restoreQueued")
                    : t("restoring")}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
