import { describe, expect, it } from "vitest";
import { perTopicForAnswers, readinessScore } from "../src/lib/scoring";
import type { Attempt, Question } from "../src/types";

const q = (id: string, topic: Question["topic"]): Question => ({
  id,
  topic,
  question: "q",
  choices: ["a", "b", "c", "d"],
  answerIndex: 1,
  explanation: "e",
  citation: "c",
  difficulty: 1,
});

describe("perTopicForAnswers", () => {
  it("grades and groups by topic", () => {
    const questions = [
      q("a1", "right-of-way"),
      q("a2", "right-of-way"),
      q("b1", "speed-following"),
    ];
    const { perTopic, missedIds, score } = perTopicForAnswers(questions, [1, 0, 1]);
    expect(score).toBe(2);
    expect(missedIds).toEqual(["a2"]);
    expect(perTopic["right-of-way"]).toEqual({ correct: 1, total: 2 });
    expect(perTopic["speed-following"]).toEqual({ correct: 1, total: 1 });
  });

  it("treats null (unanswered) as wrong", () => {
    const { score, missedIds } = perTopicForAnswers([q("a1", "right-of-way")], [null]);
    expect(score).toBe(0);
    expect(missedIds).toEqual(["a1"]);
  });
});

describe("readinessScore", () => {
  it("is 0 with no data", () => {
    expect(readinessScore({}, ["a", "b"], [])).toBe(0);
  });

  it("is 100 with full mastery, perfect exams, and strong topics", () => {
    const srs = {
      a: { box: 5, due: 0, seen: 5, correct: 5 },
      b: { box: 5, due: 0, seen: 5, correct: 5 },
    };
    const attempt: Attempt = {
      mode: "exam",
      score: 25,
      total: 25,
      passed: true,
      startedAt: 0,
      durationSec: 600,
      perTopic: { "right-of-way": { correct: 25, total: 25 } },
      missedIds: [],
    };
    expect(readinessScore(srs, ["a", "b"], [attempt])).toBe(100);
  });

  it("a weak topic drags the score down via the floor term", () => {
    const srs = {
      a: { box: 5, due: 0, seen: 5, correct: 5 },
      b: { box: 5, due: 0, seen: 5, correct: 5 },
    };
    const attempt: Attempt = {
      mode: "exam",
      score: 25,
      total: 25,
      passed: true,
      startedAt: 0,
      durationSec: 600,
      perTopic: {
        "right-of-way": { correct: 22, total: 22 },
        "signs-signals-markings": { correct: 0, total: 3 },
      },
      missedIds: [],
    };
    expect(readinessScore(srs, ["a", "b"], [attempt])).toBeLessThan(90);
  });
});
