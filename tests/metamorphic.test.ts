// Metamorphic / invariant tests for the pure libs. These assert algebraic
// properties (commutativity, idempotence, monotonicity, permutation, order-
// independence) that must hold for ALL inputs, exercised over many seeds —
// a violation is a real bug, not a fixture mismatch.
import { describe, expect, it } from "vitest";
import {
  BOX_INTERVALS_DAYS,
  MAX_BOX,
  mergeSrs,
  recordAnswer,
  newEntry,
} from "../src/lib/leitner";
import { shuffle } from "../src/lib/shuffle";
import { buildExam, EXAM_SIZE } from "../src/lib/examBuilder";
import { buildDiagnostic } from "../src/lib/diagnosticBuilder";
import { perTopicForAnswers } from "../src/lib/scoring";
import type { Question, SrsEntry, SrsState, Topic } from "../src/types";
import { TOPICS } from "../src/types";

// Small deterministic PRNG (mulberry32) so seeded runs are reproducible.
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

const NOW = 1_750_000_000_000;

function randomEntry(r: () => number): SrsEntry {
  const box = 1 + Math.floor(r() * MAX_BOX);
  return {
    box,
    due: NOW + Math.floor((r() - 0.5) * 30) * 86_400_000,
    seen: Math.floor(r() * 20),
    correct: Math.floor(r() * 20),
  };
}

function randomState(r: () => number, ids: string[]): SrsState {
  const out: SrsState = {};
  for (const id of ids) if (r() < 0.7) out[id] = randomEntry(r);
  return out;
}

const sortedKeys = (s: SrsState) => Object.keys(s).sort();

describe("metamorphic: leitner box transitions monotone within bounds", () => {
  it("box stays in [1, MAX_BOX] and correct moves up exactly 1, wrong resets to 1", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      let e = newEntry(NOW);
      for (let step = 0; step < 30; step++) {
        const before = e.box;
        const correct = r() < 0.5;
        e = recordAnswer(e, correct, NOW);
        expect(e.box).toBeGreaterThanOrEqual(1);
        expect(e.box).toBeLessThanOrEqual(MAX_BOX);
        if (correct) {
          // monotone up by exactly 1 unless already capped
          expect(e.box).toBe(Math.min(before + 1, MAX_BOX));
          expect(e.box).toBeGreaterThanOrEqual(before);
        } else {
          expect(e.box).toBe(1);
        }
        // due is always derived from the box interval, never negative offset
        expect(e.due).toBe(NOW + BOX_INTERVALS_DAYS[e.box] * 86_400_000);
        // seen is strictly monotone increasing
        expect(e.seen).toBe(step + 1);
        // correct never exceeds seen
        expect(e.correct).toBeLessThanOrEqual(e.seen);
      }
    }
  });
});

describe("metamorphic: mergeSrs algebraic properties", () => {
  const ids = ["q0", "q1", "q2", "q3", "q4", "q5"];

  it("idempotent: merge(a, a) === a", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = randomState(rng(seed), ids);
      expect(mergeSrs(a, a)).toEqual(a);
    }
  });

  it("commutative on tracked fields: merge(a, b) === merge(b, a)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const a = randomState(r, ids);
      const b = randomState(r, ids);
      const ab = mergeSrs(a, b);
      const ba = mergeSrs(b, a);
      // Same key set
      expect(sortedKeys(ab)).toEqual(sortedKeys(ba));
      // Same chosen entry per id (the ordering tie-break must be symmetric)
      for (const id of sortedKeys(ab)) {
        expect(ab[id]).toEqual(ba[id]);
      }
    }
  });

  it("associative: merge(merge(a,b),c) === merge(a,merge(b,c))", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const a = randomState(r, ids);
      const b = randomState(r, ids);
      const c = randomState(r, ids);
      const left = mergeSrs(mergeSrs(a, b), c);
      const right = mergeSrs(a, mergeSrs(b, c));
      expect(sortedKeys(left)).toEqual(sortedKeys(right));
      for (const id of sortedKeys(left)) expect(left[id]).toEqual(right[id]);
    }
  });

  it("merge never invents or drops ids: keys(merge(a,b)) === keys(a) ∪ keys(b)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const a = randomState(r, ids);
      const b = randomState(r, ids);
      const union = new Set([...Object.keys(a), ...Object.keys(b)]);
      expect(sortedKeys(mergeSrs(a, b))).toEqual([...union].sort());
    }
  });
});

describe("metamorphic: shuffle is a permutation", () => {
  it("preserves multiset (no loss, no dup) over many seeds and lengths", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const len = Math.floor(r() * 50);
      const input = Array.from({ length: len }, (_, i) => i);
      const out = shuffle(input, rng(seed * 7 + 1));
      expect(out.length).toBe(input.length);
      expect([...out].sort((a, b) => a - b)).toEqual(input);
    }
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, rng(42));
    expect(input).toEqual(copy);
  });
});

// A synthetic bank big enough that every topic has surplus questions.
function makeBank(perTopic: number): Question[] {
  const bank: Question[] = [];
  for (const t of TOPICS) {
    for (let i = 0; i < perTopic; i++) {
      bank.push({
        id: `${t}-${i}`,
        topic: t as Topic,
        question: "q",
        choices: ["a", "b"],
        answerIndex: 0,
        explanation: "",
        citation: "",
      });
    }
  }
  return bank;
}

describe("metamorphic: exam/diagnostic builders are permutation-stable", () => {
  const bank = makeBank(20);

  it("buildExam always returns EXAM_SIZE distinct real bank questions", () => {
    const bankIds = new Set(bank.map((q) => q.id));
    for (let seed = 1; seed <= 200; seed++) {
      const exam = buildExam(bank, rng(seed));
      expect(exam.length).toBe(EXAM_SIZE);
      const ids = exam.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length); // no dups
      for (const id of ids) expect(bankIds.has(id)).toBe(true); // no invented
    }
  });

  it("buildDiagnostic returns distinct real questions, never duplicating", () => {
    const bankIds = new Set(bank.map((q) => q.id));
    for (let seed = 1; seed <= 200; seed++) {
      const diag = buildDiagnostic(bank, rng(seed));
      const ids = diag.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(bankIds.has(id)).toBe(true);
    }
  });
});

describe("metamorphic: exam scoring is order-independent", () => {
  it("score and perTopic totals are invariant under co-permutation of questions+answers", () => {
    const bank = makeBank(5);
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const qs = shuffle(bank, r).slice(0, 25);
      const answers = qs.map((q) => (r() < 0.5 ? q.answerIndex : 1 - q.answerIndex));
      const base = perTopicForAnswers(qs, answers);

      // Co-permute questions and their answers identically.
      const perm = shuffle(
        qs.map((_, i) => i),
        rng(seed * 13 + 3),
      );
      const qs2 = perm.map((i) => qs[i]);
      const ans2 = perm.map((i) => answers[i]);
      const reordered = perTopicForAnswers(qs2, ans2);

      expect(reordered.score).toBe(base.score);
      // perTopic aggregates are order-independent
      expect(reordered.perTopic).toEqual(base.perTopic);
      // missedIds is the same set (order may differ)
      expect([...reordered.missedIds].sort()).toEqual([...base.missedIds].sort());
    }
  });
});
