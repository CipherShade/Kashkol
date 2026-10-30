"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/form";
import { permissionKey, grantablePermissions, isSensitivePermission } from "@/modules/tenancy/types";
import type { PermissionAction, PermissionResource } from "@/modules/tenancy/types";

type Grant = { resource: PermissionResource; action: PermissionAction };
type Member = {
  id: string;
  role: "owner" | "assistant";
  status: "active" | "suspended" | "invited" | "removed";
  joinedAt: Date;
  user: { id: string; name: string; email: string };
  grants: Grant[];
};
type Invitation = {
  id: string;
  email: string;
  role: "owner" | "assistant";
  grants: Grant[];
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  lastSentAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const PERMISSIONS = grantablePermissions();

async function requestJson(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const messageKey =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "object" &&
      result.error !== null &&
      "messageKey" in result.error &&
      typeof result.error.messageKey === "string"
        ? result.error.messageKey
        : "Team.requestFailed";
    throw new Error(
      messageKey.startsWith("team.errors.")
        ? `Team.errors.${messageKey.slice("team.errors.".length)}`
        : "Team.requestFailed",
    );
  }
  return response.json();
}

export function TeamManagement({
  members,
  invitations,
}: {
  members: Member[];
  invitations: Invitation[];
}) {
  const t = useTranslations("Team");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [invitationGrants, setInvitationGrants] = useState<string[]>([]);
  const [memberGrants, setMemberGrants] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedSensitive = (selected: string[]) =>
    selected.some((key) => {
      const [resource, action] = key.split(":");
      return isSensitivePermission(resource as PermissionResource, action as PermissionAction);
    });

  function setPermission(
    selected: string[],
    value: string,
    checked: boolean,
    setSelected: (next: string[]) => void,
  ) {
    setSelected(checked ? [...new Set([...selected, value])] : selected.filter((item) => item !== value));
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const grants = invitationGrants.map((key) => {
        const [resource, action] = key.split(":");
        return { resource, action };
      });
      await requestJson("/api/team", "POST", { email, grants });
      setEmail("");
      setInvitationGrants([]);
      setNotice("Team.invitationSent");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Team.requestFailed");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path: string, method: string, body?: unknown, confirmKey?: string) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson(path, method, body);
      setNotice("Team.changeSaved");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Team.requestFailed");
    } finally {
      setBusy(false);
    }
  }

  const fieldset = (selected: string[], setSelected: (next: string[]) => void) => (
    <fieldset className="ui-form-stack">
      <legend className="ui-label">{t("permissions")}</legend>
      <div className="ui-form-row">
        {PERMISSIONS.map(({ resource, action }) => {
          const value = permissionKey(resource, action);
          return (
            <label className="ui-checkbox-row" key={value}>
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={selected.includes(value)}
                disabled={busy}
                onChange={(event) =>
                  setPermission(selected, value, event.currentTarget.checked, setSelected)
                }
              />
              <span>{t(`resources.${resource}`)} · {t(`actions.${action}`)}</span>
            </label>
          );
        })}
      </div>
      {selectedSensitive(selected) ? (
        <Alert tone="warning" icon="alert">
          {t("sensitiveWarning")}
        </Alert>
      ) : null}
    </fieldset>
  );

  return (
    <div className="app-page-section">
      {error ? <Alert tone="danger" live="alert">{t(error)}</Alert> : null}
      {notice ? <Alert tone="success" live="status">{t(notice)}</Alert> : null}

      <Card labelledBy="invite-assistant-title">
        <CardHeader
          title={t("inviteTitle")}
          titleId="invite-assistant-title"
          description={t("inviteHint")}
        />
        <CardBody>
          <form onSubmit={submitInvitation} className="ui-form-stack">
            <Field
              label={t("email")}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <p className="app-muted">{t("safeDefault")}</p>
            {fieldset(invitationGrants, setInvitationGrants)}
            <div className="ui-form-actions">
              <Button type="submit" variant="primary" disabled={busy}>
                {t(busy ? "working" : "sendInvitation")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card labelledBy="team-members-title">
        <CardHeader title={t("membersTitle")} titleId="team-members-title" />
        <CardBody>
          {members.length === 0 ? (
            <p className="app-muted">{t("noMembers")}</p>
          ) : (
            <div className="app-page-section">
              {members.map((member) => {
                const selected =
                  memberGrants[member.id] ??
                  member.grants.map(({ resource, action }) => permissionKey(resource, action));
                const setSelected = (next: string[]) =>
                  setMemberGrants((current) => ({ ...current, [member.id]: next }));
                return (
                  <section className="ui-card" key={member.id} aria-labelledby={`member-${member.id}`}>
                    <div className="ui-card-header">
                      <div>
                        <h3 className="ui-card-title" id={`member-${member.id}`}>{member.user.name}</h3>
                        <p className="ui-card-description"><bdi>{member.user.email}</bdi></p>
                      </div>
                      <span className="ui-badge" data-tone={member.status === "active" ? "success" : "warning"}>
                        {t(`status.${member.status}`)}
                      </span>
                    </div>
                    <div className="ui-card-body">
                      {member.role === "owner" ? (
                        <p className="app-muted">{t("ownerFullAccess")}</p>
                      ) : (
                        <>
                          <fieldset className="ui-form-stack">
                            <legend className="ui-label">{t("permissions")}</legend>
                            <div className="ui-form-row">
                              {PERMISSIONS.map(({ resource, action }) => {
                                const value = permissionKey(resource, action);
                                return (
                                  <label className="ui-checkbox-row" key={value}>
                                    <input
                                      type="checkbox"
                                      className="ui-checkbox"
                                      checked={selected.includes(value)}
                                      disabled={busy}
                                      onChange={(event) =>
                                        setPermission(
                                          selected,
                                          value,
                                          event.currentTarget.checked,
                                          setSelected,
                                        )
                                      }
                                    />
                                    <span>
                                      {t(`resources.${resource}`)} · {t(`actions.${action}`)}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {selectedSensitive(selected) ? (
                              <Alert tone="warning" icon="alert">
                                {t("sensitiveWarning")}
                              </Alert>
                            ) : null}
                          </fieldset>
                          <div className="ui-form-actions">
                            <Button
                              variant="primary"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  `/api/team/members/${encodeURIComponent(member.id)}/permissions`,
                                  "PATCH",
                                  {
                                    grants: selected.map((key) => {
                                      const [resource, action] = key.split(":");
                                      return { resource, action };
                                    }),
                                  },
                                )
                              }
                            >
                              {t("savePermissions")}
                            </Button>
                            {member.status === "suspended" ? (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    `/api/team/members/${encodeURIComponent(member.id)}/reactivate`,
                                    "POST",
                                  )
                                }
                              >
                                {t("reactivate")}
                              </Button>
                            ) : (
                              <Button
                                disabled={busy || member.status !== "active"}
                                onClick={() =>
                                  runAction(
                                    `/api/team/members/${encodeURIComponent(member.id)}/suspend`,
                                    "POST",
                                    undefined,
                                    "confirmSuspend",
                                  )
                                }
                              >
                                {t("suspend")}
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  `/api/team/members/${encodeURIComponent(member.id)}`,
                                  "DELETE",
                                  undefined,
                                  "confirmRemove",
                                )
                              }
                            >
                              {t("remove")}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card labelledBy="team-invitations-title">
        <CardHeader title={t("invitationsTitle")} titleId="team-invitations-title" />
        <CardBody>
          {invitations.length === 0 ? (
            <p className="app-muted">{t("noInvitations")}</p>
          ) : (
            <div className="app-page-section">
              {invitations.map((invitation) => (
                <div className="ui-card-body" key={invitation.id}>
                  <div className="ui-card-header">
                    <div>
                      <p className="ui-card-title"><bdi>{invitation.email}</bdi></p>
                      <p className="ui-card-description">
                        {t("expires", {
                          date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                            invitation.expiresAt,
                          ),
                        })}
                      </p>
                    </div>
                    <span className="ui-badge" data-tone={invitation.status === "pending" ? "accent" : "outline"}>
                      {t(`status.${invitation.status}`)}
                    </span>
                  </div>
                  {invitation.status === "pending" ? (
                    <div className="ui-form-actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          runAction(
                            `/api/team/invitations/${encodeURIComponent(invitation.id)}/resend`,
                            "POST",
                          )
                        }
                      >
                        {t("resend")}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          runAction(
                            `/api/team/invitations/${encodeURIComponent(invitation.id)}/revoke`,
                            "POST",
                            undefined,
                            "confirmRevoke",
                          )
                        }
                      >
                        {t("revoke")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
