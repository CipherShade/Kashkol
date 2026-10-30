"use client";

import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth";
import { signOutEverywhereAction } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

export function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations("Shell");
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="secondary">
        <Icon name="logout" size={16} />
        <span>{t("signOut")}</span>
      </Button>
    </form>
  );
}

/**
 * "Sign out everywhere" is destructive for every other device, so it goes
 * through a Radix AlertDialog and submits the real server action on confirm.
 */
export function SignOutEverywhereDialog({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const shell = useTranslations("Shell");
  const common = useTranslations("Common");

  return (
    <ConfirmDialog
      title={t("signOutEverywhereTitle")}
      description={t("signOutEverywhereDescription")}
      confirmLabel={t("signOutEverywhereConfirm")}
      cancelLabel={common("cancel")}
      closeLabel={common("close")}
      action={signOutEverywhereAction}
      fields={{ locale }}
      trigger={
        <Button variant="danger-ghost">
          <Icon name="logout" size={16} />
          <span>{t("signOutEverywhereAction")}</span>
        </Button>
      }
    >
      <p className="app-note">{shell("signOutEverywhereHint")}</p>
    </ConfirmDialog>
  );
}
