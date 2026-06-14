import { describe, expect, it } from "vitest";
import { shuffle, shuffleChoices } from "../src/lib/shuffle";
import type { Question } from "../src/types";

/** Deterministic PRNG (mulberry32) so shuffle tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("shuffle", () => {
  it("returns a permutation: same elements, same multiplicities", () => {
    const items = ["a", "b", "b", "c", "d", "e"];
    const out = shuffle(items, mulberry32(1));
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual([...items].sort());
  });

  it("does not mutate the input array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    shuffle(items, mulberry32(2));
    expect(items).toEqual(copy);
  });

  it("is deterministic for a given seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, mulberry32(42))).toEqual(shuffle(items, mulberry32(42)));
  });

  it("different seeds produce different orders (20 items)", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, mulberry32(1))).not.toEqual(shuffle(items, mulberry32(99)));
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([], mulberry32(3))).toEqual([]);
    expect(shuffle([7], mulberry32(3))).toEqual([7]);
  });

  it("visits every position: over many seeds each element appears first at least once", () => {
    // A correct Fisher–Yates can place any element in any slot. With 200
    // seeds over 4 items, every element should lead at least once; a biased
    // off-by-one implementation (e.g. never swapping index 0) fails this.
    const items = ["a", "b", "c", "d"];
    const firsts = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      firsts.add(shuffle(items, mulberry32(seed))[0]);
    }
    expect([...firsts].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

const Q: Question = {
  id: "q1",
  topic: "right-of-way",
  question: "Who yields?",
  choices: ["correct", "wrong-a", "wrong-b", "wrong-c"],
  answerIndex: 0,
  explanation: "because",
  citation: "p.1",
};

describe("shuffleChoices", () => {
  it("keeps answerIndex pointing at the same correct choice text", () => {
    // The whole point: render-time shuffle must never desync the answer from
    // its text, or the app would grade the wrong option.
    for (let seed = 0; seed < 200; seed++) {
      const out = shuffleChoices(Q, mulberry32(seed));
      expect(out.choices[out.answerIndex]).toBe("correct");
    }
  });

  it("preserves the full set of choices", () => {
    const out = shuffleChoices(Q, mulberry32(7));
    expect([...out.choices].sort()).toEqual([...Q.choices].sort());
  });

  it("does not mutate the input question", () => {
    const before = JSON.stringify(Q);
    shuffleChoices(Q, mulberry32(7));
    expect(JSON.stringify(Q)).toBe(before);
  });

  it("preserves all non-choice fields", () => {
    const out = shuffleChoices(Q, mulberry32(7));
    expect({ ...out, choices: null, answerIndex: null }).toEqual({
      ...Q,
      choices: null,
      answerIndex: null,
    });
  });

  it("spreads the correct answer across every position over many seeds", () => {
    // Defeats the historical 'answer is almost always index 1' tell: the
    // correct choice must be able to land in any slot.
    const landed = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      landed.add(shuffleChoices(Q, mulberry32(seed)).answerIndex);
    }
    expect([...landed].sort()).toEqual([0, 1, 2, 3]);
  });
});
