"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import {
  archiveGroupAction,
  enrollStudentAction,
  removeStudentAction,
  restoreGroupAction,
  transferStudentAction,
  updateGroupAction,
} from "@/app/actions/groups";
import { GROUP_COLOR_PALETTE, type GroupColor } from "@/modules/groups/schemas";

const COLOR_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-600 dark:bg-indigo-500" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-600 dark:bg-emerald-500" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-600 dark:bg-amber-500" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-600 dark:bg-rose-500" },
  sky: { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-300", bar: "bg-sky-600 dark:bg-sky-500" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-600 dark:bg-violet-500" },
  teal: { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300", bar: "bg-teal-600 dark:bg-teal-500" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", bar: "bg-orange-600 dark:bg-orange-500" },
};

const WEEKDAY_NAMES_AR = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const WEEKDAY_NAMES_EN = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type StudentBrief = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  phoneE164: string | null;
  parentName: string | null;
  parentPhoneE164: string | null;
  archivedAt: Date | string | null;
};

type GroupEnrollment = {
  id: string;
  enrolledAt: Date | string;
  student: StudentBrief;
};

type UpcomingSession = {
  id: string;
  startsAt: Date | string;
  status: string;
};

type GroupDetailsData = {
  id: string;
  name: string;
  subjectId: string | null;
  subject: { id: string; name: string } | null;
  grade: string | null;
  room: string | null;
  color: string;
  weekday: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  teacherNote: string | null;
  archivedAt: Date | string | null;
  enrollments: GroupEnrollment[];
  upcomingSessions: UpcomingSession[];
};

type GroupDetailsClientProps = {
  group: GroupDetailsData;
  availableStudents: Array<{ id: string; name: string; grade: string | null }>;
  availableGroups: Array<{ id: string; name: string; color: string }>;
  availableSubjects: Array<{ id: string; name: string }>;
  locale: string;
  labels: Record<string, string>;
};

