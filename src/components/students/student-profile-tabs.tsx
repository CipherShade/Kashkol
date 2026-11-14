"use client";

import { startTransition, useState } from "react";
import { createStudentNoteAction } from "@/app/actions/students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FormField, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { StudentPortalAccessPanel } from "./student-portal-access-panel";

const WEEKDAY_NAMES_AR = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const WEEKDAY_NAMES_EN = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function formatSlotTime(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 5);
  return value.toISOString().slice(11, 16);
}

type StudentData = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  phoneE164: string | null;
  parentName: string | null;
  parentPhoneE164: string | null;
  joinedAt: string;
  archivedAt: string | null;
};

type EnrollmentData = {
  id: string;
  group: {
    id: string;
    name: string;
    color: string;
    grade: string | null;
    scheduleSlots: Array<{
      id: string;
      weekday: number;
      startTime: Date | string;
      endTime: Date | string | null;
      room: string | null;
      capacity: number | null;
    }>;
  };
  enrolledAt: string;
  leftAt?: string | null;
};

type AttendanceMarkData = {
  id: string;
  mark: "present" | "absent" | "late" | "excused";
  recordedAt: string;
  session: {
    id: string;
    startsAt: string;
    status: string;
    gradeLabel?: string | null;
    group: { id: string; name: string; color: string } | null;
  };
  revisions: Array<{
    id: string;
    oldMark: string | null;
    newMark: string;
    reason: string | null;
    createdAt: string;
  }>;
};

type AssessmentScoreData = {
  id: string;
  score: number | null;
  assessment: {
    id: string;
    title: string;
    date: string;
    maxScore: number;
    group: { id: string; name: string; color: string };
  };
};

type StudentNoteData = { id: string; body: string; createdAt: string };

type StudentProfileTabId =
  | "overview"
  | "attendance"
  | "assessments"
  | "homework"
  | "notes"
  | "portal";

