"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { FormField, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import {
  archiveGroupAction,
  createGroupAction,
  restoreGroupAction,
  updateGroupAction,
} from "@/app/actions/groups";
import type { GroupListItem } from "@/modules/groups/repository";
import { GROUP_COLOR_PALETTE, type GroupColor } from "@/modules/groups/schemas";
import {
  SlotsEditor,
  DEFAULT_SLOT_FORM_VALUE,
  slotFormValueFromSlot,
  slotFormValuesToJson,
  type SlotFormValue,
} from "@/components/groups/slots-editor";

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-800",
    bar: "bg-indigo-600 dark:bg-indigo-500",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    bar: "bg-emerald-600 dark:bg-emerald-500",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    bar: "bg-amber-600 dark:bg-amber-500",
  },
  rose: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
    bar: "bg-rose-600 dark:bg-rose-500",
  },
  sky: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-800",
    bar: "bg-sky-600 dark:bg-sky-500",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
    bar: "bg-violet-600 dark:bg-violet-500",
  },
  teal: {
    bg: "bg-teal-50 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-800",
    bar: "bg-teal-600 dark:bg-teal-500",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    bar: "bg-orange-600 dark:bg-orange-500",
  },
};

const WEEKDAY_NAMES_AR = [
  "السبت",
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

const WEEKDAY_NAMES_EN = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

type GroupsClientProps = {
  initialGroups: GroupListItem[];
  availableSubjects: Array<{ id: string; name: string }>;
  availableGrades: string[];
  currentQuery: {
    search?: string;
    subjectId?: string;
    grade?: string;
    weekday?: number;
    showArchived?: boolean;
  };
  locale: string;
  labels: Record<string, string>;
};

export function GroupsClient({
  initialGroups,
  availableSubjects,
  availableGrades,
  currentQuery,
  locale,
  labels,
}: GroupsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAr = locale === "ar";
  const weekdayNames = isAr ? WEEKDAY_NAMES_AR : WEEKDAY_NAMES_EN;

  // Filter state
  const [search, setSearch] = useState(currentQuery.search ?? "");
  const [selectedSubject, setSelectedSubject] = useState(currentQuery.subjectId ?? "");
  const [selectedGrade, setSelectedGrade] = useState(currentQuery.grade ?? "");
  const [selectedWeekday, setSelectedWeekday] = useState<string>(
    currentQuery.weekday !== undefined ? String(currentQuery.weekday) : "",
  );
  const [showArchived, setShowArchived] = useState(currentQuery.showArchived ?? false);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupListItem | null>(null);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addSubjectId, setAddSubjectId] = useState("");
  const [addSubjectName, setAddSubjectName] = useState("");
  const [addGrade, setAddGrade] = useState("");
  const [addSlots, setAddSlots] = useState<SlotFormValue[]>([{ ...DEFAULT_SLOT_FORM_VALUE }]);
  const [addColor, setAddColor] = useState<GroupColor>("indigo");
  const [addNote, setAddNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [ignoreConflict, setIgnoreConflict] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editSubjectId, setEditSubjectId] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editSlots, setEditSlots] = useState<SlotFormValue[]>([{ ...DEFAULT_SLOT_FORM_VALUE }]);
  const [editColor, setEditColor] = useState<GroupColor>("indigo");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  function applyFilters(newOverrides: Partial<{
    search: string;
    subjectId: string;
    grade: string;
    weekday: string;
    showArchived: boolean;
  }> = {}) {
    const params = new URLSearchParams();
    const effectiveSearch = newOverrides.search !== undefined ? newOverrides.search : search;
    const effectiveSubject = newOverrides.subjectId !== undefined ? newOverrides.subjectId : selectedSubject;
    const effectiveGrade = newOverrides.grade !== undefined ? newOverrides.grade : selectedGrade;
    const effectiveWeekday = newOverrides.weekday !== undefined ? newOverrides.weekday : selectedWeekday;
    const effectiveArchived = newOverrides.showArchived !== undefined ? newOverrides.showArchived : showArchived;

    if (effectiveSearch.trim()) params.set("search", effectiveSearch.trim());
    if (effectiveSubject) params.set("subjectId", effectiveSubject);
    if (effectiveGrade) params.set("grade", effectiveGrade);
    if (effectiveWeekday !== "") params.set("weekday", effectiveWeekday);
    if (effectiveArchived) params.set("showArchived", "true");

    startTransition(() => {
      router.push(`/${locale}/app/groups?${params.toString()}`);
    });
  }

  function handleResetFilters() {
    setSearch("");
    setSelectedSubject("");
    setSelectedGrade("");
    setSelectedWeekday("");
    setShowArchived(false);
    startTransition(() => {
      router.push(`/${locale}/app/groups`);
    });
  }

  function openEditModal(group: GroupListItem) {
    setEditingGroup(group);
    setEditName(group.name);
    setEditSubjectId(group.subject?.id ?? "");
    setEditGrade(group.grade ?? "");
    setEditSlots(
      group.slots.length > 0
        ? group.slots.map(slotFormValueFromSlot)
        : [{ ...DEFAULT_SLOT_FORM_VALUE }],
    );
    setEditColor((group.color as GroupColor) || "indigo");
    setEditNote(group.teacherNote ?? "");
    setEditError(null);
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    const formData = new FormData();
    formData.set("name", addName);
    if (addSubjectId === "new") {
      formData.set("subjectName", addSubjectName);
    } else if (addSubjectId) {
      formData.set("subjectId", addSubjectId);
    }
    formData.set("grade", addGrade);
    formData.set("color", addColor);
    formData.set("slots", slotFormValuesToJson(addSlots));
    if (addNote) formData.set("teacherNote", addNote);
    if (ignoreConflict) formData.set("ignoreConflicts", "true");

    startTransition(async () => {
      const res = await createGroupAction(undefined, formData);
      if (res.status === "error") {
        if (res.fieldErrors?.hasConflict?.[0] === "true") {
          const conflictName = res.fieldErrors?.conflictingGroupName?.[0] || "";
          setConflictWarning(
            labels.conflictDetectedWithName
              ? labels.conflictDetectedWithName.replace("{name}", conflictName)
              : `Schedule slot overlaps with group: ${conflictName}`,
          );
        } else {
          const slotError = res.fieldErrors?.slots?.[0];
          const knownSlotError =
            slotError === "slotOverlapsSameGroup" || slotError === "atLeastOneScheduleSlot"
              ? labels[slotError]
              : undefined;
          const key = res.errorKey ?? "errors.generic";
          setAddError(knownSlotError ?? labels[key] ?? key);
        }
      } else {
        setIsAddOpen(false);
        setConflictWarning(null);
        setIgnoreConflict(false);
        resetAddForm();
        router.refresh();
      }
    });
  }

  function resetAddForm() {
    setAddName("");
    setAddSubjectId("");
    setAddSubjectName("");
    setAddGrade("");
    setAddSlots([{ ...DEFAULT_SLOT_FORM_VALUE }]);
    setAddColor("indigo");
    setAddNote("");
    setAddError(null);
    setConflictWarning(null);
    setIgnoreConflict(false);
  }

  async function handleUpdateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGroup) return;
    setEditError(null);

    const formData = new FormData();
    formData.set("id", editingGroup.id);
    formData.set("name", editName);
    if (editSubjectId) formData.set("subjectId", editSubjectId);
    formData.set("grade", editGrade);
    formData.set("color", editColor);
    formData.set("slots", slotFormValuesToJson(editSlots));
    if (editNote) formData.set("teacherNote", editNote);

    startTransition(async () => {
      const res = await updateGroupAction(undefined, formData);
      if (res.status === "error") {
        const slotError = res.fieldErrors?.slots?.[0];
        const knownSlotError =
          slotError === "slotOverlapsSameGroup" || slotError === "atLeastOneScheduleSlot"
            ? labels[slotError]
            : undefined;
        const key = res.errorKey ?? "errors.generic";
        setEditError(knownSlotError ?? labels[key] ?? key);
      } else {
        setEditingGroup(null);
        router.refresh();
      }
    });
  }

  async function handleArchiveToggle(group: GroupListItem) {
    startTransition(async () => {
      if (group.archivedAt) {
        await restoreGroupAction(group.id);
      } else {
        await archiveGroupAction(group.id);
      }
      router.refresh();
    });
  }

  const hasActiveFilters = Boolean(
    search.trim() || selectedSubject || selectedGrade || selectedWeekday !== "" || showArchived,
  );

  return (
    <div className="space-y-6">
      {/* Top action & filter bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1 max-w-md">
              <Input
                type="search"
                placeholder={labels.searchPlaceholder ?? "Search groups, room, grade..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters({ search });
                  }
                }}
                className="w-full"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => applyFilters({ search })}
              disabled={isPending}
            >
              <Icon name="search" size="sm" className="me-1.5" />
              {labels.search ?? "Search"}
            </Button>
          </div>

          <div className="flex gap-2 items-center">
            <Button variant="primary" onClick={() => setIsAddOpen(true)}>
              <Icon name="plus" size="sm" className="me-1.5" />
              {labels.createGroup ?? "Create Group"}
            </Button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {/* Subject Filter */}
          <div className="w-40">
            <Select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                applyFilters({ subjectId: e.target.value });
              }}
            >
              <option value="">{labels.allSubjects ?? "All subjects"}</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Grade Filter */}
          <div className="w-36">
            <Select
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                applyFilters({ grade: e.target.value });
              }}
            >
              <option value="">{labels.allGrades ?? "All grades"}</option>
              {availableGrades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          {/* Weekday Filter */}
          <div className="w-36">
            <Select
              value={selectedWeekday}
              onChange={(e) => {
                setSelectedWeekday(e.target.value);
                applyFilters({ weekday: e.target.value });
              }}
            >
              <option value="">{labels.allDays ?? "All days"}</option>
              {weekdayNames.map((name, idx) => (
                <option key={idx} value={String(idx)}>
                  {name}
                </option>
              ))}
            </Select>
          </div>

          {/* Show Archived Checkbox */}
          <label className="flex items-center gap-1.5 ms-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={showArchived}
              onChange={(e) => {
                const checked = e.target.checked;
                setShowArchived(checked);
                applyFilters({ showArchived: checked });
              }}
            />
            <span>{labels.showArchived ?? "Show archived"}</span>
          </label>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="ms-auto text-xs"
            >
              <Icon name="x" size="xs" className="me-1" />
              {labels.clearFilters ?? "Clear filters"}
            </Button>
          )}
        </div>
      </div>

      {/* Groups Grid */}
      {initialGroups.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title={labels.noGroupsMatchFilters ?? "No groups match your filters"}
            description={
              labels.noGroupsMatchDesc ??
              "Try clearing some filters or searching with a different term."
            }
            action={
              <Button variant="secondary" onClick={handleResetFilters}>
                {labels.clearFilters ?? "Clear filters"}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={labels.noGroupsYet ?? "No teaching groups yet"}
            description={
              labels.noGroupsYetDesc ??
              "Create groups to organise your students by subject, grade level, and weekly schedule."
            }
            action={
              <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                <Icon name="plus" size="sm" className="me-1.5" />
                {labels.createGroup ?? "Create Group"}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialGroups.map((group) => {
            const styles = COLOR_STYLES[group.color] ?? COLOR_STYLES.indigo;
            const slotCapacities = group.slots
              .map((slot) => slot.capacity)
              .filter((capacity): capacity is number => capacity !== null);
            const isFull =
              slotCapacities.length > 0 && group.enrolledCount >= Math.min(...slotCapacities);

            return (
              <Card
                key={group.id}
                className={`relative overflow-hidden transition-all hover:shadow-md border ${
                  group.archivedAt ? "opacity-60 bg-muted/30" : ""
                }`}
              >
                {/* Top Color Bar Accent */}
                <div className={`h-1.5 w-full ${styles.bar}`} />

                <CardBody className="p-4 space-y-3">
                  {/* Subject, Grade, and Badges row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {group.subject && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.bg} ${styles.text}`}
                        >
                          {group.subject.name}
                        </span>
                      )}
                      {group.grade && (
                        <Badge variant="outline" className="text-xs">
                          {group.grade}
                        </Badge>
                      )}
                    </div>
                    {group.archivedAt ? (
                      <Badge variant="destructive" className="text-xs">
                        {labels.statusArchived ?? "Archived"}
                      </Badge>
                    ) : isFull ? (
                      <Badge variant="warning" className="text-xs">
                        {labels.capacityFull ?? "Full"}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Group Name */}
                  <h3 className="font-semibold text-base leading-snug">
                    <Link
                      href={`/app/groups/${group.id}`}
                      className="hover:underline hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded"
                    >
                      {group.name}
                    </Link>
                  </h3>

                  {/* Schedule slots: one line per weekly slot */}
                  <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Icon name="clock" size="xs" className="shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      {group.slots.map((slot) => (
                        <span key={slot.id} className="block">
                          {weekdayNames[slot.weekday] ?? ""} • {slot.startTime}
                          {slot.endTime ? ` - ${slot.endTime}` : ""}
                          {slot.room ? ` · ${slot.room}` : ""}
                          {slot.capacity !== null ? ` · ${slot.capacity}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Enrolled Students & Capacity */}
                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon name="users" size="xs" className="text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {group.enrolledCount}
                      </span>
                      <span className="text-muted-foreground">
                        {labels.students ?? "students"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => openEditModal(group)}
                        title={labels.edit ?? "Edit"}
                      >
                        <Icon name="edit" size="xs" />
                      </Button>
                      <Link href={`/app/groups/${group.id}`}>
                        <Button variant="ghost" size="xs" title={labels.view ?? "View"}>
                          <Icon name="arrow-right" size="xs" className="rtl:rotate-180" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE GROUP MODAL */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          resetAddForm();
        }}
        title={labels.createGroupTitle ?? "Create New Group"}
        size="lg"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          {addError && <Alert variant="error" description={addError} />}

          {conflictWarning && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <Icon name="alert" size={16} className="text-amber-600" />
                <span>{labels.conflictWarningTitle ?? "Schedule Conflict Detected"}</span>
              </div>
              <p className="text-xs">{conflictWarning}</p>
              <label className="flex items-center gap-2 pt-1 cursor-pointer font-normal text-xs">
                <Checkbox
                  checked={ignoreConflict}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIgnoreConflict(e.target.checked)}
                />
                <span>{labels.ignoreConflictCheckbox ?? "Schedule anyway (allow slot overlap)"}</span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={labels.groupName ?? "Group Name"} required>
              <Input
                required
                value={addName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddName(e.target.value)}
                placeholder={isAr ? "مثال: مجموعة التفوق - فيزياء" : "e.g. Physics Honors A"}
              />
            </FormField>

            <FormField label={labels.subject ?? "Subject"}>
              <Select
                value={addSubjectId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddSubjectId(e.target.value)}
              >
                <option value="">{labels.selectSubject ?? "Select subject (optional)"}</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="new">{labels.addNewSubject ?? "+ Add new subject..."}</option>
              </Select>
            </FormField>
          </div>

          {addSubjectId === "new" && (
            <FormField label={labels.newSubjectName ?? "New Subject Name"} required>
              <Input
                required
                value={addSubjectName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddSubjectName(e.target.value)}
                placeholder={isAr ? "مثال: الكيمياء العضوية" : "e.g. Chemistry"}
              />
            </FormField>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={labels.gradeLevel ?? "Grade / Academic Level"}>
              <Input
                value={addGrade}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddGrade(e.target.value)}
                placeholder={isAr ? "مثال: الصف الثالث الثانوي" : "e.g. 3rd Secondary"}
              />
            </FormField>

            {/* Color Swatch Picker */}
            <FormField label={labels.color ?? "Color Theme"}>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {GROUP_COLOR_PALETTE.map((color) => {
                  const style = COLOR_STYLES[color];
                  const isSelected = addColor === color;
                  return (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setAddColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform ${style.bar} ${
                        isSelected ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                      }`}
                      aria-label={color}
                    />
                  );
                })}
              </div>
            </FormField>
          </div>

          {/* Schedule slots: weekday + time + room + capacity per slot */}
          <SlotsEditor
            slots={addSlots}
            onChange={setAddSlots}
            labels={labels}
            weekdayNames={weekdayNames}
          />

          <FormField label={labels.teacherNote ?? "Private Teacher Notes"}>
            <Textarea
              rows={2}
              value={addNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAddNote(e.target.value)}
              placeholder={labels.teacherNotePlaceholder ?? "Notes visible only to teacher and staff..."}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsAddOpen(false);
                resetAddForm();
              }}
            >
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (labels.saving ?? "Saving...") : (labels.save ?? "Save Group")}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* EDIT GROUP MODAL */}
      <Dialog
        isOpen={Boolean(editingGroup)}
        onClose={() => setEditingGroup(null)}
        title={labels.editGroupTitle ?? "Edit Group"}
        size="lg"
      >
        <form onSubmit={handleUpdateGroup} className="space-y-4">
          {editError && <Alert variant="error" description={editError} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={labels.groupName ?? "Group Name"} required>
              <Input
                required
                value={editName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
              />
            </FormField>

            <FormField label={labels.subject ?? "Subject"}>
              <Select
                value={editSubjectId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditSubjectId(e.target.value)}
              >
                <option value="">{labels.selectSubject ?? "Select subject"}</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={labels.gradeLevel ?? "Grade / Academic Level"}>
              <Input
                value={editGrade}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditGrade(e.target.value)}
              />
            </FormField>

            {/* Color Swatch Picker */}
            <FormField label={labels.color ?? "Color Theme"}>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {GROUP_COLOR_PALETTE.map((color) => {
                  const style = COLOR_STYLES[color];
                  const isSelected = editColor === color;
                  return (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform ${style.bar} ${
                        isSelected ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                      }`}
                      aria-label={color}
                    />
                  );
                })}
              </div>
            </FormField>
          </div>

          {/* Schedule slots: weekday + time + room + capacity per slot */}
          <SlotsEditor
            slots={editSlots}
            onChange={setEditSlots}
            labels={labels}
            weekdayNames={weekdayNames}
          />

          <FormField label={labels.teacherNote ?? "Private Teacher Notes"}>
            <Textarea
              rows={2}
              value={editNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNote(e.target.value)}
            />
          </FormField>

          {editingGroup && (
            <div className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={editingGroup.archivedAt ? "text-primary" : "text-destructive"}
                onClick={() => handleArchiveToggle(editingGroup)}
                disabled={isPending}
              >
                <Icon name={editingGroup.archivedAt ? "refresh" : "trash"} size={16} className="me-1.5" />
                {editingGroup.archivedAt
                  ? (labels.restoreGroup ?? "Restore Group")
                  : (labels.archiveGroup ?? "Archive Group")}
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingGroup(null)}
            >
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (labels.saving ?? "Saving...") : (labels.saveChanges ?? "Save Changes")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
