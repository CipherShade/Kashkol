"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

type Group = { id: string; name: string };
type Student = { id: string; name: string };
type Subject = { id: string; name: string };
type Material = {
  id: string;
  scope: "teacher_only" | "groups" | "students";
  title: string;
  description: string | null;
  topic: string | null;
  subject: Subject | null;
  sizeBytes: number;
  mime: string;
  scanStatus: "pending" | "clean" | "blocked";
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
  groups: Array<Group & { archived: boolean }>;
  students: Array<Student & { archived: boolean }>;
};

type VideoLessonItem = {
  id: string;
  provider: string;
  externalAssetId: string;
  title: string;
  description: string | null;
  topic: string | null;
  subject: Subject | null;
  scope: "teacher_only" | "groups" | "students";
  publicationStatus: "draft" | "published" | "archived";
  assetStatus: "pending_upload" | "processing" | "ready" | "failed";
  durationSeconds: number | null;
  sizeBytes: number;
  thumbnailUrl: string | null;
  playbackCount: number;
  estimatedBandwidthBytes: number;
  ownerId: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  groups: Array<Group & { archived: boolean }>;
  students: Array<Student & { archived: boolean }>;
};

type VideoDataPayload = {
  providerStatus: {
    driver: string;
    configured: boolean;
  };
  usage: {
    videoCount: number;
    totalStorageBytes: number;
    totalDurationSeconds: number;
    totalPlaybacks: number;
    estimatedBandwidthBytes: number;
  };
  limits: {
    maxCount: number;
    maxStorageBytes: number;
    maxBandwidthBytesPerMonth: number;
  };
  items: VideoLessonItem[];
};

function formatBytes(bytes: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "byte",
    unitDisplay: "short",
  }).format(bytes);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("request failed");
}

