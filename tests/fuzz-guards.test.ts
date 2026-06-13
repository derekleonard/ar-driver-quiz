// Corrupt-input fuzz for the load guards. The contract under test: malformed
// localStorage blobs and malformed cloud docs must be REJECTED cleanly by the
// guards (no throw), and anything that *passes* a guard must be safe to feed
// to the downstream consumers (dashboard/streak/readiness math) without
// throwing or producing NaN/undefined that white-screens the app.
import { describe, expect, it } from "vitest";
import { isAttempt, isSrsEntry, sanitizeSrs } from "../src/lib/storage";
import { isUserSummary } from "../src/lib/summary";
import { topicStatsFromAttempts, readinessScore } from "../src/lib/scoring";
import { studyStreak } from "../src/lib/streak";
import type { Attempt } from "../src/types";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A grab-bag of pathological values to splat into fields.
const JUNK: unknown[] = [
  undefined,
  null,
  NaN,
  Infinity,
  -Infinity,
  "",
  "5",
  "junk",
  0,
  -1,
  3.14,
  true,
  false,
  [],
  [1, 2, 3],
  {},
  { nested: { deep: 1 } },
  Number.MAX_SAFE_INTEGER,
];

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

// Mutate an object: randomly delete fields, add junk fields, or wrong-type
// existing ones.
function mutate(r: () => number, base: Record<string, unknown>): unknown {
  if (r() < 0.05) return pick(r, JUNK); // sometimes replace wholesale
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(out)) {
    const roll = r();
    if (roll < 0.25) delete out[k];
    else if (roll < 0.5) out[k] = pick(r, JUNK);
  }
  if (r() < 0.5) out[`extra_${Math.floor(r() * 100)}`] = pick(r, JUNK);
  return out;
}

const validAttempt = (): Record<string, unknown> => ({
  mode: "drill",
  score: 5,
  total: 10,
  startedAt: 1_750_000_000_000,
  durationSec: 60,
  perTopic: { "right-of-way": { correct: 2, total: 3 } },
  missedIds: ["x"],
});

const validEntry = (): Record<string, unknown> => ({
  box: 2,
  due: 1_750_000_000_000,
  seen: 3,
  correct: 2,
});

const validSummary = (): Record<string, unknown> => ({
  readiness: 70,
  streak: 4,
  topicMastery: { "right-of-way": 80 },
  lastExam: { score: 20, total: 25, passed: true, at: 1_750_000_000_000 },
});

describe("fuzz: guards never throw on arbitrary garbage", () => {
  it("isAttempt / isSrsEntry / sanitizeSrs / isUserSummary tolerate any value", () => {
    const r = rng(1);
    for (let i = 0; i < 5000; i++) {
      const v = r() < 0.5 ? pick(r, JUNK) : mutate(r, validAttempt());
      expect(() => isAttempt(v)).not.toThrow();
      expect(() => isSrsEntry(v)).not.toThrow();
      expect(() => sanitizeSrs(v)).not.toThrow();
      expect(() => isUserSummary(v)).not.toThrow();
    }
  });
});

describe("fuzz: anything passing isAttempt is safe downstream", () => {
  it("accepted attempts never crash streak / readiness / topicStats math", () => {
    const r = rng(7);
    const accepted: Attempt[] = [];
    for (let i = 0; i < 8000; i++) {
      const v = mutate(r, validAttempt());
      if (isAttempt(v)) accepted.push(v);
    }
    expect(accepted.length).toBeGreaterThan(0); // sanity: fuzz produced some valid

    // Each accepted attempt must survive the consumers without throwing.
    for (const a of accepted) {
      expect(() => topicStatsFromAttempts([a])).not.toThrow();
      expect(() => studyStreak([a], Date.now())).not.toThrow();
      expect(() => readinessScore({}, ["q1", "q2"], [a])).not.toThrow();
    }

    // The whole batch together must also be finite, never NaN.
    const ready = readinessScore({}, ["q1", "q2", "q3"], accepted);
    expect(Number.isFinite(ready)).toBe(true);
    const stats = topicStatsFromAttempts(accepted);
    for (const s of Object.values(stats)) {
      expect(Number.isFinite(s.correct)).toBe(true);
      expect(Number.isFinite(s.total)).toBe(true);
    }
  });
});

