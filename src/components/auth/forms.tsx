"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { initialFormState } from "@/lib/forms/action-state";

export function SignInForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(signInAction, initialFormState);

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
    </form>
  );
}

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(signUpAction, initialFormState);

  return (
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
      <div className="auth-links">
        <span>
          {t("Auth.haveAccount")}{" "}
          <Link href="/sign-in" locale={locale}>
            {t("Auth.signInAction")}
          </Link>
        </span>
      </div>
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
