// Emits deterministic golden vectors for the DriverPrepCore (KMP) port to assert
// against — guaranteeing the Kotlin engine matches this canonical TypeScript
// byte-for-byte (mergeSrs, scoring, shuffle, exam/diagnostic builders, FNV-1a).
// Run: npm run export-parity   ->  parity-vectors/vectors.json
//
// PRNG = mulberry32. Reproduce EXACTLY in Kotlin (Int math; treat state as unsigned):
//   var a = seed
//   fun rawNext(): Int {
//     a += 0x6D2B79F5
//     var t = (a xor (a ushr 15)) * (1 or a)
//     t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
//     return (t xor (t ushr 14))            // compare as (toLong() and 0xFFFFFFFFL)
//   }
//   fun rand(): Double = (rawNext().toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BANK } from "../src/data/bank";
import type { Question, SrsState, SrsEntry, Attempt } from "../src/types";
import { mergeSrs, recordAnswer, masteryFraction, reviewQueue, newEntry } from "../src/lib/leitner";
import { readinessScore } from "../src/lib/scoring";
import { shuffle, shuffleChoices } from "../src/lib/shuffle";
import { buildExam } from "../src/lib/examBuilder";
import { buildDiagnostic } from "../src/lib/diagnosticBuilder";
import { studyStreak, displayStreak } from "../src/lib/streak";
import { summaryFor } from "../src/lib/summary";
import { auditTells } from "../src/lib/tellAudit";

