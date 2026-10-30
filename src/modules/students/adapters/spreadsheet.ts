import ExcelJS from "exceljs";
import {
  normalizePhoneNumber,
  sanitizeSpreadsheetFormula,
} from "../schemas";

export type ParsedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  firstName: string;
  lastName: string;
  grade: string | null;
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  groupName: string | null;
  errors: string[];
  warnings: string[];
  action: "create" | "update" | "skip";
  existingStudentId?: string | null;
};

export type ImportPreviewResult = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  detectedGroups: string[];
  columnsMatched: Record<string, string>;
  sourceEncoding?: "utf-8" | "utf-8-bom" | "windows-1256";
  rows: ParsedImportRow[];
};

export type SpreadsheetParseResult = {
  rows: ParsedImportRow[];
  detectedGroups: string[];
  columnsMatched: Record<string, string>;
  sourceEncoding: "utf-8" | "utf-8-bom" | "windows-1256";
};

const COLUMN_SYNONYMS = {
  name: [
    "name",
    "fullname",
    "full_name",
    "student_name",
    "studentname",
    "الاسم",
    "اسم الطالب",
    "الاسم بالكامل",
    "اسم",
  ],
  firstName: ["first_name", "firstname", "first", "الاسم الاول", "الاسم الأول"],
  lastName: ["last_name", "lastname", "last", "اسم العائلة", "اسم الاب", "اسم الأب", "اللقب"],
  phone: ["phone", "mobile", "student_phone", "student_mobile", "رقم الهاتف", "الموبايل", "تليفون", "موبايل الطالب", "هاتف"],
  parentName: ["parent_name", "parentname", "guardian_name", "guardian", "ولي الامر", "ولي الأمر", "اسم ولي الأمر", "اسم ولي الامر"],
  parentPhone: ["parent_phone", "parentphone", "guardian_phone", "رقم ولي الامر", "رقم ولي الأمر", "هاتف ولي الأمر", "موبايل ولي الأمر", "تليفون ولي الأمر"],
  grade: ["grade", "level", "year", "الصف", "السنة الدراسية", "المرحلة", "الصف الدراسي"],
  group: ["group", "group_name", "groupname", "class", "المجموعة", "مجموعة", "الفصل"],
};

function matchColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim().replace(/[\s_-]+/g, "");
  for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalized === synonym.toLowerCase().replace(/[\s_-]+/g, "")) {
        return key;
      }
    }
  }
  return null;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

