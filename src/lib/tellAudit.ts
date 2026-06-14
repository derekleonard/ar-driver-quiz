import type { Question } from "../types";

// Single source of truth for the "test-wiseness" tell metrics — patterns that
// let a student guess the answer without knowing the material. Consumed by the
// CLI report (scripts/audit-tells.ts) and the CI guard (tests/bank-quality).
// The app shuffles choices per session; this keeps the at-rest data honest too.

export interface Tell {
  name: string;
  value: number; // an EV (0..1), a rate, or a raw count
  threshold: number | null; // null = report-only (no gate)
  op: "<" | ">" | "==";
  guarded: boolean; // true = fails the build if it breaches the threshold
}

type Chooser = (q: Question) => number[] | null;

const idx = (q: Question) => q.choices.map((_, i) => i);

// Expected score of a strategy that narrows each question to a set of option
// indices and guesses uniformly among them. Averaged over questions where it
// applies (choose returns null to skip). 25% = chance for 4 choices.
export function strategyEV(bank: Question[], choose: Chooser): { ev: number; applic: number } {
  let tot = 0,
    applic = 0;
  for (const q of bank) {
    const set = choose(q);
    if (!set || set.length === 0) continue;
    applic++;
    if (set.includes(q.answerIndex)) tot += 1 / set.length;
  }
  return { ev: applic ? tot / applic : 0, applic };
}

const ABSOLUTE =
  /\b(always|never|all|none|only|every|everyone|everything|any|anyone|anything|must|cannot|entirely|completely|no one|nothing|impossible)\b/i;
const HEDGE =
  /\b(usually|generally|typically|often|sometimes|may|might|should|most|can|could|normally|in general)\b/i;
const AONA = /all of (the )?above|none of (the )?above|both a|a and b|b and c/i;
const SAFE =
  /\b(slow|slower|slow down|stop|stopp|yield|caution|careful|carefully|check|watch|wait|safe|safely|safety|reduce|signal|avoid|distance|gap|look|prepare|brake|gently|gradually|pull over|both directions|defensiv|let them|give way|do not|don't)\b/gi;
const COND = /\b(when|unless|except|if|while|where|only|after|before|until)\b/gi;
const STOP = new Set(
  "a an the of to in on at is are be you your or and if it this that with for as do not no when will may can".split(" "),
);

const content = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t)));
const countMatches = (s: string, re: RegExp) => (s.match(re) || []).length;
const firstNumber = (s: string) => {
  const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function auditTells(bank: Question[]): Tell[] {
  const N = bank.length;
  const ev = (choose: Chooser) => strategyEV(bank, choose);

  const lenEV = (extreme: "max" | "min") =>
    ev((q) => {
      const L = q.choices.map((c) => c.trim().length);
      const target = extreme === "max" ? Math.max(...L) : Math.min(...L);
      return idx(q).filter((i) => L[i] === target);
    }).ev;

  const absEV = ev((q) => {
    const non = idx(q).filter((i) => !ABSOLUTE.test(q.choices[i]));
    return non.length ? non : idx(q);
  }).ev;

  const hedge = ev((q) => {
    const h = idx(q).filter((i) => HEDGE.test(q.choices[i]));
    return h.length ? h : null;
  });

  let numericQs = 0,
    midHits = 0;
  const numMid = ev((q) => {
    const nums = q.choices.map(firstNumber);
    if (!nums.every((n) => n !== null) || new Set(nums).size !== nums.length) return null;
    numericQs++;
    const order = idx(q).sort((a, b) => nums[a]! - nums[b]!);
    const mids = order.slice(1, -1);
    if (mids.includes(q.answerIndex)) midHits++;
    return mids;
  });

  const echoEV = ev((q) => {
    const st = content(q.question);
    const ov = q.choices.map((c) => [...content(c)].filter((t) => st.has(t)).length);
    const mx = Math.max(...ov);
    return idx(q).filter((i) => ov[i] === mx);
  }).ev;

  const cautious = ev((q) => {
    const sc = q.choices.map((c) => countMatches(c, SAFE));
    const mx = Math.max(...sc);
    return mx > 0 ? idx(q).filter((i) => sc[i] === mx) : null;
  });

  const qualified = ev((q) => {
    const sp = q.choices.map((c) => (c.match(/,/g) || []).length + countMatches(c, COND));
    const mx = Math.max(...sp);
    return mx > 0 ? idx(q).filter((i) => sp[i] === mx) : null;
  });

  const outlierEV = ev((q) => {
    const L = q.choices.map((c) => c.trim().length);
    const med = median(L);
    const dev = L.map((l) => Math.abs(l - med));
    const mx = Math.max(...dev);
    return idx(q).filter((i) => dev[i] === mx);
  }).ev;

  const aona = bank.reduce((n, q) => n + q.choices.filter((c) => AONA.test(c)).length, 0);

  const pos = [0, 0, 0, 0];
  for (const q of bank) pos[q.answerIndex]++;

  const guard = (name: string, value: number, threshold: number, op: Tell["op"], guarded = true): Tell => ({
    name,
    value,
    threshold,
    op,
    guarded,
  });
  const report = (name: string, value: number): Tell => ({
    name,
    value,
    threshold: null,
    op: "<",
    guarded: false,
  });

  return [
    guard("pick-longest", lenEV("max"), 0.4, "<"),
    guard("pick-shortest", lenEV("min"), 0.4, "<"),
    guard("avoid-absolutes", absEV, 0.33, "<"),
    guard(`pick-hedged (${hedge.applic} qs)`, hedge.ev, 0.33, "<"),
    // chance that the answer is one of the two middle values is ~50%
    guard(`numeric correct-is-middle (${numericQs} qs)`, numericQs ? midHits / numericQs : 0, 0.6, "<", numericQs >= 10),
    guard("all/none-of-above count", aona, 0, "=="),
    guard("position max share", N ? Math.max(...pos) / N : 0, 0.4, "<"),
    guard("position min share", N ? Math.min(...pos) / N : 0, 0.1, ">"),
    // Report-only: mild and/or inherent to safe-driving content (the correct
    // action genuinely tends to be the cautious, nuanced one) — watch as the
    // bank grows, but don't distort facts chasing them toward chance.
    report("stem keyword-echo", echoEV),
    report("numeric-middle strategy EV", numMid.ev),
    report(`cautious "safest answer" (${cautious.applic} qs)`, cautious.ev),
    report(`most-qualified/conditional (${qualified.applic} qs)`, qualified.ev),
    report("length-outlier (odd one out)", outlierEV),
  ];
}

export function passes(t: Tell): boolean {
  if (!t.guarded || t.threshold === null) return true;
  return t.op === "<"
    ? t.value < t.threshold
    : t.op === ">"
      ? t.value > t.threshold
      : t.value === t.threshold;
}
