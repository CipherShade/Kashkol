"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { minorUnitsToEgp } from "@/modules/payments/schemas";

type SessionRevenue = {
  id: string;
  groupId: string | null;
  groupName: string;
  gradeLabel: string | null;
  startsAt: string;
  pricePerStudentMinor: number | null;
  presentCount: number;
  expectedRevenueMinor: number | null;
  collectedRevenueMinor: number;
};

type PaymentRecord = {
  id: string;
  sessionId: string | null;
  amountMinor: number;
  paidOn: string;
  purpose: string | null;
  method: string;
  methodLabel: string | null;
  voidedAt: string | null;
};

type AdjustmentRecord = {
  id: string;
  paymentId: string | null;
  amountMinor: number;
  paidOn: string;
  kind: string;
  reason: string;
};

type Dashboard = {
  groups: Array<{ id: string; name: string }>;
  sessions: SessionRevenue[];
  payments: PaymentRecord[];
  adjustments: AdjustmentRecord[];
  totals: {
    collectedMinor: number;
    grossCollectedMinor: number;
    refundedMinor: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    paymentCount: number;
    adjustmentCount: number;
  };
};

export function PaymentsClient({
  initialData,
  canWrite,
  today,
}: {
  initialData: Dashboard;
  canWrite: boolean;
  today: string;
}) {
  const t = useTranslations("Payments");
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [selectedSession, setSelectedSession] = useState("");

  async function reload(nextPage = 1, sessionId = selectedSession) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
    if (sessionId) params.set("sessionId", sessionId);
    const response = await fetch(`/api/payments?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to refresh the payment ledger");
    const result = await response.json();
    setData({
      ...result,
      payments: result.payments.map((row: PaymentRecord) => ({
        ...row,
        paidOn: row.paidOn.slice(0, 10),
      })),
      adjustments: result.adjustments.map((row: AdjustmentRecord) => ({
        ...row,
        paidOn: row.paidOn.slice(0, 10),
      })),
    });
    setPage(nextPage);
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    endpoint: string,
    buildBody: (form: FormData) => Record<string, unknown>,
    rotateIdempotencyKey?: () => void,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(false);
    try {
      const body = buildBody(new FormData(formElement));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Payment operation failed");
      rotateIdempotencyKey?.();
      formElement.reset();
      await reload(1, selectedSession);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.pagination.paymentCount / data.pagination.pageSize));
  const sessionLabel = (session: SessionRevenue) =>
    session.groupName || session.gradeLabel || t("independentSession");
  const sessionOptions = data.sessions.map((session) => ({
    id: session.id,
    label: `${sessionLabel(session)} · ${new Date(session.startsAt).toLocaleDateString()}`,
  }));

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="text-sm text-destructive">{t("requestError")}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryCard title={t("collected")} value={data.totals.collectedMinor} />
        <SummaryCard title={t("expected")} value={data.sessions.reduce((sum, s) => sum + (s.expectedRevenueMinor ?? 0), 0)} />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("sessionRevenueTitle")}</h2>
            <label className="grid gap-1 text-sm">
              <span>{t("filterSession")}</span>
              <Select
                value={selectedSession}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSelectedSession(value);
                  void reload(1, value).catch(() => setError(true));
                }}
              >
                <option value="">{t("allSessions")}</option>
                {sessionOptions.map((session) => (
                  <option key={session.id} value={session.id}>{session.label}</option>
                ))}
              </Select>
            </label>
          </div>
          {data.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyHistory")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start">{t("session")}</th>
                    <th className="p-2 text-start">{t("attended")}</th>
                    <th className="p-2 text-start">{t("price")}</th>
                    <th className="p-2 text-start">{t("expected")}</th>
                    <th className="p-2 text-start">{t("received")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session) => (
                    <tr key={session.id} className="border-t border-border">
                      <td className="p-2">{sessionLabel(session)} · {new Date(session.startsAt).toLocaleDateString()}</td>
                      <td className="p-2">{session.presentCount}</td>
                      <td className="p-2">{session.pricePerStudentMinor != null ? `${minorUnitsToEgp(session.pricePerStudentMinor)} EGP` : "—"}</td>
                      <td className="p-2">{session.expectedRevenueMinor != null ? `${minorUnitsToEgp(session.expectedRevenueMinor)} EGP` : "—"}</td>
                      <td className="p-2">{minorUnitsToEgp(session.collectedRevenueMinor)} EGP</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {canWrite ? (
        <Card>
          <CardBody>
            <form
              className="grid gap-3"
              onSubmit={(event) =>
                void submit(event, "/api/payments", (form) => ({
                  sessionId: String(form.get("sessionId")),
                  amount: String(form.get("amount")),
                  method: String(form.get("method")),
                  methodLabel: String(form.get("methodLabel") ?? "").trim() || undefined,
                  paidOn: String(form.get("paidOn")),
                  purpose: String(form.get("purpose") ?? "").trim() || undefined,
                  referenceNumber: String(form.get("referenceNumber") ?? "").trim() || undefined,
                  note: String(form.get("note") ?? "").trim() || undefined,
                  idempotencyKey: paymentKey,
                }),
                () => setPaymentKey(crypto.randomUUID()),
              )
              }
            >
              <h2 className="text-lg font-semibold">{t("recordTitle")}</h2>
              <label className="grid gap-1 text-sm">
                <span>{t("session")}</span>
                <Select name="sessionId" required defaultValue="">
                  <option value="" disabled>{t("chooseSession")}</option>
                  {sessionOptions.map((session) => (
                    <option key={session.id} value={session.id}>{session.label}</option>
                  ))}
                </Select>
              </label>
              <Field label={t("amount")} name="amount" inputMode="decimal" required />
              <Field label={t("purpose")} name="purpose" />
              <label className="grid gap-1 text-sm">
                <span>{t("method")}</span>
                <Select name="method" defaultValue="cash">
                  <option value="cash">{t("cash")}</option>
                  <option value="transfer">{t("transfer")}</option>
                  <option value="other">{t("other")}</option>
                </Select>
              </label>
              <Field label={t("methodLabel")} name="methodLabel" />
              <Field label={t("paidOn")} name="paidOn" type="date" defaultValue={today} required />
              <Field label={t("reference")} name="referenceNumber" />
              <Field label={t("note")} name="note" type="text" />
              <Button type="submit" disabled={busy || data.sessions.length === 0}>
                {busy ? t("saving") : t("recordButton")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyHistory")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start">{t("session")}</th>
                    <th className="p-2 text-start">{t("amount")}</th>
                    <th className="p-2 text-start">{t("method")}</th>
                    <th className="p-2 text-start">{t("paidOn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => {
                    const session = data.sessions.find((candidate) => candidate.id === payment.sessionId);
                    return (
                      <tr key={payment.id} className="border-t border-border">
                        <td className="p-2">{session ? `${sessionLabel(session)} · ${new Date(session.startsAt).toLocaleDateString()}` : t("unspecified")}</td>
                        <td className="p-2">{minorUnitsToEgp(payment.amountMinor)} EGP</td>
                        <td className="p-2">{payment.method === "other" ? payment.methodLabel ?? t("other") : payment.method}</td>
                        <td className="p-2">{payment.paidOn}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label={t("historyPagination")} className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button variant="secondary" size="sm" onClick={() => void reload(page - 1).catch(() => setError(true))} disabled={page <= 1 || busy}>
              {t("previous")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("pageOf", { page, pageCount })}</span>
            <Button variant="secondary" size="sm" onClick={() => void reload(page + 1).catch(() => setError(true))} disabled={page >= pageCount || busy}>
              {t("next")}
            </Button>
          </nav>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{minorUnitsToEgp(value)} EGP</p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  inputMode,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} inputMode={inputMode} required={required} />
    </label>
  );
}
