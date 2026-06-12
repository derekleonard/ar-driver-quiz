import { describe, expect, it } from "vitest";
import {
  buildDiagnostic,
  DIAGNOSTIC_PER_TOPIC,
} from "../src/lib/diagnosticBuilder";
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
        difficulty: 1,
      });
    }
  }
  return bank;
}

describe("buildDiagnostic", () => {
  it("samples every topic equally", () => {
    const diag = buildDiagnostic(makeBank(10), () => 0.5);
    expect(diag).toHaveLength(TOPICS.length * DIAGNOSTIC_PER_TOPIC);
    const counts: Partial<Record<Topic, number>> = {};
    for (const q of diag) counts[q.topic] = (counts[q.topic] ?? 0) + 1;
    for (const t of TOPICS) expect(counts[t]).toBe(DIAGNOSTIC_PER_TOPIC);
  });

  it("has no duplicates", () => {
    const diag = buildDiagnostic(makeBank(10), () => 0.3);
    expect(new Set(diag.map((q) => q.id)).size).toBe(diag.length);
  });

  it("takes whole topics when thinner than the quota", () => {
    const diag = buildDiagnostic(makeBank(3), () => 0.7);
    expect(diag).toHaveLength(TOPICS.length * 3);
  });
});
