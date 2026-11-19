/**
 * Pure term resolution for F-P3-07 AC-1 and AC-2.
 *
 * A term with `grade === null` is workspace-wide. If a grade has at least one
 * term of its own, those terms govern that grade completely; there is no
 * silent fallback to workspace-wide dates. "Previous" means the term in the
 * same scope with the latest end date strictly before the current term starts.
 */

export type TermView = {
  id: string;
  name: string;
  grade: string | null;
  startDate: string;
  endDate: string;
};

export function termsForGrade<T extends { grade: string | null }>(
  terms: T[],
  grade?: string | null,
): T[] {
  if (!grade) return terms.filter((term) => term.grade === null);
  const specific = terms.filter((term) => term.grade === grade);
  return specific.length > 0 ? specific : terms.filter((term) => term.grade === null);
}

export function currentTerm<T extends TermView>(
  terms: T[],
  today: string,
  grade?: string | null,
): T | null {
  const active = termsForGrade(terms, grade).filter(
    (term) => term.startDate <= today && term.endDate >= today,
  );
  return active.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

export function previousTerm<T extends TermView>(
  terms: T[],
  current: TermView | null,
  grade?: string | null,
): T | null {
  if (!current) return null;
  const prior = termsForGrade(terms, grade).filter((term) => term.endDate < current.startDate);
  return prior.sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

/** True when two terms in the same scope cover any common day. */
export function hasOverlap<T extends TermView>(
  terms: T[],
  candidate: TermView,
  excludeId?: string,
): boolean {
  return terms.some(
    (term) =>
      term.id !== excludeId &&
      term.grade === candidate.grade &&
      term.startDate <= candidate.endDate &&
      term.endDate >= candidate.startDate,
  );
}
