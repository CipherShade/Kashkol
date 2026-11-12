"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export type OneTimeCredential = { username: string; password: string };

/**
 * One-time display of a teacher-generated portal password.
 *
 * The plaintext exists in this component's props only because the server put
 * it in the action response / API response. Nothing persists it here: closing
 * the dialog drops the value. It is never re-served after dismissal.
 */
export function PortalCredentialReveal({
  credential,
  onClose,
}: {
  credential: OneTimeCredential | null;
  onClose: () => void;
}) {
  const t = useTranslations("Portal.staff");
  const tCommon = useTranslations("Common");
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  async function copy(value: string, field: "username" | "password") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable: the value is on screen for manual copy.
    }
  }

  return (
    <Dialog
      open={credential !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("credentialReadyTitle")}
      description={t("credentialReadyWarning")}
      closeLabel={tCommon("close")}
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {tCommon("done")}
          </Button>
        </div>
      }
    >
      {credential ? (
        <div className="space-y-3">
          <div>
            <span className="ui-label">{t("usernameLabel")}</span>
            <div className="mt-1 flex items-center gap-2">
              <code dir="ltr" className="flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--surface-elevated)] px-3 py-2 font-mono text-sm text-foreground">
                {credential.username}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void copy(credential.username, "username")}
                aria-label={t("credentialCopyUsername")}
              >
                <Icon name={copied === "username" ? "check" : "clipboard"} size={14} />
              </Button>
            </div>
          </div>
          <div>
            <span className="ui-label">{t("passwordLabel")}</span>
            <div className="mt-1 flex items-center gap-2">
              <code dir="ltr" className="flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--surface-elevated)] px-3 py-2 font-mono text-sm font-semibold text-foreground">
                {credential.password}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void copy(credential.password, "password")}
                aria-label={t("credentialCopyPassword")}
              >
                <Icon name={copied === "password" ? "check" : "clipboard"} size={14} />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
