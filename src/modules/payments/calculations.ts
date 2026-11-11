export type FeeRuleRow = {
  studentId: string | null;
  groupId: string | null;
  amountMinor: number;
  effectiveFrom: Date;
};

export type EnrollmentRow = {
  studentId: string;
  groupId: string;
  enrolledAt: Date;
  leftAt: Date | null;
};

export type PaymentBalanceRow = {
  studentId: string;
  amountMinor: number;
  voidedAt: Date | null;
};

export type AdjustmentBalanceRow = {
  studentId: string;
  amountMinor: number;
  balanceImpact: number;
};

/**
 * One attended-session charge. It is created only from a real present/late
 * attendance mark on a non-cancelled session that has a per-student price.
 */
export type SessionChargeRow = {
  studentId: string;
  amountMinor: number;
};

export type StudentBalanceInput = {
  students: Array<{ id: string }>;
  feeRules: FeeRuleRow[];
  enrollments: EnrollmentRow[];
  payments: PaymentBalanceRow[];
  adjustments: AdjustmentBalanceRow[];
  /**
   * Session-priced charges (price × attended students). A student enrolled in a
   * session-priced group is billed from these charges instead of monthly rules;
   * only groups that are not session-priced keep their monthly fee.
   */
  sessionCharges?: SessionChargeRow[];
  /** Groups whose sessions are billed per attended student, not per month. */
  sessionPricedGroupIds?: string[];
  asOfMonth: string;
  timezone: string;
};

export type StudentBalance = {
  studentId: string;
  expectedMinor: number;
  receivedMinor: number;
  adjustmentsMinor: number;
  balanceMinor: number;
};

function addMinorUnits(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Payment balance exceeds the supported integer range");
  }
  return total;
}

function localMidnightUtc(year: number, month: number, day: number, timezone: string): Date {
  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetLocalAsUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]),
    );
    const observedLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += targetLocalAsUtc - observedLocalAsUtc;
  }
  return new Date(guess);
}

function monthSequence(startMonth: string, endMonth: string): string[] {
  const [startYear, startNumber] = startMonth.split("-").map(Number);
  const [endYear, endNumber] = endMonth.split("-").map(Number);
  const current = startYear * 12 + startNumber - 1;
  const end = endYear * 12 + endNumber - 1;
  if (end - current > 1_200) {
    throw new RangeError("Monthly fee history exceeds the supported period limit");
  }
  const result: string[] = [];
  for (let index = current; index <= end; index++) {
    result.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return result;
}

function monthDate(month: string, timezone: string, day: number): Date {
  const [year, value] = month.split("-").map(Number);
  return localMidnightUtc(year, value, day, timezone);
}

function activeForMonth(enrollment: EnrollmentRow, month: string, timezone: string): boolean {
  const start = monthDate(month, timezone, 1);
  const [year, monthNumber] = month.split("-").map(Number);
  const end = monthDate(
    monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`,
    timezone,
    1,
  );
  return enrollment.enrolledAt < end && (enrollment.leftAt === null || enrollment.leftAt > start);
}

function ruleForMonth(rules: FeeRuleRow[], month: string): FeeRuleRow | undefined {
  return rules
    .filter((rule) => rule.effectiveFrom.toISOString().slice(0, 7) <= month)
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0];
}

export function calculateStudentBalances(input: StudentBalanceInput): StudentBalance[] {
  const balances = new Map(
    input.students.map((student) => [
      student.id,
      { studentId: student.id, expectedMinor: 0, receivedMinor: 0, adjustmentsMinor: 0 },
    ]),
  );

  const sessionChargesByStudent = new Map<string, number>();
  for (const charge of input.sessionCharges ?? []) {
    sessionChargesByStudent.set(
      charge.studentId,
      addMinorUnits(sessionChargesByStudent.get(charge.studentId) ?? 0, charge.amountMinor),
    );
  }
  const sessionPricedGroupIds = new Set(input.sessionPricedGroupIds ?? []);

  for (const payment of input.payments) {
    if (!payment.voidedAt) {
      const balance = balances.get(payment.studentId);
      if (balance) balance.receivedMinor = addMinorUnits(balance.receivedMinor, payment.amountMinor);
    }
  }
  for (const adjustment of input.adjustments) {
    const balance = balances.get(adjustment.studentId);
    if (balance) {
      balance.adjustmentsMinor = addMinorUnits(
        balance.adjustmentsMinor,
        adjustment.amountMinor * adjustment.balanceImpact,
      );
    }
  }

  for (const student of input.students) {
    const balance = balances.get(student.id);
    if (!balance) continue;
    const groupEnrollments = input.enrollments.filter(
      (enrollment) => enrollment.studentId === student.id,
    );
    const groupIds = [...new Set(groupEnrollments.map((entry) => entry.groupId))];

    // Direct student fee rules always apply regardless of session-priced enrollment.
    const directRules = input.feeRules.filter((rule) => rule.studentId === student.id);
    const monthlyGroupIds = groupIds.filter((groupId) => !sessionPricedGroupIds.has(groupId));
    const groupRules = input.feeRules.filter(
      (rule) => rule.groupId !== null && monthlyGroupIds.includes(rule.groupId),
    );
    const earliestRule = [...directRules, ...groupRules]
      .sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime())[0];

    if (earliestRule) {
      for (const month of monthSequence(
        earliestRule.effectiveFrom.toISOString().slice(0, 7),
        input.asOfMonth,
      )) {
        const directRule = ruleForMonth(directRules, month);
        if (directRule) {
          balance.expectedMinor = addMinorUnits(balance.expectedMinor, directRule.amountMinor);
          continue;
        }

        for (const groupId of monthlyGroupIds) {
          const enrolledThisMonth = groupEnrollments.some(
            (entry) => entry.groupId === groupId && activeForMonth(entry, month, input.timezone),
          );
          if (!enrolledThisMonth) continue;
          const groupRule = ruleForMonth(
            groupRules.filter((rule) => rule.groupId === groupId),
            month,
          );
          if (groupRule) {
            balance.expectedMinor = addMinorUnits(balance.expectedMinor, groupRule.amountMinor);
          }
        }
      }
    }

    const sessionCharge = sessionChargesByStudent.get(student.id) ?? 0;
    if (sessionCharge !== 0) {
      balance.expectedMinor = addMinorUnits(balance.expectedMinor, sessionCharge);
    }
  }

  return [...balances.values()].map((balance) => ({
    ...balance,
    balanceMinor: addMinorUnits(
      addMinorUnits(balance.expectedMinor, balance.adjustmentsMinor),
      -balance.receivedMinor,
    ),
  }));
}

export function currentMonthInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new RangeError("Unable to resolve the current month in the workspace timezone");
  return `${year}-${month}`;
}

export function currentDateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new RangeError("Unable to resolve the current date in the workspace timezone");
  }
  return `${year}-${month}-${day}`;
}
