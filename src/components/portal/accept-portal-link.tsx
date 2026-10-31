"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type InvitationPreview = {
  id: string;
  kind: "parent" | "student";
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  studentFirstName: string;
  grade: string | null;
  teachingName: string;
  primarySubject: string | null;
};

export function AcceptPortalLink({
  token,
  userEmail,
}: {
  token: string;
  userEmail: string;
}) {
  const t = useTranslations("Portal.link");
  const locale = useLocale();
  const router = useRouter();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/portal/invitations/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setErrorKey("invalidOrExpired");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { invitation: InvitationPreview };
        setPreview(data.invitation);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setErrorKey("invalidOrExpired");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleAccept = async () => {
    setSubmitting(true);
    setErrorKey(null);
    try {
      const res = await fetch("/api/portal/invitations/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-locale": locale,
        },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: { messageKey?: string };
        } | null;
        const msgKey = payload?.error?.messageKey;
        if (msgKey === "errors.invitationEmailMismatch") {
          setErrorKey("emailMismatch");
        } else if (msgKey === "errors.invitationUsed") {
          setErrorKey("alreadyUsed");
        } else if (msgKey === "errors.invitationRevoked") {
          setErrorKey("revoked");
        } else if (msgKey === "errors.invitationExpired") {
          setErrorKey("invalidOrExpired");
        } else {
          setErrorKey("acceptFailed");
        }
        return;
      }

      const data = (await res.json()) as {
        kind: "parent" | "student";
        studentId: string;
      };

      if (data.kind === "parent") {
        router.push(
          `/portal/parent?studentId=${encodeURIComponent(data.studentId)}`,
        );
      } else {
        router.push("/portal/student");
      }
    } catch {
      setErrorKey("acceptFailed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-6 text-sm text-[var(--text-secondary)]">
        {t("verifyingLink")}
      </div>
    );
  }

  if (errorKey || !preview) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-subtle)] p-4 text-sm text-[var(--danger-fg)]">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
        <span>{t(errorKey ?? "invalidOrExpired")}</span>
      </div>
    );
  }

  const emailMatches =
    userEmail.trim().toLowerCase() === preview.email.trim().toLowerCase();

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-fg)]">
          <Icon name="shield" size={16} />
          <span>
            {preview.kind === "parent"
              ? t("parentInviteBadge")
              : t("studentInviteBadge")}
          </span>
        </div>

        <h2 className="mt-2 text-base font-bold text-[var(--text-primary)]">
          {t("inviteForStudent", {
            studentName: preview.studentFirstName,
            teachingName: preview.teachingName,
          })}
        </h2>

        <dl className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
          <div className="flex justify-between gap-2">
            <dt>{t("invitedEmailLabel")}</dt>
            <dd className="font-mono font-semibold text-[var(--text-primary)]">
              <bdi>{preview.email}</bdi>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("signedInEmailLabel")}</dt>
            <dd className="font-mono font-semibold text-[var(--text-primary)]">
              <bdi>{userEmail}</bdi>
            </dd>
          </div>
        </dl>
      </div>

      {preview.status !== "pending" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-subtle)] p-3.5 text-xs text-[var(--warning-fg)]">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>
            {preview.status === "accepted"
              ? t("alreadyUsed")
              : preview.status === "revoked"
                ? t("revoked")
                : t("invalidOrExpired")}
          </span>
        </div>
      ) : !emailMatches ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-subtle)] p-3.5 text-xs text-[var(--danger-fg)]">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>{t("emailMismatch")}</span>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => void handleAccept()}
          disabled={submitting}
          className="w-full justify-center gap-2"
        >
          <Icon name="checkCircle" size={16} />
          <span>
            {submitting ? t("linkingAccount") : t("confirmLinkAction")}
          </span>
          <Icon name="arrowRight" size={16} directional />
        </Button>
      )}
    </div>
  );
}
