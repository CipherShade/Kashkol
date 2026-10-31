"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePWAInstall } from "@/lib/pwa/use-pwa-install";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function PWAInstallBanner() {
  const t = useTranslations("Portal.pwa");
  const {
    isInstallable,
    isIOSInstallable,
    isOffline,
    promptInstall,
    dismissInstall,
  } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  return (
    <>
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-xs font-medium text-[var(--text-secondary)]"
        >
          <Icon name="alert" size={16} className="shrink-0 text-[var(--warning-fg)]" />
          <span>{t("offlineNotice")}</span>
        </div>
      )}

      {(isInstallable || isIOSInstallable) && (
        <div className="mb-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-fg)]">
                <Icon name="phone" size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("installTitle")}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {isIOSInstallable
                    ? t("installIosDescription")
                    : t("installDescription")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isInstallable ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void promptInstall()}
                  className="gap-1.5"
                >
                  <Icon name="download" size={14} />
                  <span>{t("installAction")}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowIOSGuide(true)}
                  className="gap-1.5"
                >
                  <Icon name="externalLink" size={14} />
                  <span>{t("iosGuideAction")}</span>
                </Button>
              )}

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dismissInstall}
                aria-label={t("dismissInstall")}
              >
                <Icon name="x" size={16} />
              </Button>
            </div>
          </div>

          {showIOSGuide && (
            <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3.5 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[var(--text-primary)]">
                  {t("iosStepsTitle")}
                </p>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              <ol className="mt-2 space-y-1.5 ps-4 list-decimal">
                <li className="flex items-center gap-1.5">
                  <span>{t("iosStep1")}</span>
                  <Icon name="externalLink" size={14} className="inline text-[var(--brand-fg)]" />
                </li>
                <li className="flex items-center gap-1.5">
                  <span>{t("iosStep2")}</span>
                  <Icon name="plus" size={14} className="inline text-[var(--brand-fg)]" />
                </li>
                <li>{t("iosStep3")}</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </>
  );
}
