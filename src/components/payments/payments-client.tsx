"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { minorUnitsToEgp } from "@/modules/payments/schemas";

type PaymentRecord = {
  id: string;
  studentId: string;
  amountMinor: number;
  paidOn: string;
  period: string | null;
  purpose: string | null;
  method: string;
  methodLabel: string | null;
  referenceNumber: string | null;
  note: string | null;
  voidedAt: string | null;
};

type AdjustmentRecord = {
  id: string;
  studentId: string;
  paymentId: string | null;
  amountMinor: number;
  balanceImpact: number;
  paidOn: string;
  kind: string;
  reason: string;
};

type Dashboard = {
  students: Array<{ id: string; firstName: string; lastName: string }>;
  groups: Array<{ id: string; name: string }>;
  balances: Array<{
    studentId: string;
    student: { firstName: string; lastName: string };
    expectedMinor: number;
    receivedMinor: number;
    adjustmentsMinor: number;
    balanceMinor: number;
  }>;
  payments: PaymentRecord[];
  adjustments: AdjustmentRecord[];
  feeRules: Array<{
    id: string;
    studentId: string | null;
    groupId: string | null;
    amountMinor: number;
    effectiveFrom: string;
    purpose: string;
  }>;
  totals: {
    grossCollectedMinor: number;
    refundedMinor: number;
    collectedMinor: number;
    outstandingMinor: number;
    creditMinor: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    paymentCount: number;
    adjustmentCount: number;
  };
};