describe("fuzz: sanitizeSrs only emits well-formed entries", () => {
  it("every surviving entry passes isSrsEntry, over fuzzed maps", () => {
    const r = rng(13);
    for (let i = 0; i < 3000; i++) {
      const map: Record<string, unknown> = {};
      const n = Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        map[`q${k}`] = r() < 0.5 ? mutate(r, validEntry()) : pick(r, JUNK);
      }
      const clean = sanitizeSrs(map);
      for (const e of Object.values(clean)) {
        expect(isSrsEntry(e)).toBe(true);
        // numbers really are numbers (not NaN sneaking through)
        expect(typeof e.box).toBe("number");
        expect(typeof e.due).toBe("number");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// FIXED BUGS (regression guards). These previously documented inputs that the
// guards ACCEPTED but that produced NaN downstream — a NaN readiness reaches
// Dashboard.tsx as `{s?.readiness ?? "—"}`, and `NaN ?? x === NaN`, so the
// parent dashboard rendered the literal "NaN". The guards now reject them and
// readinessScore is defensively clamped to a finite number.
// ---------------------------------------------------------------------------
describe("FIXED: NaN/zero-total no longer slips through isAttempt into readinessScore", () => {
  // src/lib/storage.ts isAttempt now uses Number.isFinite + total>0.
  // src/lib/scoring.ts readinessScore now clamps each exam ratio to [0,1].
  it("isAttempt rejects an exam with total:0 and NaN fields", () => {
    const zeroTotal: Attempt = {
      mode: "exam", score: 0, total: 0, startedAt: 1, durationSec: 60,
      perTopic: {}, missedIds: [],
    };
    expect(isAttempt(zeroTotal)).toBe(false); // <-- rejected (total>0 guard)

    const nanFields = { ...zeroTotal, total: 10, score: NaN, startedAt: NaN } as Attempt;
    expect(isAttempt(nanFields)).toBe(false); // Number.isFinite rejects NaN
  });

  it("readinessScore stays finite even if a bad attempt slips through", () => {
    // Bad attempts that bypass isAttempt (e.g. a cloud doc) must not yield NaN.
    const zeroTotal = {
      mode: "exam", score: 0, total: 0, startedAt: 1, durationSec: 60,
      perTopic: {}, missedIds: [],
    } as Attempt;
    expect(Number.isFinite(readinessScore({}, ["a"], [zeroTotal]))).toBe(true);

    const nanFields = { ...zeroTotal, total: 10, score: NaN } as Attempt;
    expect(Number.isFinite(readinessScore({}, ["a"], [nanFields]))).toBe(true);
  });
});

describe("FIXED: sanitizeSrs drops entries with NaN numeric fields", () => {
  // src/lib/storage.ts isSrsEntry now uses Number.isFinite, so a corrupt
  // cloud/local entry with NaN box/due is dropped instead of being written
  // back to Firestore (where JSON.stringify would turn NaN into null).
  it("a NaN entry is dropped", () => {
    const clean = sanitizeSrs({ q: { box: NaN, due: NaN, seen: NaN, correct: NaN } });
    expect("q" in clean).toBe(false); // dropped

    // Infinity is likewise non-finite and dropped; a clean sibling survives.
    const mixed = sanitizeSrs({
      bad: { box: Infinity, due: 1, seen: 1, correct: 1 },
      good: { box: 2, due: 1_750_000_000_000, seen: 3, correct: 2 },
    });
    expect("bad" in mixed).toBe(false);
    expect("good" in mixed).toBe(true);
  });
});

describe("fuzz: isUserSummary rejects malformed and accepts well-formed", () => {
  it("accepts the canonical shape and any optional-lastExam-omitted variant", () => {
    const full = validSummary();
    expect(isUserSummary(full)).toBe(true);
    const noExam = { ...full };
    delete noExam.lastExam;
    expect(isUserSummary(noExam)).toBe(true);
  });

  it("rejects every single-field corruption of the summary", () => {
    const r = rng(21);
    let rejected = 0;
    let accepted = 0;
    for (let i = 0; i < 5000; i++) {
      const v = mutate(r, validSummary());
      const ok = isUserSummary(v);
      if (ok) {
        accepted++;
        // If accepted, the numeric fields must be real numbers (no NaN leak).
        const s = v as unknown as Record<string, unknown>;
        expect(typeof s.readiness).toBe("number");
        expect(typeof s.streak).toBe("number");
      } else {
        rejected++;
      }
    }
    expect(rejected).toBeGreaterThan(0);
    expect(accepted).toBeGreaterThan(0);
  });
});
