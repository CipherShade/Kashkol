"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";

export type TeacherBillingData = {
  month: string;
  config: {
    version: number;
    rateMinor: number;
    thresholdMinor: number;
    currency: string;
    timezone: string;
    instapayHandle: string;
    instapayLink: string;
    versionLabel?: string;
    isActive: boolean;
  };
  activation: { month: string; activatedAt: string } | null;
  exemption: {
    reason: string;
    startDate: string;
    expiresOn: string | null;
    status: string;
  } | null;
  preview: {
    qualifyingStudentCount: number;
    rateMinor: number;
    chargeMinor: number;
    chargeLabel: string;
    billable: boolean;
  };
  summary: {
    unbilledMinor: number;
    availableCreditMinor: number;
    invoicedMinor: number;
    paidMinor: number;
    creditedMinor: number;
    outstandingMinor: number;
    unbilledLabel: string;
    availableCreditLabel: string;
    paidLabel: string;
    creditedLabel: string;
    outstandingLabel: string;
    invoices: Array<{
      id: string;
      number: string;
      totalMinor: number;
      totalLabel: string;
      paidMinor: number;
      paidLabel: string;
      creditedMinor: number;
      creditedLabel: string;
      outstandingMinor: number;
      outstandingLabel: string;
      state: string;
      issuedAt: string | null;
    }>;
  };
  ledger: Array<{
    id: string;
    entryType: string;
    direction: string;
    amountMinor: number;
    amountLabel: string;
    periodMonth: string | null;
    createdAt: string;
    descriptionKey: string | null;
  }>;
  submissions: Array<{
    id: string;
    invoiceId: string;
    reference: string;
    amountMinor: number;
    amountLabel: string;
    transferredAt: string;
    status: string;
    hasEvidence: boolean;
    submittedAt: string;
    reviewedAt: string | null;
    reviewNoteCode: string | null;
  }>;
};