function decodeCsvBuffer(buffer: Buffer): {
  content: string;
  sourceEncoding: "utf-8" | "utf-8-bom" | "windows-1256";
} {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      content: new TextDecoder("utf-8").decode(buffer.subarray(3)),
      sourceEncoding: "utf-8-bom",
    };
  }

  try {
    return {
      content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      sourceEncoding: "utf-8",
    };
  } catch {
    // Arabic Excel on Windows commonly writes Windows-1256. The conversion is
    // explicit in the preview so the teacher knows the file was re-decoded.
    return {
      content: new TextDecoder("windows-1256").decode(buffer),
      sourceEncoding: "windows-1256",
    };
  }
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileType: "csv" | "xlsx",
): Promise<SpreadsheetParseResult> {
  const workbook = new ExcelJS.Workbook();
  let sourceEncoding: "utf-8" | "utf-8-bom" | "windows-1256" = "utf-8";

  if (fileType === "csv") {
    const decoded = decodeCsvBuffer(buffer);
    sourceEncoding = decoded.sourceEncoding;
    const { Readable } = await import("node:stream");
    const stream = Readable.from([decoded.content]);
    await workbook.csv.read(stream);
  } else {
    // xlsx
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("EMPTY_WORKBOOK");
  }

  const totalRowCount = worksheet.rowCount;
  if (totalRowCount > 5001) {
    throw new Error("ROW_LIMIT_EXCEEDED");
  }

  // Find header row (check first 5 rows for column matches)
  let headerRowIndex = 1;
  let columnMap: Record<number, string> = {};
  let columnsMatched: Record<string, string> = {};

  for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const candidateMap: Record<number, string> = {};
    const candidateMatched: Record<string, string> = {};

    row.eachCell((cell, colNumber) => {
      const text = cell.text ? String(cell.text).trim() : "";
      if (text) {
        const matchedKey = matchColumn(text);
        if (matchedKey) {
          candidateMap[colNumber] = matchedKey;
          candidateMatched[matchedKey] = text;
        }
      }
    });

    if (Object.keys(candidateMap).length >= 1) {
      headerRowIndex = r;
      columnMap = candidateMap;
      columnsMatched = candidateMatched;
      break;
    }
  }

  const parsedRows: ParsedImportRow[] = [];
  const detectedGroupsSet = new Set<string>();
  const seenInFile = new Map<string, number>();

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const raw: Record<string, string> = {};
    let hasAnyData = false;

    row.eachCell((cell, colNumber) => {
      const val = cell.text !== undefined ? String(cell.text).trim() : "";
      if (val) {
        hasAnyData = true;
        const key = columnMap[colNumber] ?? `col_${colNumber}`;
        raw[key] = val;
      }
    });

    if (!hasAnyData) continue;

    let firstName = "";
    let lastName = "";
    if (raw.name) {
      const split = splitFullName(raw.name);
      firstName = split.firstName;
      lastName = split.lastName;
    } else {
      firstName = raw.firstName ?? "";
      lastName = raw.lastName ?? "";
    }

    const grade = raw.grade ? raw.grade.trim() : null;
    const rawPhone = raw.phone ? raw.phone.trim() : null;
    const parentName = raw.parentName ? raw.parentName.trim() : null;
    const rawParentPhone = raw.parentPhone ? raw.parentPhone.trim() : null;
    const groupName = raw.group ? raw.group.trim() : null;

    if (groupName) detectedGroupsSet.add(groupName);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!firstName) errors.push("missingFirstName");
    if (!lastName) errors.push("missingLastName");

    let normalizedPhone: string | null = null;
    if (rawPhone) {
      normalizedPhone = normalizePhoneNumber(rawPhone);
      if (!normalizedPhone) {
        errors.push("invalidStudentPhone");
      }
    }

    let normalizedParentPhone: string | null = null;
    if (rawParentPhone) {
      normalizedParentPhone = normalizePhoneNumber(rawParentPhone);
      if (!normalizedParentPhone) {
        errors.push("invalidParentPhone");
      }
    }

    // Duplicate import rows are skipped rather than creating ambiguous records.
    const fileKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${normalizedPhone ?? ""}`;
    if (seenInFile.has(fileKey)) {
      errors.push("duplicateInFile");
    } else {
      seenInFile.set(fileKey, r);
    }

    parsedRows.push({
      rowNumber: r,
      raw,
      firstName,
      lastName,
      grade,
      phone: normalizedPhone,
      parentName,
      parentPhone: normalizedParentPhone,
      groupName,
      errors,
      warnings,
      action: errors.length > 0 ? "skip" : "create",
    });
  }

  return {
    rows: parsedRows,
    detectedGroups: Array.from(detectedGroupsSet),
    columnsMatched,
    sourceEncoding,
  };
}

export type StudentExportRow = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  phoneE164: string | null;
  parentName: string | null;
  parentPhoneE164: string | null;
  status: string;
  groupNames: string[];
  attendanceRate: number | null;
  quizAverage: number | null;
  joinedAt: Date;
  archivedAt: Date | null;
};

export async function generateExportBuffer(
  students: StudentExportRow[],
  format: "csv" | "xlsx",
  locale: "ar" | "en",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(locale === "ar" ? "الطلاب" : "Students", {
    views: [{ rightToLeft: locale === "ar" }],
  });

  const headers =
    locale === "ar"
      ? [
          { header: "الاسم الأول", key: "firstName", width: 16 },
          { header: "اسم العائلة", key: "lastName", width: 18 },
          { header: "الصف", key: "grade", width: 14 },
          { header: "المجموعات", key: "groups", width: 22 },
          { header: "رقم الطالب", key: "phone", width: 18 },
          { header: "اسم ولي الأمر", key: "parentName", width: 20 },
          { header: "رقم ولي الأمر", key: "parentPhone", width: 18 },
          { header: "الحالة", key: "status", width: 14 },
          { header: "نسبة الحضور %", key: "attendanceRate", width: 14 },
          { header: "متوسط الدرجات %", key: "quizAverage", width: 14 },
          { header: "تاريخ الانضمام", key: "joinedAt", width: 16 },
        ]
      : [
          { header: "First Name", key: "firstName", width: 16 },
          { header: "Last Name", key: "lastName", width: 18 },
          { header: "Grade", key: "grade", width: 14 },
          { header: "Groups", key: "groups", width: 22 },
          { header: "Student Phone", key: "phone", width: 18 },
          { header: "Parent Name", key: "parentName", width: 20 },
          { header: "Parent Phone", key: "parentPhone", width: 18 },
          { header: "Status", key: "status", width: 14 },
          { header: "Attendance %", key: "attendanceRate", width: 14 },
          { header: "Quiz Average %", key: "quizAverage", width: 14 },
          { header: "Joined Date", key: "joinedAt", width: 16 },
        ];

  worksheet.columns = headers;

  // Header style
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: locale === "ar" ? "right" : "left" };

  for (const s of students) {
    const rowValues = {
      firstName: sanitizeSpreadsheetFormula(s.firstName),
      lastName: sanitizeSpreadsheetFormula(s.lastName),
      grade: sanitizeSpreadsheetFormula(s.grade ?? ""),
      groups: sanitizeSpreadsheetFormula(s.groupNames.join(", ")),
      phone: sanitizeSpreadsheetFormula(s.phoneE164 ?? ""),
      parentName: sanitizeSpreadsheetFormula(s.parentName ?? ""),
      parentPhone: sanitizeSpreadsheetFormula(s.parentPhoneE164 ?? ""),
      status: sanitizeSpreadsheetFormula(s.status),
      attendanceRate: s.attendanceRate !== null ? `${s.attendanceRate}%` : "—",
      quizAverage: s.quizAverage !== null ? `${s.quizAverage}%` : "—",
      joinedAt: s.joinedAt.toISOString().slice(0, 10),
    };
    worksheet.addRow(rowValues);
  }

  if (format === "csv") {
    const csvBuffer = await workbook.csv.writeBuffer({
      formatterOptions: {
        delimiter: ",",
        quote: '"',
      },
    });
    // Prepend UTF-8 BOM so Excel opens Arabic correctly
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvBuffer)]);
  }

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(xlsxBuffer);
}

export async function generateTemplateBuffer(
  format: "csv" | "xlsx",
  locale: "ar" | "en",
): Promise<Buffer> {
  const sampleStudents: StudentExportRow[] =
    locale === "ar"
      ? [
          {
            id: "1",
            firstName: "أحمد",
            lastName: "محمود",
            grade: "الصف الأول الثانوي",
            phoneE164: "+201012345678",
            parentName: "محمود أحمد",
            parentPhoneE164: "+201198765432",
            status: "active",
            groupNames: ["مجموعة الفيزياء - السبت ٤م"],
            attendanceRate: 100,
            quizAverage: 95,
            joinedAt: new Date(),
            archivedAt: null,
          },
          {
            id: "2",
            firstName: "مريم",
            lastName: "خالد",
            grade: "الصف الثاني الثانوي",
            phoneE164: "+201234567890",
            parentName: "خالد إبراهيم",
            parentPhoneE164: "+201555555555",
            status: "active",
            groupNames: ["مجموعة الكيمياء"],
            attendanceRate: 90,
            quizAverage: 88,
            joinedAt: new Date(),
            archivedAt: null,
          },
        ]
      : [
          {
            id: "1",
            firstName: "Ahmed",
            lastName: "Mahmoud",
            grade: "Grade 10",
            phoneE164: "+201012345678",
            parentName: "Mahmoud Ahmed",
            parentPhoneE164: "+201198765432",
            status: "active",
            groupNames: ["Physics - Sat 4PM"],
            attendanceRate: 100,
            quizAverage: 95,
            joinedAt: new Date(),
            archivedAt: null,
          },
          {
            id: "2",
            firstName: "Mariam",
            lastName: "Khaled",
            grade: "Grade 11",
            phoneE164: "+201234567890",
            parentName: "Khaled Ibrahim",
            parentPhoneE164: "+201555555555",
            status: "active",
            groupNames: ["Chemistry"],
            attendanceRate: 90,
            quizAverage: 88,
            joinedAt: new Date(),
            archivedAt: null,
          },
        ];

  return generateExportBuffer(sampleStudents, format, locale);
}
