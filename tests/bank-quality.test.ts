import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Question } from "../src/types";

// Guards against the two "giveaway" patterns an earlier version of the bank
// had, where you could pass without reading the question:
//   1. the correct answer was the longest choice ~82% of the time, and
//   2. the correct answer sat at index 1 ~80% of the time (never at index 3).
// The app also shuffles choices per session (see tests for shuffleChoices),
// but we keep the at-rest data honest too so neither tell can creep back in
// as questions are added. If this fails on new questions: lengthen the terse
// distractors (so the answer isn't the longest) and run `npm run normalize-bank`.

const questionsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "questions",
);

const BANK: Question[] = readdirSync(questionsDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(questionsDir, f), "utf8")));

describe("question bank: not gameable by length", () => {
  const N = BANK.length;

  it("the correct answer is rarely the single longest choice", () => {
    const strictlyLongest = BANK.filter((q) => {
      const lens = q.choices.map((c) => c.trim().length);
      const max = Math.max(...lens);
      return lens[q.answerIndex] === max && lens.filter((l) => l === max).length === 1;
    }).length;
    // Random for 4 choices is 25%. Pre-fix this was 81.5%. Allow slack for
    // questions where the answer is naturally the most detailed option.
    expect(strictlyLongest / N).toBeLessThan(0.4);
  });

  // Expected score of a "always pick the {longest,shortest} option" strategy
  // with random tie-breaking. Both must be no better than chance (~25%) so
  // length gives nothing away in either direction.
  const pickByLength = (extreme: "max" | "min") =>
    BANK.reduce((sum, q) => {
      const lens = q.choices.map((c) => c.trim().length);
      const target = extreme === "max" ? Math.max(...lens) : Math.min(...lens);
      const nAtTarget = lens.filter((l) => l === target).length;
      return sum + (lens[q.answerIndex] === target ? 1 / nAtTarget : 0);
    }, 0) / N;

  it("'always pick the longest option' scores no better than chance", () => {
    expect(pickByLength("max")).toBeLessThan(0.4); // pre-fix this was ~83%
  });

  it("'always pick the shortest option' scores no better than chance", () => {
    expect(pickByLength("min")).toBeLessThan(0.4); // guards the inverse tell
  });
});

describe("question bank: not gameable by position", () => {
  const N = BANK.length;

  it("spreads the correct answer across all choice positions", () => {
    const counts = [0, 0, 0, 0];
    for (const q of BANK) counts[q.answerIndex]++;
    // Every slot must be used and no slot may dominate. Pre-fix index 1 held
    // ~80% and index 3 held 0%.
    for (let i = 0; i < 4; i++) {
      expect(counts[i], `index ${i} share`).toBeGreaterThan(0.1 * N);
      expect(counts[i], `index ${i} share`).toBeLessThan(0.4 * N);
    }
  });
});
