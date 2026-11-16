

export type AttendanceReportMode = "all" | "attended_only" | "attended_and_late";

export type AttendanceReportInput = {
  locale: "ar" | "en";
  workspaceName: string;
  groupName: string;
  sessionDate: string;
  sessionTime?: string | null;
  mode?: AttendanceReportMode;
  roster: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    mark: "present" | "absent" | "late" | "excused" | null;
  }>;
};

function numberList(items: string[], _locale: "ar" | "en"): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function formatReport(input: AttendanceReportInput): string {
  const locale = input.locale;
  const isAr = locale === "ar";
  const mode = input.mode ?? "all";

  const present = input.roster.filter((r) => r.mark === "present");
  const absent = input.roster.filter((r) => r.mark === "absent");
  const late = input.roster.filter((r) => r.mark === "late");
  const excused = input.roster.filter((r) => r.mark === "excused");
  const total = input.roster.length;

  const presentNames = present.map((r) => `${r.firstName} ${r.lastName}`);
  const absentNames = absent.map((r) => `${r.firstName} ${r.lastName}`);
  const lateNames = late.map((r) => `${r.firstName} ${r.lastName}`);
  const excusedNames = excused.map((r) => `${r.firstName} ${r.lastName}`);

  const header = isAr
    ? `📚 ${input.groupName}\n\n📅 التاريخ: ${input.sessionDate}${input.sessionTime ? " " + input.sessionTime : ""}\n\nتم تسجيل الحضور بواسطة إدارة المجموعة.`
    : `📚 ${input.groupName}\n\n📅 Date: ${input.sessionDate}${input.sessionTime ? " " + input.sessionTime : ""}\n\nRecorded by workspace management.`;

  const sectionTitle = (emoji: string, title: string) => (isAr ? `${emoji} ${title}` : `${emoji} ${title}`);

  const presentBlock = presentNames.length
    ? `\n\n${sectionTitle("✅", isAr ? "الحضور" : "Present")}:\n${numberList(presentNames, locale)}`
    : "";

  const lateBlock =
    (mode === "all" || mode === "attended_and_late") && lateNames.length
      ? `\n\n${sectionTitle("⏰", isAr ? "التأخير" : "Late")}:\n${numberList(lateNames, locale)}`
      : "";

  const absentBlock =
    mode === "all" && absentNames.length
      ? `\n\n${sectionTitle("❌", isAr ? "الغياب" : "Absent")}:\n${numberList(absentNames, locale)}`
      : "";

  const excusedBlock =
    mode === "all" && excusedNames.length
      ? `\n\n${sectionTitle("📋", isAr ? "عذر" : "Excused")}:\n${numberList(excusedNames, locale)}`
      : "";

  let summaryLine = "";
  if (mode === "attended_only") {
    summaryLine = isAr
      ? `\n\n📊 إجمالي الحاضرين: ${present.length}`
      : `\n\n📊 Total present: ${present.length}`;
  } else if (mode === "attended_and_late") {
    summaryLine = isAr
      ? `\n\n📊 إجمالي الحضور والتأخير: ${present.length + late.length}`
      : `\n\n📊 Total present and late: ${present.length + late.length}`;
  } else {
    summaryLine = isAr
      ? `\n\n📊 إجمالي الحضور: ${present.length}` + (total > 0 ? ` / ${total}` : "")
      : `\n\n📊 Total present: ${present.length}` + (total > 0 ? ` / ${total}` : "");
  }

  const footer = `\n\nKashkol 📚`;
  const workspaceLine = `\n📌 ${input.workspaceName}`;

  return header + workspaceLine + presentBlock + lateBlock + absentBlock + excusedBlock + summaryLine + footer;
}

export { formatReport };
