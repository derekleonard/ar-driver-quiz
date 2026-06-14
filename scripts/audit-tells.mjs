// Audits the question bank for "test-wiseness" tells — patterns that let a
// student guess the answer without knowing the material. Prints each tell's
// exploitability (expected score of that guessing strategy, random tie-break;
// 25% = chance for 4 choices) and fails (exit 1) if a GUARDED tell is breached.
// The app also shuffles choices per session, but we keep the at-rest data
// honest too. Run: node scripts/audit-tells.mjs  (npm run audit-tells)
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "questions");
const BANK = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const N = BANK.length;

const ABS = /\b(always|never|all|none|only|every|everyone|everything|any|anyone|anything|must|cannot|entirely|completely|no one|nothing|impossible)\b/i;
const HEDGE = /\b(usually|generally|typically|often|sometimes|may|might|should|most|can|could|normally|in general)\b/i;
const AONA = /all of (the )?above|none of (the )?above|both a|a and b|b and c/i;
const STOP = new Set("a an the of to in on at is are be you your or and if it this that with for as do not no when will may can".split(" "));
const num = (s) => {
  const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const content = (s) =>
  new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t)));

// Expected score of a strategy that, per question, narrows to a chosen set of
// option indices and guesses uniformly among them (tie-break). Averaged over
// the questions where the strategy applies (chosenFn returns null to skip).
function strategyEV(chosenFn) {
  let tot = 0, applic = 0;
  for (const q of BANK) {
    const chosen = chosenFn(q);
    if (!chosen || chosen.size === 0) continue;
    applic++;
    if (chosen.has(q.answerIndex)) tot += 1 / chosen.size;
  }
  return { ev: applic ? tot / applic : 0, applic };
}
const idx = (q) => q.choices.map((_, i) => i);

// --- length (longest / shortest) ---
const lenEV = (extreme) =>
  strategyEV((q) => {
    const L = q.choices.map((c) => c.trim().length);
    const target = extreme === "max" ? Math.max(...L) : Math.min(...L);
    return new Set(idx(q).filter((i) => L[i] === target));
  }).ev;

// --- absolute words: eliminate options containing one ---
const absEV = strategyEV((q) => {
  const non = idx(q).filter((i) => !ABS.test(q.choices[i]));
  return new Set(non.length ? non : idx(q));
}).ev;

// --- hedge words: pick a hedged option (only where some option is hedged) ---
const hedge = strategyEV((q) => {
  const h = idx(q).filter((i) => HEDGE.test(q.choices[i]));
  return h.length ? new Set(h) : null;
});

// --- numeric middle-value ---
let numericQs = 0, midHits = 0;
const numMid = strategyEV((q) => {
  const nums = q.choices.map(num);
  if (!nums.every((n) => n !== null) || new Set(nums).size !== nums.length) return null;
  numericQs++;
  const order = idx(q).sort((a, b) => nums[a] - nums[b]);
  const mids = new Set(order.slice(1, -1));
  if (mids.has(q.answerIndex)) midHits++;
  return mids;
});

// --- stem keyword echo (report only) ---
const echoEV = strategyEV((q) => {
  const st = content(q.question);
  const ov = q.choices.map((c) => [...content(c)].filter((t) => st.has(t)).length);
  const mx = Math.max(...ov);
  return new Set(idx(q).filter((i) => ov[i] === mx));
}).ev;

// --- all/none of the above ---
const aona = BANK.reduce((n, q) => n + q.choices.filter((c) => AONA.test(c)).length, 0);

// --- position distribution ---
const pos = [0, 0, 0, 0];
for (const q of BANK) pos[q.answerIndex]++;
const posMax = Math.max(...pos) / N, posMin = Math.min(...pos) / N;

// thresholds for GUARDED tells (chance is 25%, or 50% for numeric-middle)
const T = { len: 0.4, abs: 0.33, hedge: 0.33, numMid: 0.6, posHi: 0.4, posLo: 0.1 };
const rows = [
  ["pick-longest", lenEV("max"), T.len, "<"],
  ["pick-shortest", lenEV("min"), T.len, "<"],
  ["avoid-absolutes", absEV, T.abs, "<"],
  [`pick-hedged (${hedge.applic} qs)`, hedge.ev, T.hedge, "<"],
  [`numeric correct-is-middle (${numericQs} qs)`, numericQs ? midHits / numericQs : 0, T.numMid, "<"],
  ["all/none-of-above count", aona, 0, "=="],
  ["position max share", posMax, T.posHi, "<"],
  ["position min share", posMin, T.posLo, ">"],
];
const reportOnly = [
  ["stem keyword-echo", echoEV],
  ["numeric-middle strategy EV", numMid.ev],
];

let failed = 0;
const pct = (x) => (x <= 1 ? (100 * x).toFixed(1) + "%" : String(x));
console.log(`Question bank tell audit — ${N} questions (chance ≈ 25%)\n`);
for (const [name, val, thr, op] of rows) {
  const ok = op === "<" ? val < thr : op === ">" ? val > thr : val === thr;
  if (!ok) failed++;
  console.log(`  [${ok ? "OK " : "BAD"}] ${name.padEnd(28)} ${pct(val).padStart(7)}  (need ${op} ${pct(thr)})`);
}
console.log("  -- report only --");
for (const [name, val] of reportOnly)
  console.log(`        ${name.padEnd(28)} ${pct(val).padStart(7)}`);

if (failed) {
  console.error(`\nTELL AUDIT FAILED: ${failed} guarded tell(s) over threshold.`);
  process.exit(1);
}
console.log("\nTell audit OK.");
