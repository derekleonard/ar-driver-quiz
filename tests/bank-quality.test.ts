import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Question } from "../src/types";

// Guards against "test-wiseness" tells — patterns that let you answer without
// reading the question. An earlier bank had several: the answer was the longest
// choice ~82% of the time, sat at index 1 ~80% of the time, leaned on hedged
// wording while distractors leaned on absolutes, and (for numeric questions)
// was the bracketed middle value. `scripts/audit-tells.mjs` reports them all;
// these tests fail the build if any creep back as questions are added. Fixes:
// reword terse/absolute distractors, then run `npm run normalize-bank`.

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

// Expected score of a guessing strategy that narrows each question to a set of
// option indices and picks uniformly among them. `choose` returns that set, or
// null to skip a question; averaged over the questions where it applies.
// (Kept in sync with scripts/audit-tells.mjs.)
function strategyEV(choose: (q: Question) => number[] | null): number {
  let tot = 0,
    applic = 0;
  for (const q of BANK) {
    const set = choose(q);
    if (!set || set.length === 0) continue;
    applic++;
    if (set.includes(q.answerIndex)) tot += 1 / set.length;
  }
  return applic ? tot / applic : 0;
}
const indices = (q: Question) => q.choices.map((_, i) => i);
const ABSOLUTE =
  /\b(always|never|all|none|only|every|everyone|everything|any|anyone|anything|must|cannot|entirely|completely|no one|nothing|impossible)\b/i;
const HEDGE =
  /\b(usually|generally|typically|often|sometimes|may|might|should|most|can|could|normally|in general)\b/i;

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

describe("question bank: not gameable by qualifier words", () => {
  it("eliminating options with absolute words doesn't beat chance", () => {
    // Distractors used to lean on absolutes (always/never/only/must), so a
    // student could discard them. Strategy: keep only options without one.
    const ev = strategyEV((q) => {
      const non = indices(q).filter((i) => !ABSOLUTE.test(q.choices[i]));
      return non.length ? non : indices(q);
    });
    expect(ev).toBeLessThan(0.33); // pre-fix ~35%
  });

  it("picking a hedged option doesn't beat chance", () => {
    // Correct answers used to be the hedged ones (usually/generally/may).
    const ev = strategyEV((q) => {
      const hedged = indices(q).filter((i) => HEDGE.test(q.choices[i]));
      return hedged.length ? hedged : null;
    });
    expect(ev).toBeLessThan(0.33); // pre-fix ~35%
  });
});

describe("question bank: not gameable by numeric value or filler options", () => {
  it("the correct number isn't disproportionately the bracketed middle value", () => {
    const firstNum = (s: string) => {
      const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    };
    let numeric = 0,
      middle = 0;
    for (const q of BANK) {
      const nums = q.choices.map(firstNum);
      if (!nums.every((n) => n !== null) || new Set(nums).size !== nums.length) continue;
      numeric++;
      const order = indices(q).sort((a, b) => nums[a]! - nums[b]!);
      if (order.slice(1, -1).includes(q.answerIndex)) middle++;
    }
    // Chance that the answer is one of the two middle values is ~50%; pre-fix
    // it was ~78%. (Skip the assertion if there are too few numeric questions.)
    if (numeric >= 10) expect(middle / numeric).toBeLessThan(0.6);
  });

  it("has no 'all/none of the above'-style options", () => {
    const aona = /all of (the )?above|none of (the )?above|both a|a and b|b and c/i;
    const offenders = BANK.filter((q) => q.choices.some((c) => aona.test(c))).map((q) => q.id);
    expect(offenders).toEqual([]);
  });
});
