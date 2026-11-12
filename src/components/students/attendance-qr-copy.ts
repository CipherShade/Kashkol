import type { AttendanceQrCopy } from "./student-attendance-qr";

/** Server-rendered strings for the attendance QR card (Arabic/English). */
export function attendanceQrCopyFor(locale: string): AttendanceQrCopy {
  const isAr = locale === "ar";
  return {
    title: isAr ? "بطاقة الحضور الذكية" : "Smart Attendance Card",
    subtitle: isAr
      ? "هذا الرمز مخصص للطالب ويظل صالحًا طوال العام الدراسي لجميع المجموعات والحصص. عند مسحه من قبل المساعد، يُسجَّل حضور الطالب فورًا. وهو لا يفتح أي حساب ولا يحتوي على أي كلمة مرور."
      : "This QR uniquely identifies the student across all sessions and groups. When scanned by an assistant, attendance is recorded instantly. It cannot sign in anywhere and stores no password.",
    loading: isAr ? "جارٍ تجهيز رمز QR..." : "Loading QR code...",
    loadFailed: isAr ? "تعذر تحميل رمز QR" : "Failed to load QR code",
    retry: isAr ? "إعادة المحاولة" : "Retry",
    print: isAr ? "طباعة البطاقة" : "Print Card",
    downloadSvg: isAr ? "تحميل SVG" : "Download SVG",
    downloadPng: isAr ? "تحميل PNG" : "Download PNG",
    reissue: isAr ? "إعادة إصدار الرمز" : "Re-issue Code",
    reissueTitle: isAr ? "تأكيد إعادة إصدار رمز QR" : "Confirm QR Code Re-issuance",
    reissueDescription: isAr
      ? "سيؤدي هذا الإجراء إلى إلغاء الرمز القديم فورًا، ولن يعمل أي كارت مطبوع سابقًا. هل أنت متأكد؟"
      : "This will invalidate the existing QR code immediately. Any previously printed card will stop working. Are you sure?",
    revoke: isAr ? "إيقاف رمز QR" : "Disable QR",
    revokeTitle: isAr ? "تأكيد إيقاف رمز QR" : "Confirm QR disabling",
    revokeDescription: isAr
      ? "سيتوقف رمز QR عن العمل فورًا للمسح الحضور، ولن يسجّل أي مسح. يمكنك إنشاء رمز جديد في أي وقت. هل أنت متأكد؟"
      : "Scanning with this QR will stop recording attendance immediately. You can issue a new one at any time. Are you sure?",
    confirm: isAr ? "نعم، تابع" : "Yes, continue",
    cancel: isAr ? "إلغاء" : "Cancel",
    noQrTitle: isAr ? "لا يوجد رمز حضور بعد" : "No attendance QR yet",
    noQrHint: isAr
      ? "أنشئ رمزًا فريدًا لهذا الطالب. يمكن مسحه من شاشة المجموعة أثناء أي حصة."
      : "Create a unique code for this student. It can be scanned during any session on the group screen.",
    create: isAr ? "إنشاء رمز QR" : "Create QR",
    working: isAr ? "جارٍ التنفيذ..." : "Working...",
  };
}
