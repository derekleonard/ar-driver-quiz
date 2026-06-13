import { describe, expect, it } from "vitest";
import { masteryClass, perTopicForAnswers, readinessScore } from "../src/lib/scoring";
import type { Attempt, Question } from "../src/types";

const q = (id: string, topic: Question["topic"]): Question => ({
  id,
  topic,
  question: "q",
  choices: ["a", "b", "c", "d"],
  answerIndex: 1,
  explanation: "e",
  citation: "c",
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

  // The three weights (0.5 mastery / 0.3 exam avg / 0.2 worst topic) are the
  // product spec — pin each in isolation so a weight swap fails the suite.
  const MASTERED = { box: 5, due: 0, seen: 5, correct: 5 };
  const exam = (score: number, perTopic: Attempt["perTopic"] = {}): Attempt => ({
    mode: "exam",
    score,
    total: 25,
    passed: score >= 20,
    startedAt: 0,
    durationSec: 600,
    perTopic,
    missedIds: [],
  });

  it("full mastery alone scores exactly 50 (the 0.5 weight)", () => {
    expect(readinessScore({ a: MASTERED, b: MASTERED }, ["a", "b"], [])).toBe(50);
  });

  it("perfect exams alone score exactly 30 (the 0.3 weight)", () => {
    expect(readinessScore({}, ["a", "b"], [exam(25)])).toBe(30);
  });

  it("a strong worst topic alone scores exactly 20 (the 0.2 weight)", () => {
    const drill: Attempt = {
      mode: "drill",
      score: 3,
      total: 3,
      startedAt: 0,
      durationSec: 60,
      perTopic: { "right-of-way": { correct: 3, total: 3 } },
      missedIds: [],
    };
    expect(readinessScore({}, ["a", "b"], [drill])).toBe(20);
  });

  it("exam average uses exactly the last 5 exams", () => {
    // ratios [1, 1, 0, 0, 1, 1, 1] -> last 5 avg = 0.6; last 3 would be 1.0,
    // all 7 would be 5/7. Only slice(-5) yields round(100 * 0.3 * 0.6) = 18.
    const exams = [25, 25, 0, 0, 25, 25, 25].map((s) => exam(s));
    expect(readinessScore({}, ["a", "b"], exams)).toBe(18);
  });

  it("the worst-topic floor ignores topics with fewer than 3 answers", () => {
    const drill: Attempt = {
      mode: "drill",
      score: 3,
      total: 5,
      startedAt: 0,
      durationSec: 60,
      perTopic: {
        "right-of-way": { correct: 0, total: 2 }, // below floor: excluded
        "speed-following": { correct: 3, total: 3 }, // at floor: included
      },
      missedIds: [],
    };
    // Only the perfect total-3 topic counts -> 0.2 * 1.0. A floor of >3
    // would yield 0; a floor of >=2 would let the 0% topic zero it out.
    expect(readinessScore({}, ["a", "b"], [drill])).toBe(20);
  });
});

describe("masteryClass", () => {
  it("bands at >=80 good, >=60 ok, else bad (boundaries included)", () => {
    expect(masteryClass(100)).toBe("good");
    expect(masteryClass(80)).toBe("good");
    expect(masteryClass(79)).toBe("ok");
    expect(masteryClass(60)).toBe("ok");
    expect(masteryClass(59)).toBe("bad");
    expect(masteryClass(0)).toBe("bad");
  });
});
