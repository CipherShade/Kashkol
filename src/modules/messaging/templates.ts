export type TemplateKey =
  | "attendance_present"
  | "attendance_absent"
  | "attendance_late"
  | "attendance_excused"
  | "session_cancelled"
  | "session_rescheduled"
  | "homework_assigned"
  | "homework_reminder"
  | "exam_result"
  | "general";

type Template = {
  ar: string;
  en: string;
};

export const templates: Record<TemplateKey, Template> = {
  attendance_present: {
    ar: "مرحبًا {guardianName}، تم تسجيل حضور {studentName} في حصة {groupName} يوم {date}.",
    en: "Hi {guardianName}, {studentName} was marked present in {groupName} class on {date}.",
  },
  attendance_absent: {
    ar: "مرحبًا {guardianName}، تم تسجيل غياب {studentName} في حصة {groupName} يوم {date}.",
    en: "Hi {guardianName}, {studentName} was marked absent in {groupName} class on {date}.",
  },
  attendance_late: {
    ar: "مرحبًا {guardianName}، تم تسجيل تأخر {studentName} في حصة {groupName} يوم {date}.",
    en: "Hi {guardianName}, {studentName} was marked late in {groupName} class on {date}.",
  },
  attendance_excused: {
    ar: "مرحبًا {guardianName}، تم تسجيل عذر {studentName} في حصة {groupName} يوم {date}.",
    en: "Hi {guardianName}, {studentName} was marked excused in {groupName} class on {date}.",
  },
  session_cancelled: {
    ar: "مرحبًا {guardianName}، تم إلغاء حصة {groupName} يوم {date}.",
    en: "Hi {guardianName}, the {groupName} class on {date} has been cancelled.",
  },
  session_rescheduled: {
    ar: "مرحبًا {guardianName}، تم تغيير موعد حصة {groupName} إلى {newDate} في {newTime}.",
    en: "Hi {guardianName}, {groupName} class has been rescheduled to {newDate} at {newTime}.",
  },
  homework_assigned: {
    ar: "مرحبًا {guardianName}، تم إعطاء واجب جديد لـ {studentName} في {groupName}. موعد التسليم: {dueDate}.",
    en: "Hi {guardianName}, new homework has been assigned to {studentName} for {groupName}. Due: {dueDate}.",
  },
  homework_reminder: {
    ar: "تذكير: واجب {studentName} في {groupName} يستحق يوم {dueDate}.",
    en: "Reminder: {studentName}'s homework for {groupName} is due on {dueDate}.",
  },
  exam_result: {
    ar: "مرحبًا {guardianName}، نتيجة اختبار {studentName} في {groupName}: {score}/{maxScore}.",
    en: "Hi {guardianName}, {studentName}'s result for {groupName} exam: {score}/{maxScore}.",
  },
  general: {
    ar: "{message}",
    en: "{message}",
  },
};

export function renderTemplate(key: TemplateKey, locale: "ar" | "en", vars: Record<string, string>): string {
  let template = templates[key][locale];
  for (const [k, v] of Object.entries(vars)) {
    template = template.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return template;
}
