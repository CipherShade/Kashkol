"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations("Team");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/team/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const key =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "object" &&
          result.error !== null &&
          "messageKey" in result.error &&
          typeof result.error.messageKey === "string"
            ? result.error.messageKey
            : "team.errors.invitationInvalid";
        setError(key.startsWith("team.errors.") ? `errors.${key.slice("team.errors.".length)}` : "errors.invitationInvalid");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("errors.requestFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-form-stack">
      {error ? <Alert tone="danger" live="alert">{t(error)}</Alert> : null}
      <Button variant="primary" disabled={busy} onClick={accept}>
        {t(busy ? "working" : "accept")}
      </Button>
    </div>
  );
}
