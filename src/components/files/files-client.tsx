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

  const visibleMaterials = materials.filter(
    (material) => Boolean(material.archivedAt) === archived,
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
    </div>
  );
}