async function stableKey(prefix: string, parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode([prefix, ...parts].join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const encoded = Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${encoded}`;
}

export function BillingClient({ initialData }: { initialData: TeacherBillingData }) {
  const t = useTranslations("TeacherBilling");
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [transferredAt, setTransferredAt] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [invoiceId, setInvoiceId] = useState(data.summary.invoices[0]?.id ?? "");

  async function reload() {
    const response = await fetch(`/api/billing?month=${encodeURIComponent(data.month)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("billing.reloadFailed");
    const next = (await response.json()) as TeacherBillingData;
    setData(next);
    setInvoiceId((current) => current || next.summary.invoices[0]?.id || "");
  }

  async function uploadEvidence(file: File): Promise<string> {
    setUploadingEvidence(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/billing/evidence", { method: "POST", body: formData });
      if (!response.ok) throw new Error("billing.evidenceUploadFailed");
      const created = (await response.json()) as { fileId: string };
      return created.fileId;
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    setNoticeKey(null);
    try {
      const evidenceFileId = evidenceFile ? await uploadEvidence(evidenceFile) : null;
      const amountMinor = Math.round(Number(amount) * 100);
      const transferredAtIso = new Date(transferredAt).toISOString();
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          reference,
          amountMinor,
          transferredAt: transferredAtIso,
          evidenceFileId,
          idempotencyKey: await stableKey("submit", [
            invoiceId,
            reference.trim().toLowerCase(),
            String(amountMinor),
            transferredAtIso,
          ]),
        }),
      });
      if (!response.ok) {
        setErrorKey("errors.billingSubmissionFailed");
        return;
      }
      setReference("");
      setAmount("");
      setTransferredAt("");
      setEvidenceFile(null);
      setNoticeKey("billing.submissionRecorded");
      await reload();
    } catch {
      setErrorKey("errors.billingSubmissionFailed");
    } finally {
      setBusy(false);
    }
  }

  const transferConfigured = data.config.instapayHandle.trim().length > 0;

  return (
    <div className="space-y-6">
      {errorKey && (
        <div role="alert" className="rounded-lg border border-[var(--color-danger)] p-4 text-sm">
          {t(errorKey)}
        </div>
      )}
      {noticeKey && (
        <div role="status" className="rounded-lg border border-[var(--color-accent-primary)] p-4 text-sm">
          {t(noticeKey)}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs text-[var(--color-text-secondary)]">{t("labels.account")}</p>
            <p className="mt-2 text-sm font-semibold">{t("values.freeUnlimited")}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-[var(--color-text-secondary)]">{t("labels.currentMonth")}</p>
            <p className="mt-2 text-sm font-semibold">{data.month}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-[var(--color-text-secondary)]">{t("labels.qualifyingStudents")}</p>
            <p className="mt-2 text-2xl font-bold">{data.preview.qualifyingStudentCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-[var(--color-text-secondary)]">{t("labels.estimatedCharge")}</p>
            <p className="mt-2 text-2xl font-bold">{data.preview.chargeLabel}</p>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold">{t("sections.rule")}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{t("rule.description")}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm text-[var(--color-text-secondary)]">
            <li>{t("rule.rate", { rate: data.config.rateMinor })}</li>
            <li>{t("rule.qualification")}</li>
            <li>{t("rule.manual")}</li>
            <li>{t("rule.evidence")}</li>
            <li>{t("rule.whatsapp")}</li>
          </ul>
          <div className="rounded-md border border-[var(--color-border-subtle)] p-3 text-sm">
            <p className="font-medium">{t("labels.instapay")}</p>
            {transferConfigured ? (
              <>
                <p className="mt-1" dir="ltr">{data.config.instapayHandle}</p>
                {data.config.instapayLink && (
                  <a
                    className="mt-1 underline"
                    href={data.config.instapayLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("actions.openLink")}
                  </a>
                )}
              </>
            ) : (
              <p className="mt-1 text-[var(--color-text-secondary)]">{t("values.notConfigured")}</p>
            )}
          </div>
          {data.exemption && (
            <div role="note" className="rounded-md border border-[var(--color-accent-primary)] p-3 text-sm">
              {t("values.exempt", {
                reason: t(`exemptionReasons.${data.exemption.reason}`),
                start: data.exemption.startDate,
                end: data.exemption.expiresOn ?? t("values.openEnded"),
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold">{t("sections.summary")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <p className="text-sm">{t("labels.unbilled")}: <strong>{data.summary.unbilledLabel}</strong></p>
            <p className="text-sm">{t("labels.availableCredit")}: <strong>{data.summary.availableCreditLabel}</strong></p>
            <p className="text-sm">{t("labels.paid")}: <strong>{data.summary.paidLabel}</strong></p>
            <p className="text-sm">{t("labels.credited")}: <strong>{data.summary.creditedLabel}</strong></p>
            <p className="text-sm">{t("labels.outstanding")}: <strong>{data.summary.outstandingLabel}</strong></p>
          </div>
          {data.summary.invoices.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.invoices")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="py-2 text-start">{t("labels.invoice")}</th>
                    <th className="py-2 text-start">{t("labels.total")}</th>
                    <th className="py-2 text-start">{t("labels.state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-[var(--color-border-subtle)]">
                      <td className="py-2" dir="ltr">{invoice.number}</td>
                      <td className="py-2">{invoice.totalLabel}</td>
                      <td className="py-2">{t(`states.${invoice.state}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-base font-semibold">{t("sections.submit")}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{t("submit.note")}</p>
          {data.summary.invoices.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.invoicesForSubmission")}</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t("labels.invoice")}</span>
                <Select
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                  required
                >
                  {data.summary.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id} dir="ltr">
                      {invoice.number} — {invoice.totalLabel}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.reference")}</span>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  required
                  minLength={6}
                  maxLength={64}
                  dir="ltr"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.amountEgp")}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t("labels.transferredAt")}</span>
                <Input
                  type="datetime-local"
                  value={transferredAt}
                  onChange={(event) => setTransferredAt(event.target.value)}
                  required
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>{t("labels.evidence")}</span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                  disabled={uploadingEvidence || busy}
                />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy || uploadingEvidence}>
                  {uploadingEvidence
                    ? t("actions.uploading")
                    : busy
                      ? t("actions.submitting")
                      : t("actions.submit")}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold">{t("sections.history")}</h2>
          {data.submissions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.submissions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="py-2 text-start">{t("labels.reference")}</th>
                    <th className="py-2 text-start">{t("labels.amount")}</th>
                    <th className="py-2 text-start">{t("labels.state")}</th>
                    <th className="py-2 text-start">{t("labels.evidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.submissions.map((submission) => (
                    <tr key={submission.id} className="border-b border-[var(--color-border-subtle)]">
                      <td className="py-2" dir="ltr">{submission.reference}</td>
                      <td className="py-2">{submission.amountLabel}</td>
                      <td className="py-2">{t(`states.${submission.status}`)}</td>
                      <td className="py-2">
                        {submission.hasEvidence
                          ? t("values.evidenceAttached")
                          : t("values.noEvidence")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold">{t("sections.ledger")}</h2>
          {data.ledger.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("empty.ledger")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)]">
                    <th className="py-2 text-start">{t("labels.date")}</th>
                    <th className="py-2 text-start">{t("labels.entry")}</th>
                    <th className="py-2 text-start">{t("labels.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--color-border-subtle)]">
                      <td className="py-2">{entry.createdAt.slice(0, 10)}</td>
                      <td className="py-2">{t(`entries.${entry.entryType}`)}</td>
                      <td className="py-2">{entry.amountLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
