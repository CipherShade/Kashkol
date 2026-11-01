"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import {
  archiveStudentAction,
  createStudentAction,
  restoreStudentAction,
  updateStudentAction,
} from "@/app/actions/students";
import type { StudentListItem, StudentDerivedStatus } from "@/modules/students/repository";
import type { ImportPreviewResult } from "@/modules/students/adapters/spreadsheet";

type GroupOption = {
  id: string;
  name: string;
  color: string;
};

type StudentsClientProps = {
  initialStudents: StudentListItem[];
  summary: {
    total: number;
    active: number;
    atRisk: number;
    inactive: number;
    archived: number;
  };
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  availableGroups: GroupOption[];
  availableGrades: string[];
  currentQuery: {
    search?: string;
    groupId?: string;
    status?: string;
    grade?: string;
    showArchived?: boolean;
    sortBy?: string;
    sortOrder?: string;
  };
  locale: string;
  labels: Record<string, string>;
};

export function StudentsClient({
  initialStudents,
  summary,
  totalCount,
  currentPage,
  totalPages,
  availableGroups,
  availableGrades,
  currentQuery,
  locale,
  labels,
}: StudentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search & Filters state
  const [search, setSearch] = useState(currentQuery.search ?? "");
  const [selectedGroup, setSelectedGroup] = useState(currentQuery.groupId ?? "");
  const [selectedStatus, setSelectedStatus] = useState(currentQuery.status ?? "all");
  const [selectedGrade, setSelectedGrade] = useState(currentQuery.grade ?? "");
  const [showArchived, setShowArchived] = useState(currentQuery.showArchived ?? false);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentListItem | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Duplicate Warning state for Add/Edit
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [addFormPending, setAddFormPending] = useState(false);

  // Import flow state
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importGroupMappings, setImportGroupMappings] = useState<
    Record<string, { action: "create" | "map" | "ignore"; targetGroupId?: string }>
  >({});
  const [importMode, setImportMode] = useState<"all_or_nothing" | "valid_only">("all_or_nothing");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  // Action status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  function applyFilters(updates: Record<string, string | boolean | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      search,
      groupId: selectedGroup,
      status: selectedStatus,
      grade: selectedGrade,
      showArchived,
      ...updates,
    };

    if (merged.search) params.set("search", merged.search as string);
    if (merged.groupId) params.set("groupId", merged.groupId as string);
    if (merged.status && merged.status !== "all") params.set("status", merged.status as string);
    if (merged.grade) params.set("grade", merged.grade as string);
    if (merged.showArchived) params.set("showArchived", "true");

    startTransition(() => {
      router.push(`/app/students?${params.toString()}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({ search });
  }

  function handleClearFilters() {
    setSearch("");
    setSelectedGroup("");
    setSelectedStatus("all");
    setSelectedGrade("");
    setShowArchived(false);
    startTransition(() => {
      router.push("/app/students");
    });
  }

  async function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddFormPending(true);
    setDuplicateWarning(null);

    const formData = new FormData(e.currentTarget);
    const result = await createStudentAction(undefined, formData);

    setAddFormPending(false);
    if (result.status === "error") {
      if (result.fieldErrors?.duplicateFound) {
        setDuplicateWarning(labels.duplicateWarningDesc ?? "A student with a matching phone number or name already exists in this workspace.");
      } else {
        const key = result.errorKey ?? "errors.generic";
        setStatusMessage({ text: labels[key] ?? key, tone: "danger" });
      }
    } else {
      setAddModalOpen(false);
      setStatusMessage({ text: labels.createdSuccess ?? "Student created successfully.", tone: "success" });
      startTransition(() => router.refresh());
    }
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddFormPending(true);

    const formData = new FormData(e.currentTarget);
    const result = await updateStudentAction(undefined, formData);

    setAddFormPending(false);
    if (result.status === "error") {
      const key = result.errorKey ?? "errors.generic";
      setStatusMessage({ text: labels[key] ?? key, tone: "danger" });
    } else {
      setEditModalOpen(false);
      setEditingStudent(null);
      setStatusMessage({ text: labels.updatedSuccess ?? "Student updated successfully.", tone: "success" });
      startTransition(() => router.refresh());
    }
  }

  async function handleArchiveToggle(student: StudentListItem) {
    startTransition(async () => {
      if (student.archivedAt) {
        await restoreStudentAction(student.id);
        setStatusMessage({ text: labels.restoredSuccess ?? "Student restored.", tone: "success" });
      } else {
        await archiveStudentAction(student.id);
        setStatusMessage({ text: labels.archivedSuccess ?? "Student archived.", tone: "success" });
      }
      router.refresh();
    });
  }

  // Import flow handlers
  async function handlePreviewUpload() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);

    try {
      const fd = new FormData();
      fd.append("file", importFile);

      const res = await fetch("/api/students/import/preview", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.messageKey ?? "errors.generic");
      }

      setImportPreview(data);
      // Initialize default group mappings
      const initialMappings: Record<string, { action: "create" | "map" | "ignore"; targetGroupId?: string }> = {};
      for (const g of data.detectedGroups as string[]) {
        const matchedExisting = availableGroups.find(
          (ex) => ex.name.toLowerCase().trim() === g.toLowerCase().trim(),
        );
        if (matchedExisting) {
          initialMappings[g] = { action: "map", targetGroupId: matchedExisting.id };
        } else {
          initialMappings[g] = { action: "create" };
        }
      }
      setImportGroupMappings(initialMappings);
      setImportStep("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "errors.generic";
      setImportError(labels[msg] ?? msg);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleCommitImport() {
    if (!importPreview) return;
    setImportLoading(true);
    setImportError(null);

    try {
      const payload = {
        mode: importMode,
        acknowledgeWarnings,
        rows: importPreview.rows.map((r) => ({
          rowNumber: r.rowNumber,
          firstName: r.firstName,
          lastName: r.lastName,
          grade: r.grade,
          phone: r.phone,
          parentName: r.parentName,
          parentPhone: r.parentPhone,
          groupName: r.groupName,
          action: r.action,
          existingStudentId: r.existingStudentId,
        })),
        groupMappings: importGroupMappings,
      };

      const res = await fetch("/api/students/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.messageKey ?? "errors.generic");
      }

      setImportResult({
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
        skippedCount: data.skippedCount ?? 0,
      });
      setImportStep("done");
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "errors.generic";
      setImportError(labels[msg] ?? msg);
    } finally {
      setImportLoading(false);
    }
  }

  function downloadErrorReport() {
    if (!importPreview) return;
    const failed = importPreview.rows.filter((r) => r.errors.length > 0);
    if (failed.length === 0) return;

    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const header = ["row", "first_name", "last_name", "phone", "reasons"].join(",");
    const lines = failed.map((row) =>
      [
        String(row.rowNumber),
        escape(row.firstName),
        escape(row.lastName),
        escape(row.phone ?? ""),
        escape(row.errors.join("; ")),
      ].join(","),
    );
    const csv = `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `students-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function statusBadge(status: StudentDerivedStatus) {
    switch (status) {
      case "active":
        return <Badge tone="success">{labels.statusActive ?? "Active"}</Badge>;
      case "at_risk":
        return <Badge tone="warn">{labels.statusAtRisk ?? "At Risk"}</Badge>;
      case "inactive":
        return <Badge tone="neutral">{labels.statusInactive ?? "Inactive"}</Badge>;
      case "archived":
        return <Badge tone="outline">{labels.statusArchived ?? "Archived"}</Badge>;
    }
  }

  const importNameOnlyCount =
    importPreview?.rows.filter((r) => r.warnings.includes("nameOnlyMatch")).length ?? 0;

  return (
    <div className="app-page space-y-6">
      {statusMessage && (
        <Alert
          tone={statusMessage.tone}
          title={statusMessage.text}
          icon={statusMessage.tone === "success" ? "check" : "alert"}
          action={
            <Button variant="ghost" size="sm" onClick={() => setStatusMessage(null)}>
              {labels.close ?? "Dismiss"}
            </Button>
          }
        />
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedStatus("all");
            applyFilters({ status: "all" });
          }}
          className={`ui-card p-4 text-start transition-all ${
            selectedStatus === "all" ? "ring-2 ring-indigo-500 shadow-sm" : ""
          }`}
        >
          <div className="text-xs text-muted mb-1">{labels.totalStudents ?? "Total"}</div>
          <div className="text-2xl font-bold">{summary.total}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStatus("active");
            applyFilters({ status: "active" });
          }}
          className={`ui-card p-4 text-start transition-all ${
            selectedStatus === "active" ? "ring-2 ring-emerald-500 shadow-sm" : ""
          }`}
        >
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">
            {labels.statusActive ?? "Active"}
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            {summary.active}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStatus("at_risk");
            applyFilters({ status: "at_risk" });
          }}
          className={`ui-card p-4 text-start transition-all ${
            selectedStatus === "at_risk" ? "ring-2 ring-amber-500 shadow-sm" : ""
          }`}
        >
          <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">
            {labels.statusAtRisk ?? "At Risk"}
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
            {summary.atRisk}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStatus("inactive");
            applyFilters({ status: "inactive" });
          }}
          className={`ui-card p-4 text-start transition-all ${
            selectedStatus === "inactive" ? "ring-2 ring-neutral-500 shadow-sm" : ""
          }`}
        >
          <div className="text-xs text-muted mb-1">{labels.statusInactive ?? "Inactive"}</div>
          <div className="text-2xl font-bold">{summary.inactive}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowArchived(!showArchived);
            applyFilters({ showArchived: !showArchived });
          }}
          className={`ui-card p-4 text-start transition-all ${
            showArchived ? "ring-2 ring-indigo-500 shadow-sm" : ""
          }`}
        >
          <div className="text-xs text-muted mb-1">{labels.statusArchived ?? "Archived"}</div>
          <div className="text-2xl font-bold">{summary.archived}</div>
        </button>
      </div>

      {/* Action Bar & Search */}
      <Card>
        <CardBody className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={labels.searchPlaceholder ?? "Search by name or phone..."}
                  className="w-full"
                />
              </div>
              <Button type="submit" variant="secondary">
                <Icon name="search" size={16} />
                <span>{labels.search ?? "Search"}</span>
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setDuplicateWarning(null);
                  setAddModalOpen(true);
                }}
              >
                <Icon name="plus" size={16} />
                <span>{labels.addStudent ?? "Add Student"}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  setImportStep("upload");
                  setImportFile(null);
                  setImportPreview(null);
                  setImportError(null);
                  setImportResult(null);
                  setAcknowledgeWarnings(false);
                  setImportModalOpen(true);
                }}
              >
                <Icon name="file" size={16} />
                <span>{labels.importSpreadsheet ?? "Import"}</span>
              </Button>

              <Button variant="ghost" onClick={() => setExportModalOpen(true)}>
                <Icon name="activity" size={16} />
                <span>{labels.export ?? "Export"}</span>
              </Button>
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-medium">{labels.filterByGroup ?? "Group"}:</span>
              <select
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  applyFilters({ groupId: e.target.value });
                }}
                className="ui-select text-sm py-1"
              >
                <option value="">{labels.allGroups ?? "All Groups"}</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {availableGrades.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-medium">{labels.filterByGrade ?? "Grade"}:</span>
                <select
                  value={selectedGrade}
                  onChange={(e) => {
                    setSelectedGrade(e.target.value);
                    applyFilters({ grade: e.target.value });
                  }}
                  className="ui-select text-sm py-1"
                >
                  <option value="">{labels.allGrades ?? "All Grades"}</option>
                  {availableGrades.map((gr) => (
                    <option key={gr} value={gr}>
                      {gr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="ms-auto flex items-center gap-3">
              {(search || selectedGroup || selectedGrade || selectedStatus !== "all" || showArchived) && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  <Icon name="x" size={14} />
                  <span>{labels.clearFilters ?? "Clear filters"}</span>
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Students Data Table */}
      {initialStudents.length === 0 ? (
        <Card>
          <CardBody className="py-12">
            <EmptyState
              icon="users"
              title={
                search || selectedGroup || selectedGrade || selectedStatus !== "all"
                  ? labels.noStudentsMatchFilters ?? "No students match the current filters."
                  : labels.noStudentsYet ?? "No students in this workspace yet."
              }
              description={
                search || selectedGroup || selectedGrade || selectedStatus !== "all"
                  ? labels.noStudentsMatchDesc ?? "Try adjusting your search terms or clearing active filters."
                  : labels.noStudentsYetDesc ?? "Add students manually or import an existing roster from a spreadsheet."
              }
              action={
                search || selectedGroup || selectedGrade || selectedStatus !== "all" ? (
                  <Button variant="secondary" onClick={handleClearFilters}>
                    {labels.clearFilters ?? "Clear Filters"}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setAddModalOpen(true)}>
                      <Icon name="plus" size={16} />
                      <span>{labels.addStudent ?? "Add Student"}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setImportStep("upload");
                        setAcknowledgeWarnings(false);
                        setImportModalOpen(true);
                      }}
                    >
                      <Icon name="file" size={16} />
                      <span>{labels.importSpreadsheet ?? "Import Spreadsheet"}</span>
                    </Button>
                  </div>
                )
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="ui-table-scroll bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden shadow-sm">
          <table className="ui-table w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-xs text-muted font-medium">
                <th className="py-3 px-4 text-start">{labels.student ?? "Student"}</th>
                <th className="py-3 px-4 text-start">{labels.groups ?? "Groups"}</th>
                <th className="py-3 px-4 text-start">{labels.grade ?? "Grade"}</th>
                <th className="py-3 px-4 text-start">{labels.attendanceRate ?? "Attendance"}</th>
                <th className="py-3 px-4 text-start">{labels.quizAverage ?? "Quiz Avg"}</th>
                <th className="py-3 px-4 text-start">{labels.phone ?? "Phone"}</th>
                <th className="py-3 px-4 text-start">{labels.parent ?? "Parent"}</th>
                <th className="py-3 px-4 text-start">{labels.status ?? "Status"}</th>
                <th className="py-3 px-4 text-end">{labels.actions ?? "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-sm">
              {initialStudents.map((student) => (
                <tr key={student.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={`${student.firstName} ${student.lastName}`}
                        size="sm"
                      />
                      <div>
                        <Link
                          href={`/app/students/${student.id}`}
                          className="font-semibold text-foreground hover:text-indigo-600 transition-colors"
                        >
                          {student.firstName} {student.lastName}
                        </Link>
                        {student.archivedAt && (
                          <span className="block text-xs text-muted">{labels.archivedMarker ?? "(Archived)"}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {student.groups.length > 0 ? (
                        student.groups.map((g) => (
                          <Badge key={g.id} tone="neutral" className="text-xs">
                            {g.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-muted">{student.grade || "—"}</td>

                  <td className="py-3 px-4">
                    {student.attendanceRate !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              student.attendanceRate >= 85
                                ? "bg-emerald-500"
                                : student.attendanceRate >= 70
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${student.attendanceRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{student.attendanceRate}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {student.quizAverage !== null ? (
                      <span className="text-xs font-semibold">{student.quizAverage}%</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {student.phoneE164 ? (
                      <a
                        href={`https://wa.me/${student.phoneE164.replace(/\+/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                      >
                        <Icon name="whatsapp" size={13} className="text-emerald-500" />
                        <span dir="ltr">{student.phoneE164}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {student.parentName || student.parentPhoneE164 ? (
                      <div className="text-xs">
                        <div className="font-medium text-foreground">{student.parentName || (labels.guardian ?? "Guardian")}</div>
                        {student.parentPhoneE164 && (
                          <a
                            href={`https://wa.me/${student.parentPhoneE164.replace(/\+/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-muted hover:text-indigo-600"
                          >
                            <Icon name="whatsapp" size={11} className="text-emerald-500" />
                            <span dir="ltr">{student.parentPhoneE164}</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4">{statusBadge(student.status)}</td>

                  <td className="py-3 px-4 text-end">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/app/students/${student.id}`}
                        className="ui-button"
                        data-variant="ghost"
                        data-size="sm"
                      >
                        <Icon name="eye" size={14} />
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingStudent(student);
                          setEditModalOpen(true);
                        }}
                      >
                        <Icon name="edit" size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchiveToggle(student)}
                      >
                        <Icon name={student.archivedAt ? "refresh" : "trash"} size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-2 text-sm text-muted">
          <div>
            {labels.pageInfo
              ? labels.pageInfo
                  .replace("{page}", String(currentPage))
                  .replace("{totalPages}", String(totalPages))
                  .replace("{total}", String(totalCount))
              : `Page ${currentPage} of ${totalPages} (${totalCount} students)`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => applyFilters({ page: String(currentPage - 1) })}
            >
              {labels.prevPage ?? "Previous"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => applyFilters({ page: String(currentPage + 1) })}
            >
              {labels.nextPage ?? "Next"}
            </Button>
          </div>
        </div>
      )}

      {/* ADD STUDENT MODAL */}
      <Dialog
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        trigger={<span className="hidden" />}
        title={labels.addStudentModalTitle ?? "Add New Student"}
        closeLabel={labels.close ?? "Close"}
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {duplicateWarning && (
            <Alert tone="warning" title={labels.duplicateWarningTitle ?? "Possible Duplicate Student"} icon="alert">
              <div className="space-y-2">
                <p className="text-xs">{duplicateWarning}</p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="confirmDuplicate"
                    name="confirmDuplicate"
                    value="true"
                    className="ui-checkbox"
                    required
                  />
                  <label htmlFor="confirmDuplicate" className="text-xs font-semibold cursor-pointer">
                    {labels.confirmDuplicateAddAnyway ?? "I confirm this is a distinct student, proceed with adding."}
                  </label>
                </div>
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label={labels.firstName ?? "First Name"} required>
              <Input name="firstName" required placeholder="e.g. أحمد" />
            </FormField>
            <FormField label={labels.lastName ?? "Last Name"} required>
              <Input name="lastName" required placeholder="e.g. محمود" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label={labels.grade ?? "Grade / Academic Level"}>
              <Input name="grade" placeholder="e.g. 1st Secondary / الصف الأول الثانوي" />
            </FormField>
            <FormField
              label={labels.phone ?? "Student Phone"}
              hint={labels.egyptianPhoneHint ?? "Egyptian mobile (010, 011, 012, 015) or international (+...)"}
            >
              <Input name="phone" placeholder="01012345678" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label={labels.parentName ?? "Guardian Name"}>
              <Input name="parentName" placeholder="e.g. ولي الأمر" />
            </FormField>
            <FormField label={labels.parentPhone ?? "Guardian Phone"}>
              <Input name="parentPhone" placeholder="01198765432" />
            </FormField>
          </div>

          {availableGroups.length > 0 && (
            <FormField label={labels.assignGroups ?? "Enroll in Groups"}>
              <div className="flex flex-wrap gap-2 pt-1">
                {availableGroups.map((group) => (
                  <label
                    key={group.id}
                    className="inline-flex items-center gap-1.5 p-2 rounded border border-[var(--color-border)] text-xs cursor-pointer hover:bg-[var(--color-surface-hover)]"
                  >
                    <input type="checkbox" name="groupIds" value={group.id} className="ui-checkbox" />
                    <span>{group.name}</span>
                  </label>
                ))}
              </div>
            </FormField>
          )}

          <FormField label={labels.internalNotes ?? "Internal Notes (Teacher Only)"}>
            <Textarea name="note" placeholder="Personal notes regarding student progress or context..." rows={2} />
          </FormField>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={() => setAddModalOpen(false)}>
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button variant="primary" type="submit" disabled={addFormPending}>
              {addFormPending ? labels.saving ?? "Saving..." : labels.save ?? "Save Student"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* EDIT STUDENT MODAL */}
      <Dialog
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        trigger={<span className="hidden" />}
        title={labels.editStudentModalTitle ?? "Edit Student"}
        closeLabel={labels.close ?? "Close"}
      >
        {editingStudent && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <input type="hidden" name="id" value={editingStudent.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label={labels.firstName ?? "First Name"} required>
                <Input name="firstName" defaultValue={editingStudent.firstName} required />
              </FormField>
              <FormField label={labels.lastName ?? "Last Name"} required>
                <Input name="lastName" defaultValue={editingStudent.lastName} required />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label={labels.grade ?? "Grade"}>
                <Input name="grade" defaultValue={editingStudent.grade ?? ""} />
              </FormField>
              <FormField label={labels.phone ?? "Student Phone"}>
                <Input name="phone" defaultValue={editingStudent.phoneE164 ?? ""} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label={labels.parentName ?? "Guardian Name"}>
                <Input name="parentName" defaultValue={editingStudent.parentName ?? ""} />
              </FormField>
              <FormField label={labels.parentPhone ?? "Guardian Phone"}>
                <Input name="parentPhone" defaultValue={editingStudent.parentPhoneE164 ?? ""} />
              </FormField>
            </div>

            {availableGroups.length > 0 && (
              <FormField label={labels.assignGroups ?? "Enrolled Groups"}>
                <div className="flex flex-wrap gap-2 pt-1">
                  {availableGroups.map((group) => {
                    const isEnrolled = editingStudent.groups.some((g) => g.id === group.id);
                    return (
                      <label
                        key={group.id}
                        className="inline-flex items-center gap-1.5 p-2 rounded border border-[var(--color-border)] text-xs cursor-pointer hover:bg-[var(--color-surface-hover)]"
                      >
                        <input
                          type="checkbox"
                          name="groupIds"
                          value={group.id}
                          defaultChecked={isEnrolled}
                          className="ui-checkbox"
                        />
                        <span>{group.name}</span>
                      </label>
                    );
                  })}
                </div>
              </FormField>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <Button variant="ghost" type="button" onClick={() => setEditModalOpen(false)}>
                {labels.cancel ?? "Cancel"}
              </Button>
              <Button variant="primary" type="submit" disabled={addFormPending}>
                {addFormPending ? labels.saving ?? "Saving..." : labels.saveChanges ?? "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* IMPORT MODAL */}
      <Dialog
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        trigger={<span className="hidden" />}
        title={labels.importModalTitle ?? "Import Students (CSV / XLSX)"}
        closeLabel={labels.close ?? "Close"}
      >
        <div className="space-y-4">
          {importError && <Alert tone="danger" title={importError} icon="alert" />}

          {importStep === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                {labels.importIntroText ??
                  "Upload a CSV or XLSX file containing your students roster. The system automatically detects columns in Arabic or English."}
              </p>

              <div className="p-4 border-2 border-dashed border-[var(--color-border)] rounded-lg text-center space-y-2">
                <Icon name="file" size={32} className="mx-auto text-muted" />
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  id="importSpreadsheetFile"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <label
                  htmlFor="importSpreadsheetFile"
                  className="ui-button cursor-pointer inline-block"
                  data-variant="secondary"
                >
                  {importFile ? importFile.name : labels.chooseFile ?? "Choose CSV or XLSX File"}
                </label>
                {importFile && (
                  <p className="text-xs text-muted">
                    {(importFile.size / 1024).toFixed(1)} KB — {importFile.name}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                <span className="text-xs text-muted">{labels.needTemplate ?? "Need a sample template?"}</span>
                <div className="flex gap-2">
                  <a
                    href="/api/students/template?format=csv"
                    download
                    className="ui-button text-xs"
                    data-variant="ghost"
                  >
                    CSV Template
                  </a>
                  <a
                    href="/api/students/template?format=xlsx"
                    download
                    className="ui-button text-xs"
                    data-variant="ghost"
                  >
                    Excel Template
                  </a>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
                  {labels.cancel ?? "Cancel"}
                </Button>
                <Button variant="primary" disabled={!importFile || importLoading} onClick={handlePreviewUpload}>
                  {importLoading ? labels.analyzing ?? "Analyzing..." : labels.uploadAndPreview ?? "Upload & Preview"}
                </Button>
              </div>
            </div>
          )}

          {importStep === "preview" && importPreview && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Summary of findings */}
              <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-[var(--color-surface-subtle)] rounded">
                  <div className="font-semibold text-sm">{importPreview.totalRows}</div>
                  <div className="text-muted">{labels.totalRows ?? "Total Rows"}</div>
                </div>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded text-emerald-700 dark:text-emerald-400">
                  <div className="font-semibold text-sm">{importPreview.validRows}</div>
                  <div>{labels.validRows ?? "Valid Rows"}</div>
                </div>
                <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded text-rose-700 dark:text-rose-400">
                  <div className="font-semibold text-sm">{importPreview.errorRows}</div>
                  <div>{labels.skippedRows ?? "Errors/Skipped"}</div>
                </div>
              </div>

              {importPreview.sourceEncoding === "windows-1256" && (
                <Alert
                  tone="info"
                  title={labels.encodingConvertedNotice ?? "Windows-1256 file converted to UTF-8."}
                  icon="alert"
                />
              )}

              {/* Group Mappings */}
              {importPreview.detectedGroups.length > 0 && (
                <div className="space-y-2 p-3 bg-[var(--color-surface-subtle)] rounded border border-[var(--color-border)]">
                  <div className="text-xs font-semibold">{labels.detectedGroupsMapping ?? "Group Mappings"}:</div>
                  <div className="space-y-2">
                    {importPreview.detectedGroups.map((gName) => (
                      <div key={gName} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                        <span className="font-medium">{gName}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={importGroupMappings[gName]?.action ?? "create"}
                            onChange={(e) => {
                              const action = e.target.value as "create" | "map" | "ignore";
                              setImportGroupMappings((prev) => ({
                                ...prev,
                                [gName]: { ...prev[gName], action },
                              }));
                            }}
                            className="ui-select text-xs py-0.5"
                          >
                            <option value="create">{labels.createNewGroup ?? "Create New Group"}</option>
                            <option value="map">{labels.mapToExistingGroup ?? "Map to Existing"}</option>
                            <option value="ignore">{labels.ignoreGroup ?? "Do not assign"}</option>
                          </select>

                          {importGroupMappings[gName]?.action === "map" && (
                            <select
                              value={importGroupMappings[gName]?.targetGroupId ?? ""}
                              onChange={(e) => {
                                const targetGroupId = e.target.value;
                                setImportGroupMappings((prev) => ({
                                  ...prev,
                                  [gName]: { ...prev[gName], targetGroupId },
                                }));
                              }}
                              className="ui-select text-xs py-0.5"
                            >
                              <option value="">{labels.selectGroup ?? "-- Select Group --"}</option>
                              {availableGroups.map((ag) => (
                                <option key={ag.id} value={ag.id}>
                                  {ag.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Mode */}
              <div className="p-3 border border-[var(--color-border)] rounded text-xs space-y-2">
                <div className="font-semibold">{labels.importMode ?? "Import Strategy"}:</div>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="all_or_nothing"
                      checked={importMode === "all_or_nothing"}
                      onChange={() => setImportMode("all_or_nothing")}
                    />
                    <span>{labels.allOrNothing ?? "All or Nothing (Strict)"}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="valid_only"
                      checked={importMode === "valid_only"}
                      onChange={() => setImportMode("valid_only")}
                    />
                    <span>{labels.validOnly ?? "Import Valid Rows Only"}</span>
                  </label>
                </div>
              </div>

              {importNameOnlyCount > 0 && (
                <div className="p-3 border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 rounded text-xs space-y-2">
                  <div className="font-semibold text-amber-800 dark:text-amber-300">
                    {labels.nameOnlyMatchWarning ?? "Name-only matches need review"} ({importNameOnlyCount})
                  </div>
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeWarnings}
                      onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{labels.warningsAcknowledged ?? "I reviewed the name-only matches"}</span>
                  </label>
                </div>
              )}

              {/* Rows preview table */}
              <div className="max-h-48 overflow-y-auto border border-[var(--color-border)] rounded text-xs">
                <table className="w-full text-start divide-y divide-[var(--color-border)]">
                  <thead className="bg-[var(--color-surface-subtle)] sticky top-0">
                    <tr>
                      <th className="p-2 text-start">#</th>
                      <th className="p-2 text-start">{labels.name ?? "Name"}</th>
                      <th className="p-2 text-start">{labels.phone ?? "Phone"}</th>
                      <th className="p-2 text-start">{labels.group ?? "Group"}</th>
                      <th className="p-2 text-start">{labels.action ?? "Action"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {importPreview.rows.slice(0, 50).map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.errors.length > 0
                            ? "bg-rose-50/50 dark:bg-rose-950/20"
                            : row.action === "update"
                            ? "bg-amber-50/50 dark:bg-amber-950/20"
                            : ""
                        }
                      >
                        <td className="p-2 text-muted">{row.rowNumber}</td>
                        <td className="p-2 font-medium">
                          {row.firstName} {row.lastName}
                        </td>
                        <td className="p-2" dir="ltr">
                          {row.phone || "—"}
                        </td>
                        <td className="p-2">{row.groupName || "—"}</td>
                        <td className="p-2">
                          {row.errors.length > 0 ? (
                            <Badge tone="danger">{labels[row.errors[0]] ?? row.errors[0]}</Badge>
                          ) : row.action === "update" ? (
                            <Badge tone="warn">{labels.actionUpdate ?? "Update"}</Badge>
                          ) : (
                            <Badge tone="success">{labels.actionCreate ?? "Create"}</Badge>
                          )}
                          {row.warnings.map((warning) => (
                            <div key={warning} className="mt-1">
                              <Badge tone="warn">{labels[warning] ?? warning}</Badge>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setImportStep("upload")}>
                    {labels.back ?? "Back"}
                  </Button>
                  {importPreview.errorRows > 0 ? (
                    <Button variant="ghost" onClick={downloadErrorReport}>
                      {labels.downloadErrorReport ?? "Download error report"}
                    </Button>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  disabled={
                    importLoading ||
                    (importMode === "all_or_nothing" && importPreview.errorRows > 0) ||
                    (importNameOnlyCount > 0 && !acknowledgeWarnings)
                  }
                  onClick={handleCommitImport}
                >
                  {importLoading
                    ? labels.committing ?? "Importing..."
                    : labels.commitImport ?? `Commit Import (${importPreview.validRows} students)`}
                </Button>
              </div>
            </div>
          )}

          {importStep === "done" && importResult && (
            <div className="space-y-4 py-4 text-center">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Icon name="check" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{labels.importCompletedTitle ?? "Import Complete!"}</h3>
                <p className="text-sm text-muted mt-1">
                  {labels.importSummary
                    ? labels.importSummary
                        .replace("{created}", String(importResult.createdCount))
                        .replace("{updated}", String(importResult.updatedCount))
                        .replace("{skipped}", String(importResult.skippedCount))
                    : `Created ${importResult.createdCount} students, updated ${importResult.updatedCount} students, skipped ${importResult.skippedCount}.`}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                {importPreview && importPreview.errorRows > 0 ? (
                  <Button variant="secondary" onClick={downloadErrorReport}>
                    {labels.downloadErrorReport ?? "Download error report"}
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => {
                    setImportModalOpen(false);
                    router.refresh();
                  }}
                >
                  {labels.done ?? "Done"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* EXPORT DIALOG */}
      <Dialog
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        trigger={<span className="hidden" />}
        title={labels.exportModalTitle ?? "Export Students Roster"}
        closeLabel={labels.close ?? "Close"}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {labels.exportDescription ??
              "Download your current student list. Export files are protected against spreadsheet formula injection."}
          </p>

          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 pt-2">
            <a
              href={`/api/students/export?format=csv&locale=${locale}${
                selectedGroup ? `&groupId=${selectedGroup}` : ""
              }${selectedGrade ? `&grade=${selectedGrade}` : ""}${
                selectedStatus !== "all" ? `&status=${selectedStatus}` : ""
              }${showArchived ? "&showArchived=true" : ""}`}
              download
              className="ui-card p-4 text-center hover:border-indigo-500 transition-colors block"
              onClick={() => setExportModalOpen(false)}
            >
              <Icon name="file" size={24} className="mx-auto mb-2 text-indigo-600" />
              <div className="font-semibold text-sm">CSV</div>
              <div className="text-xs text-muted">UTF-8 with BOM</div>
            </a>

            <a
              href={`/api/students/export?format=xlsx&locale=${locale}${
                selectedGroup ? `&groupId=${selectedGroup}` : ""
              }${selectedGrade ? `&grade=${selectedGrade}` : ""}${
                selectedStatus !== "all" ? `&status=${selectedStatus}` : ""
              }${showArchived ? "&showArchived=true" : ""}`}
              download
              className="ui-card p-4 text-center hover:border-indigo-500 transition-colors block"
              onClick={() => setExportModalOpen(false)}
            >
              <Icon name="table" size={24} className="mx-auto mb-2 text-emerald-600" />
              <div className="font-semibold text-sm">Excel (.xlsx)</div>
              <div className="text-xs text-muted">Native Excel Workbook</div>
            </a>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