export function FilesClient({
  initialMaterials,
  initialUsedBytes,
  initialVideoData,
  groups,
  students,
  subjects,
  actorUserId,
  locale,
  canWrite,
  canShareGroups,
  canShareStudents,
  storageReady,
  scannerReady,
  maxFileSizeBytes,
}: {
  initialMaterials: Material[];
  initialUsedBytes: number;
  initialVideoData?: VideoDataPayload;
  groups: Group[];
  students: Student[];
  subjects: Subject[];
  actorUserId: string;
  locale: string;
  canWrite: boolean;
  canShareGroups: boolean;
  canShareStudents: boolean;
  storageReady: boolean;
  scannerReady: boolean;
  maxFileSizeBytes: number;
}) {
  const t = useTranslations("Files");
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [usedBytes, setUsedBytes] = useState(initialUsedBytes);
  const [videoData, setVideoData] = useState<VideoDataPayload>(
    initialVideoData ?? {
      providerStatus: { driver: "none", configured: false },
      usage: {
        videoCount: 0,
        totalStorageBytes: 0,
        totalDurationSeconds: 0,
        totalPlaybacks: 0,
        estimatedBandwidthBytes: 0,
      },
      limits: {
        maxCount: 50,
        maxStorageBytes: 5 * 1024 * 1024 * 1024,
        maxBandwidthBytesPerMonth: 50 * 1024 * 1024 * 1024,
      },
      items: [],
    },
  );
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [activePlayback, setActivePlayback] = useState<{
    videoId: string;
    embedUrl: string;
    expiresAt: string;
    title: string;
  } | null>(null);
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const availableScopes = useMemo(
    () => [
      { value: "teacher_only", label: t("teacherOnly") },
      ...(canShareGroups ? [{ value: "groups", label: t("selectedGroups") }] : []),
      ...(canShareStudents ? [{ value: "students", label: t("selectedStudents") }] : []),
    ],
    [canShareGroups, canShareStudents, t],
  );

  async function refresh() {
    const response = await fetch(`/api/files?archived=${archived}`, { cache: "no-store" });
    if (!response.ok) throw new Error("reload failed");
    const result = await response.json();
    setMaterials(result.items);
    setUsedBytes(result.usedBytes);
    router.refresh();
  }

  async function scan(fileId: string) {
    await request(`/api/files/${fileId}/scan`, "POST", {});
    await refresh();
  }

  async function retryScan(fileId: string) {
    setBusy(true);
    setError(null);
    try {
      await scan(fileId);
    } catch {
      setError("scanError");
    } finally {
      setBusy(false);
    }
  }

  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File)) return;
    const scope = String(data.get("scope"));
    const metadata = {
      title: String(data.get("title") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      topic: String(data.get("topic") ?? "").trim() || null,
      subjectId: String(data.get("subjectId") ?? "") || null,
      scope,
      groupIds: scope === "groups" ? data.getAll("groupIds").map(String) : [],
      studentIds: scope === "students" ? data.getAll("studentIds").map(String) : [],
    };
    const body = new FormData();
    body.set("file", file);
    body.set("metadata", JSON.stringify(metadata));

    setBusy(true);
    setError(null);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      }
    };
    xhr.onerror = () => {
      setError("requestError");
      setBusy(false);
      setProgress(null);
    };
    xhr.onload = async () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) {
          let message = "requestError";
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.error?.messageKey === "errors.fileTypeNotAllowed")
              message = "uploadTypeError";
            if (result.error?.messageKey === "errors.fileSizeInvalid") message = "uploadSizeError";
          } catch {
            message = "requestError";
          }
          setError(message);
          return;
        }
        const created = JSON.parse(xhr.responseText) as { id: string };
        try {
          await scan(created.id);
        } catch {
          setError("scanError");
        }
        form.reset();
        await refresh();
      } catch {
        setError("requestError");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    };
    xhr.send(body);
  }

  async function updateTitle(fileId: string) {
    setBusy(true);
    setError(null);
    try {
      await request(`/api/files/${fileId}`, "PATCH", { title: editingTitle });
      setEditingId(null);
      await refresh();
    } catch {
      setError("requestError");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(material: Material) {
    setBusy(true);
    setError(null);
    try {
      await request(`/api/files/${material.id}`, "PATCH", { archived: !material.archivedAt });
      await refresh();
    } catch {
      setError("requestError");
    } finally {
      setBusy(false);
    }
  }

  async function remove(material: Material) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/files/${material.id}`, "DELETE");
      await refresh();
    } catch {
      setError("requestError");
    } finally {
      setBusy(false);
    }
  }

  async function refreshVideos() {
    const response = await fetch(`/api/videos?archived=${archived}`, { cache: "no-store" });
    if (!response.ok) throw new Error("video reload failed");
    const result = (await response.json()) as VideoDataPayload;
    setVideoData(result);
    router.refresh();
  }

  async function attachVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const scope = String(data.get("scope") ?? "teacher_only");
    const payload = {
      title: String(data.get("title") ?? "").trim(),
      externalAssetId: String(data.get("externalAssetId") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      topic: String(data.get("topic") ?? "").trim() || null,
      subjectId: String(data.get("subjectId") ?? "") || null,
      publicationStatus: String(data.get("publicationStatus") ?? "draft"),
      scope,
      groupIds: scope === "groups" ? data.getAll("groupIds").map(String) : [],
      studentIds: scope === "students" ? data.getAll("studentIds").map(String) : [],
    };
    setVideoBusy(true);
    setVideoError(null);
    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setVideoError("requestError");
        return;
      }
      form.reset();
      await refreshVideos();
    } catch {
      setVideoError("requestError");
    } finally {
      setVideoBusy(false);
    }
  }

  async function updateVideoPublication(
    video: VideoLessonItem,
    publicationStatus: "draft" | "published" | "archived",
  ) {
    setVideoBusy(true);
    setVideoError(null);
    try {
      await request(`/api/videos/${video.id}`, "PATCH", { publicationStatus });
      await refreshVideos();
    } catch {
      setVideoError("requestError");
    } finally {
      setVideoBusy(false);
    }
  }

  async function syncVideoMetadata(video: VideoLessonItem) {
    setVideoBusy(true);
    setVideoError(null);
    try {
      await request(`/api/videos/${video.id}`, "PATCH", { syncMetadata: true });
      await refreshVideos();
    } catch {
      setVideoError("requestError");
    } finally {
      setVideoBusy(false);
    }
  }

  async function removeVideo(video: VideoLessonItem) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setVideoBusy(true);
    setVideoError(null);
    try {
      await request(`/api/videos/${video.id}`, "DELETE");
      if (activePlayback?.videoId === video.id) setActivePlayback(null);
      await refreshVideos();
    } catch {
      setVideoError("requestError");
    } finally {
      setVideoBusy(false);
    }
  }

  async function requestVideoPlayback(video: VideoLessonItem) {
    setVideoBusy(true);
    setVideoError(null);
    try {
      const response = await fetch(`/api/videos/${video.id}/playback`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("playback failed");
      const result = (await response.json()) as {
        videoId: string;
        title: string;
        playback: { embedUrl: string; expiresAt: string };
      };
      setActivePlayback({
        videoId: result.videoId,
        title: result.title,
        embedUrl: result.playback.embedUrl,
        expiresAt: result.playback.expiresAt,
      });
      await refreshVideos();
    } catch {
      setVideoError("requestError");
    } finally {
      setVideoBusy(false);
    }
  }

  const visibleMaterials = materials.filter(
    (material) => Boolean(material.archivedAt) === archived,
  );
  const visibleVideos = videoData.items.filter(
    (video) => Boolean(video.archivedAt) === archived,
  );
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-card-title">{t("storageUsage")}</h2>
              <p className="text-sm text-muted">{formatBytes(usedBytes, locale)}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setArchived((value) => !value);
                void fetch(`/api/files?archived=${!archived}`, { cache: "no-store" })
                  .then(async (response) => {
                    if (!response.ok) throw new Error("reload failed");
                    const result = await response.json();
                    setMaterials(result.items);
                  })
                  .catch(() => setError("requestError"));
              }}
            >
              {archived ? t("showActive") : t("showArchived")}
            </Button>
          </div>
        </CardBody>
      </Card>

      {canWrite && (
        <Card>
          <CardBody>
            <h2 className="ui-card-title mb-4">{t("uploadTitle")}</h2>
            {!storageReady ? <Alert tone="danger">{t("storageUnavailable")}</Alert> : null}
            {!scannerReady ? <Alert tone="warning">{t("scannerUnavailable")}</Alert> : null}
            {error ? <Alert tone="danger">{t(error)}</Alert> : null}
            <form className="grid gap-4 md:grid-cols-2" onSubmit={upload}>
              <label className="grid gap-1">
                <span>{t("titleLabel")}</span>
                <input className="ui-input" name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1">
                <span>{t("fileLabel")}</span>
                <input
                  className="ui-input"
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx"
                  disabled={!storageReady || !scannerReady || !canWrite || busy}
                />
                <small className="text-muted">
                  {t("sizeLimit", { size: formatBytes(maxFileSizeBytes, locale) })}
                </small>
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span>{t("descriptionLabel")}</span>
                <textarea className="ui-input" name="description" rows={2} maxLength={2000} />
              </label>
              <label className="grid gap-1">
                <span>{t("subjectLabel")}</span>
                <select className="ui-input" name="subjectId" defaultValue="">
                  <option value="">{t("noSubject")}</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span>{t("topicLabel")}</span>
                <input className="ui-input" name="topic" maxLength={160} />
              </label>
              <label className="grid gap-1">
                <span>{t("accessLabel")}</span>
                <select className="ui-input" name="scope" defaultValue={availableScopes[0]?.value}>
                  {availableScopes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {canShareGroups ? (
                <label className="grid gap-1">
                  <span>{t("groupsLabel")}</span>
                  <select
                    className="ui-input"
                    name="groupIds"
                    multiple
                    size={Math.min(5, Math.max(2, groups.length))}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {canShareStudents ? (
                <label className="grid gap-1">
                  <span>{t("studentsLabel")}</span>
                  <select
                    className="ui-input"
                    name="studentIds"
                    multiple
                    size={Math.min(5, Math.max(2, students.length))}
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={!storageReady || !scannerReady || !canWrite || busy}
                >
                  {busy ? t("uploading") : t("uploadAction")}
                </Button>
                {progress !== null ? (
                  <div className="mt-3 grid gap-1">
                    <label htmlFor="file-upload-progress">
                      {t("uploadProgress", { progress })}
                    </label>
                    <progress id="file-upload-progress" max={100} value={progress} />
                  </div>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <h2 className="ui-card-title">{archived ? t("archivedTitle") : t("libraryTitle")}</h2>
          {error ? <Alert tone="danger">{t(error)}</Alert> : null}
          {visibleMaterials.length === 0 ? (
            <EmptyState
              icon="file"
              title={archived ? t("emptyArchivedTitle") : t("emptyTitle")}
              description={archived ? t("emptyArchivedDescription") : t("emptyDescription")}
            />
          ) : (
            <ul className="space-y-4">
              {visibleMaterials.map((material) => (
                <li className="rounded-lg border border-border p-4" key={material.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      {editingId === material.id ? (
                        <form
                          className="flex flex-wrap gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void updateTitle(material.id);
                          }}
                        >
                          <input
                            className="ui-input"
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            maxLength={160}
                            required
                            aria-label={t("titleLabel")}
                          />
                          <Button type="submit" disabled={busy}>
                            {t("save")}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                            {t("cancel")}
                          </Button>
                        </form>
                      ) : (
                        <h3 className="font-semibold">{material.title}</h3>
                      )}
                      {material.description ? (
                        <p className="mt-1 text-sm">{material.description}</p>
                      ) : null}
                      <p className="mt-2 text-sm text-muted">
                        {t("scopeLabel")}: {t(material.scope)}
                        {material.groups.length
                          ? ` · ${material.groups.map(({ name, archived: isArchived }) => `${name}${isArchived ? ` (${t("archivedSuffix")})` : ""}`).join(", ")}`
                          : ""}
                        {material.students.length
                          ? ` · ${material.students.map(({ name, archived: isArchived }) => `${name}${isArchived ? ` (${t("archivedSuffix")})` : ""}`).join(", ")}`
                          : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {material.subject?.name ?? t("noSubject")}
                        {material.topic ? ` · ${material.topic}` : ""}
                        {` · ${formatBytes(material.sizeBytes, locale)} · ${formatDate(material.createdAt, locale)}`}
                        {` · ${material.ownerId === actorUserId ? t("uploadedByYou") : t("uploadedByMember")}`}
                      </p>
                      <p className="mt-2 text-sm" role="status">
                        {t(`scan.${material.scanStatus}`)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {material.scanStatus === "clean" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = `/api/files/${material.id}/download`;
                            link.rel = "noopener";
                            link.click();
                          }}
                        >
                          {t("download")}
                        </Button>
                      ) : material.scanStatus === "pending" && canWrite ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void retryScan(material.id)}
                        >
                          {t("retryScan")}
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <>
                          {material.archivedAt ? null : (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setEditingId(material.id);
                                setEditingTitle(material.title);
                              }}
                            >
                              {t("rename")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void toggleArchive(material)}
                          >
                            {material.archivedAt ? t("restore") : t("archive")}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void remove(material)}
                          >
                            {t("delete")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Recorded Video Lessons Section (F-P3-02) */}
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="ui-card-title">{t("videos.sectionTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("videos.sectionSubtitle")}</p>
            </div>
            {videoData.providerStatus.configured ? (
              <span className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold">
                {t("videos.providerActiveBadge", {
                  provider: videoData.providerStatus.driver,
                })}
              </span>
            ) : null}
          </div>

          {!videoData.providerStatus.configured ? (
            <Alert tone="warning">
              <div className="space-y-1">
                <p className="font-semibold">{t("videos.setupStateTitle")}</p>
                <p className="text-sm">{t("videos.setupStateBody")}</p>
                <p className="text-xs text-muted">{t("videos.setupDocsHint")}</p>
              </div>
            </Alert>
          ) : null}

          {/* Cost Drivers & Workspace Video Limits */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">{t("videos.limitsTitle")}</h3>
            <p className="mt-1 text-xs text-muted">{t("videos.limitsDisclaimer")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-border p-2.5 text-xs">
                {t("videos.videoCountUsage", {
                  used: videoData.usage.videoCount,
                  max: videoData.limits.maxCount,
                })}
              </div>
              <div className="rounded border border-border p-2.5 text-xs">
                {t("videos.storageUsage", {
                  used: formatBytes(videoData.usage.totalStorageBytes, locale),
                  max: formatBytes(videoData.limits.maxStorageBytes, locale),
                })}
              </div>
              <div className="rounded border border-border p-2.5 text-xs">
                {t("videos.bandwidthUsage", {
                  used: formatBytes(videoData.usage.estimatedBandwidthBytes, locale),
                  max: formatBytes(videoData.limits.maxBandwidthBytesPerMonth, locale),
                })}
              </div>
              <div className="rounded border border-border p-2.5 text-xs">
                {t("videos.totalDurationUsage", {
                  minutes: Math.round(videoData.usage.totalDurationSeconds / 60),
                  playbacks: videoData.usage.totalPlaybacks,
                })}
              </div>
            </div>
          </div>

          {videoError ? <Alert tone="danger">{t(videoError)}</Alert> : null}

          {canWrite && videoData.providerStatus.configured ? (
            <form
              className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2"
              onSubmit={(event) => void attachVideo(event)}
            >
              <h3 className="text-sm font-semibold md:col-span-2">{t("videos.attachTitle")}</h3>
              <label className="grid gap-1 text-sm">
                <span>{t("titleLabel")}</span>
                <input className="ui-input" name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("videos.externalAssetIdLabel")}</span>
                <input
                  className="ui-input"
                  name="externalAssetId"
                  required
                  maxLength={160}
                  placeholder="cf-asset-..."
                />
                <small className="text-xs text-muted">{t("videos.externalAssetIdHint")}</small>
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>{t("descriptionLabel")}</span>
                <textarea className="ui-input" name="description" rows={2} maxLength={2000} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("subjectLabel")}</span>
                <select className="ui-input" name="subjectId" defaultValue="">
                  <option value="">{t("noSubject")}</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("topicLabel")}</span>
                <input className="ui-input" name="topic" maxLength={160} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("videos.publicationLabel")}</span>
                <select className="ui-input" name="publicationStatus" defaultValue="draft">
                  <option value="draft">{t("videos.pubDraft")}</option>
                  <option value="published">{t("videos.pubPublished")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("accessLabel")}</span>
                <select className="ui-input" name="scope" defaultValue={availableScopes[0]?.value}>
                  {availableScopes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {canShareGroups ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("groupsLabel")}</span>
                  <select
                    className="ui-input"
                    name="groupIds"
                    multiple
                    size={Math.min(4, Math.max(2, groups.length))}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {canShareStudents ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("studentsLabel")}</span>
                  <select
                    className="ui-input"
                    name="studentIds"
                    multiple
                    size={Math.min(4, Math.max(2, students.length))}
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="md:col-span-2">
                <Button type="submit" disabled={videoBusy || !canWrite}>
                  {videoBusy ? t("videos.attaching") : t("videos.attachAction")}
                </Button>
              </div>
            </form>
          ) : null}

          {activePlayback ? (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm">{activePlayback.title}</h4>
                  <p className="text-xs text-muted">
                    {t("videos.signedPlaybackReady", {
                      expiresAt: new Date(activePlayback.expiresAt).toLocaleTimeString(locale),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActivePlayback(null)}
                >
                  {t("videos.closePlayer")}
                </Button>
              </div>
              <iframe
                title={activePlayback.title}
                src={activePlayback.embedUrl}
                className="h-64 w-full rounded border border-border"
                allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}

          {visibleVideos.length === 0 ? (
            <EmptyState
              icon="file"
              title={t("videos.emptyTitle")}
              description={t("videos.emptyDescription")}
            />
          ) : (
            <ul className="space-y-3">
              {visibleVideos.map((video) => (
                <li key={video.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{video.title}</h3>
                        <span className="rounded border border-border px-2 py-0.5 text-xs">
                          {t(`videos.publicationStatus.${video.publicationStatus}`)}
                        </span>
                        <span className="rounded border border-border px-2 py-0.5 text-xs text-muted">
                          {t(`videos.assetStatus.${video.assetStatus}`)}
                        </span>
                      </div>
                      {video.description ? (
                        <p className="text-sm">{video.description}</p>
                      ) : null}
                      <p className="text-xs text-muted">
                        {t("scopeLabel")}: {t(video.scope)}
                        {video.groups.length
                          ? ` · ${video.groups.map((g) => g.name).join(", ")}`
                          : ""}
                        {video.students.length
                          ? ` · ${video.students.map((s) => s.name).join(", ")}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {video.subject?.name ?? t("noSubject")}
                        {video.topic ? ` · ${video.topic}` : ""}
                        {video.durationSeconds !== null
                          ? ` · ${t("videos.durationLabel", { seconds: video.durationSeconds })}`
                          : ""}
                        {` · ${formatBytes(video.sizeBytes, locale)} · ${t("videos.playbacksCount", { count: video.playbackCount })}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {video.assetStatus === "ready" && videoData.providerStatus.configured ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={videoBusy}
                          onClick={() => void requestVideoPlayback(video)}
                        >
                          {t("videos.previewPlayback")}
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <>
                          {video.publicationStatus === "draft" && video.assetStatus === "ready" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={videoBusy}
                              onClick={() => void updateVideoPublication(video, "published")}
                            >
                              {t("videos.publishAction")}
                            </Button>
                          ) : video.publicationStatus === "published" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={videoBusy}
                              onClick={() => void updateVideoPublication(video, "draft")}
                            >
                              {t("videos.unpublishAction")}
                            </Button>
                          ) : null}
                          {videoData.providerStatus.configured ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={videoBusy}
                              onClick={() => void syncVideoMetadata(video)}
                            >
                              {t("videos.syncMetadataAction")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={videoBusy}
                            onClick={() => void removeVideo(video)}
                          >
                            {t("delete")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
