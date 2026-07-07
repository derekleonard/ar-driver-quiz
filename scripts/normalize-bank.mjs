// Normalizes answer positions in the question bank so the correct choice
// isn't parked at a predictable index (it used to sit at index 1 ~80% of the
// time). Each correct answer is moved to a position derived from a hash of the
// question id, spreading answerIndex ~uniformly across choices while keeping
// distractor order. Idempotent: the correct answer's target only depends on
// its id, so re-running (e.g. after adding questions) is stable.
//
// The app also shuffles choices per session at render time (lib/shuffle.ts) —
// this just keeps the at-rest data honest. Run: node scripts/normalize-bank.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { placeCorrect } from "./lib/bank-normalize.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionsDir = join(root, "src", "data", "questions");

const dist = {};
let moved = 0;
let count = 0;

for (const file of readdirSync(questionsDir).filter((f) => f.endsWith(".json"))) {
  const path = join(questionsDir, file);
  const bank = JSON.parse(readFileSync(path, "utf8"));
  for (const q of bank) {
    count++;
    const { choices, answerIndex } = placeCorrect(q.id, q.choices, q.answerIndex);
    if (answerIndex !== q.answerIndex) moved++;
    q.choices = choices;
    q.answerIndex = answerIndex;
    dist[answerIndex] = (dist[answerIndex] ?? 0) + 1;
  }
  writeFileSync(path, JSON.stringify(bank, null, 2) + "\n");
}

console.log(`Normalized ${count} questions (${moved} moved).`);
console.log(
  "answerIndex distribution: " +
    Object.keys(dist)
      .sort()
      .map((k) => `${k}:${dist[k]} (${Math.round((100 * dist[k]) / count)}%)`)
      .join("  "),
);