function studentName(student: { firstName: string; lastName: string }) {
  return `${student.firstName} ${student.lastName}`;
}

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
  const [selectedStudent, setSelectedStudent] = useState("");
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [adjustmentKey, setAdjustmentKey] = useState(() => crypto.randomUUID());

  async function reload(nextPage = 1, studentId = selectedStudent) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
    if (studentId) params.set("studentId", studentId);
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
      feeRules: result.feeRules.map((row: Dashboard["feeRules"][number]) => ({
        ...row,
        effectiveFrom: row.effectiveFrom.slice(0, 7),
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
      await reload(1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const paymentPages = Math.max(1, Math.ceil(data.pagination.paymentCount / data.pagination.pageSize));
  const adjustmentPages = Math.max(
    1,
    Math.ceil(data.pagination.adjustmentCount / data.pagination.pageSize),
  );
  const pageCount = Math.max(paymentPages, adjustmentPages);
  const displayStudent = (studentId: string) => {
    const student = data.students.find((candidate) => candidate.id === studentId);
    return student ? studentName(student) : t("unknownStudent");
  };

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="text-sm text-destructive">{t("requestError")}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard title={t("collected")} value={data.totals.collectedMinor} />
        <SummaryCard title={t("outstanding")} value={data.totals.outstandingMinor} />
        <SummaryCard title={t("credit")} value={data.totals.creditMinor} />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("balancesTitle")}</h2>
            <label className="grid gap-1 text-sm">
              <span>{t("filterStudent")}</span>
              <Select
                value={selectedStudent}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSelectedStudent(value);
                  void reload(1, value).catch(() => setError(true));
                }}
              >
                <option value="">{t("allStudents")}</option>
                {data.students.map((student) => (
                  <option key={student.id} value={student.id}>{studentName(student)}</option>
                ))}
              </Select>
            </label>
          </div>
          {data.balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyBalances")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start">{t("student")}</th>
                    <th className="p-2 text-start">{t("expected")}</th>
                    <th className="p-2 text-start">{t("received")}</th>
                    <th className="p-2 text-start">{t("balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.balances.map((balance) => (
                    <tr key={balance.studentId} className="border-t border-border">
                      <td className="p-2">{studentName(balance.student)}</td>
                      <td className="p-2">{minorUnitsToEgp(balance.expectedMinor)} EGP</td>
                      <td className="p-2">{minorUnitsToEgp(balance.receivedMinor)} EGP</td>
                      <td className="p-2">
                        {balance.balanceMinor < 0 ? t("creditLabel", {
                            amount: minorUnitsToEgp(-balance.balanceMinor),
                          }) : `${minorUnitsToEgp(balance.balanceMinor)} EGP`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {canWrite ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardBody>
              <form
                className="grid gap-3"
                onSubmit={(event) =>
                  void submit(event, "/api/payments", (form) => ({
                    studentId: String(form.get("studentId")),
                    amount: String(form.get("amount")),
                    period: String(form.get("period") ?? "").trim() || undefined,
                    purpose: String(form.get("purpose") ?? "").trim() || undefined,
                    method: String(form.get("method")),
                    methodLabel: String(form.get("methodLabel") ?? "").trim() || undefined,
                    paidOn: String(form.get("paidOn")),
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
                  <span>{t("student")}</span>
                  <Select name="studentId" required defaultValue="">
                    <option value="" disabled>{t("chooseStudent")}</option>
                    {data.students.map((student) => (
                      <option key={student.id} value={student.id}>{studentName(student)}</option>
                    ))}
                  </Select>
                </label>
                <Field label={t("amount")} name="amount" inputMode="decimal" required />
                <Field label={t("period")} name="period" placeholder="2026-10" />
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
                <Button type="submit" disabled={busy || data.students.length === 0}>
                  {busy ? t("saving") : t("recordButton")}
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <form
                className="grid gap-3"
                onSubmit={(event) =>
                  void submit(event, "/api/payments/adjustments", (form) => {
                    const kind = String(form.get("kind"));
                    return {
                      kind,
                      studentId: String(form.get("studentId")),
                      paymentId: String(form.get("paymentId") ?? "") || undefined,
                      amount: String(form.get("amount")),
                      direction: String(form.get("direction")),
                      paidOn: String(form.get("paidOn")),
                      reason: String(form.get("reason")),
                      idempotencyKey: adjustmentKey,
                    };
                  },
                  () => setAdjustmentKey(crypto.randomUUID()),
                )
                }
              >
                <h2 className="text-lg font-semibold">{t("adjustmentTitle")}</h2>
                <label className="grid gap-1 text-sm">
                  <span>{t("student")}</span>
                  <Select name="studentId" required defaultValue="">
                    <option value="" disabled>{t("chooseStudent")}</option>
                    {data.students.map((student) => (
                      <option key={student.id} value={student.id}>{studentName(student)}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>{t("adjustmentKind")}</span>
                  <Select name="kind" defaultValue="discount">
                    <option value="discount">{t("discount")}</option>
                    <option value="refund">{t("refund")}</option>
                    <option value="correction">{t("correction")}</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>{t("relatedReceipt")}</span>
                  <Select name="paymentId" defaultValue="">
                    <option value="">{t("none")}</option>
                    {data.payments.map((payment) => (
                      <option key={payment.id} value={payment.id}>
                        {payment.paidOn} · {minorUnitsToEgp(payment.amountMinor)} EGP
                      </option>
                    ))}
                  </Select>
                </label>
                <Field label={t("amount")} name="amount" inputMode="decimal" required />
                <label className="grid gap-1 text-sm">
                  <span>{t("correctionDirection")}</span>
                  <Select name="direction" defaultValue="increase_due">
                    <option value="increase_due">{t("increaseDue")}</option>
                    <option value="decrease_due">{t("decreaseDue")}</option>
                  </Select>
                </label>
                <Field label={t("paidOn")} name="paidOn" type="date" defaultValue={today} required />
                <Field label={t("reason")} name="reason" required />
                <Button type="submit" disabled={busy || data.students.length === 0}>
                  {busy ? t("saving") : t("addAdjustment")}
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <form
                className="grid gap-3"
                onSubmit={(event) =>
                  void submit(event, "/api/payments/fees", (form) => {
                    const studentId = String(form.get("studentId") ?? "");
                    const groupId = String(form.get("groupId") ?? "");
                    return {
                      studentId: studentId || undefined,
                      groupId: groupId || undefined,
                      amount: String(form.get("amount")),
                      effectiveFrom: String(form.get("effectiveFrom")),
                      purpose: String(form.get("purpose")),
                    };
                  })
                }
              >
                <h2 className="text-lg font-semibold">{t("feeRuleTitle")}</h2>
                <label className="grid gap-1 text-sm">
                  <span>{t("studentFee")}</span>
                  <Select
                    name="studentId"
                    defaultValue=""
                    onChange={(event) => {
                      const groupSelect = event.currentTarget.form?.elements.namedItem("groupId");
                      if (groupSelect instanceof HTMLSelectElement && event.currentTarget.value) {
                        groupSelect.value = "";
                      }
                    }}
                  >
                    <option value="">{t("none")}</option>
                    {data.students.map((student) => (
                      <option key={student.id} value={student.id}>{studentName(student)}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>{t("groupFee")}</span>
                  <Select
                    name="groupId"
                    defaultValue=""
                    onChange={(event) => {
                      const studentSelect = event.currentTarget.form?.elements.namedItem("studentId");
                      if (studentSelect instanceof HTMLSelectElement && event.currentTarget.value) {
                        studentSelect.value = "";
                      }
                    }}
                  >
                    <option value="">{t("none")}</option>
                    {data.groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </Select>
                </label>
                <Field label={t("monthlyAmount")} name="amount" inputMode="decimal" required />
                <Field label={t("effectiveFrom")} name="effectiveFrom" type="month" defaultValue={today.slice(0, 7)} required />
                <Field label={t("purpose")} name="purpose" required />
                <Button type="submit" disabled={busy}>
                  {busy ? t("saving") : t("saveFeeRule")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("feeRuleNote")}</p>
              </form>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryCard title={t("historyTitle")} empty={t("emptyHistory")}>
          {data.payments.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-3 py-2">
              <span>
                {displayStudent(payment.studentId)}
                {" · "}{payment.period ?? payment.purpose ?? t("unspecified")}
                {" · "}{payment.paidOn}
              </span>
              <strong>{minorUnitsToEgp(payment.amountMinor)} EGP</strong>
            </li>
          ))}
        </HistoryCard>
        <HistoryCard title={t("adjustmentsHistory")} empty={t("emptyAdjustments")}>
          {data.adjustments.map((adjustment) => (
            <li key={adjustment.id} className="flex justify-between gap-3 py-2">
              <span>
                {displayStudent(adjustment.studentId)}
                {" · "}{adjustment.kind === "discount"
                  ? t("discount")
                  : adjustment.kind === "refund"
                    ? t("refund")
                    : t("correction")}
                {" · "}{adjustment.reason}
              </span>
              <strong>{minorUnitsToEgp(adjustment.amountMinor)} EGP</strong>
            </li>
          ))}
        </HistoryCard>
      </div>

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between" aria-label={t("historyPagination")}>
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || busy}
            onClick={() => void reload(page - 1).catch(() => setError(true))}
          >
            {t("previous")}
          </Button>
          <span className="text-sm">{t("pageOf", { page, pageCount })}</span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= pageCount || busy}
            onClick={() => void reload(page + 1).catch(() => setError(true))}
          >
            {t("next")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-xl font-semibold">{minorUnitsToEgp(value)} EGP</p>
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  name,
  type = "text",
  inputMode,
  required = false,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  inputMode?: "decimal";
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <Input
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={type === "month" ? "2000-01" : undefined}
      />
    </label>
  );
}

function HistoryCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <CardBody>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hasRows ? <ul className="mt-2 divide-y divide-border">{children}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}
      </CardBody>
    </Card>
  );
}
