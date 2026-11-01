"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type IntegrationKey =
  | "email"
  | "fileStorage"
  | "malwareScanner"
  | "videoProvider"
  | "webPush"
  | "whatsappMessaging"
  | "saasBilling";

type IntegrationReadinessItem = {
  key: IntegrationKey;
  driver: string;
  configured: boolean;
  productionReady: boolean;
  measurementNoteKey: string;
};

type PlanTier = "pilot" | "standard" | "expanded";
type PlanStatus = "pilot_active" | "active" | "past_due" | "suspended" | "cancelled";
type AccountStatus = "active" | "suspended" | "deleted";

type LimitUtilization = {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  exceeded: boolean;
  nearLimit: boolean;
};

type WorkspaceProjection = {
  id: string;
  name: string;
  slug: string;
  teachingName: string | null;
  primarySubject: string | null;
  gradesTaught: string[];
  status: AccountStatus;
  statusReason: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  plan: {
    tier: PlanTier;
    status: PlanStatus;
    billingMode: "manual_pilot";
    writesAllowed: boolean;
    writeRestrictionReason: string | null;
    limits: {
      maxActiveStudents: number;
      maxActiveGroups: number;
      maxAssistants: number;
      maxFileStorageBytes: number;
      maxVideoCount: number;
      maxVideoStorageBytes: number;
      maxVideoBandwidthBytesPerMonth: number;
    };
    features: {
      onlineExamsEnabled: boolean;
      recordedVideosEnabled: boolean;
      reportExportsEnabled: boolean;
    };
    overrides: Record<string, unknown>;
    assignedAt: string | null;
    assignedBy: string | null;
    note: string | null;
  };
  usage: {
    students: { activeCount: number; archivedCount: number };
    groups: { activeCount: number; archivedCount: number };
    members: {
      ownerCount: number;
      activeAssistantCount: number;
      suspendedAssistantCount: number;
      pendingInvitationCount: number;
      ownerName: string | null;
      ownerEmail: string | null;
    };
    files: {
      activeCount: number;
      totalCount: number;
      totalSizeBytes: number;
      pendingScanCount: number;
      blockedScanCount: number;
      measurementBasis: "exact_db_records";
    };
    videos: {
      activeCount: number;
      totalSizeBytes: number;
      totalDurationSeconds: number;
      totalPlaybackCount: number;
      estimatedBandwidthBytes: number;
      isEstimate: boolean;
    };
    messages: {
      outboxTotal: number;
      pendingCount: number;
      preparedCount: number;
      sentCount: number;
      deliveredCount: number;
      failedCount: number;
      cancelledCount: number;
      inAppNotificationCount: number;
      isEstimate: boolean;
    };
    onlineExams: {
      totalCount: number;
      publishedCount: number;
    };
  };
  utilization: {
    students: LimitUtilization;
    groups: LimitUtilization;
    assistants: LimitUtilization;
    fileStorageBytes: LimitUtilization;
    videoCount: LimitUtilization;
    videoStorageBytes: LimitUtilization;
    videoBandwidthBytes: LimitUtilization;
  };
  activeBreakGlassGrant: {
    id: string;
    adminUserId: string;
    adminDisplayName: string;
    ticketRef: string;
    reason: string;
    expiresAt: string;
    createdAt: string;
  } | null;
};

type PlatformAuditRow = {
  id: string;
  actorUserId: string;
  actorDisplayName: string;
  targetWorkspaceId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  diff: unknown;
  requestId: string | null;
  createdAt: string;
};

type BreakGlassDiagnostics = {
  grant: {
    id: string;
    ticketRef: string;
    reason: string;
    expiresAt: string;
    createdAt: string;
  };
  recentAuditActions: Array<{
    id: string;
    actorType: string;
    entityType: string;
    action: string;
    requestId: string;
    createdAt: string;
  }>;
  failedExports: Array<{
    id: string;
    type: string;
    failureCode: string | null;
    createdAt: string;
  }>;
  failedOutboxMessages: Array<{
    id: string;
    channel: string;
    type: string;
    provider: string;
    attempts: number;
    lastError: string | null;
    failedAt: string | null;
  }>;
};

type OverviewResponse = {
  admin: {
    userId: string;
    email: string;
    displayName: string;
    grantedAt: string;
  };
  integrations: {
    appEnv: "local" | "staging" | "production";
    items: IntegrationReadinessItem[];
  };
  totals: {
    totalWorkspaces: number;
    activeWorkspaces: number;
    suspendedWorkspaces: number;
    totalActiveStudents: number;
    totalActiveGroups: number;
    totalFileStorageBytes: number;
    totalVideoStorageBytes: number;
    totalEstimatedVideoBandwidthBytes: number;
    totalOutboxMessages: number;
  };
  workspaces: WorkspaceProjection[];
  auditEvents: PlatformAuditRow[];
};

