import { describe, expect, it } from "vitest";
import { studyStreak } from "../src/lib/streak";
import type { Attempt } from "../src/types";

const DAY = 86_400_000;
const NOW = new Date(2026, 5, 11, 18, 0, 0).getTime(); // local 6pm

const attempt = (ts: number): Attempt => ({
  mode: "drill",
  score: 5,
  total: 10,
  startedAt: ts,
  durationSec: 60,
  perTopic: {},
  missedIds: [],
});

describe("studyStreak", () => {
  it("is 0 with no attempts", () => {
    expect(studyStreak([], NOW)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const attempts = [attempt(NOW - 2 * DAY), attempt(NOW - DAY), attempt(NOW - 3600_000)];
    expect(studyStreak(attempts, NOW)).toBe(3);
  });

  it("doesn't break the streak if today has no session yet", () => {
    const attempts = [attempt(NOW - 2 * DAY), attempt(NOW - DAY)];
    expect(studyStreak(attempts, NOW)).toBe(2);
  });

  it("a single attempt yesterday (and nothing else) is a streak of 1", () => {
    expect(studyStreak([attempt(NOW - DAY)], NOW)).toBe(1);
  });

  it("is 0 when the last session was 2+ days ago", () => {
    expect(studyStreak([attempt(NOW - 3 * DAY)], NOW)).toBe(0);
  });

  it("multiple sessions in one day count once", () => {
    const attempts = [attempt(NOW - 3600_000), attempt(NOW - 7200_000)];
    expect(studyStreak(attempts, NOW)).toBe(1);
  });

  it("a gap resets the streak", () => {
    const attempts = [attempt(NOW - 5 * DAY), attempt(NOW - DAY), attempt(NOW)];
    expect(studyStreak(attempts, NOW)).toBe(2);
  });
});
