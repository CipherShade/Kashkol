"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { studentPortalSignInAction } from "@/app/actions/portal-auth";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { initialFormState } from "@/lib/forms/action-state";

export function PortalSignInForm({ locale }: { locale: string }) {
  const t = useTranslations("Portal.signIn");
  const [state, action] = useActionState(studentPortalSignInAction, initialFormState);

  return (
    <form action={action} className="form-stack" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Field
        label={t("phoneLabel")}
        name="phone"
        type="tel"
        autoComplete="username"
        inputMode="tel"
        dir="ltr"
        hint={t("phoneHint")}
        required
      />
      <Field
        label={t("passwordLabel")}
        name="password"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        hint={t("passwordHint")}
        required
      />
      <FormMessage state={state} />
      <SubmitButton idleKey="Portal.signIn.signInAction" />
    </form>
  );
}