function mulberry32Raw(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const mulberry32 = (seed: number): (() => number) => {
  const raw = mulberry32Raw(seed);
  return () => raw() / 4294967296;
};
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// Mirror of scripts/normalize-bank.mjs placement (correct answer -> hash(id)%n).
function normalizePlacement(q: Pick<Question, "id" | "choices" | "answerIndex">) {
  const n = q.choices.length;
  const correct = q.choices[q.answerIndex];
  const others = q.choices.filter((_, i) => i !== q.answerIndex);
  const target = fnv1a(q.id) % n;
  return { choices: [...others.slice(0, target), correct, ...others.slice(target)], answerIndex: target };
}

const SEEDS = [1, 42, 12345, 987654321];
const E = (box: number, due: number, seen: number, correct: number): SrsEntry => ({ box, due, seen, correct });

// --- PRNG raw uint32 stream (validate the Kotlin PRNG first) ---
const prng = SEEDS.map((seed) => {
  const r = mulberry32Raw(seed);
  return { seed, stream: Array.from({ length: 12 }, () => r()) };
});

// --- FNV-1a ---
const fnv = ["signs-001", "license-admin-062", "alcohol-gdl-027", "tx-signs-001", "a", "abc", ""].map((id) => ({
  id,
  hash: fnv1a(id),
}));

// --- normalize placement ---
const normalize = [
  { id: "q-a", choices: ["A", "B", "C", "D"], answerIndex: 0 },
  { id: "q-bb", choices: ["A", "B", "C", "D"], answerIndex: 2 },
  { id: "signs-001", choices: ["w", "x", "y", "z"], answerIndex: 3 },
  { id: "three", choices: ["one", "two", "three"], answerIndex: 1 },
].map((q) => ({ input: q, output: normalizePlacement(q) }));

// --- mergeSrs (each tie-break branch) ---
const merge = (
  [
    { a: { x: E(2, 100, 3, 2) }, b: { x: E(1, 50, 1, 1) } }, // a more seen -> keep a
    { a: { x: E(1, 50, 1, 1) }, b: { x: E(3, 200, 5, 4) } }, // b more seen -> keep b
    { a: { x: E(2, 100, 3, 2) }, b: { y: E(1, 10, 1, 0) } }, // disjoint -> union
    { a: { x: E(2, 100, 3, 2) }, b: { x: E(4, 100, 3, 2) } }, // seen==, box> -> b
    { a: { x: E(3, 100, 3, 2) }, b: { x: E(3, 200, 3, 2) } }, // seen==box==, due> -> b
    { a: { x: E(3, 100, 3, 1) }, b: { x: E(3, 100, 3, 2) } }, // all== except correct> -> b
    { a: { x: E(3, 100, 3, 2) }, b: { x: E(3, 100, 3, 2) } }, // identical -> keep a
    { a: {}, b: { z: E(1, 0, 0, 0) } }, // empty a
  ] as { a: SrsState; b: SrsState }[]
).map(({ a, b }) => ({ a, b, expected: mergeSrs(a, b) }));

// --- recordAnswer ---
const record = [
  { entry: E(1, 0, 0, 0), correct: true, now: 1000 },
  { entry: E(5, 0, 9, 9), correct: true, now: 1000 }, // cap at MAX_BOX
  { entry: E(4, 0, 5, 3), correct: false, now: 1000 }, // wrong -> box 1
  { entry: newEntry(500), correct: true, now: 2000 },
].map((c) => ({ ...c, expected: recordAnswer(c.entry, c.correct, c.now) }));

// --- readinessScore ---
const att = (mode: Attempt["mode"], score: number, total: number, perTopic: Attempt["perTopic"], startedAt: number): Attempt => ({
  mode,
  score,
  total,
  startedAt,
  durationSec: 60,
  perTopic,
  missedIds: [],
});
const readiness = (
  [
    { srs: {}, allIds: ["a", "b", "c", "d"], attempts: [] },
    {
      srs: { a: E(3, 0, 2, 2), b: E(4, 0, 3, 3), c: E(1, 0, 1, 0) },
      allIds: ["a", "b", "c", "d"],
      attempts: [
        att("exam", 22, 25, { "signs-signals-markings": { correct: 7, total: 8 } }, 1),
        att("exam", 18, 25, { "right-of-way": { correct: 1, total: 3 } }, 2),
      ],
    },
  ] as { srs: SrsState; allIds: string[]; attempts: Attempt[] }[]
).map((c) => ({ ...c, expected: readinessScore(c.srs, c.allIds, c.attempts) }));

// --- masteryFraction ---
const mastery = (
  [
    { state: { a: E(3, 0, 0, 0), b: E(2, 0, 0, 0) }, allIds: ["a", "b", "c", "d"] },
    { state: {}, allIds: [] },
  ] as { state: SrsState; allIds: string[] }[]
).map((c) => ({ ...c, expected: masteryFraction(c.state, c.allIds) }));

// --- shuffle (permutation of 0..n-1) ---
const shuf: unknown[] = [];
for (const seed of SEEDS) for (const n of [4, 8, 25]) {
  const input = Array.from({ length: n }, (_, i) => i);
  shuf.push({ seed, input, output: shuffle(input, mulberry32(seed)) });
}

// --- shuffleChoices ---
const sc: unknown[] = [];
for (const seed of [1, 42]) for (const q of BANK.slice(0, 3)) {
  const out = shuffleChoices(q, mulberry32(seed));
  sc.push({ seed, id: q.id, choices: q.choices, answerIndex: q.answerIndex, outChoices: out.choices, outAnswerIndex: out.answerIndex });
}

// --- buildExam / buildDiagnostic (over the real AR bank) ---
const bankProjection = BANK.map((q) => ({ id: q.id, topic: q.topic })); // Kotlin rebuilds the bank from this
const buildExamV = SEEDS.map((seed) => ({ seed, expected: buildExam(BANK, mulberry32(seed)).map((q) => q.id) }));
const buildDiagnosticV = SEEDS.map((seed) => ({ seed, expected: buildDiagnostic(BANK, mulberry32(seed)).map((q) => q.id) }));

// --- reviewQueue ---
const rqItems = BANK.slice(0, 20).map((q) => ({ id: q.id }));
const rqState: SrsState = {};
rqItems.forEach((it, i) => { if (i % 2 === 0) rqState[it.id] = E((i % 5) + 1, i * 10, i + 1, i); });
const reviewQueueV = SEEDS.map((seed) => ({
  seed,
  now: 1_000_000,
  size: 15,
  state: rqState,
  items: rqItems,
  expected: reviewQueue(rqState, rqItems, 1_000_000, 15, mulberry32(seed)).map((x) => x.id),
}));

// --- streak / summary (dayKey is local-calendar; exporter pinned to TZ=UTC, Kotlin asserts in UTC) ---
const day = (n: number) => Date.UTC(2026, 5, n, 12, 0, 0); // noon UTC, June 2026
const mkAtts = (ns: number[]) => ns.map((n) => ({ startedAt: day(n) }));
const studyStreakV = [
  { attempts: [] as { startedAt: number }[], now: day(15) },
  { attempts: mkAtts([15, 14, 13]), now: day(15) },
  { attempts: mkAtts([14, 13]), now: day(15) },
  { attempts: mkAtts([15, 13, 12]), now: day(15) },
  { attempts: mkAtts([10]), now: day(15) },
].map((c) => ({ attempts: c.attempts, now: c.now, expected: studyStreak(c.attempts as Attempt[], c.now) }));
const displayStreakV = [
  { stored: 5, lastActive: day(15) as number | null, now: day(15) },
  { stored: 5, lastActive: day(15) as number | null, now: day(16) },
  { stored: 5, lastActive: day(15) as number | null, now: day(17) },
  { stored: 7, lastActive: null as number | null, now: day(15) },
].map((c) => ({ ...c, expected: displayStreak(c.stored, c.lastActive, c.now) }));
const summaryV = (() => {
  const srs: SrsState = { a: E(3, 0, 2, 2), b: E(4, 0, 3, 3), c: E(1, 0, 1, 0) };
  const allIds = ["a", "b", "c", "d"];
  const attempts: Attempt[] = [
    att("exam", 22, 25, { "signs-signals-markings": { correct: 7, total: 8 } }, day(14)),
    att("exam", 18, 25, { "right-of-way": { correct: 2, total: 3 } }, day(15)),
  ];
  const now = day(15);
  return [{ srs, allIds, attempts, now, expected: summaryFor(srs, attempts, allIds, now) }];
})();

const out = {
  generatedFrom: "ar-driver-quiz",
  bankSize: BANK.length,
  prngAlgo: "mulberry32 (uint32 stream; rand = raw / 2^32)",
  prng,
  fnv,
  normalize,
  merge,
  record,
  readiness,
  mastery,
  shuffle: shuf,
  shuffleChoices: sc,
  bankProjection,
  buildExam: buildExamV,
  buildDiagnostic: buildDiagnosticV,
  reviewQueue: reviewQueueV,
  streakTz: "UTC",
  studyStreak: studyStreakV,
  displayStreak: displayStreakV,
  summary: summaryV,
  fullBank: BANK,
  tellAudit: auditTells(BANK),
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "parity-vectors");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "vectors.json"), JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote parity-vectors/vectors.json — bank=${BANK.length}; ` +
    `${prng.length} prng, ${merge.length} merge, ${record.length} record, ${readiness.length} readiness, ` +
    `${shuf.length} shuffle, ${buildExamV.length} exam, ${buildDiagnosticV.length} diagnostic, ${reviewQueueV.length} reviewQueue`,
);
