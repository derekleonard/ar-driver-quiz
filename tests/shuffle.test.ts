import { describe, expect, it } from "vitest";
import { shuffle } from "../src/lib/shuffle";

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
