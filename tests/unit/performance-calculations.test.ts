import { describe, expect, it } from "vitest";
import {
  aggregateTopicEvidence,
  buildClassIntelligence,
  classifyTrend,
  evaluateRiskRules,
  normalizeTopic,
  selectStrongTopics,
  selectWeakTopics,
  summarizeScores,
  type RiskConfig,
  type ScoreRecord,
} from "@/modules/performance/calculations";

function score(
  id: string,
  date: string,
  value: number | null,
  status: ScoreRecord["status"] = "graded",
  assessmentId = `assessment-${id}`,
  studentId = "student-1",
): ScoreRecord {
  return {
    id,
    date,
    status,
    score: value,
    maxScore: 100,
    assessmentId,
    studentId,
  };
}

const riskConfig: RiskConfig = {
  enabled: true,
  minAssessments: 2,
  averageBelowPercent: 60,
  consecutiveDeclines: 2,
  weakTopicPercent: 60,
};

describe("performance score calculations", () => {
  it("counts only graded results and never treats absence as zero", () => {
    const summary = summarizeScores(
      [
        score("s1", "2026-01-01", 40),
        score("s2", "2026-02-01", null, "missing"),
        score("s3", "2026-03-01", null, "excused"),
        score("s4", "2026-04-01", 80),
        score("s5", "2026-05-01", null, "not_taken"),
      ],
      3,
    );

    expect(summary.gradedCount).toBe(2);
    expect(summary.completedCount).toBe(2);
    expect(summary.missedCount).toBe(2);
    expect(summary.excusedCount).toBe(1);
    expect(summary.notTakenCount).toBe(1);
    expect(summary.averagePercent).toBe(60);
    expect(summary.highestPercent).toBe(80);
    expect(summary.lowestPercent).toBe(40);
    expect(summary.latestPercent).toBe(80);
    expect(summary.previousPercent).toBe(40);
    expect(summary.consecutiveChanges).toEqual([40]);
    expect(summary.evidenceIds).toEqual(["s1", "s4"]);
    expect(summary.insufficientData).toBe(true);
    expect(summary.latestEvidenceAt).toBe("2026-04-01");
  });

  it("classifies trends from half averages with an explicit steady band", () => {
    const improving = [
      score("i1", "2026-01-01", 40),
      score("i2", "2026-02-01", 50),
      score("i3", "2026-03-01", 80),
      score("i4", "2026-04-01", 90),
    ];
    const declining = [
      score("d1", "2026-01-01", 90),
      score("d2", "2026-02-01", 80),
      score("d3", "2026-03-01", 50),
      score("d4", "2026-04-01", 40),
    ];
    const steady = [
      score("t1", "2026-01-01", 50),
      score("t2", "2026-02-01", 52),
      score("t3", "2026-03-01", 51),
      score("t4", "2026-04-01", 50),
    ];

    expect(
      classifyTrend(summarizeScores(improving), improving).classification,
    ).toBe("improving");
    expect(
      classifyTrend(summarizeScores(declining), declining).classification,
    ).toBe("declining");
    expect(classifyTrend(summarizeScores(steady), steady).classification).toBe("steady");
    expect(
      classifyTrend(summarizeScores(improving.slice(0, 2)), improving.slice(0, 2)).classification,
    ).toBe("insufficient_data");
    expect(classifyTrend(summarizeScores(improving), improving).rule).toContain(">=+5");
  });
});

describe("performance topic evidence", () => {
  it("aggregates only question responses and explicit topic counts", () => {
    const topics = aggregateTopicEvidence(
      [
        {
          topic: "  Fractions  ",
          correct: false,
          responseId: "response-1",
          questionId: "question-1",
          at: "2026-01-02",
          studentId: "student-1",
        },
        {
          topic: "fractions",
          correct: true,
          responseId: "response-2",
          questionId: "question-2",
          at: "2026-01-03",
          studentId: "student-1",
        },
      ],
      [
        {
          topic: "Fractions",
          correctCount: 1,
          incorrectCount: 4,
          resultId: "result-1",
          assessmentId: "assessment-1",
          at: "2026-01-05",
          studentId: "student-1",
        },
      ],
    );

    expect(normalizeTopic("  Topic   Name ")).toBe("Topic Name");
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      topic: "Fractions",
      observedCount: 7,
      correctCount: 2,
      incorrectCount: 5,
      incorrectRatePercent: 71.4,
      questionCount: 2,
      manualObservationCount: 5,
      latestAt: "2026-01-05",
      evidenceIds: ["response-1", "response-2", "result-1"],
      sourceIds: ["assessment-1", "question-1", "question-2"],
    });
    expect(selectWeakTopics(topics, 60)).toHaveLength(1);
    expect(selectStrongTopics(topics, 30)).toHaveLength(0);
    expect(selectWeakTopics(topics, 60, 8)).toHaveLength(0);
  });
});

