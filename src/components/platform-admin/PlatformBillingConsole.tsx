"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatMinorAsEgp } from "@/modules/billing/ledger";

type Config = {
  id: string;
  version: number;
  rateMinor: number;
  thresholdMinor: number;
  currency: string;
  timezone: string;
  instapayHandle: string;
  instapayLink: string;
  qrStorageKey: string | null;
  isActive: boolean;
  effectiveAt: string;
  createdAt: string;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  ownerName?: string | null;
};

type Exemption = {
  id: string;
  workspaceId: string;
  reason: string;
  notes: string | null;
  startDate: string;
  expiresOn: string | null;
  status: string;
  revokedOn: string | null;
  createdByAdminId: string;
  modifiedByAdminId: string;
  createdAt: string;
  updatedAt: string;
};

type AdminSubmission = {
  id: string;
  workspaceId: string;
  workspace: Workspace;
  invoiceId: string;
  invoice: { number: string; totalMinor: number; cycleKey: string };
  referenceRaw: string;
  amountMinor: number;
  amountLabel: string;
  invoiceTotalLabel: string;
  transferredAt: string;
  status: string;
  evidenceFileId: string | null;
  reversedAt: string | null;
  submittedAt: string;
};

type BillingOverview = {
  config: Config;
  versions: Config[];
  workspaces: Workspace[];
  exemptions: Array<{ workspace: Workspace; exemptions: Exemption[] }>;
  exemptionsTruncated: boolean;
  submissions: AdminSubmission[];
  submissionsTruncated: boolean;
};

const AUDIT_REASON_CODES = [
  "config_change",
  "exemption_created",
  "exemption_updated",
  "exemption_revoked",
  "manual_adjustment",
  "review_decision",
  "reference_release",
] as const;

