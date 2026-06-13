import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  dueCount,
  masteryFraction,
  mergeSrs,
  newEntry,
  recordAnswer,
  reviewQueue,
  REVIEW_SIZE,
} from "../src/lib/leitner";

const DAY = 86_400_000;
const NOW = 1_750_000_000_000;

describe("leitner", () => {
  it("new entries start in box 1, due immediately", () => {
    const e = newEntry(NOW);
    expect(e.box).toBe(1);
    expect(e.due).toBe(NOW);
  });

  it("correct answers move up one box and schedule the right interval", () => {
    let e = newEntry(NOW);
    e = recordAnswer(e, true, NOW); // -> box 2, due +1d
    expect(e.box).toBe(2);
    expect(e.due).toBe(NOW + 1 * DAY);
    e = recordAnswer(e, true, NOW); // -> box 3, due +3d
    expect(e.box).toBe(3);
    expect(e.due).toBe(NOW + 3 * DAY);
  });

  it("caps at box 5", () => {
    let e = newEntry(NOW);
    for (let i = 0; i < 10; i++) e = recordAnswer(e, true, NOW);
    expect(e.box).toBe(5);
    expect(e.due).toBe(NOW + 14 * DAY);
  });

  it("a wrong answer resets to box 1, due immediately", () => {
    let e = newEntry(NOW);
    for (let i = 0; i < 4; i++) e = recordAnswer(e, true, NOW);
    e = recordAnswer(e, false, NOW);
    expect(e.box).toBe(1);
    expect(e.due).toBe(NOW);
  });

  it("tracks seen/correct counts", () => {
    let e = newEntry(NOW);
    e = recordAnswer(e, true, NOW);
    e = recordAnswer(e, false, NOW);
    expect(e.seen).toBe(2);
    expect(e.correct).toBe(1);
  });

  it("dueCount counts seen-and-due only (unseen excluded)", () => {
    const state = {
      a: { box: 2, due: NOW + DAY, seen: 1, correct: 1 }, // not due
      b: { box: 1, due: NOW - 1, seen: 1, correct: 0 }, // due
    };
    expect(dueCount(state, ["a", "b", "c"], NOW)).toBe(1);
  });

  it("an entry due exactly now is due (the newEntry contract)", () => {
    const state = { a: newEntry(NOW) };
    expect(dueCount(state, ["a"], NOW)).toBe(1);
    expect(reviewQueue(state, [{ id: "a" }], NOW).map((q) => q.id)).toEqual(["a"]);
  });

  it("reviewQueue serves due questions most-fragile-box first, then unseen filler", () => {
    const state = {
      frag: { box: 1, due: NOW - 1, seen: 2, correct: 0 },
      solid: { box: 4, due: NOW, seen: 5, correct: 4 },
      later: { box: 2, due: NOW + DAY, seen: 1, correct: 1 },
    };
    const items = ["solid", "unseen1", "frag", "later", "unseen2"].map((id) => ({ id }));
    const queue = reviewQueue(state, items, NOW, 3, () => 0.5);
    expect(queue.map((q) => q.id).slice(0, 2)).toEqual(["frag", "solid"]);
    expect(queue).toHaveLength(3);
    expect(["unseen1", "unseen2"]).toContain(queue[2].id);
  });

  it("reviewQueue caps at REVIEW_SIZE by default", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `q${i}` }));
    expect(reviewQueue({}, items, NOW)).toHaveLength(REVIEW_SIZE);
    expect(REVIEW_SIZE).toBe(15);
  });

  it("mergeSrs keeps the entry with more history per id", () => {
    const a = {
      onlyA: { box: 2, due: NOW, seen: 1, correct: 1 },
      both: { box: 4, due: NOW + 7 * DAY, seen: 6, correct: 5 },
      tied: { box: 2, due: NOW + DAY, seen: 3, correct: 2 },
    };
    const b = {
      onlyB: { box: 3, due: NOW, seen: 2, correct: 2 },
      both: { box: 1, due: NOW, seen: 4, correct: 2 },
      tied: { box: 3, due: NOW + 3 * DAY, seen: 3, correct: 3 },
    };
    const m = mergeSrs(a, b);
    expect(m.onlyA).toEqual(a.onlyA);
    expect(m.onlyB).toEqual(b.onlyB);
    expect(m.both).toEqual(a.both); // higher seen wins
    expect(m.tied).toEqual(b.tied); // seen tied -> higher box wins
    // inputs untouched
    expect(a.both.seen).toBe(6);
    expect(Object.keys(a)).toHaveLength(3);
  });

  it("mergeSrs breaks a seen/box/due tie on the higher correct count", () => {
    // Same seen, box, and due on both sides: without the correct tie-break the
    // entry with the lower correct count would silently win and drop stats.
    const a = { q: { box: 2, due: NOW + DAY, seen: 4, correct: 1 } };
    const b = { q: { box: 2, due: NOW + DAY, seen: 4, correct: 3 } };
    expect(mergeSrs(a, b).q).toEqual(b.q); // b's higher correct wins
    expect(mergeSrs(b, a).q).toEqual(b.q); // order-independent
  });

  it("mergeSrs of a state with empty is identity", () => {
    const a = { x: { box: 2, due: NOW, seen: 1, correct: 1 } };
    expect(mergeSrs(a, {})).toEqual(a);
    expect(mergeSrs({}, a)).toEqual(a);
  });

  it("masteryFraction counts box >= 3, unseen as unmastered", () => {
    const state = {
      a: { box: 3, due: 0, seen: 3, correct: 3 },
      b: { box: 5, due: 0, seen: 9, correct: 9 },
      c: { box: 2, due: 0, seen: 1, correct: 1 },
    };
    expect(masteryFraction(state, ["a", "b", "c", "d"])).toBe(0.5);
  });

  it("applyAnswer is immutable", () => {
    const state = {};
    const next = applyAnswer(state, "q1", true, NOW);
    expect(state).toEqual({});
    expect(next.q1.box).toBe(2);
  });
});
