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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionsDir = join(root, "src", "data", "questions");

// FNV-1a (32-bit) — a stable, well-spread string hash so target positions
// don't cluster the way Math.random across a single seed might.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const dist = {};
let moved = 0;
let count = 0;

for (const file of readdirSync(questionsDir).filter((f) => f.endsWith(".json"))) {
  const path = join(questionsDir, file);
  const bank = JSON.parse(readFileSync(path, "utf8"));
  for (const q of bank) {
    count++;
    const n = q.choices.length;
    const correct = q.choices[q.answerIndex];
    const others = q.choices.filter((_, i) => i !== q.answerIndex);
    const target = hash(q.id) % n;
    const next = [...others.slice(0, target), correct, ...others.slice(target)];
    if (target !== q.answerIndex) moved++;
    q.choices = next;
    q.answerIndex = target;
    dist[target] = (dist[target] ?? 0) + 1;
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
