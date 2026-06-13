// Extended TZ + DST matrix for the day-keyed logic: studyStreak, displayStreak
// (the dashboard freshness window) and dueCount (the readiness/review window).
// Each invariant is asserted under US/Pacific and US/Eastern across a spring-
// forward and a fall-back weekend. process.env.TZ affects subsequently-
// constructed Dates in Node; vitest isolates files per worker so TZ can't leak.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { displayStreak, studyStreak } from "../src/lib/streak";
import { dueCount } from "../src/lib/leitner";
import type { Attempt, SrsState } from "../src/types";

const DAY = 86_400_000;

const attempt = (ts: number): Attempt => ({
  mode: "drill",
  score: 5,
  total: 10,
  startedAt: ts,
  durationSec: 60,
  perTopic: {},
  missedIds: [],
});
const at = (y: number, m: number, d: number, h = 18) =>
  attempt(new Date(y, m, d, h).getTime());

function withTz(tz: string, name: string, fn: () => void) {
  describe(`${name} (${tz})`, () => {
    const original = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });
    fn();
  });
}

// US DST 2026: spring forward Sun Mar 8 02:00, fall back Sun Nov 1 02:00.
for (const tz of ["America/Los_Angeles", "America/New_York"]) {
  withTz(tz, "studyStreak DST matrix", () => {
    it("spring-forward weekend counts every consecutive day (no skip)", () => {
      const attempts = [at(2026, 2, 7), at(2026, 2, 8), at(2026, 2, 9)];
      expect(studyStreak(attempts, new Date(2026, 2, 9, 20).getTime())).toBe(3);
    });

    it("fall-back weekend counts every consecutive day (no double-count collapse)", () => {
      const attempts = [at(2026, 9, 31), at(2026, 10, 1), at(2026, 10, 2)];
      expect(studyStreak(attempts, new Date(2026, 10, 2, 20).getTime())).toBe(3);
    });

    it("a gap during a DST weekend correctly breaks the streak", () => {
      // Studied Sat and Mon of spring-forward weekend but NOT Sunday.
      const attempts = [at(2026, 2, 7), at(2026, 2, 9)];
      // 'now' is Monday evening -> only Monday counts, Sunday gap stops it.
      expect(studyStreak(attempts, new Date(2026, 2, 9, 20).getTime())).toBe(1);
    });

    it("each calendar day is keyed exactly once even with multiple sessions", () => {
      const attempts = [
        at(2026, 2, 8, 1), // just after spring-forward gap (1am -> skipped to 3am)
        at(2026, 2, 8, 9),
        at(2026, 2, 8, 23),
      ];
      // All three are the same local day -> streak of 1, not 3.
      expect(studyStreak(attempts, new Date(2026, 2, 8, 23, 30).getTime())).toBe(1);
    });
  });

  withTz(tz, "displayStreak freshness window DST matrix", () => {
    it("keeps the stored streak when last active was today (across spring-forward)", () => {
      const lastActive = new Date(2026, 2, 8, 10).getTime();
      const now = new Date(2026, 2, 8, 22).getTime();
      expect(displayStreak(5, lastActive, now)).toBe(5);
    });

    it("keeps the stored streak when last active was yesterday (fall-back boundary)", () => {
      const lastActive = new Date(2026, 9, 31, 20).getTime(); // Sat
      const now = new Date(2026, 10, 1, 9).getTime(); // Sun (fall-back day)
      expect(displayStreak(5, lastActive, now)).toBe(5);
    });

    it("zeroes a stale streak when more than one day has passed (DST not a free pass)", () => {
      const lastActive = new Date(2026, 2, 6, 20).getTime(); // Fri
      const now = new Date(2026, 2, 9, 9).getTime(); // Mon after spring-forward
      expect(displayStreak(5, lastActive, now)).toBe(0);
    });
  });

  withTz(tz, "dueCount review window DST matrix", () => {
    it("an entry due at local-midnight-crossing instants is counted exactly once", () => {
      // due exactly now counts; one-ms-future does not.
      const now = new Date(2026, 2, 8, 2, 30).getTime(); // inside spring-forward gap mapping
      const state: SrsState = {
        a: { box: 1, due: now, seen: 1, correct: 0 }, // due now
        b: { box: 2, due: now + 1, seen: 1, correct: 1 }, // 1ms future
        c: { box: 1, due: now - DAY, seen: 1, correct: 0 }, // overdue
      };
      expect(dueCount(state, ["a", "b", "c"], now)).toBe(2);
    });
  });
}