describe("deterministic risk rules", () => {
  it("produces stable keys and uses evidence time, not the query end", () => {
    const results = [
      score("risk-1", "2026-02-01", 40, "graded", "paper-1"),
      score("risk-2", "2026-03-01", 50, "graded", "paper-2"),
      score("risk-3", "2026-04-01", 55, "graded", "paper-3"),
    ];
    const summary = summarizeScores(results, 2);
    const trend = classifyTrend(summary, results, 2);
    const input = {
      studentId: "student-1",
      from: "2026-01-01",
      to: "2026-12-31",
      config: riskConfig,
      summary,
      trend,
      topics: [],
    };

    const first = evaluateRiskRules(input);
    const second = evaluateRiskRules(input);
    expect(first.map((risk) => risk.ruleKey)).toEqual(["low_average"]);
    expect(first[0]?.riskKey).toBe(second[0]?.riskKey);
    expect(first[0]?.detectedAt).toBe("2026-04-01");
    expect(first[0]?.threshold).toBe(60);
    expect(first[0]?.evidenceIds).toEqual(["risk-1", "risk-2", "risk-3"]);

    const disabled = evaluateRiskRules({ ...input, config: { ...riskConfig, enabled: false } });
    expect(disabled).toEqual([]);
  });

  it("detects declining trends and weak topics with their own evidence", () => {
    const results = [
      score("decline-1", "2026-01-01", 90),
      score("decline-2", "2026-02-01", 80),
      score("decline-3", "2026-03-01", 70),
      score("decline-4", "2026-04-01", 60),
    ];
    const summary = summarizeScores(results, 2);
    const trend = classifyTrend(summary, results, 2);
    const topics = [
      {
        topic: "Decimals",
        observedCount: 5,
        correctCount: 1,
        incorrectCount: 4,
        incorrectRatePercent: 80,
        questionCount: 0,
        manualObservationCount: 5,
        latestAt: "2026-03-10",
        evidenceIds: ["topic-result-1"],
        sourceIds: ["assessment-9"],
      },
    ];

    const risks = evaluateRiskRules({
      studentId: "student-1",
      from: "2026-01-01",
      to: "2026-12-31",
      config: riskConfig,
      summary,
      trend,
      topics,
    });

    expect(risks.map((risk) => risk.ruleKey)).toEqual(["declining_trend", "weak_topic"]);
    expect(risks.find((risk) => risk.ruleKey === "declining_trend")?.threshold).toBe(2);
    expect(risks.find((risk) => risk.ruleKey === "weak_topic")?.detectedAt).toBe("2026-03-10");
    expect(risks.find((risk) => risk.ruleKey === "weak_topic")?.evidenceIds).toEqual([
      "topic-result-1",
    ]);
  });
});

describe("class intelligence", () => {
  const students = [
    {
      studentId: "a",
      name: "A",
      summary: summarizeScores([score("a1", "2026-01-01", 40, "graded", "q1", "a"), score("a2", "2026-02-01", 80, "graded", "q2", "a")], 2),
      trend: classifyTrend(
        summarizeScores([score("a1", "2026-01-01", 40, "graded", "q1", "a"), score("a2", "2026-02-01", 80, "graded", "q2", "a")], 2),
        [score("a1", "2026-01-01", 40, "graded", "q1", "a"), score("a2", "2026-02-01", 80, "graded", "q2", "a")],
        2,
      ),
    },
    {
      studentId: "b",
      name: "B",
      summary: summarizeScores([score("b1", "2026-01-01", 50, "graded", "q2", "b"), score("b2", "2026-02-01", 60, "graded", "q1", "b")], 2),
      trend: classifyTrend(
        summarizeScores([score("b1", "2026-01-01", 50, "graded", "q2", "b"), score("b2", "2026-02-01", 60, "graded", "q1", "b")], 2),
        [score("b1", "2026-01-01", 50, "graded", "q2", "b"), score("b2", "2026-02-01", 60, "graded", "q1", "b")],
        2,
      ),
    },
    {
      studentId: "c",
      name: "C",
      summary: summarizeScores([score("c1", "2026-01-01", 70, "graded", "q1", "c")], 2),
      trend: classifyTrend(
        summarizeScores([score("c1", "2026-01-01", 70, "graded", "q1", "c")], 2),
        [score("c1", "2026-01-01", 70, "graded", "q1", "c")],
        2,
      ),
    },
  ];

  it("compares only students with the same graded assessment set", () => {
    const result = buildClassIntelligence({
      students,
      assessments: [
        {
          id: "q1",
          title: "Quiz 1",
          date: "2026-01-01",
          results: [score("a1", "2026-01-01", 40, "graded", "q1", "a"), score("b2", "2026-02-01", 60, "graded", "q1", "b")],
        },
        {
          id: "q2",
          title: "Quiz 2",
          date: "2026-02-01",
          results: [score("a2", "2026-02-01", 80, "graded", "q2", "a"), score("b1", "2026-01-01", 50, "graded", "q2", "b")],
        },
      ],
      questionEvidence: [
        {
          topic: "Algebra",
          correct: false,
          responseId: "r1",
          questionId: "question-1",
          at: "2026-01-01",
          studentId: "a",
          prompt: "Solve x",
        },
        {
          topic: "Algebra",
          correct: false,
          responseId: "r2",
          questionId: "question-1",
          at: "2026-01-01",
          studentId: "b",
          prompt: "Solve x",
        },
      ],
      minSamples: 2,
    });

    expect(result.comparable).toBe(true);
    expect(result.comparableStudentCount).toBe(2);
    expect(result.students.map((student) => student.studentId)).toEqual(["a", "b"]);
    expect(result.comparisonNoteKey).toBe("Performance.class.comparableNote");
    expect(result.weakestAssessments[0]?.id).toBe("q1");
    expect(result.questionIncorrectRates[0]).toMatchObject({
      questionId: "question-1",
      incorrectRatePercent: 100,
      observedCount: 2,
    });
    expect(result.improvingPercent + result.steadyPercent + result.decliningPercent + result.insufficientPercent).toBe(100);
  });

  it("does not claim comparability when cohorts differ", () => {
    const result = buildClassIntelligence({
      students: [students[0]!, students[2]!],
      assessments: [],
      questionEvidence: [],
      minSamples: 2,
    });

    expect(result.comparable).toBe(false);
    expect(result.comparableStudentCount).toBe(0);
    expect(result.comparisonNoteKey).toBe("Performance.class.notComparableNote");
    expect(result.improvingPercent).toBe(0);
  });
});
