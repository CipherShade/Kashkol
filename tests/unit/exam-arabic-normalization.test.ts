import { describe, expect, it } from "vitest";
import { normalizeShortAnswer, evaluateSingleQuestion } from "@/modules/exams";

describe("normalizeShortAnswer — Arabic letter variants (Issue #4)", () => {
  it("folds the alef variants to bare alef", () => {
    expect(normalizeShortAnswer("أحمد")).toBe("احمد");
    expect(normalizeShortAnswer("إبراهيم")).toBe("ابراهيم");
    expect(normalizeShortAnswer("آدم")).toBe("ادم");
    expect(normalizeShortAnswer("ٱلبيداء")).toBe("البيداء"); // alef wasla
    // all four variants normalize identically to the same base string
    expect(normalizeShortAnswer("أحمد")).toBe(normalizeShortAnswer("احمد"));
    expect(normalizeShortAnswer("آلم")).toBe(normalizeShortAnswer("الم"));
  });

  it("folds Arabic-Indic and Eastern Arabic-Indic digits to ASCII", () => {
    expect(normalizeShortAnswer("١٢٣")).toBe("123");
    expect(normalizeShortAnswer("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeShortAnswer("المسألة 1")).toBe(normalizeShortAnswer("المسأله ١"));
    expect(normalizeShortAnswer("ترتيب ٥")).toBe(normalizeShortAnswer("ترتيب 5"));
  });

  it("folds alef maksura to yaa", () => {
    expect(normalizeShortAnswer("علي")).toBe(normalizeShortAnswer("على"));
    expect(normalizeShortAnswer("موسى")).toBe("موسي");
  });

  it("folds teh marbuta to heh", () => {
    expect(normalizeShortAnswer("مكتبة")).toBe("مكتبه");
    expect(normalizeShortAnswer("مدينة")).toBe(normalizeShortAnswer("مدينه"));
  });

  it("folds waw with hamza to waw", () => {
    expect(normalizeShortAnswer("سؤال")).toBe("سوال");
    expect(normalizeShortAnswer("رؤوس")).toBe(normalizeShortAnswer("رووس"));
  });

  it("folds yaa with hamza to yaa", () => {
    expect(normalizeShortAnswer("سئل")).toBe("سيل");
    expect(normalizeShortAnswer("جئت")).toBe("جيت");
  });

  it("strips tatweel and diacritics", () => {
    expect(normalizeShortAnswer("مُحَمَّد")).toBe("محمد");
    expect(normalizeShortAnswer("بــــار")).toBe("بار");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeShortAnswer("  إجابة   صحيحة  ")).toBe("اجابه صحيحه");
  });

  it("applies the fold together for realistic accepted answer variants", () => {
    const accepted = "الإجابة الصحيحة رقم ١";
    const given = "الاجابه الصحيحه رقم 1";
    expect(normalizeShortAnswer(given)).toBe(normalizeShortAnswer(accepted));
  });
});

describe("normalizeShortAnswer — caseSensitive behavior (preserved)", () => {
  it("lowercases Latin text when caseSensitive is false (default)", () => {
    expect(normalizeShortAnswer("Hello")).toBe("hello");
    expect(normalizeShortAnswer("Newton")).toBe(normalizeShortAnswer("newton"));
  });

  it("does not change case when caseSensitive is true", () => {
    expect(normalizeShortAnswer("Hello", true)).toBe("Hello");
    expect(normalizeShortAnswer("HELLO", true)).not.toBe(normalizeShortAnswer("hello", true));
  });

  it("still folds Arabic variants when caseSensitive is true (existing behavior)", () => {
    // Arabic has no case; the Arabic fold is unaffected by caseSensitive
    expect(normalizeShortAnswer("الإجابة ١", true)).toBe("الاجابه 1");
  });
});

describe("evaluateSingleQuestion — Arabic normalization end-to-end", () => {
  const question = {
    id: "q1",
    questionType: "short_answer" as const,
    points: 5,
    autoGradable: true,
    correctAnswerJson: {
      kind: "short_answer",
      acceptedAnswers: ["الإجابة الصحيحة رقم ١"],
      caseSensitive: false,
    },
  };

  it("matches accepted answer against variants with diacritics, alef wasla, teh marbuta, and Arabic-Indic digits", () => {
    const result = evaluateSingleQuestion(question, { text: "الاجابه الصحيحه رقم 1" });
    expect(result.isCorrect).toBe(true);
    expect(result.autoAwardedPoints).toBe(5);
  });

  it("rejects a wrong answer that differs after folding", () => {
    const result = evaluateSingleQuestion(question, { text: "الاجابه الخطا" });
    expect(result.isCorrect).toBe(false);
    expect(result.autoAwardedPoints).toBe(0);
  });
});
