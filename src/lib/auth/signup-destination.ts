/**
 * Where a teacher lands after account creation (ADR-0046).
 *
 * Accounts are free and active without a payment step. Sign-up never starts a
 * session, so the destination is the existing sign-in surface; when outbound
 * email is configured the verification surface is shown first. The helper is
 * pure so a unit test can lock the sequence without Better Auth or a session.
 */
export function signUpDestination(locale: string, emailConfigured: boolean): string {
  if (emailConfigured) return `/${locale}/verify-email?registered=1`;
  return `/${locale}/sign-in?registered=1`;
}
