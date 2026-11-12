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
import { Stat } from "@/components/ui/stat";
import { Link } from "@/i18n/navigation";
import {
  archiveStudentAction,
  createStudentAction,
  restoreStudentAction,
  updateStudentAction,
} from "@/app/actions/students";
import type { StudentListItem, StudentDerivedStatus } from "@/modules/students/repository";
import type { ImportPreviewResult } from "@/modules/students/adapters/spreadsheet";
import { PortalCredentialReveal, type OneTimeCredential } from "./portal-credential-reveal";

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
  // The teacher-generated password is shown once, right after creation.
  const [oneTimeCredential, setOneTimeCredential] = useState<OneTimeCredential | null>(null);

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
      if (result.oneTimeCredential) {
        setOneTimeCredential(result.oneTimeCredential);
      } else {
        setStatusMessage({ text: labels.createdSuccess ?? "Student created successfully.", tone: "success" });
      }
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

  const share = (value: number) =>
    summary.total > 0 ? Math.round((value / summary.total) * 100) : 0;
  const shareHint = (value: number) =>
    (labels.kpiShare ?? "{{percent}}% of listed students").replace("{{percent}}", String(share(value)));

  function attendanceTone(rate: number): "success" | "warn" | "danger" {
    if (rate >= 85) return "success";
    if (rate >= 70) return "warn";
    return "danger";
  }

  function toggleArchived() {
    const next = !showArchived;
    const nextStatus = !next && selectedStatus === "archived" ? "all" : selectedStatus;
    setShowArchived(next);
    setSelectedStatus(nextStatus);
    applyFilters({ showArchived: next, status: nextStatus });
  }

  return (
    <div className="app-page">
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

      {/* Real KPI filters. Every percentage is computed from the records in view. */}
      <div className="app-kpi-grid">
        <Stat
          label={labels.totalStudents ?? "Total students"}
          value={summary.total}
          hint={labels.kpiTotalHint ?? "Students in this view"}
          icon="users"
          variant="invert"
          pressed={selectedStatus === "all"}
          onClick={() => {
            setSelectedStatus("all");
            applyFilters({ status: "all" });
          }}
        />
        <Stat
          label={labels.statusActive ?? "Active"}
          value={summary.active}
          hint={shareHint(summary.active)}
          icon="checkCircle"
          tone="success"
          pressed={selectedStatus === "active"}
          onClick={() => {
            setSelectedStatus("active");
            applyFilters({ status: "active" });
          }}
        />
        <Stat
          label={labels.statusAtRisk ?? "At risk"}
          value={summary.atRisk}
          hint={shareHint(summary.atRisk)}
          icon="alert"
          tone="warn"
          pressed={selectedStatus === "at_risk"}
          onClick={() => {
            setSelectedStatus("at_risk");
            applyFilters({ status: "at_risk" });
          }}
        />
        <Stat
          label={labels.statusInactive ?? "Inactive"}
          value={summary.inactive}
          hint={shareHint(summary.inactive)}
          icon="clock"
          tone="muted"
          pressed={selectedStatus === "inactive"}
          onClick={() => {
            setSelectedStatus("inactive");
            applyFilters({ status: "inactive" });
          }}
        />
      </div>

      {/* Action bar, search, and filters */}
      <Card>
        <CardBody>
          <div className="app-toolbar">
            <div className="app-toolbar-row">
              <form onSubmit={handleSearchSubmit} className="app-toolbar-search" role="search">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={labels.searchPlaceholder ?? "Search by name or phone"}
                  aria-label={labels.searchPlaceholder ?? "Search by name or phone"}
                />
                <Button type="submit" variant="secondary">
                  <Icon name="search" size={16} />
                  <span>{labels.search ?? "Search"}</span>
                </Button>
              </form>

              <div className="app-toolbar-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    setDuplicateWarning(null);
                    setAddModalOpen(true);
                  }}
                >
                  <Icon name="plus" size={16} />
                  <span>{labels.addStudent ?? "Add student"}</span>
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

            <div className="app-filter-row">
              <label className="app-filter">
                <span>{labels.filterByGroup ?? "Group"}</span>
                <select
                  value={selectedGroup}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    applyFilters({ groupId: e.target.value });
                  }}
                  className="ui-select"
                >
                  <option value="">{labels.allGroups ?? "All groups"}</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>

              {availableGrades.length > 0 ? (
                <label className="app-filter">
                  <span>{labels.filterByGrade ?? "Grade"}</span>
                  <select
                    value={selectedGrade}
                    onChange={(e) => {
                      setSelectedGrade(e.target.value);
                      applyFilters({ grade: e.target.value });
                    }}
                    className="ui-select"
                  >
                    <option value="">{labels.allGrades ?? "All grades"}</option>
                    {availableGrades.map((gr) => (
                      <option key={gr} value={gr}>
                        {gr}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="app-toolbar-actions">
                <button
                  type="button"
                  className="app-archived-toggle"
                  data-pressed={showArchived}
                  aria-pressed={showArchived}
                  onClick={toggleArchived}
                >
                  <Icon name="file" size={15} />
                  <span>
                    {showArchived
                      ? labels.hideArchived ?? "Hide archived"
                      : labels.showArchived ?? "Show archived"}
                  </span>
                </button>
                {search || selectedGroup || selectedGrade || selectedStatus !== "all" || showArchived ? (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                    <Icon name="x" size={14} />
                    <span>{labels.clearFilters ?? "Clear filters"}</span>
                  </Button>
                ) : null}
              </div>
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
        <div className="app-table-card">
          <div
            className="ui-table-scroll"
            role="region"
            aria-label={labels.tableLabel ?? "Students table"}
            tabIndex={0}
          >
            <table className="ui-table">
              <caption className="ui-visually-hidden">
                {labels.tableLabel ?? "Students table"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{labels.student ?? "Student"}</th>
                  <th scope="col">{labels.groups ?? "Groups"}</th>
                  <th scope="col">{labels.grade ?? "Grade"}</th>
                  <th scope="col">{labels.attendanceRate ?? "Attendance"}</th>
                  <th scope="col">{labels.quizAverage ?? "Quiz average"}</th>
                  <th scope="col">{labels.phone ?? "Phone"}</th>
                  <th scope="col">{labels.parent ?? "Parent"}</th>
                  <th scope="col">{labels.status ?? "Status"}</th>
                  <th scope="col" className="ui-table-cell-end">
                    {labels.actions ?? "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <span className="app-person">
                        <Avatar name={`${student.firstName} ${student.lastName}`} size="sm" />
                        <span className="app-person-text">
                          <Link
                            href={`/app/students/${student.id}`}
                            className="app-student-link"
                          >
                            {student.firstName} {student.lastName}
                          </Link>
                          {student.archivedAt ? (
                            <span className="app-student-meta">
                              {labels.archivedMarker ?? "Archived"}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>

                    <td>
                      <span className="app-group-chips">
                        {student.groups.length > 0 ? (
                          student.groups.map((g) => (
                            <Badge key={g.id} tone="neutral">
                              {g.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="app-muted">—</span>
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="app-muted">{student.grade || "—"}</span>
                    </td>

                    <td>
                      {student.attendanceRate !== null ? (
                        <span className="app-meter-row">
                          <span
                            className="app-meter"
                            data-tone={attendanceTone(student.attendanceRate)}
                            aria-hidden="true"
                          >
                            <span style={{ inlineSize: `${student.attendanceRate}%` }} />
                          </span>
                          <span className="app-meter-value">{student.attendanceRate}%</span>
                        </span>
                      ) : (
                        <span className="app-muted">—</span>
                      )}
                    </td>

                    <td>
                      {student.quizAverage !== null ? (
                        <span className="app-meter-value">{student.quizAverage}%</span>
                      ) : (
                        <span className="app-muted">—</span>
                      )}
                    </td>

                    <td>
                      {student.phoneE164 ? (
                        <a
                          href={`https://wa.me/${student.phoneE164.replace(/\+/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="app-whatsapp"
                        >
                          <Icon name="whatsapp" size={13} />
                          <span dir="ltr">{student.phoneE164}</span>
                        </a>
                      ) : (
                        <span className="app-muted">—</span>
                      )}
                    </td>

                    <td>
                      {student.parentName || student.parentPhoneE164 ? (
                        <span className="app-person-text">
                          <span className="app-person-name">
                            {student.parentName || (labels.guardian ?? "Guardian")}
                          </span>
                          {student.parentPhoneE164 ? (
                            <a
                              href={`https://wa.me/${student.parentPhoneE164.replace(/\+/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="app-whatsapp"
                            >
                              <Icon name="whatsapp" size={11} />
                              <span dir="ltr">{student.parentPhoneE164}</span>
                            </a>
                          ) : null}
                        </span>
                      ) : (
                        <span className="app-muted">—</span>
                      )}
                    </td>

                    <td>{statusBadge(student.status)}</td>

                    <td className="ui-table-cell-end">
                      <span className="app-row-actions">
                        <Link
                          href={`/app/students/${student.id}`}
                          className="ui-button"
                          data-variant="ghost"
                          data-size="icon-sm"
                          aria-label={`${labels.viewStudent ?? "View student"}: ${student.firstName} ${student.lastName}`}
                        >
                          <Icon name="eye" size={15} />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${labels.editStudent ?? "Edit"}: ${student.firstName} ${student.lastName}`}
                          onClick={() => {
                            setEditingStudent(student);
                            setEditModalOpen(true);
                          }}
                        >
                          <Icon name="edit" size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            student.archivedAt
                              ? `${labels.restoreStudent ?? "Restore"}: ${student.firstName} ${student.lastName}`
                              : `${labels.archiveStudent ?? "Archive"}: ${student.firstName} ${student.lastName}`
                          }
                          onClick={() => handleArchiveToggle(student)}
                        >
                          <Icon name={student.archivedAt ? "refresh" : "trash"} size={15} />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="app-pagination">
          <div>
            {labels.pageInfo
              ? labels.pageInfo
                  .replace("{page}", String(currentPage))
                  .replace("{totalPages}", String(totalPages))
                  .replace("{total}", String(totalCount))
              : `Page ${currentPage} of ${totalPages} (${totalCount} students)`}
          </div>
          <div className="app-pagination-actions">
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

      <PortalCredentialReveal
        credential={oneTimeCredential}
        onClose={() => setOneTimeCredential(null)}
      />
    </div>
  );
}
