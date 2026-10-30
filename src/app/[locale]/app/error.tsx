"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");

  useEffect(() => {
    // Only the server-provided digest is recorded; never the error message,
    // which could contain a raw database or request detail.
    console.error(`[app] request failed (${error.digest ?? "no-digest"})`);
  }, [error.digest]);

  return (
    <div className="app-page">
      <ErrorState
        title={t("title")}
        description={t("body")}
        action={
          <Button variant="primary" onClick={reset}>
            <Icon name="refresh" size={16} />
            <span>{t("retry")}</span>
          </Button>
        }
      />
    </div>
  );
}
