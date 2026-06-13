import { describe, expect, it } from "vitest";
import { buildExam, EXAM_MIX, EXAM_SIZE, isPassing, PASS_SCORE } from "../src/lib/examBuilder";
import { TOPICS, type Question, type Topic } from "../src/types";

function makeBank(perTopic: number): Question[] {
  const bank: Question[] = [];
  for (const topic of TOPICS) {
    for (let i = 0; i < perTopic; i++) {
      bank.push({
        id: `${topic}-${i}`,
        topic,
        question: "q",
        choices: ["a", "b", "c", "d"],
        answerIndex: 0,
        explanation: "e",
        citation: "c",
      });
    }
  }
  return bank;
}

// deterministic PRNG for stable tests
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("buildExam", () => {
  it("EXAM_MIX sums to EXAM_SIZE", () => {
    const sum = Object.values(EXAM_MIX).reduce((a, b) => a + b, 0);
    expect(sum).toBe(EXAM_SIZE);
  });

  it("builds a 25-question exam matching the topic mix when the bank is rich", () => {
    const exam = buildExam(makeBank(10), mulberry32(42));
    expect(exam).toHaveLength(EXAM_SIZE);
    const counts: Partial<Record<Topic, number>> = {};
    for (const q of exam) counts[q.topic] = (counts[q.topic] ?? 0) + 1;
    for (const t of TOPICS) expect(counts[t] ?? 0).toBe(EXAM_MIX[t]);
  });

  it("has no duplicate questions", () => {
    const exam = buildExam(makeBank(10), mulberry32(7));
    expect(new Set(exam.map((q) => q.id)).size).toBe(exam.length);
  });

  it("fills shortfalls from other topics when a topic is thin", () => {
    const bank = makeBank(10).filter((q) => q.topic !== "license-admin");
    const exam = buildExam(bank, mulberry32(1));
    expect(exam).toHaveLength(EXAM_SIZE);
  });

  it("returns the whole bank when smaller than EXAM_SIZE", () => {
    const bank = makeBank(2); // 16 questions
    const exam = buildExam(bank, mulberry32(3));
    expect(exam).toHaveLength(16);
  });

  it("pins the real AR pass rule: 20 of 25 (80%)", () => {
    expect(PASS_SCORE).toBe(20);
    expect(EXAM_SIZE).toBe(25);
    expect(PASS_SCORE / EXAM_SIZE).toBe(0.8);
  });

  it("isPassing boundary: 19 fails, 20 and 21 pass", () => {
    expect(isPassing(19)).toBe(false);
    expect(isPassing(20)).toBe(true);
    expect(isPassing(21)).toBe(true);
  });
});
