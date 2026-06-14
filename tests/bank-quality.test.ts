import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Question } from "../src/types";
import { auditTells, passes } from "../src/lib/tellAudit";

// Guards against "test-wiseness" tells — patterns that let you answer without
// reading the question. An earlier bank had several: the answer was the longest
// choice ~82% of the time, sat at index 1 ~80% of the time, leaned on hedged
// wording while distractors leaned on absolutes, and (for numeric questions)
// was the bracketed middle value. The metric math lives in src/lib/tellAudit.ts
// (shared with `npm run audit-tells`); these tests fail the build if any guarded
// tell creeps back as questions are added. Fix: reword the offending distractors
// (see `npm run audit-tells` for which), then run `npm run normalize-bank`.

const questionsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "questions");
const BANK: Question[] = readdirSync(questionsDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(questionsDir, f), "utf8")));

describe("question bank: not gameable by a known tell", () => {
  const show = (v: number) => (v <= 1 ? `${(100 * v).toFixed(1)}%` : String(v));
  for (const tell of auditTells(BANK).filter((t) => t.guarded)) {
    it(`${tell.name} (need ${tell.op} ${show(tell.threshold!)})`, () => {
      expect(passes(tell), `${tell.name} = ${show(tell.value)}`).toBe(true);
    });
  }
});