async function stableKey(prefix: string, parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode([prefix, ...parts].join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const encoded = Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${encoded}`;
}

export function PlatformBillingConsole({ initialData }: { initialData: BillingOverview }) {
  const t = useTranslations("PlatformBilling");
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(String(Number(formatMinorAsEgp(data.config.thresholdMinor))));
  const [handle, setHandle] = useState(data.config.instapayHandle);
  const [link, setLink] = useState(data.config.instapayLink);

  async function reload() {
    const response = await fetch("/api/platform-admin/billing", { cache: "no-store" });
    if (!response.ok) throw new Error("billing.reloadFailed");
    setData((await response.json()) as BillingOverview);
  }

  async function postJson(
    url: string,
    body: unknown,
    successKey: string,
    confirmKey?: string,
    confirmValues?: Record<string, string>,
  ) {
    if (confirmKey && !window.confirm(t(confirmKey, confirmValues))) return;
    setBusy(true);
    setErrorKey(null);
    setNoticeKey(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setErrorKey("errors.adminActionFailed");
        return;
      }
      setNoticeKey(successKey);
      await reload();
    } catch {
      setErrorKey("errors.adminActionFailed");
    } finally {
      setBusy(false);
    }
  }

  function workspaceLabel(workspaceId: string): string {
    const workspace = data.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) return workspaceId;
    const owner = workspace.ownerName ? ` · ${workspace.ownerName}` : "";
    return `${workspace.name} (${workspace.slug}, ${workspace.id})${owner}`;
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await postJson(
      "/api/platform-admin/billing/config",
      {
        thresholdMinor: Math.round(Number(threshold) * 100),
        instapayHandle: handle,
        instapayLink: link,
        reasonCode: String(values.get("reasonCode")),
      },
      "notices.configSaved",
      "confirmations.saveConfig",
    );
  }

  async function createExemption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const workspaceId = String(values.get("workspaceId"));
    if (!workspaceId) {
      setErrorKey("errors.workspaceRequired");
      return;
    }
    await postJson(
      "/api/platform-admin/billing/exemptions",
      {
        workspaceId,
        reason: String(values.get("reason")),
        notes: String(values.get("notes") ?? "") || null,
        startDate: String(values.get("startDate")),
        expiresOn: String(values.get("expiresOn") ?? "") || null,
        reasonCode: String(values.get("reasonCode")),
      },
      "notices.exemptionCreated",
      "confirmations.createExemption",
      { workspace: workspaceLabel(workspaceId) },
    );
    form.reset();
  }

  async function revokeExemption(exemption: Exemption) {
    await postJson(
      `/api/platform-admin/billing/exemptions/${encodeURIComponent(exemption.id)}`,
      {
        operation: "revoke",
        workspaceId: exemption.workspaceId,
        reasonCode: "exemption_revoked",
      },
      "notices.exemptionRevoked",
      "confirmations.revokeExemption",
      { workspace: workspaceLabel(exemption.workspaceId) },
    );
  }

  async function reviewSubmission(submission: AdminSubmission, form: HTMLFormElement) {
    const values = new FormData(form);
    const action = String(values.get("action"));
    await postJson(
      `/api/platform-admin/billing/submissions/${encodeURIComponent(submission.id)}/review`,
      {
        workspaceId: submission.workspaceId,
        action,
        noteCode: String(values.get("noteCode") ?? "") || null,
        reasonCode: String(values.get("reasonCode") ?? "review_decision"),
        idempotencyKey: await stableKey("review", [submission.id, action]),
      },
      "notices.reviewSaved",
      "confirmations.reviewSubmission",
      {
        workspace: workspaceLabel(submission.workspaceId),
        action: t(`reviewActions.${action}`),
        invoice: submission.invoice.number,
      },
    );
    form.reset();
  }

  async function releaseSubmission(submission: AdminSubmission) {
    await postJson(
      `/api/platform-admin/billing/submissions/${encodeURIComponent(submission.id)}/release`,
      {
        workspaceId: submission.workspaceId,
        reasonCode: "duplicate_reported",
      },
      "notices.referenceReleased",
      "confirmations.releaseReference",
      {
        workspace: workspaceLabel(submission.workspaceId),
        invoice: submission.invoice.number,
      },
    );
  }

  async function adjustBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const workspaceId = String(values.get("workspaceId"));
    const direction = String(values.get("direction"));
    const amountMinor = Math.round(Number(values.get("amountEgp")) * 100);
    const reasonCode = String(values.get("reasonCode"));
    if (!workspaceId) {
      setErrorKey("errors.workspaceRequired");
      return;
    }
    await postJson(
      "/api/platform-admin/billing/adjustments",
      {
        workspaceId,
        direction,
        amountMinor,
        reasonCode,
        idempotencyKey: await stableKey("adjust", [
          workspaceId,
          direction,
          String(amountMinor),
          reasonCode,
        ]),
      },
      "adjustment.success",
      "confirmations.adjustBalance",
      { workspace: workspaceLabel(workspaceId) },
    );
    form.reset();
  }

  const workspaceOptions = (
    <>
      <option value="">{t("labels.selectWorkspace")}</option>
      {data.workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name} ({workspace.slug}, {workspace.id})
          {workspace.ownerName ? ` · ${workspace.ownerName}` : ""}
        </option>
      ))}
    </>
  );

  const auditReasonOptions = AUDIT_REASON_CODES.map((code) => (
    <option key={code} value={code}>
      {t(`auditReasons.${code}`)}
    </option>
  ));

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] px-4 py-6 text-[var(--color-text-primary)] sm:px-6">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void postJson("/api/platform-admin/billing/cycle", {}, "notices.cycleCompleted")
            }
          >
            {t("actions.runCycle")}
          </Button>
          <Link
            href="/platform-admin"
            className="inline-flex items-center rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-semibold"
          >
            {t("actions.back")}
          </Link>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl space-y-6">
        {errorKey && (
          <div role="alert" className="rounded-lg border border-[var(--color-danger)] p-4 text-sm">
            {t(errorKey)}
          </div>
        )}
        {noticeKey && (
          <div
            role="status"
            className="rounded-lg border border-[var(--color-accent-primary)] p-4 text-sm"
          >
            {t(noticeKey)}
          </div>
        )}

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold">{t("sections.config")}</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{t("config.note")}</p>
            <form
              onSubmit={(event) => void saveConfig(event)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm">
                <span>{t("labels.thresholdEgp")}</span>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.instapayHandle")}</span>
                <Input
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  required
                  dir="ltr"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.instapayLink")}</span>
                <Input value={link} onChange={(event) => setLink(event.target.value)} dir="ltr" />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.auditReason")}</span>
                <Select name="reasonCode" defaultValue="config_change" required>
                  {auditReasonOptions}
                </Select>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {t("actions.saveVersion")}
                </Button>
              </div>
            </form>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t("config.active", { version: data.config.version, rate: data.config.rateMinor })}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold">{t("sections.exemption")}</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{t("exemption.note")}</p>
            <form
              onSubmit={(event) => void createExemption(event)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm">
                <span>{t("labels.workspace")}</span>
                <Select name="workspaceId" defaultValue="" required>
                  {workspaceOptions}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.reasonType")}</span>
                <Select name="reason" defaultValue="internal_testing" required>
                  {["internal_testing", "beta_tester", "testimonial", "promotional", "partner", "custom"].map(
                    (reason) => (
                      <option key={reason} value={reason}>
                        {t(`reasonTypes.${reason}`)}
                      </option>
                    ),
                  )}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.startDate")}</span>
                <Input name="startDate" type="date" required />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.expiresOn")}</span>
                <Input name="expiresOn" type="date" />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.internalNotes")}</span>
                <Input name="notes" maxLength={500} />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.auditReason")}</span>
                <Select name="reasonCode" defaultValue="exemption_created" required>
                  {auditReasonOptions}
                </Select>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {t("actions.createExemption")}
                </Button>
              </div>
            </form>

            {data.exemptionsTruncated && (
              <p className="text-sm text-[var(--color-text-secondary)]">{t("labels.listTruncated")}</p>
            )}
            {data.exemptions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.exemptions")}</p>
            ) : (
              <div className="space-y-3">
                {data.exemptions.map((group) => (
                  <div
                    key={group.workspace.id}
                    className="rounded-md border border-[var(--color-border-subtle)] p-3"
                  >
                    <p className="text-sm font-semibold">{group.workspace.name}</p>
                    {group.exemptions.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t("empty.workspaceExemptions")}
                      </p>
                    ) : (
                      group.exemptions.map((exemption) => (
                        <div
                          key={exemption.id}
                          className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {t(`reasonTypes.${exemption.reason}`)} · {exemption.startDate} ·{" "}
                            {t(`exemptionStates.${exemption.status}`)}
                          </span>
                          {exemption.status !== "revoked" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void revokeExemption(exemption)}
                            >
                              {t("actions.revoke")}
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold">{t("sections.adjustment")}</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{t("adjustment.note")}</p>
            <form
              onSubmit={(event) => void adjustBalance(event)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.workspace")}</span>
                <Select name="workspaceId" defaultValue="" required>
                  {workspaceOptions}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("adjustment.direction")}</span>
                <Select name="direction" defaultValue="credit" required>
                  <option value="credit">{t("adjustment.credit")}</option>
                  <option value="debit">{t("adjustment.debit")}</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("adjustment.amount")}</span>
                <Input name="amountEgp" type="number" step="0.01" min="0.01" required />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.auditReason")}</span>
                <Select name="reasonCode" defaultValue="manual_adjustment" required>
                  {auditReasonOptions}
                </Select>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {t("adjustment.submit")}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold">{t("sections.submissions")}</h2>
            {data.submissionsTruncated && (
              <p className="text-sm text-[var(--color-text-secondary)]">{t("labels.listTruncated")}</p>
            )}
            {data.submissions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.submissions")}</p>
            ) : (
              <div className="space-y-3">
                {data.submissions.map((submission) => (
                  <form
                    key={submission.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void reviewSubmission(submission, event.currentTarget);
                    }}
                    className="grid gap-3 rounded-md border border-[var(--color-border-subtle)] p-3 text-sm sm:grid-cols-4"
                  >
                    <div className="sm:col-span-4">
                      <p className="font-medium" dir="ltr">
                        {submission.invoice.number}
                      </p>
                      <p className="text-[var(--color-text-secondary)]">
                        {submission.workspace.name} · {submission.amountLabel} /{" "}
                        {submission.invoiceTotalLabel} ·{" "}
                        {t(`submissionStates.${submission.status}`)}
                      </p>
                      <p className="text-[var(--color-text-secondary)]" dir="ltr">
                        {submission.referenceRaw}
                      </p>
                      {submission.reversedAt && (
                        <p className="text-xs text-[var(--color-danger)]">
                          {t("labels.referenceReleased")}
                        </p>
                      )}
                      {submission.evidenceFileId ? (
                        <a
                          className="text-xs underline"
                          href={`/api/platform-admin/billing/submissions/${encodeURIComponent(submission.id)}/evidence?workspaceId=${encodeURIComponent(submission.workspaceId)}`}
                          rel="noreferrer"
                        >
                          {t("actions.openEvidence")}
                        </a>
                      ) : (
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t("labels.evidence")}: {t("labels.noEvidence")}
                        </p>
                      )}
                    </div>
                    <label className="space-y-1">
                      <span>{t("labels.action")}</span>
                      <Select name="action" defaultValue="under_review" required>
                        <option value="under_review">{t("reviewActions.under_review")}</option>
                        <option value="approved">{t("reviewActions.approved")}</option>
                        <option value="rejected">{t("reviewActions.rejected")}</option>
                        <option value="flagged">{t("reviewActions.flagged")}</option>
                      </Select>
                    </label>
                    <label className="space-y-1">
                      <span>{t("labels.noteCode")}</span>
                      <Select name="noteCode" defaultValue="">
                        <option value="">—</option>
                        <option value="amount_mismatch">{t("noteCodes.amount_mismatch")}</option>
                        <option value="reference_not_found">{t("noteCodes.reference_not_found")}</option>
                        <option value="duplicate_reference">{t("noteCodes.duplicate_reference")}</option>
                        <option value="other">{t("noteCodes.other")}</option>
                      </Select>
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span>{t("labels.auditReason")}</span>
                      <Select name="reasonCode" defaultValue="review_decision" required>
                        {auditReasonOptions}
                      </Select>
                    </label>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
                      <Button type="submit" size="sm" variant="primary" disabled={busy}>
                        {t("actions.review")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || submission.reversedAt !== null}
                        onClick={() => void releaseSubmission(submission)}
                      >
                        {t("actions.releaseReference")}
                      </Button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