export function GroupDetailsClient({
  group,
  availableStudents,
  availableGroups,
  availableSubjects,
  locale,
  labels,
}: GroupDetailsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAr = locale === "ar";
  const weekdayNames = isAr ? WEEKDAY_NAMES_AR : WEEKDAY_NAMES_EN;
  const styles = COLOR_STYLES[group.color] ?? COLOR_STYLES.indigo;
  const isFull = group.capacity !== null && group.enrollments.length >= group.capacity;

  // Modals state
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [selectedStudentToEnroll, setSelectedStudentToEnroll] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState<StudentBrief | null>(null);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<StudentBrief | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editSubjectId, setEditSubjectId] = useState(group.subjectId ?? "");
  const [editGrade, setEditGrade] = useState(group.grade ?? "");
  const [editRoom, setEditRoom] = useState(group.room ?? "");
  const [editColor, setEditColor] = useState<GroupColor>((group.color as GroupColor) || "indigo");
  const [editWeekday, setEditWeekday] = useState(String(group.weekday));
  const [editStartTime, setEditStartTime] = useState(group.startTime);
  const [editEndTime, setEditEndTime] = useState(group.endTime ?? "");
  const [editCapacity, setEditCapacity] = useState(group.capacity ? String(group.capacity) : "");
  const [editNote, setEditNote] = useState(group.teacherNote ?? "");
  const [editError, setEditError] = useState<string | null>(null);

  // Filter students who are NOT already enrolled in this group
  const enrolledStudentIds = new Set(group.enrollments.map((e) => e.student.id));
  const eligibleStudents = availableStudents.filter((s) => !enrolledStudentIds.has(s.id));

  // Eligible groups for transfer (excluding this current group)
  const eligibleTransferGroups = availableGroups.filter((g) => g.id !== group.id);

  async function handleEnrollStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudentToEnroll) return;
    setEnrollError(null);

    startTransition(async () => {
      const res = await enrollStudentAction(group.id, selectedStudentToEnroll);
      if (res.status === "error") {
        const key = res.errorKey ?? "errors.generic";
        setEnrollError(labels[key] ?? key);
      } else {
        setIsEnrollOpen(false);
        setSelectedStudentToEnroll("");
        router.refresh();
      }
    });
  }

  async function handleTransferStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTarget || !selectedTargetGroup) return;
    setTransferError(null);

    startTransition(async () => {
      const res = await transferStudentAction(group.id, selectedTargetGroup, transferTarget.id);
      if (res.status === "error") {
        const key = res.errorKey ?? "errors.generic";
        setTransferError(labels[key] ?? key);
      } else {
        setTransferTarget(null);
        setSelectedTargetGroup("");
        router.refresh();
      }
    });
  }

  async function handleRemoveStudent() {
    if (!removeTarget) return;
    setRemoveError(null);

    startTransition(async () => {
      const res = await removeStudentAction(group.id, removeTarget.id);
      if (res.status === "error") {
        const key = res.errorKey ?? "errors.generic";
        setRemoveError(labels[key] ?? key);
      } else {
        setRemoveTarget(null);
        router.refresh();
      }
    });
  }

  async function handleUpdateGroup(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);

    const formData = new FormData();
    formData.set("id", group.id);
    formData.set("name", editName);
    if (editSubjectId) formData.set("subjectId", editSubjectId);
    formData.set("grade", editGrade);
    formData.set("room", editRoom);
    formData.set("color", editColor);
    formData.set("weekday", editWeekday);
    formData.set("startTime", editStartTime);
    formData.set("endTime", editEndTime);
    if (editCapacity) formData.set("capacity", editCapacity);
    if (editNote) formData.set("teacherNote", editNote);

    startTransition(async () => {
      const res = await updateGroupAction(undefined, formData);
      if (res.status === "error") {
        const key = res.errorKey ?? "errors.generic";
        setEditError(labels[key] ?? key);
      } else {
        setIsEditOpen(false);
        router.refresh();
      }
    });
  }

  async function handleArchiveToggle() {
    startTransition(async () => {
      if (group.archivedAt) {
        await restoreGroupAction(group.id);
      } else {
        await archiveGroupAction(group.id);
      }
      router.refresh();
    });
  }

  function getWhatsAppUrl(phoneE164: string, studentName: string) {
    const cleanPhone = phoneE164.replace(/[^\d]/g, "");
    const msg = isAr
      ? `السلام عليكم، بخصوص الطالب ${studentName} في ${group.name}...`
      : `Hello, regarding student ${studentName} in group ${group.name}...`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Color Accent Card */}
      <Card className="overflow-hidden border">
        <div className={`h-2.5 w-full ${styles.bar}`} />
        <CardBody className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-2">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {group.subject && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${styles.bg} ${styles.text}`}>
                    {group.subject.name}
                  </span>
                )}
                {group.grade && (
                  <Badge variant="outline" className="text-xs">
                    {group.grade}
                  </Badge>
                )}
                {group.archivedAt ? (
                  <Badge variant="destructive" className="text-xs">
                    {labels.statusArchived ?? "Archived"}
                  </Badge>
                ) : isFull ? (
                  <Badge variant="warning" className="text-xs">
                    {labels.capacityFull ?? "Capacity Full"}
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-xs">
                    {labels.statusActive ?? "Active"}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {group.name}
              </h1>

              {/* Meta details */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5">
                  <Icon name="clock" size="sm" className="text-muted-foreground" />
                  <span>
                    {weekdayNames[group.weekday]} • {group.startTime}
                    {group.endTime ? ` - ${group.endTime}` : ""}
                  </span>
                </div>

                {group.room && (
                  <div className="flex items-center gap-1.5">
                    <Icon name="map-pin" size="sm" className="text-muted-foreground" />
                    <span>{group.room}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <Icon name="users" size="sm" className="text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {group.enrollments.length}
                  </span>
                  {group.capacity ? (
                    <span>/ {group.capacity} {labels.students ?? "students"}</span>
                  ) : (
                    <span>{labels.students ?? "students"}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setIsEnrollOpen(true)}
                disabled={isPending || Boolean(group.archivedAt)}
              >
                <Icon name="user-plus" size="sm" className="me-1.5" />
                {labels.enrollStudent ?? "Enroll Student"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsEditOpen(true)}
                disabled={isPending}
              >
                <Icon name="edit" size="sm" className="me-1.5" />
                {labels.editGroup ?? "Edit Group"}
              </Button>

              <Button
                variant="ghost"
                onClick={handleArchiveToggle}
                disabled={isPending}
                className={group.archivedAt ? "text-primary" : "text-muted-foreground hover:text-destructive"}
              >
                <Icon name={group.archivedAt ? "rotate-ccw" : "archive"} size="sm" className="me-1.5" />
                {group.archivedAt ? (labels.restoreGroup ?? "Restore") : (labels.archiveGroup ?? "Archive")}
              </Button>
            </div>
          </div>

          {/* Teacher Note banner */}
          {group.teacherNote && (
            <div className="mt-4 p-3 bg-muted/40 rounded-lg border border-border text-xs text-muted-foreground flex items-start gap-2">
              <Icon name="info" size="sm" className="shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block mb-0.5">
                  {labels.internalNotes ?? "Teacher Notes"}:
                </span>
                <p className="whitespace-pre-line">{group.teacherNote}</p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Main Content: Roster Table & Upcoming Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Enrolled Roster (2 columns on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Icon name="users" size="sm" />
              <span>{labels.enrolledRoster ?? "Enrolled Students"}</span>
              <Badge variant="secondary" className="text-xs">
                {group.enrollments.length}
              </Badge>
            </h2>

            {group.enrollments.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEnrollOpen(true)}
                disabled={Boolean(group.archivedAt)}
              >
                <Icon name="user-plus" size="xs" className="me-1" />
                {labels.enrollStudent ?? "Enroll"}
              </Button>
            )}
          </div>

          {group.enrollments.length === 0 ? (
            <EmptyState
              title={labels.noStudentsEnrolled ?? "No students enrolled in this group"}
              description={
                labels.noStudentsEnrolledDesc ??
                "Enroll students from your student directory to begin recording attendance and scores."
              }
              action={
                <Button
                  variant="primary"
                  onClick={() => setIsEnrollOpen(true)}
                  disabled={Boolean(group.archivedAt)}
                >
                  <Icon name="user-plus" size="sm" className="me-1.5" />
                  {labels.enrollFirstStudent ?? "Enroll Student"}
                </Button>
              }
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground text-start">
                      <th className="py-3 px-4 text-start">{labels.student ?? "Student"}</th>
                      <th className="py-3 px-4 text-start">{labels.grade ?? "Grade"}</th>
                      <th className="py-3 px-4 text-start">{labels.phone ?? "Phone"}</th>
                      <th className="py-3 px-4 text-start">{labels.guardian ?? "Guardian"}</th>
                      <th className="py-3 px-4 text-start">{labels.enrolledSince ?? "Enrolled"}</th>
                      <th className="py-3 px-4 text-end">{labels.actions ?? "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.enrollments.map(({ id: enrollmentId, enrolledAt, student }) => {
                      const studentName = `${student.firstName} ${student.lastName}`;
                      const enrolledDate = new Date(enrolledAt).toLocaleDateString(locale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      });

                      return (
                        <tr key={enrollmentId} className="hover:bg-muted/20 transition-colors">
                          {/* Student name & avatar */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={studentName} size="sm" />
                              <div>
                                <Link
                                  href={`/app/students/${student.id}`}
                                  className="font-medium hover:underline hover:text-primary transition-colors focus:outline-none"
                                >
                                  {studentName}
                                </Link>
                                {student.archivedAt && (
                                  <span className="ms-2 text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                                    {labels.archivedMarker ?? "Archived"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Grade */}
                          <td className="py-3 px-4 text-muted-foreground">
                            {student.grade || "—"}
                          </td>

                          {/* Student Phone */}
                          <td className="py-3 px-4">
                            {student.phoneE164 ? (
                              <a
                                href={`tel:${student.phoneE164}`}
                                className="text-muted-foreground hover:text-foreground text-xs font-mono"
                                dir="ltr"
                              >
                                {student.phoneE164}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>

                          {/* Guardian Phone & WhatsApp */}
                          <td className="py-3 px-4">
                            {student.parentPhoneE164 ? (
                              <div className="flex items-center gap-1.5">
                                <div>
                                  {student.parentName && (
                                    <div className="text-xs font-medium text-foreground">
                                      {student.parentName}
                                    </div>
                                  )}
                                  <a
                                    href={`tel:${student.parentPhoneE164}`}
                                    className="text-muted-foreground hover:text-foreground text-xs font-mono"
                                    dir="ltr"
                                  >
                                    {student.parentPhoneE164}
                                  </a>
                                </div>
                                <a
                                  href={getWhatsAppUrl(student.parentPhoneE164, studentName)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  title={labels.openWhatsApp ?? "Open WhatsApp"}
                                >
                                  <Icon name="message-circle" size="xs" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>

                          {/* Enrolled date */}
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {enrolledDate}
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3 px-4 text-end">
                            <div className="flex items-center justify-end gap-1">
                              {/* Transfer button */}
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setTransferTarget(student);
                                  setSelectedTargetGroup("");
                                  setTransferError(null);
                                }}
                                title={labels.transferStudent ?? "Transfer to another group"}
                              >
                                <Icon name="repeat" size="xs" />
                              </Button>

                              {/* Remove button */}
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setRemoveTarget(student);
                                  setRemoveError(null);
                                }}
                                title={labels.removeFromGroup ?? "Remove from group"}
                              >
                                <Icon name="user-minus" size="xs" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Upcoming Sessions & Info */}
        <div className="space-y-4">
          <Card className="border">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon name="calendar" size="sm" />
                  <span>{labels.upcomingSessions ?? "Upcoming Sessions"}</span>
                </span>
              }
            />
            <CardBody className="p-4 space-y-3">
              {group.upcomingSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {labels.noSessionsScheduled ?? "No sessions scheduled in the next 4 weeks."}
                </p>
              ) : (
                <div className="space-y-2">
                  {group.upcomingSessions.map((session) => {
                    const sessionDate = new Date(session.startsAt);
                    const formatted = sessionDate.toLocaleString(locale, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between text-xs p-2.5 rounded-lg border border-border bg-muted/20"
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="clock" size="xs" className="text-muted-foreground" />
                          <span className="font-medium text-foreground">{formatted}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {session.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Quick link to Back */}
          <Link href="/app/groups" className="block">
            <Button variant="secondary" className="w-full">
              <Icon name="arrow-left" size="sm" className="me-1.5 rtl:rotate-180" />
              {labels.backToGroups ?? "Back to all groups"}
            </Button>
          </Link>
        </div>
      </div>

      {/* ENROLL STUDENT MODAL */}
      <Dialog
        isOpen={isEnrollOpen}
        onClose={() => {
          setIsEnrollOpen(false);
          setSelectedStudentToEnroll("");
          setEnrollError(null);
        }}
        title={labels.enrollStudentModalTitle ?? "Enroll Student in Group"}
        size="md"
      >
        <form onSubmit={handleEnrollStudent} className="space-y-4">
          {enrollError && <Alert variant="error" description={enrollError} />}

          {isFull && (
            <Alert
              variant="warning"
              description={
                labels.capacityWarningNotice ??
                "This group has reached its target capacity. You can still enroll students if you wish to exceed capacity."
              }
            />
          )}

          {eligibleStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {labels.noMoreEligibleStudents ??
                "All students in this workspace are already enrolled in this group."}
            </p>
          ) : (
            <FormField label={labels.selectStudent ?? "Select Student"} required>
              <Select
                required
                value={selectedStudentToEnroll}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStudentToEnroll(e.target.value)}
              >
                <option value="">{labels.chooseStudentPlaceholder ?? "-- Choose student --"}</option>
                {eligibleStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.grade ? `(${s.grade})` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEnrollOpen(false);
                setSelectedStudentToEnroll("");
              }}
            >
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isPending || !selectedStudentToEnroll || eligibleStudents.length === 0}
            >
              {isPending ? (labels.enrolling ?? "Enrolling...") : (labels.enroll ?? "Enroll Student")}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* TRANSFER STUDENT MODAL */}
      <Dialog
        isOpen={Boolean(transferTarget)}
        onClose={() => {
          setTransferTarget(null);
          setSelectedTargetGroup("");
          setTransferError(null);
        }}
        title={labels.transferStudentModalTitle ?? "Transfer Student to Another Group"}
        size="md"
      >
        <form onSubmit={handleTransferStudent} className="space-y-4">
          {transferError && <Alert variant="error" description={transferError} />}

          {transferTarget && (
            <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs space-y-1">
              <span className="font-semibold text-foreground">
                {labels.studentToTransfer ?? "Student"}:
              </span>{" "}
              <span>{transferTarget.firstName} {transferTarget.lastName}</span>
              <p className="text-muted-foreground pt-1">
                {labels.transferHistoryPreservedNotice ??
                  "Historical attendance records and quiz marks are preserved and will not be lost during transfer."}
              </p>
            </div>
          )}

          {eligibleTransferGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {labels.noOtherGroupsAvailable ?? "No other active groups available for transfer."}
            </p>
          ) : (
            <FormField label={labels.destinationGroup ?? "Destination Group"} required>
              <Select
                required
                value={selectedTargetGroup}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTargetGroup(e.target.value)}
              >
                <option value="">{labels.chooseGroupPlaceholder ?? "-- Choose destination group --"}</option>
                {eligibleTransferGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTransferTarget(null);
                setSelectedTargetGroup("");
              }}
            >
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isPending || !selectedTargetGroup || eligibleTransferGroups.length === 0}
            >
              {isPending ? (labels.transferring ?? "Transferring...") : (labels.confirmTransfer ?? "Confirm Transfer")}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* REMOVE STUDENT CONFIRMATION DIALOG */}
      <Dialog
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title={labels.removeStudentModalTitle ?? "Remove Student from Group?"}
        size="sm"
      >
        <div className="space-y-4">
          {removeError && <Alert variant="error" description={removeError} />}

          <p className="text-sm text-muted-foreground">
            {labels.removeStudentConfirmMessage
              ? labels.removeStudentConfirmMessage.replace(
                  "{name}",
                  removeTarget ? `${removeTarget.firstName} ${removeTarget.lastName}` : "",
                )
              : `Are you sure you want to remove this student from ${group.name}? They will be marked as having left the group.`}
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRemoveTarget(null)}
            >
              {labels.cancel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleRemoveStudent}
              disabled={isPending}
            >
              {isPending ? (labels.removing ?? "Removing...") : (labels.confirmRemove ?? "Remove")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* EDIT GROUP DIALOG */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
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

            <FormField label={labels.roomLocation ?? "Room / Location"}>
              <Input
                value={editRoom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRoom(e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label={labels.weekday ?? "Day of Week"} required>
              <Select
                value={editWeekday}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditWeekday(e.target.value)}
              >
                {weekdayNames.map((name, idx) => (
                  <option key={idx} value={String(idx)}>
                    {name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label={labels.startTime ?? "Start Time"} required>
              <Input
                type="time"
                required
                value={editStartTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditStartTime(e.target.value)}
              />
            </FormField>

            <FormField label={labels.endTime ?? "End Time"}>
              <Input
                type="time"
                value={editEndTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEndTime(e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={labels.capacity ?? "Capacity (Max Students)"}>
              <Input
                type="number"
                min="1"
                max="500"
                value={editCapacity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditCapacity(e.target.value)}
              />
            </FormField>

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

          <FormField label={labels.teacherNote ?? "Private Teacher Notes"}>
            <Textarea
              rows={2}
              value={editNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNote(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsEditOpen(false)}
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
