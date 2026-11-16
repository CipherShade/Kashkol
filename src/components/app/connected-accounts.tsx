"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { linkSocialAction, unlinkSocialAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { initialFormState } from "@/lib/forms/action-state";

/**
 * Starts linking one configured social provider to the signed-in account.
 * Success always leaves this page by redirecting to the provider; a failure is
 * shown in place by the shared FormMessage.
 */
export function ConnectProviderButton({
  locale,
  provider,
}: {
  locale: string;
  provider: "google" | "facebook";
}) {
  const [state, action] = useActionState(linkSocialAction, initialFormState);
  const labelKey = provider === "google" ? "Account.connectGoogleAction" : "Account.connectFacebookAction";

  return (
    <form action={action} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="provider" value={provider} />
      <SubmitButton
        idleKey={labelKey}
        pendingKey="Common.saving"
        variant="secondary"
        icon="globe"
      />
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Unlinks one social account. The action refuses the credential account and
 * the last remaining account, so the button can never lock the user out; the
 * confirmation dialog makes the destructive gesture explicit.
 */
export function UnlinkAccountButton({
  locale,
  accountId,
  providerLabel,
}: {
  locale: string;
  accountId: string;
  providerLabel: string;
}) {
  const t = useTranslations("Account");
  const common = useTranslations("Common");

  return (
    <ConfirmDialog
      title={t("disconnectConfirmTitle")}
      description={t("disconnectConfirmDescription", { provider: providerLabel })}
      confirmLabel={t("disconnectConfirm")}
      cancelLabel={common("cancel")}
      closeLabel={common("close")}
      action={unlinkSocialAction}
      fields={{ locale, accountId }}
      trigger={
        <Button variant="danger-ghost" size="sm">
          <Icon name="x" size={14} />
          <span>{t("disconnect")}</span>
        </Button>
      }
    />
  );
}
