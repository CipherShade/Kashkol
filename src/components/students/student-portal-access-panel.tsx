"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { PortalPermissions } from "@/modules/portals/schemas";

type PortalGrantItem = {
  id: string;
  kind: "parent" | "student";
  guardianId: string | null;
  permissions: PortalPermissions;
  status: "active" | "revoked" | "expired";
  issuedAt: string;
  revokedAt: string | null;
  portalUser: {
    id: string;
    name: string;
    email: string;
  };
};

type PortalInvitationItem = {
  id: string;
  kind: "parent" | "student";
  guardianId: string | null;
  email: string;
  permissions: PortalPermissions;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  lastSentAt: string;
};

type GuardianItem = {
  id: string;
  firstName: string;
  lastName: string;
  relation: string;
  phoneE164: string;
  email: string | null;
};

export function StudentPortalAccessPanel({
  studentId,
  locale,
}: {
  studentId: string;
  locale: string;
}) {
  const t = useTranslations("Portal.staff");
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<PortalGrantItem[]>([]);
  const [invitations, setInvitations] = useState<PortalInvitationItem[]>([]);
  const [guardians, setGuardians] = useState<GuardianItem[]>([]);

  const [inviteKind, setInviteKind] = useState<"parent" | "student">("parent");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedGuardianId, setSelectedGuardianId] = useState<string>("");
  const [permissions, setPermissions] = useState<PortalPermissions>({
    showAttendance: true,
    showGrades: true,
    showHomework: true,
    showResources: true,
    showPayments: false,
    showSchedule: true,
    showNotifications: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [issuedVerificationPath, setIssuedVerificationPath] = useState<
    string | null
  >(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/students/${encodeURIComponent(studentId)}/portal-access`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        grants: PortalGrantItem[];
        invitations: PortalInvitationItem[];
        guardians: GuardianItem[];
      };
      setGrants(data.grants ?? []);
      setInvitations(data.invitations ?? []);
      setGuardians(data.guardians ?? []);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/students/${encodeURIComponent(studentId)}/portal-access`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as {
          grants: PortalGrantItem[];
          invitations: PortalInvitationItem[];
          guardians: GuardianItem[];
        };
        if (!active) return;
        setGrants(data.grants ?? []);
        setInvitations(data.invitations ?? []);
        setGuardians(data.guardians ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  const handleIssueInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    setIssuedVerificationPath(null);

    try {
      const res = await fetch(
        `/api/students/${encodeURIComponent(studentId)}/portal-access`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-locale": locale,
          },
          body: JSON.stringify({
            studentId,
            kind: inviteKind,
            email: inviteEmail.trim().toLowerCase(),
            guardianId:
              inviteKind === "parent" && selectedGuardianId
                ? selectedGuardianId
                : null,
            permissions: {
              ...permissions,
              showPayments:
                inviteKind === "parent" ? permissions.showPayments : false,
            },
          }),
        },
      );

      if (!res.ok) {
        setErrorMsg(t("issueError"));
        return;
      }

      const data = (await res.json()) as {
        verificationPath: string;
      };
      setIssuedVerificationPath(data.verificationPath);
      setInviteEmail("");
      await loadAccess();
    } catch {
      setErrorMsg(t("issueError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    await fetch(
      `/api/students/${encodeURIComponent(studentId)}/portal-access/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { method: "POST" },
    );
    await loadAccess();
  };

  const handleRevokeGrant = async (grantId: string) => {
    await fetch(
      `/api/students/${encodeURIComponent(studentId)}/portal-access/grants/${encodeURIComponent(grantId)}`,
      { method: "DELETE" },
    );
    await loadAccess();
  };

  const handleToggleGrantPermission = async (
    grant: PortalGrantItem,
    key: keyof PortalPermissions,
    value: boolean,
  ) => {
    const res = await fetch(
      `/api/students/${encodeURIComponent(studentId)}/portal-access/grants/${encodeURIComponent(grant.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          permissions: { [key]: value },
        }),
      },
    );
    if (res.ok) {
      await loadAccess();
    }
  };

  const fullVerificationUrl =
    issuedVerificationPath && typeof window !== "undefined"
      ? `${window.location.origin}${issuedVerificationPath}`
      : issuedVerificationPath;

  const handleCopyLink = async () => {
    if (!fullVerificationUrl) return;
    try {
      await navigator.clipboard.writeText(fullVerificationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Issue Verified One-Time Portal Invitation */}
      <Card>
        <CardBody className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-fg)]">
              <Icon name="shield" size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {t("issueTitle")}
              </h3>
              <p className="text-xs text-muted mt-0.5">{t("issueSubtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleIssueInvite} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t("portalRoleLabel")}
                </label>
                <select
                  value={inviteKind}
                  onChange={(e) =>
                    setInviteKind(e.target.value as "parent" | "student")
                  }
                  className="ui-input w-full text-sm"
                >
                  <option value="parent">{t("roleParent")}</option>
                  <option value="student">{t("roleStudent")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t("verifiedEmailLabel")}
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="ui-input w-full text-sm"
                  dir="ltr"
                />
              </div>

              {inviteKind === "parent" && guardians.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {t("linkedGuardianLabel")}
                  </label>
                  <select
                    value={selectedGuardianId}
                    onChange={(e) => setSelectedGuardianId(e.target.value)}
                    className="ui-input w-full text-sm"
                  >
                    <option value="">{t("anyAuthorizedGuardian")}</option>
                    {guardians.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.firstName} {g.lastName} ({g.phoneE164})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Granular Portal Visibility Toggles */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3.5">
              <p className="text-xs font-semibold text-foreground mb-2.5">
                {t("permittedSectionsTitle")}
              </p>
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
                {(
                  [
                    "showSchedule",
                    "showAttendance",
                    "showGrades",
                    "showHomework",
                    "showResources",
                    "showNotifications",
                    ...(inviteKind === "parent"
                      ? (["showPayments"] as const)
                      : []),
                  ] as Array<keyof PortalPermissions>
                ).map((permKey) => (
                  <label
                    key={permKey}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={permissions[permKey]}
                      onChange={(e) =>
                        setPermissions((prev) => ({
                          ...prev,
                          [permKey]: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span>{t(`perm.${permKey}`)}</span>
                  </label>
                ))}
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs font-medium text-rose-600">{errorMsg}</p>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting || !inviteEmail.trim()}
                className="gap-1.5"
              >
                <Icon name="externalLink" size={14} />
                <span>
                  {submitting ? t("issuingAction") : t("issueLinkAction")}
                </span>
              </Button>
            </div>
          </form>

          {fullVerificationUrl && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {t("generatedLinkTitle")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  dir="ltr"
                  className="flex-1 truncate rounded bg-[var(--surface-elevated)] px-3 py-1.5 font-mono text-xs text-foreground border border-[var(--color-border)]"
                >
                  {fullVerificationUrl}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCopyLink()}
                  className="gap-1.5"
                >
                  {copiedLink ? (
                    <Icon name="check" size={14} className="text-emerald-600" />
                  ) : (
                    <Icon name="clipboard" size={14} />
                  )}
                  <span>{copiedLink ? t("copied") : t("copyLink")}</span>
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Active & Historical Linked Portal Accounts */}
      <Card>
        <CardBody className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="user" size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-foreground">
              {t("linkedAccountsTitle")}
            </h3>
          </div>

          {loading ? (
            <p className="text-xs text-muted py-3">{t("loading")}</p>
          ) : grants.length === 0 ? (
            <p className="text-xs text-muted py-3">{t("noLinkedAccounts")}</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {grants.map((grant) => (
                <div key={grant.id} className="py-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {grant.portalUser.name}
                        </span>
                        <Badge
                          tone={grant.kind === "parent" ? "neutral" : "outline"}
                        >
                          {grant.kind === "parent"
                            ? t("roleParent")
                            : t("roleStudent")}
                        </Badge>
                        <Badge
                          tone={
                            grant.status === "active" ? "success" : "danger"
                          }
                        >
                          {t(`status.${grant.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted font-mono" dir="ltr">
                        {grant.portalUser.email}
                      </p>
                    </div>

                    {grant.status === "active" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRevokeGrant(grant.id)}
                        className="text-rose-600 gap-1"
                      >
                        <Icon name="trash" size={14} />
                        <span>{t("revokeAccessAction")}</span>
                      </Button>
                    )}
                  </div>

                  {grant.status === "active" && (
                    <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted">
                      {(
                        [
                          "showSchedule",
                          "showAttendance",
                          "showGrades",
                          "showHomework",
                          "showResources",
                          "showNotifications",
                          ...(grant.kind === "parent"
                            ? (["showPayments"] as const)
                            : []),
                        ] as Array<keyof PortalPermissions>
                      ).map((permKey) => (
                        <label
                          key={permKey}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={grant.permissions[permKey]}
                            onChange={(e) =>
                              void handleToggleGrantPermission(
                                grant,
                                permKey,
                                e.target.checked,
                              )
                            }
                            className="h-3.5 w-3.5 rounded"
                          />
                          <span>{t(`perm.${permKey}`)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Pending & Recent Portal Invitations */}
      <Card>
        <CardBody className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="mail" size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-foreground">
              {t("invitationsTitle")}
            </h3>
          </div>

          {invitations.length === 0 ? (
            <p className="text-xs text-muted py-3">{t("noInvitations")}</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs font-semibold text-foreground"
                        dir="ltr"
                      >
                        {inv.email}
                      </span>
                      <Badge tone="outline">
                        {inv.kind === "parent"
                          ? t("roleParent")
                          : t("roleStudent")}
                      </Badge>
                      <Badge
                        tone={
                          inv.status === "accepted"
                            ? "success"
                            : inv.status === "pending"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {t(`inviteStatus.${inv.status}`)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {t("expiresAtLabel")}:{" "}
                      {new Date(inv.expiresAt).toLocaleString(locale)}
                    </p>
                  </div>

                  {inv.status === "pending" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRevokeInvitation(inv.id)}
                      className="text-rose-600 gap-1"
                    >
                      <Icon name="trash" size={14} />
                      <span>{t("revokeInviteAction")}</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
