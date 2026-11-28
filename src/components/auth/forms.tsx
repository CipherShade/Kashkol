"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  completePhoneAction,
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signInSocialAction,
  signUpAction,
} from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { initialFormState } from "@/lib/forms/action-state";

export type EnabledSocialProviders = {
  google: boolean;
  facebook: boolean;
};

/**
 * Social sign-in buttons for the sign-in and sign-up screens. The server
 * decides which providers are enabled (both credentials present) and passes
 * only booleans; a disabled provider is never offered, so the button cannot
 * start an OAuth flow this environment cannot complete.
 */
export function SocialSignInButtons({
  locale,
  providers,
}: {
  locale: string;
  providers: EnabledSocialProviders;
}) {
  const t = useTranslations();
  const [googleState, googleAction] = useActionState(signInSocialAction, initialFormState);
  const [facebookState, facebookAction] = useActionState(signInSocialAction, initialFormState);

  if (!providers.google && !providers.facebook) return null;

  return (
    <div className="auth-social-block">
      <div className="auth-divider" role="separator">
        <span>{t("Auth.socialDivider")}</span>
      </div>
      <div className="auth-social">
        {providers.google ? (
          <form action={googleAction} noValidate>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="provider" value="google" />
            <SubmitButton
              idleKey="Auth.continueWithGoogle"
              variant="secondary"
              icon="globe"
              className="auth-social-button"
            />
            <FormMessage state={googleState} />
          </form>
        ) : null}
        {providers.facebook ? (
          <form action={facebookAction} noValidate>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="provider" value="facebook" />
            <SubmitButton
              idleKey="Auth.continueWithFacebook"
              variant="secondary"
              icon="globe"
              className="auth-social-button"
            />
            <FormMessage state={facebookState} />
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function SignInForm({
  locale,
  providers,
}: {
  locale: string;
  providers: EnabledSocialProviders;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(signInAction, initialFormState);

  // The social block is a sibling of the credential form, never a child: a
  // `<form>` inside a `<form>` is invalid HTML, and the browser parser discards
  // the inner form, so its hidden `provider` input and its submit button would
  // be absorbed by the credential form and submit the wrong action.
  return (
    <>
      <form action={action} className="form-stack" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <Field
          label={t("Auth.email")}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          errors={state.fieldErrors?.email}
        />
        <Field
          label={t("Auth.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <FormMessage state={state} />
        <SubmitButton idleKey="Auth.signInAction" />
      </form>
      <div className="auth-tail">
        <SocialSignInButtons locale={locale} providers={providers} />
        <div className="auth-links">
          <Link href="/forgot-password" locale={locale}>
            {t("Auth.forgotPassword")}
          </Link>
          <span>
            {t("Auth.noAccount")}{" "}
            <Link href="/sign-up" locale={locale}>
              {t("Auth.createAccount")}
            </Link>
          </span>
        </div>
      </div>
    </>
  );
}

export function SignUpForm({
  locale,
  providers,
}: {
  locale: string;
  providers: EnabledSocialProviders;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(signUpAction, initialFormState);

  return (
    <>
      <form action={action} className="form-stack" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <Field
          label={t("Auth.name")}
          name="name"
          autoComplete="name"
          required
          errors={state.fieldErrors?.name}
        />
        <Field
          label={t("Auth.email")}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          errors={state.fieldErrors?.email}
        />
        <Field
          label={t("Auth.phone")}
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          dir="ltr"
          hint={t("Auth.phoneHint")}
          required
          errors={state.fieldErrors?.phone}
        />
        <Field
          label={t("Auth.password")}
          name="password"
          type="password"
          autoComplete="new-password"
          hint={t("Auth.passwordHint")}
          required
          errors={state.fieldErrors?.password}
        />
        <Field
          label={t("Auth.confirmPassword")}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          errors={state.fieldErrors?.confirmPassword}
        />
        <FormMessage state={state} />
        <SubmitButton idleKey="Auth.signUpAction" />
      </form>
      <div className="auth-tail">
        <SocialSignInButtons locale={locale} providers={providers} />
        <div className="auth-links">
          <span>
            {t("Auth.haveAccount")}{" "}
            <Link href="/sign-in" locale={locale}>
              {t("Auth.signInAction")}
            </Link>
          </span>
        </div>
      </div>
    </>
  );
}

/** Required phone collection for first-time social accounts (ADR-0052). */
export function CompletePhoneForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(completePhoneAction, initialFormState);

  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Field
        label={t("Auth.phone")}
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        dir="ltr"
        hint={t("Auth.phoneHint")}
        required
        errors={state.fieldErrors?.phone}
      />
      <FormMessage state={state} />
      <SubmitButton idleKey="Auth.completePhoneAction" />
    </form>
  );
}

export function ForgotPasswordForm({
  locale,
  emailDisabled,
}: {
  locale: string;
  emailDisabled: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState);

  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {emailDisabled ? <Alert tone="warning" live="status">{t("Auth.emailDisabledNotice")}</Alert> : null}
      <Field
        label={t("Auth.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        dir="ltr"
        required
        errors={state.fieldErrors?.email}
      />
      <FormMessage state={state} />
      <SubmitButton idleKey="Auth.requestResetAction" />
      <div className="auth-links">
        <Link href="/sign-in" locale={locale}>
          {t("Common.backToSignIn")}
        </Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({
  locale,
  token,
  emailDisabled,
}: {
  locale: string;
  token: string;
  emailDisabled: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(resetPasswordAction, initialFormState);

  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      {emailDisabled ? <Alert tone="warning" live="status">{t("Auth.emailDisabledNotice")}</Alert> : null}
      <Field
        label={t("Auth.newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t("Auth.passwordHint")}
        required
        errors={state.fieldErrors?.password}
      />
      <Field
        label={t("Auth.confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <FormMessage state={state} />
      <SubmitButton idleKey="Auth.resetAction" />
      <div className="auth-links">
        <Link href="/sign-in" locale={locale}>
          {t("Common.backToSignIn")}
        </Link>
      </div>
    </form>
  );
}

export function ResendVerificationForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(resendVerificationAction, initialFormState);

  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Field
        label={t("Auth.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        dir="ltr"
        required
        errors={state.fieldErrors?.email}
      />
      <FormMessage state={state} />
      <SubmitButton idleKey="Auth.resendAction" />
      <div className="auth-links">
        <Link href="/sign-in" locale={locale}>
          {t("Common.backToSignIn")}
        </Link>
      </div>
    </form>
  );
}
