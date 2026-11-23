/**
 * Where a teacher lands after the account part of sign-up (ADR-0036).
 *
 * The destination is kept in a pure helper so a unit test can lock the two-step
 * sequence without constructing Better Auth or a session.
 */
export function signUpDestination(locale: string, emailConfigured: boolean): string {
  const params = new URLSearchParams({ registered: "1" });
  if (emailConfigured) params.set("verify", "1");
  return `/${locale}/subscribe?${params.toString()}`;
}
