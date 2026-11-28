export type LedgerEntryType =
  | "usage_charge"
  | "adjustment"
  | "invoice_allocation"
  | "payment_credit"
  | "exemption_reversal"
  | "invoice_credit"
  | "payment_reversal";

export type LedgerEntryLike = {
  id?: string;
  entryType: LedgerEntryType;
  direction: "debit" | "credit";
  amountMinor: number;
  sourceType: string;
  sourceId: string;
};

export type InvoiceLike = {
  id: string;
  number: string;
  totalMinor: number;
};

export type SubmissionLike = {
  id: string;
  invoiceId: string;
  status: "submitted" | "under_review" | "approved" | "rejected" | "flagged";
};

export type InvoiceCreditLike = {
  invoiceId: string;
  ledgerEntryId: string;
  amountMinor: number;
};

export type InvoiceState = "paid" | "credited" | "awaiting_verification" | "unpaid";

export type BillingSummary = {
  /** Accumulated charges not yet allocated to an invoice. Never negative. */
  unbilledMinor: number;
  /** Credit that exceeds every current obligation. */
  availableCreditMinor: number;
  invoicedMinor: number;
  /** Verified manual payments only. Credits are reported separately. */
  paidMinor: number;
  creditedMinor: number;
  outstandingMinor: number;
  invoices: Array<{
    id: string;
    number: string;
    totalMinor: number;
    paidMinor: number;
    creditedMinor: number;
    outstandingMinor: number;
    state: InvoiceState;
  }>;
};

function signed(entry: Pick<LedgerEntryLike, "direction" | "amountMinor">): number {
  return entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Money is computed from append-only ledger rows, immutable invoices, and
 * immutable invoice-credit applications. No cached balance column exists, so a
 * stale number cannot be displayed and a truncated page cannot change a total.
 */
export function computeBillingSummary(
  entries: readonly LedgerEntryLike[],
  invoices: readonly InvoiceLike[],
  submissions: readonly SubmissionLike[],
  invoiceCredits: readonly InvoiceCreditLike[] = [],
): BillingSummary {
  // A ledger credit that has been applied to an invoice must not also reduce
  // the carried balance. Each application names its ledger entry explicitly.
  const appliedByLedgerEntry = new Map<string, number>();
  const creditByInvoice = new Map<string, number>();
  for (const credit of invoiceCredits) {
    creditByInvoice.set(
      credit.invoiceId,
      (creditByInvoice.get(credit.invoiceId) ?? 0) + credit.amountMinor,
    );
    appliedByLedgerEntry.set(
      credit.ledgerEntryId,
      (appliedByLedgerEntry.get(credit.ledgerEntryId) ?? 0) + credit.amountMinor,
    );
  }

  const unbilledMinor = sum(
    entries
      .filter((entry) => {
        if (["usage_charge", "exemption_reversal", "invoice_allocation"].includes(entry.entryType))
          return true;
        return (
          entry.entryType === "adjustment" &&
          !(entry.id && appliedByLedgerEntry.has(entry.id))
        );
      })
      .map(signed),
  );

  const paymentCreditBySubmission = new Map<string, number>();
  const paymentReversalBySubmission = new Map<string, number>();
  for (const entry of entries) {
    if (entry.entryType === "payment_credit") {
      paymentCreditBySubmission.set(
        entry.sourceId,
        (paymentCreditBySubmission.get(entry.sourceId) ?? 0) + entry.amountMinor,
      );
    } else if (entry.entryType === "payment_reversal") {
      paymentReversalBySubmission.set(
        entry.sourceId,
        (paymentReversalBySubmission.get(entry.sourceId) ?? 0) + entry.amountMinor,
      );
    }
  }

  let availableCreditMinor = Math.max(0, -unbilledMinor);
  // Credits that never found an outstanding invoice remain as account credit.
  for (const entry of entries) {
    if (entry.entryType !== "invoice_credit") continue;
    const applied = entry.id ? appliedByLedgerEntry.get(entry.id) ?? 0 : 0;
    availableCreditMinor += Math.max(0, entry.amountMinor - applied);
  }

  const invoiceViews = invoices.map((invoice) => {
    const related = submissions.filter((submission) => submission.invoiceId === invoice.id);
    const verifiedRaw = sum(
      related
        .filter((submission) => submission.status === "approved")
        .map((submission) =>
          Math.max(
            0,
            (paymentCreditBySubmission.get(submission.id) ?? 0) -
              (paymentReversalBySubmission.get(submission.id) ?? 0),
          ),
        ),
    );
    // An overpayment is real money, but it cannot make an invoice negative.
    availableCreditMinor += Math.max(0, verifiedRaw - invoice.totalMinor);
    const paidMinor = Math.min(verifiedRaw, invoice.totalMinor);

    const creditRaw = Math.max(0, creditByInvoice.get(invoice.id) ?? 0);
    const remainingAfterPayment = Math.max(0, invoice.totalMinor - paidMinor);
    const creditedMinor = Math.min(creditRaw, remainingAfterPayment);
    availableCreditMinor += Math.max(0, creditRaw - remainingAfterPayment);

    const outstandingMinor = invoice.totalMinor - paidMinor - creditedMinor;
    let state: InvoiceState = "unpaid";
    if (outstandingMinor === 0) state = paidMinor > 0 ? "paid" : "credited";
    else if (
      related.some(
        (submission) =>
          submission.status === "submitted" ||
          submission.status === "under_review" ||
          submission.status === "flagged",
      )
    )
      state = "awaiting_verification";
    return {
      id: invoice.id,
      number: invoice.number,
      totalMinor: invoice.totalMinor,
      paidMinor,
      creditedMinor,
      outstandingMinor,
      state,
    };
  });

  const invoicedMinor = sum(invoices.map((invoice) => invoice.totalMinor));
  const paidMinor = sum(invoiceViews.map((invoice) => invoice.paidMinor));
  const creditedMinor = sum(invoiceViews.map((invoice) => invoice.creditedMinor));

  return {
    unbilledMinor: Math.max(0, unbilledMinor),
    availableCreditMinor,
    invoicedMinor,
    paidMinor,
    creditedMinor,
    outstandingMinor: Math.max(0, unbilledMinor) + sum(invoiceViews.map((i) => i.outstandingMinor)),
    invoices: invoiceViews,
  };
}

/** Intl keeps grouping and decimal separators locale-correct; no raw division is displayed. */
export function formatMinorAsEgp(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/**
 * Display labels carry the currency from Intl so no component has to append a
 * physical, untranslated suffix. The minor-unit division stays in this module.
 */
export function formatMinorAsEgpLabel(minor: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