export function StudentProfileTabs({
  student,
  attendanceRate,
  quizAverage,
  consecutiveAbsences,
  currentEnrollments,
  pastEnrollments,
  attendanceMarks,
  assessmentScores,
  notes: initialNotes,
  locale,
  initialTab = "overview",
}: {
  student: StudentData;
  attendanceRate: number | null;
  quizAverage: number | null;
  consecutiveAbsences: number;
  currentEnrollments: EnrollmentData[];
  pastEnrollments: EnrollmentData[];
  attendanceMarks: AttendanceMarkData[];
  assessmentScores: AssessmentScoreData[];
  notes: StudentNoteData[];
  locale: string;
  initialTab?: StudentProfileTabId;
}) {
  const [activeTab, setActiveTab] = useState<StudentProfileTabId>(initialTab);

  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState(false);

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    const body = newNote.trim();
    startTransition(async () => {
      try {
        const note = await createStudentNoteAction(student.id, body);
        setNotes((current) => [note, ...current]);
        setNewNote("");
        setNoteError(false);
      } catch {
        setNoteError(true);
      }
    });
  }

  const isAr = locale === "ar";

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--color-border)] overflow-x-auto gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "overview"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? "نظرة عامة" : "Overview"}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "attendance"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? `الحضور والغياب (${attendanceMarks.length})` : `Attendance (${attendanceMarks.length})`}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("assessments")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "assessments"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? `الامتحانات والدرجات (${assessmentScores.length})` : `Assessments (${assessmentScores.length})`}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("homework")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "homework"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? "الواجبات" : "Homework"}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notes")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "notes"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? `الملاحظات الداخلية (${notes.length})` : `Internal Notes (${notes.length})`}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("portal")}
          className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "portal"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {isAr ? "بوابة الطالب وولي الأمر" : "Portal Access"}
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardBody className="p-4 text-center">
                <div className="text-xs text-muted mb-1">{isAr ? "نسبة الحضور الكلية" : "Attendance Rate"}</div>
                <div className="text-3xl font-bold text-foreground">
                  {attendanceRate !== null ? `${attendanceRate}%` : "—"}
                </div>
                <div className="text-xs text-muted mt-1">
                  {isAr
                    ? `${attendanceMarks.length} حصة مسجلة`
                    : `${attendanceMarks.length} recorded sessions`}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4 text-center">
                <div className="text-xs text-muted mb-1">{isAr ? "متوسط الامتحانات" : "Quiz Average"}</div>
                <div className="text-3xl font-bold text-foreground">
                  {quizAverage !== null ? `${quizAverage}%` : "—"}
                </div>
                <div className="text-xs text-muted mt-1">
                  {isAr
                    ? `${assessmentScores.length} اختبار مصحح`
                    : `${assessmentScores.length} graded assessments`}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4 text-center">
                <div className="text-xs text-muted mb-1">{isAr ? "الغيابات المتتالية" : "Consecutive Absences"}</div>
                <div
                  className={`text-3xl font-bold ${
                    consecutiveAbsences >= 4
                      ? "text-rose-600"
                      : consecutiveAbsences >= 2
                      ? "text-amber-600"
                      : "text-foreground"
                  }`}
                >
                  {consecutiveAbsences}
                </div>
                <div className="text-xs text-muted mt-1">
                  {consecutiveAbsences >= 2
                    ? isAr
                      ? "بحاجة لمتابعة عاجلة"
                      : "Needs attention"
                    : isAr
                    ? "سجل منتظم"
                    : "Regular streak"}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Details */}
            <Card>
              <CardBody className="p-4 space-y-3">
                <h3 className="font-semibold text-sm border-b border-[var(--color-border)] pb-2">
                  {isAr ? "بيانات الاتصال والتواصل" : "Contact Information"}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">{isAr ? "رقم الطالب:" : "Student Phone:"}</span>
                    <span className="font-medium" dir="ltr">
                      {student.phoneE164 || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{isAr ? "اسم ولي الأمر:" : "Guardian Name:"}</span>
                    <span className="font-medium">{student.parentName || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{isAr ? "رقم ولي الأمر:" : "Guardian Phone:"}</span>
                    <span className="font-medium" dir="ltr">
                      {student.parentPhoneE164 || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{isAr ? "الصف الدراسي:" : "Academic Grade:"}</span>
                    <span className="font-medium">{student.grade || "—"}</span>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Enrolled Groups */}
            <Card>
              <CardBody className="p-4 space-y-3">
                <h3 className="font-semibold text-sm border-b border-[var(--color-border)] pb-2">
                  {isAr ? "المجموعات الحالية" : "Current Groups"}
                </h3>
                {currentEnrollments.length === 0 ? (
                  <p className="text-sm text-muted py-2">{isAr ? "غير ملتحق بأي مجموعة حالياً." : "Not enrolled in any group."}</p>
                ) : (
                  <div className="space-y-2">
                    {currentEnrollments.map((enr) => (
                      <div
                        key={enr.id}
                        className="flex items-center justify-between p-2.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-subtle)]"
                      >
                        <div>
                          <Link
                            href={`/app/groups/${enr.group.id}`}
                            className="font-medium text-sm text-foreground hover:text-indigo-600"
                          >
                            {enr.group.name}
                          </Link>
                          <div className="text-xs text-muted">
                            {enr.group.scheduleSlots
                              .slice()
                              .sort((a, b) => a.weekday - b.weekday)
                              .map((slot) => {
                                const weekdayName = (isAr ? WEEKDAY_NAMES_AR : WEEKDAY_NAMES_EN)[slot.weekday] ?? "";
                                const start = formatSlotTime(slot.startTime);
                                const end = slot.endTime ? formatSlotTime(slot.endTime) : null;
                                return (
                                  <span key={slot.id} className="block">
                                    {weekdayName} {start}
                                    {end ? ` - ${end}` : ""}
                                    {slot.room ? ` · ${slot.room}` : ""}
                                  </span>
                                );
                              })}
                            <span className="block">
                              {isAr ? "تاريخ الالتحاق: " : "Enrolled: "}
                              {enr.enrolledAt.slice(0, 10)}
                            </span>
                          </div>
                        </div>
                        <Badge tone="neutral">{isAr ? "نشط" : "Active"}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {pastEnrollments.length > 0 && (
                  <div className="pt-2">
                    <div className="text-xs font-semibold text-muted mb-1">
                      {isAr ? "مجموعات سابقة:" : "Previous Groups:"}
                    </div>
                    {pastEnrollments.map((enr) => (
                      <div key={enr.id} className="text-xs text-muted flex justify-between py-1">
                        <span>{enr.group.name}</span>
                        <span>
                          {enr.enrolledAt.slice(0, 10)} → {enr.leftAt ? enr.leftAt.slice(0, 10) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ATTENDANCE TAB */}
      {activeTab === "attendance" && (
        <Card>
          <CardBody className="p-4">
            {attendanceMarks.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={isAr ? "لا توجد سجلات حضور مسجلة" : "No attendance records yet."}
                description={isAr ? "سيتم تسجيل الحضور تلقائياً عند بدء الحصص." : "Attendance will be logged during class sessions."}
              />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {attendanceMarks.map((mark) => (
                  <div key={mark.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">
                        {mark.session.group?.name ??
                          mark.session.gradeLabel ??
                          (isAr ? "حصة مستقلة" : "Independent session")}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(mark.session.startsAt).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {mark.revisions.length > 0 && (
                        <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <Icon name="refresh" size={12} />
                          <span>
                            {isAr
                              ? `تم تعديل السجل: ${mark.revisions[0].reason ?? "بدون سبب"}`
                              : `Record corrected: ${mark.revisions[0].reason ?? "no reason specified"}`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      {mark.mark === "present" && <Badge tone="success">{isAr ? "حاضر" : "Present"}</Badge>}
                      {mark.mark === "absent" && <Badge tone="danger">{isAr ? "غائب" : "Absent"}</Badge>}
                      {mark.mark === "late" && <Badge tone="warn">{isAr ? "متأخر" : "Late"}</Badge>}
                      {mark.mark === "excused" && <Badge tone="neutral">{isAr ? "معذور" : "Excused"}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ASSESSMENTS TAB */}
      {activeTab === "assessments" && (
        <Card>
          <CardBody className="p-4">
            {assessmentScores.length === 0 ? (
              <EmptyState
                icon="edit"
                title={isAr ? "لا توجد درجات مسجلة" : "No assessment scores yet."}
                description={isAr ? "تظهر الدرجات هنا بعد رصد نتائج الاختبارات والواجبات المكتوبة." : "Scores will appear here after grading exams."}
              />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {assessmentScores.map((score) => {
                  const pct =
                    score.score !== null && score.assessment.maxScore > 0
                      ? Math.round((score.score / score.assessment.maxScore) * 100)
                      : null;
                  return (
                    <div key={score.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{score.assessment.title}</div>
                        <div className="text-xs text-muted">
                          {score.assessment.group.name} · {score.assessment.date}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold text-sm">
                          {score.score !== null ? `${score.score} / ${score.assessment.maxScore}` : "—"}
                        </div>
                        {pct !== null && (
                          <Badge
                            tone={pct >= 85 ? "success" : pct >= 65 ? "warn" : "danger"}
                            className="text-xs"
                          >
                            {pct}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* HOMEWORK TAB */}
      {activeTab === "homework" && (
        <Card>
          <CardBody className="p-6">
            <EmptyState
              icon="book"
              title={isAr ? "سجل الواجبات المدرسية" : "Homework Submissions Timeline"}
              description={
                isAr
                  ? "قسم سجل الواجبات والمهام المدرسية جاهز للربط مع جلسات الحصص والتقييمات."
                  : "Prepared timeline for homework assignments and submissions linked with teaching sessions."
              }
            />
          </CardBody>
        </Card>
      )}

      {/* INTERNAL NOTES TAB */}
      {activeTab === "notes" && (
        <Card>
          <CardBody className="p-4 space-y-4">
            <form onSubmit={handleAddNote} className="space-y-3">
              <FormField
                label={isAr ? "إضافة ملاحظة خاصة بالمعلم" : "Add Internal Note (Teacher Only)"}
                hint={
                  isAr
                    ? "هذه الملاحظات خاصة ومحمية ولا تظهر أبداً للطلاب أو أولياء الأمور."
                    : "Notes are private to staff and never visible to students or parents."
                }
              >
                <Textarea
                  value={newNote}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
                  placeholder={
                    isAr
                      ? "اكتب ملاحظة حول نقاط القوة أو الضعف أو سلوك الطالب..."
                      : "Write notes on student strengths, weaknesses, follow-ups..."
                  }
                  rows={3}
                />
              </FormField>
              <div className="flex justify-end">
                <Button variant="primary" size="sm" type="submit" disabled={!newNote.trim()}>
                  <Icon name="plus" size={14} />
                  <span>{isAr ? "حفظ الملاحظة" : "Save Note"}</span>
                </Button>
              </div>
            </form>

            <div className="border-t border-[var(--color-border)] pt-3">
              {noteError ? (
                <p className="text-sm text-danger" role="alert">
                  {isAr ? "تعذر حفظ الملاحظة. حاول مرة أخرى." : "Could not save the note. Try again."}
                </p>
              ) : notes.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">
                  {isAr ? "لا توجد ملاحظات مسجلة بعد." : "No internal notes recorded yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 bg-[var(--color-surface-subtle)] rounded border border-[var(--color-border)] text-xs space-y-1"
                    >
                      <div className="flex justify-between text-muted">
                        <span className="font-semibold">{isAr ? "ملاحظة المعلم" : "Teacher Note"}</span>
                        <span>{new Date(n.createdAt).toLocaleDateString(locale)}</span>
                      </div>
                      <p className="text-foreground whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* PORTAL ACCESS TAB */}
      {activeTab === "portal" && (
        <StudentPortalAccessPanel
          studentId={student.id}
          studentName={`${student.firstName} ${student.lastName}`.trim()}
          grade={student.grade}
          locale={locale}
        />
      )}
    </div>
  );
}