type WorkspaceDetailResponse = {
  workspace: WorkspaceProjection;
  breakGlassDiagnostics: BreakGlassDiagnostics | null;
  auditEvents: PlatformAuditRow[];
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function PlatformAdminConsole() {
  const t = useTranslations("PlatformAdmin");
  const format = useFormatter();

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planTierFilter, setPlanTierFilter] = useState<string>("all");
  const [planStatusFilter, setPlanStatusFilter] = useState<string>("all");

  // Selected workspace inspection state
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceProjection | null>(null);
  const [diagnostics, setDiagnostics] = useState<BreakGlassDiagnostics | null>(null);
  const [workspaceAudits, setWorkspaceAudits] = useState<PlatformAuditRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBanner, setActionBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Plan editor form state
  const [editPlanTier, setEditPlanTier] = useState<PlanTier>("pilot");
  const [editPlanStatus, setEditPlanStatus] = useState<PlanStatus>("pilot_active");
  const [overrideStudents, setOverrideStudents] = useState<string>("");
  const [overrideGroups, setOverrideGroups] = useState<string>("");
  const [overrideAssistants, setOverrideAssistants] = useState<string>("");
  const [overrideFileMb, setOverrideFileMb] = useState<string>("");
  const [overrideVideoCount, setOverrideVideoCount] = useState<string>("");
  const [featureOnlineExams, setFeatureOnlineExams] = useState<boolean>(true);
  const [featureRecordedVideos, setFeatureRecordedVideos] = useState<boolean>(true);
  const [featureReportExports, setFeatureReportExports] = useState<boolean>(true);
  const [planNote, setPlanNote] = useState<string>("");
  const [planReason, setPlanReason] = useState<string>("");
  const [planConfirmSlug, setPlanConfirmSlug] = useState<string>("");
  const [planConfirmChecked, setPlanConfirmChecked] = useState<boolean>(false);

  // Account status form state
  const [statusReason, setStatusReason] = useState<string>("");
  const [statusConfirmSlug, setStatusConfirmSlug] = useState<string>("");
  const [statusConfirmChecked, setStatusConfirmChecked] = useState<boolean>(false);

  // Break-glass form state
  const [bgTicketRef, setBgTicketRef] = useState<string>("");
  const [bgDuration, setBgDuration] = useState<number>(30);
  const [bgReason, setBgReason] = useState<string>("");
  const [bgConfirmSlug, setBgConfirmSlug] = useState<string>("");
  const [bgConfirmChecked, setBgConfirmChecked] = useState<boolean>(false);

  const hydrateDetailForms = useCallback((ws: WorkspaceProjection) => {
    setEditPlanTier(ws.plan.tier);
    setEditPlanStatus(ws.plan.status);
    const ov = ws.plan.overrides ?? {};
    setOverrideStudents(
      typeof ov.maxActiveStudents === "number" ? String(ov.maxActiveStudents) : "",
    );
    setOverrideGroups(typeof ov.maxActiveGroups === "number" ? String(ov.maxActiveGroups) : "");
    setOverrideAssistants(
      typeof ov.maxAssistants === "number" ? String(ov.maxAssistants) : "",
    );
    setOverrideFileMb(
      typeof ov.maxFileStorageBytes === "number"
        ? String(Math.round(ov.maxFileStorageBytes / (1024 * 1024)))
        : "",
    );
    setOverrideVideoCount(
      typeof ov.maxVideoCount === "number" ? String(ov.maxVideoCount) : "",
    );
    setFeatureOnlineExams(ws.plan.features.onlineExamsEnabled);
    setFeatureRecordedVideos(ws.plan.features.recordedVideosEnabled);
    setFeatureReportExports(ws.plan.features.reportExportsEnabled);
    setPlanNote(ws.plan.note ?? "");
    setPlanReason("");
    setPlanConfirmSlug("");
    setPlanConfirmChecked(false);

    setStatusReason("");
    setStatusConfirmSlug("");
    setStatusConfirmChecked(false);

    setBgTicketRef("");
    setBgDuration(30);
    setBgReason("");
    setBgConfirmSlug("");
    setBgConfirmChecked(false);
  }, []);

  const fetchOverviewData = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (planTierFilter !== "all") params.set("planTier", planTierFilter);
    if (planStatusFilter !== "all") params.set("planStatus", planStatusFilter);

    const res = await fetch(`/api/platform-admin/overview?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as OverviewResponse;
  }, [search, statusFilter, planTierFilter, planStatusFilter]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOverviewData();
      setOverview(data);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [fetchOverviewData, t]);

  useEffect(() => {
    let active = true;
    void fetchOverviewData()
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(t("loadError"));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchOverviewData, t]);

  const inspectWorkspace = useCallback(
    async (workspaceId: string) => {
      setSelectedWorkspaceId(workspaceId);
      setDetailLoading(true);
      setActionBanner(null);
      try {
        const res = await fetch(`/api/platform-admin/workspaces/${workspaceId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const detail = (await res.json()) as WorkspaceDetailResponse;
        setSelectedWorkspace(detail.workspace);
        setDiagnostics(detail.breakGlassDiagnostics);
        setWorkspaceAudits(detail.auditEvents);
        hydrateDetailForms(detail.workspace);
      } catch {
        setActionBanner({ kind: "error", text: t("actionError") });
      } finally {
        setDetailLoading(false);
      }
    },
    [hydrateDetailForms, t],
  );

  async function submitWorkspaceMutation(payload: Record<string, unknown>) {
    if (!selectedWorkspaceId) return;
    setSubmitting(true);
    setActionBanner(null);
    try {
      const res = await fetch(`/api/platform-admin/workspaces/${selectedWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const detail = (await res.json()) as WorkspaceDetailResponse;
      setSelectedWorkspace(detail.workspace);
      setDiagnostics(detail.breakGlassDiagnostics);
      setWorkspaceAudits(detail.auditEvents);
      hydrateDetailForms(detail.workspace);
      setActionBanner({ kind: "success", text: t("actionSaved") });
      await loadOverview();
    } catch {
      setActionBanner({ kind: "error", text: t("actionError") });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace || !planConfirmChecked) return;

    const overrides: Record<string, unknown> = {
      onlineExamsEnabled: featureOnlineExams,
      recordedVideosEnabled: featureRecordedVideos,
      reportExportsEnabled: featureReportExports,
    };

    if (overrideStudents.trim() !== "") {
      overrides.maxActiveStudents = Number(overrideStudents);
    }
    if (overrideGroups.trim() !== "") {
      overrides.maxActiveGroups = Number(overrideGroups);
    }
    if (overrideAssistants.trim() !== "") {
      overrides.maxAssistants = Number(overrideAssistants);
    }
    if (overrideFileMb.trim() !== "") {
      overrides.maxFileStorageBytes = Number(overrideFileMb) * 1024 * 1024;
    }
    if (overrideVideoCount.trim() !== "") {
      overrides.maxVideoCount = Number(overrideVideoCount);
    }

    await submitWorkspaceMutation({
      operation: "update_plan",
      planTier: editPlanTier,
      planStatus: editPlanStatus,
      limitOverrides: overrides,
      planNote: planNote.trim() || null,
      reason: planReason.trim(),
      confirmationSlug: planConfirmSlug.trim(),
      confirmAction: true,
    });
  }

  async function handleToggleAccountStatus(targetStatus: "active" | "suspended") {
    if (!selectedWorkspace || !statusConfirmChecked) return;
    await submitWorkspaceMutation({
      operation: "update_status",
      status: targetStatus,
      reason: statusReason.trim(),
      confirmationSlug: statusConfirmSlug.trim(),
      confirmAction: true,
    });
  }

  async function handleGrantBreakGlass(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace || !bgConfirmChecked) return;
    await submitWorkspaceMutation({
      operation: "grant_break_glass",
      ticketRef: bgTicketRef.trim(),
      durationMinutes: Number(bgDuration),
      reason: bgReason.trim(),
      confirmationSlug: bgConfirmSlug.trim(),
      confirmAction: true,
    });
  }

  async function handleRevokeBreakGlass(grantId: string) {
    await submitWorkspaceMutation({
      operation: "revoke_break_glass",
      grantId,
      reason: "Platform operator manually ended break-glass support session",
    });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]">
      {/* Top Bar */}
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-[var(--color-accent-primary)] uppercase">
              {t("eyebrow")}
            </p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">{t("title")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-secondary)]">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overview?.admin && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                {t("operatorBadge", { email: overview.admin.email })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-bg-canvas)]"
            >
              {t("refreshAction")}
            </button>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              {t("backToApp")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Privacy Boundary Banner */}
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 text-sm"
        >
          <p className="text-[var(--color-text-secondary)]">{t("privacyBoundaryBanner")}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-surface)] p-4 text-sm text-[var(--color-danger)]"
          >
            {error}
          </div>
        )}

        {loading && !overview ? (
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
            {t("loading")}
          </div>
        ) : overview ? (
          <>
            {/* Platform Summary Cards (1 col < 480px, 2 cols sm, 4 cols lg) */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t("summary.totalWorkspaces")}
                </span>
                <p className="mt-2 text-2xl font-bold">{overview.totals.totalWorkspaces}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t("summary.activeWorkspaces", {
                    active: overview.totals.activeWorkspaces,
                    suspended: overview.totals.suspendedWorkspaces,
                  })}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t("summary.totalStudents")}
                </span>
                <p className="mt-2 text-2xl font-bold">{overview.totals.totalActiveStudents}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t("summary.totalGroups", { groups: overview.totals.totalActiveGroups })}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t("summary.fileStorage")}
                </span>
                <p className="mt-2 text-2xl font-bold">
                  {formatBytes(overview.totals.totalFileStorageBytes)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t("summary.fileStorageHint")}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t("summary.videoAndMessages")}
                </span>
                <p className="mt-2 text-2xl font-bold">
                  {formatBytes(overview.totals.totalEstimatedVideoBandwidthBytes)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t("summary.videoAndMessagesHint", {
                    videoStorage: formatBytes(overview.totals.totalVideoStorageBytes),
                    messages: overview.totals.totalOutboxMessages,
                  })}
                </p>
              </div>
            </section>

            {/* System Integration Readiness */}
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold">{t("integrations.title")}</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {t("integrations.subtitle", { env: overview.integrations.appEnv })}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {overview.integrations.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">
                          {t(`integrations.items.${item.key}`)}
                        </span>
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            item.configured
                              ? "bg-[var(--color-success)]"
                              : "bg-[var(--color-warning)]"
                          }`}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
                        {t("integrations.driverLabel", { driver: item.driver })}
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                        {t(`integrations.notes.${item.key}`)}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded bg-[var(--color-bg-canvas)] px-2 py-0.5 text-[11px] font-medium">
                        {item.configured
                          ? t("integrations.configured")
                          : t("integrations.notConfigured")}
                      </span>
                      <span className="rounded bg-[var(--color-bg-canvas)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                        {item.productionReady
                          ? t("integrations.prodReady")
                          : t("integrations.localOnly")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Workspaces Directory & Inspection Split */}
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold">{t("workspaces.title")}</h2>
                {/* Filters */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("filters.searchPlaceholder")}
                    className="w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-3 py-1.5 text-xs"
                  />
                  <select
                    aria-label={t("filters.statusLabel")}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 text-xs"
                  >
                    <option value="all">
                      {t("filters.statusLabel")}: {t("filters.all")}
                    </option>
                    <option value="active">{t("accountStatus.active")}</option>
                    <option value="suspended">{t("accountStatus.suspended")}</option>
                  </select>
                  <select
                    aria-label={t("filters.planTierLabel")}
                    value={planTierFilter}
                    onChange={(e) => setPlanTierFilter(e.target.value)}
                    className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 text-xs"
                  >
                    <option value="all">
                      {t("filters.planTierLabel")}: {t("filters.all")}
                    </option>
                    <option value="pilot">{t("planTier.pilot")}</option>
                    <option value="standard">{t("planTier.standard")}</option>
                    <option value="expanded">{t("planTier.expanded")}</option>
                  </select>
                  <select
                    aria-label={t("filters.planStatusLabel")}
                    value={planStatusFilter}
                    onChange={(e) => setPlanStatusFilter(e.target.value)}
                    className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 text-xs"
                  >
                    <option value="all">
                      {t("filters.planStatusLabel")}: {t("filters.all")}
                    </option>
                    <option value="pilot_active">{t("planStatus.pilot_active")}</option>
                    <option value="active">{t("planStatus.active")}</option>
                    <option value="past_due">{t("planStatus.past_due")}</option>
                    <option value="suspended">{t("planStatus.suspended")}</option>
                    <option value="cancelled">{t("planStatus.cancelled")}</option>
                  </select>
                </div>
              </div>

              {overview.workspaces.length === 0 ? (
                <p className="mt-6 py-6 text-center text-sm text-[var(--color-text-secondary)]">
                  {t("workspaces.empty")}
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {overview.workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold">{ws.name}</h3>
                            <span className="font-mono text-xs text-[var(--color-text-muted)]">
                              ({ws.slug})
                            </span>
                            <span className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2 py-0.5 text-[11px] font-medium">
                              {t(`accountStatus.${ws.status}`)}
                            </span>
                            <span className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-primary)]">
                              {t(`planTier.${ws.plan.tier}`)} · {t(`planStatus.${ws.plan.status}`)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            {t("workspaces.createdLabel")}:{" "}
                            {format.dateTime(new Date(ws.createdAt), { dateStyle: "medium" })}
                            {ws.lastActivityAt && (
                              <>
                                {" · "}
                                {t("workspaces.lastActivityLabel")}:{" "}
                                {format.dateTime(new Date(ws.lastActivityAt), {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void inspectWorkspace(ws.id)}
                          className="inline-flex items-center gap-1.5 self-start rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {t("workspaces.inspectAction")}
                        </button>
                      </div>

                      {/* Usage metrics bar */}
                      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--color-border-subtle)] pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <span className="font-medium">
                            {t("workspaces.studentsUsage", {
                              used: ws.utilization.students.used,
                              limit: ws.utilization.students.limit,
                            })}
                          </span>
                          {" · "}
                          <span>
                            {t("workspaces.groupsUsage", {
                              used: ws.utilization.groups.used,
                              limit: ws.utilization.groups.limit,
                            })}
                          </span>
                        </div>
                        <div>
                          <span>
                            {t("workspaces.assistantsUsage", {
                              used: ws.utilization.assistants.used,
                              limit: ws.utilization.assistants.limit,
                            })}
                          </span>
                          {" · "}
                          <span>
                            {t("workspaces.filesUsage", {
                              used: formatBytes(ws.utilization.fileStorageBytes.used),
                              limit: formatBytes(ws.utilization.fileStorageBytes.limit),
                            })}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>
                            {t("workspaces.videosUsage", {
                              used: ws.utilization.videoCount.used,
                              limit: ws.utilization.videoCount.limit,
                            })}
                          </span>
                          {" · "}
                          <span>
                            {t("workspaces.messagesUsage", {
                              total: ws.usage.messages.outboxTotal,
                              failed: ws.usage.messages.failedCount,
                              inApp: ws.usage.messages.inAppNotificationCount,
                            })}
                          </span>
                          <span className="rounded bg-[var(--color-bg-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                            {t("workspaces.estimateBadge")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Selected Workspace Detail Drawer / Panel */}
            {selectedWorkspaceId && (
              <section className="rounded-lg border-2 border-[var(--color-accent-primary)] bg-[var(--color-bg-surface)] p-5">
                <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
                  <div>
                    <h2 className="text-base font-bold">{t("detail.title")}</h2>
                    {selectedWorkspace && (
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {selectedWorkspace.name} ({selectedWorkspace.slug})
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWorkspaceId(null);
                      setSelectedWorkspace(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1 text-xs"
                  >
                    {t("workspaces.closeDetail")}
                  </button>
                </div>

                {actionBanner && (
                  <div
                    role="status"
                    className={`mt-4 rounded-md border p-3 text-xs font-medium ${
                      actionBanner.kind === "success"
                        ? "border-[var(--color-success)] text-[var(--color-success)]"
                        : "border-[var(--color-danger)] text-[var(--color-danger)]"
                    }`}
                  >
                    {actionBanner.text}
                  </div>
                )}

                {detailLoading || !selectedWorkspace ? (
                  <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
                    {t("loading")}
                  </p>
                ) : (
                  <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Column 1: Metadata, Usage Summary, and Break-Glass */}
                    <div className="space-y-5">
                      {/* Metadata */}
                      <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4">
                        <h3 className="text-sm font-semibold">{t("detail.metadataSection")}</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-[var(--color-text-muted)]">
                              {t("detail.workspaceId")}
                            </dt>
                            <dd className="font-mono">{selectedWorkspace.id}</dd>
                          </div>
                          <div>
                            <dt className="text-[var(--color-text-muted)]">{t("detail.slug")}</dt>
                            <dd className="font-mono">{selectedWorkspace.slug}</dd>
                          </div>
                          <div>
                            <dt className="text-[var(--color-text-muted)]">
                              {t("detail.teachingName")}
                            </dt>
                            <dd>{selectedWorkspace.teachingName ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-[var(--color-text-muted)]">
                              {t("detail.primarySubject")}
                            </dt>
                            <dd>{selectedWorkspace.primarySubject ?? "—"}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-[var(--color-text-muted)]">
                              {t("detail.gradesTaught")}
                            </dt>
                            <dd>
                              {selectedWorkspace.gradesTaught.length > 0
                                ? selectedWorkspace.gradesTaught.join(", ")
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {/* Usage Summary */}
                      <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4">
                        <h3 className="text-sm font-semibold">{t("detail.usageSection")}</h3>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {t("detail.usageDisclaimer")}
                        </p>
                        <ul className="mt-3 space-y-1.5 text-xs">
                          <li>
                            {t("detail.activeArchivedStudents", {
                              active: selectedWorkspace.usage.students.activeCount,
                              archived: selectedWorkspace.usage.students.archivedCount,
                            })}
                          </li>
                          <li>
                            {t("detail.activeArchivedGroups", {
                              active: selectedWorkspace.usage.groups.activeCount,
                              archived: selectedWorkspace.usage.groups.archivedCount,
                            })}
                          </li>
                          <li>
                            {t("detail.membersBreakdown", {
                              owners: selectedWorkspace.usage.members.ownerCount,
                              assistants: selectedWorkspace.usage.members.activeAssistantCount,
                              suspended: selectedWorkspace.usage.members.suspendedAssistantCount,
                              invites: selectedWorkspace.usage.members.pendingInvitationCount,
                            })}
                          </li>
                          <li>
                            {t("detail.filesBreakdown", {
                              active: selectedWorkspace.usage.files.activeCount,
                              pending: selectedWorkspace.usage.files.pendingScanCount,
                              blocked: selectedWorkspace.usage.files.blockedScanCount,
                            })}
                          </li>
                          <li>
                            {t("detail.videosBreakdown", {
                              count: selectedWorkspace.usage.videos.activeCount,
                              minutes: Math.round(
                                selectedWorkspace.usage.videos.totalDurationSeconds / 60,
                              ),
                              playbacks: selectedWorkspace.usage.videos.totalPlaybackCount,
                              bandwidth: formatBytes(
                                selectedWorkspace.usage.videos.estimatedBandwidthBytes,
                              ),
                            })}
                          </li>
                          <li>
                            {t("detail.messagesBreakdown", {
                              total: selectedWorkspace.usage.messages.outboxTotal,
                              pending: selectedWorkspace.usage.messages.pendingCount,
                              sent: selectedWorkspace.usage.messages.sentCount,
                              failed: selectedWorkspace.usage.messages.failedCount,
                              inApp: selectedWorkspace.usage.messages.inAppNotificationCount,
                            })}
                          </li>
                          <li>
                            {t("detail.examsBreakdown", {
                              total: selectedWorkspace.usage.onlineExams.totalCount,
                              published: selectedWorkspace.usage.onlineExams.publishedCount,
                            })}
                          </li>
                        </ul>
                      </div>

                      {/* Break-Glass Support Diagnostics */}
                      <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4">
                        <h3 className="text-sm font-semibold">{t("detail.breakGlassSection")}</h3>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {t("detail.breakGlassHint")}
                        </p>

                        {selectedWorkspace.activeBreakGlassGrant ? (
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-warning)] bg-[var(--color-bg-canvas)] p-2.5 text-xs">
                              <span>
                                {t("detail.activeBreakGlassBanner", {
                                  ticket: selectedWorkspace.activeBreakGlassGrant.ticketRef,
                                  expiresAt: format.dateTime(
                                    new Date(selectedWorkspace.activeBreakGlassGrant.expiresAt),
                                    { dateStyle: "short", timeStyle: "short" },
                                  ),
                                })}
                              </span>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                  void handleRevokeBreakGlass(
                                    selectedWorkspace.activeBreakGlassGrant!.id,
                                  )
                                }
                                className="rounded bg-[var(--color-danger)] px-2.5 py-1 text-xs font-semibold text-white"
                              >
                                {t("detail.revokeBreakGlassAction")}
                              </button>
                            </div>

                            {diagnostics && (
                              <div className="space-y-2 text-xs">
                                <div>
                                  <h4 className="font-semibold">
                                    {t("detail.diagnosticsFailedExports")}
                                  </h4>
                                  {diagnostics.failedExports.length === 0 ? (
                                    <p className="text-[var(--color-text-muted)]">
                                      {t("detail.noFailures")}
                                    </p>
                                  ) : (
                                    <ul className="mt-1 space-y-1 font-mono text-[11px]">
                                      {diagnostics.failedExports.map((f) => (
                                        <li key={f.id}>
                                          [{f.type}] code={f.failureCode ?? "unknown"}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-semibold">
                                    {t("detail.diagnosticsFailedOutbox")}
                                  </h4>
                                  {diagnostics.failedOutboxMessages.length === 0 ? (
                                    <p className="text-[var(--color-text-muted)]">
                                      {t("detail.noFailures")}
                                    </p>
                                  ) : (
                                    <ul className="mt-1 space-y-1 font-mono text-[11px]">
                                      {diagnostics.failedOutboxMessages.map((o) => (
                                        <li key={o.id}>
                                          [{o.channel}/{o.type}] attempts={o.attempts} error=
                                          {o.lastError ?? "unknown"}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-semibold">
                                    {t("detail.diagnosticsRecentAudit")}
                                  </h4>
                                  <ul className="mt-1 space-y-1 font-mono text-[11px]">
                                    {diagnostics.recentAuditActions.slice(0, 6).map((a) => (
                                      <li key={a.id}>
                                        {a.action} ({a.entityType}) · {a.actorType}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <form
                            onSubmit={(e) => void handleGrantBreakGlass(e)}
                            className="mt-3 space-y-2.5 text-xs"
                          >
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="block font-medium">
                                  {t("detail.ticketRefLabel")}
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={bgTicketRef}
                                  onChange={(e) => setBgTicketRef(e.target.value)}
                                  placeholder={t("detail.ticketRefPlaceholder")}
                                  className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                                />
                              </div>
                              <div>
                                <label className="block font-medium">
                                  {t("detail.durationMinutesLabel")}
                                </label>
                                <input
                                  type="number"
                                  min={5}
                                  max={60}
                                  required
                                  value={bgDuration}
                                  onChange={(e) => setBgDuration(Number(e.target.value))}
                                  className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block font-medium">{t("detail.reasonLabel")}</label>
                              <input
                                type="text"
                                required
                                minLength={10}
                                value={bgReason}
                                onChange={(e) => setBgReason(e.target.value)}
                                placeholder={t("detail.reasonPlaceholder")}
                                className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="block font-medium">
                                {t("detail.confirmSlugLabel", { slug: selectedWorkspace.slug })}
                              </label>
                              <input
                                type="text"
                                required
                                value={bgConfirmSlug}
                                onChange={(e) => setBgConfirmSlug(e.target.value)}
                                className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 font-mono"
                              />
                            </div>
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={bgConfirmChecked}
                                onChange={(e) => setBgConfirmChecked(e.target.checked)}
                                className="mt-0.5"
                              />
                              <span>{t("detail.confirmCheckbox")}</span>
                            </label>
                            <button
                              type="submit"
                              disabled={
                                submitting ||
                                !bgConfirmChecked ||
                                bgConfirmSlug.trim() !== selectedWorkspace.slug
                              }
                              className="rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {t("detail.grantBreakGlassAction")}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Plan Configuration & Account Status */}
                    <div className="space-y-5">
                      {/* Manual Plan & Quota Editor */}
                      <form
                        onSubmit={(e) => void handleSavePlan(e)}
                        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4 text-xs"
                      >
                        <h3 className="text-sm font-semibold">{t("detail.planSection")}</h3>
                        <p className="mt-1 text-[var(--color-text-secondary)]">
                          {t("detail.planBillingNotice")}
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block font-medium">{t("filters.planTierLabel")}</label>
                            <select
                              value={editPlanTier}
                              onChange={(e) => setEditPlanTier(e.target.value as PlanTier)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            >
                              <option value="pilot">{t("planTier.pilot")}</option>
                              <option value="standard">{t("planTier.standard")}</option>
                              <option value="expanded">{t("planTier.expanded")}</option>
                            </select>
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("filters.planStatusLabel")}
                            </label>
                            <select
                              value={editPlanStatus}
                              onChange={(e) => setEditPlanStatus(e.target.value as PlanStatus)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            >
                              <option value="pilot_active">{t("planStatus.pilot_active")}</option>
                              <option value="active">{t("planStatus.active")}</option>
                              <option value="past_due">{t("planStatus.past_due")}</option>
                              <option value="suspended">{t("planStatus.suspended")}</option>
                              <option value="cancelled">{t("planStatus.cancelled")}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block font-medium">
                              {t("detail.overrideStudents")}
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={overrideStudents}
                              onChange={(e) => setOverrideStudents(e.target.value)}
                              placeholder={String(selectedWorkspace.plan.limits.maxActiveStudents)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("detail.overrideGroups")}
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={overrideGroups}
                              onChange={(e) => setOverrideGroups(e.target.value)}
                              placeholder={String(selectedWorkspace.plan.limits.maxActiveGroups)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("detail.overrideAssistants")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={overrideAssistants}
                              onChange={(e) => setOverrideAssistants(e.target.value)}
                              placeholder={String(selectedWorkspace.plan.limits.maxAssistants)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("detail.overrideFileStorageMb")}
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={overrideFileMb}
                              onChange={(e) => setOverrideFileMb(e.target.value)}
                              placeholder={String(
                                Math.round(
                                  selectedWorkspace.plan.limits.maxFileStorageBytes / (1024 * 1024),
                                ),
                              )}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-medium">
                              {t("detail.overrideVideoCount")}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={overrideVideoCount}
                              onChange={(e) => setOverrideVideoCount(e.target.value)}
                              placeholder={String(selectedWorkspace.plan.limits.maxVideoCount)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                        </div>

                        {/* Feature Flags */}
                        <div className="mt-3 space-y-1.5 border-t border-[var(--color-border-subtle)] pt-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={featureOnlineExams}
                              onChange={(e) => setFeatureOnlineExams(e.target.checked)}
                            />
                            <span>{t("detail.featureOnlineExams")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={featureRecordedVideos}
                              onChange={(e) => setFeatureRecordedVideos(e.target.checked)}
                            />
                            <span>{t("detail.featureRecordedVideos")}</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={featureReportExports}
                              onChange={(e) => setFeatureReportExports(e.target.checked)}
                            />
                            <span>{t("detail.featureReportExports")}</span>
                          </label>
                        </div>

                        <div className="mt-3 space-y-2.5 border-t border-[var(--color-border-subtle)] pt-3">
                          <div>
                            <label className="block font-medium">{t("detail.planNoteLabel")}</label>
                            <input
                              type="text"
                              value={planNote}
                              onChange={(e) => setPlanNote(e.target.value)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">{t("detail.reasonLabel")}</label>
                            <input
                              type="text"
                              required
                              minLength={5}
                              value={planReason}
                              onChange={(e) => setPlanReason(e.target.value)}
                              placeholder={t("detail.reasonPlaceholder")}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("detail.confirmSlugLabel", { slug: selectedWorkspace.slug })}
                            </label>
                            <input
                              type="text"
                              required
                              value={planConfirmSlug}
                              onChange={(e) => setPlanConfirmSlug(e.target.value)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 font-mono"
                            />
                          </div>
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={planConfirmChecked}
                              onChange={(e) => setPlanConfirmChecked(e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>{t("detail.confirmCheckbox")}</span>
                          </label>
                          <button
                            type="submit"
                            disabled={
                              submitting ||
                              !planConfirmChecked ||
                              planConfirmSlug.trim() !== selectedWorkspace.slug
                            }
                            className="rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {t("detail.savePlanAction")}
                          </button>
                        </div>
                      </form>

                      {/* Account Suspension / Reactivation Control */}
                      <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4 text-xs">
                        <h3 className="text-sm font-semibold">{t("detail.statusSection")}</h3>
                        <div className="mt-3 space-y-2.5">
                          <div>
                            <label className="block font-medium">{t("detail.reasonLabel")}</label>
                            <input
                              type="text"
                              minLength={5}
                              value={statusReason}
                              onChange={(e) => setStatusReason(e.target.value)}
                              placeholder={t("detail.reasonPlaceholder")}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              {t("detail.confirmSlugLabel", { slug: selectedWorkspace.slug })}
                            </label>
                            <input
                              type="text"
                              value={statusConfirmSlug}
                              onChange={(e) => setStatusConfirmSlug(e.target.value)}
                              className="mt-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2.5 py-1.5 font-mono"
                            />
                          </div>
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={statusConfirmChecked}
                              onChange={(e) => setStatusConfirmChecked(e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>{t("detail.confirmCheckbox")}</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {selectedWorkspace.status === "active" ? (
                              <button
                                type="button"
                                disabled={
                                  submitting ||
                                  !statusConfirmChecked ||
                                  statusReason.trim().length < 5 ||
                                  statusConfirmSlug.trim() !== selectedWorkspace.slug
                                }
                                onClick={() => void handleToggleAccountStatus("suspended")}
                                className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {t("detail.suspendWorkspaceAction")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  submitting ||
                                  !statusConfirmChecked ||
                                  statusReason.trim().length < 5 ||
                                  statusConfirmSlug.trim() !== selectedWorkspace.slug
                                }
                                onClick={() => void handleToggleAccountStatus("active")}
                                className="rounded-md bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {t("detail.reactivateWorkspaceAction")}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Platform Administration Audit Log */}
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5">
              <div>
                <h2 className="text-base font-semibold">{t("audit.title")}</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">{t("audit.subtitle")}</p>
              </div>

              {(workspaceAudits.length > 0 ? workspaceAudits : overview.auditEvents).length ===
              0 ? (
                <p className="mt-4 py-4 text-center text-xs text-[var(--color-text-secondary)]">
                  {t("audit.empty")}
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-start text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                        <th className="py-2 pe-3 font-medium">{t("audit.columns.time")}</th>
                        <th className="py-2 pe-3 font-medium">{t("audit.columns.actor")}</th>
                        <th className="py-2 pe-3 font-medium">{t("audit.columns.action")}</th>
                        <th className="py-2 pe-3 font-medium">{t("audit.columns.workspace")}</th>
                        <th className="py-2 font-medium">{t("audit.columns.reason")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {(workspaceAudits.length > 0 ? workspaceAudits : overview.auditEvents).map(
                        (ev) => (
                          <tr key={ev.id}>
                            <td className="py-2 pe-3 whitespace-nowrap">
                              {format.dateTime(new Date(ev.createdAt), {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="py-2 pe-3">{ev.actorDisplayName}</td>
                            <td className="py-2 pe-3 font-mono">{ev.action}</td>
                            <td className="py-2 pe-3 font-mono">
                              {ev.targetWorkspaceId ?? "global"}
                            </td>
                            <td className="py-2 text-[var(--color-text-secondary)]">
                              {ev.reason ?? "—"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
