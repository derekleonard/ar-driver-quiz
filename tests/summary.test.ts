import { describe, expect, it } from "vitest";
import { summaryFor } from "../src/lib/summary";
import type { Attempt } from "../src/types";

const NOW = new Date(2026, 5, 11, 18, 0, 0).getTime();

const exam = (startedAt: number, score: number): Attempt => ({
  mode: "exam",
  score,
  total: 25,
  passed: score >= 20,
  startedAt,
  durationSec: 600,
  perTopic: { "right-of-way": { correct: score, total: 25 } },
  missedIds: [],
});

describe("summaryFor", () => {
  it("reports the LAST exam and rounded topic mastery", () => {
    const s = summaryFor({}, [exam(NOW - 86_400_000, 10), exam(NOW, 21)], ["a"], NOW);
    expect(s.lastExam).toEqual({ score: 21, total: 25, passed: true, at: NOW });
    expect(s.topicMastery["right-of-way"]).toBe(Math.round((100 * 31) / 50));
    expect(s.streak).toBe(2);
  });

  it("omits lastExam when no exams were taken", () => {
    const drill: Attempt = {
      mode: "drill",
      score: 5,
      total: 10,
      startedAt: NOW,
      durationSec: 60,
      perTopic: { "right-of-way": { correct: 5, total: 10 } },
      missedIds: [],
    };
    const s = summaryFor({}, [drill], ["a"], NOW);
    expect(s.lastExam).toBeUndefined();
    expect(s.topicMastery["right-of-way"]).toBe(50);
  });
});
