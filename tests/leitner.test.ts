import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  dueIds,
  masteryFraction,
  newEntry,
  recordAnswer,
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

  it("dueIds includes unseen and due questions only", () => {
    const state = {
      a: { box: 2, due: NOW + DAY, seen: 1, correct: 1 }, // not due
      b: { box: 1, due: NOW - 1, seen: 1, correct: 0 }, // due
    };
    expect(dueIds(state, ["a", "b", "c"], NOW)).toEqual(["b", "c"]);
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
