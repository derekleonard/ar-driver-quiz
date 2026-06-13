// Timezone/DST behavior of the streak day-keying. process.env.TZ changes
// affect subsequently-constructed Dates in Node, and vitest isolates test
// files in separate workers, so setting TZ here can't leak into other files.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studyStreak } from "../src/lib/streak";
import type { Attempt } from "../src/types";

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

// Europe/London is the dangerous zone: local midnight sits exactly on the
// UTC date line in winter, so DST changes used to collapse or skip day keys.
withTz("Europe/London", "studyStreak across DST", () => {
  it("spring-forward Sunday doesn't collapse two days into one", () => {
    // Clocks go forward Sun 2026-03-29 01:00 GMT -> 02:00 BST.
    const attempts = [at(2026, 2, 28), at(2026, 2, 29), at(2026, 2, 30)];
    expect(studyStreak(attempts, new Date(2026, 2, 30, 20).getTime())).toBe(3);
  });

  it("fall-back Sunday doesn't open a phantom gap", () => {
    // Clocks go back Sun 2026-10-25 02:00 BST -> 01:00 GMT.
    const attempts = [at(2026, 9, 24), at(2026, 9, 25), at(2026, 9, 26)];
    expect(studyStreak(attempts, new Date(2026, 9, 26, 20).getTime())).toBe(3);
  });
});

withTz("America/Chicago", "studyStreak across DST", () => {
  it("US spring-forward weekend counts every day", () => {
    // Clocks go forward Sun 2026-03-08 02:00 CST -> 03:00 CDT.
    const attempts = [at(2026, 2, 7), at(2026, 2, 8), at(2026, 2, 9)];
    expect(studyStreak(attempts, new Date(2026, 2, 9, 20).getTime())).toBe(3);
  });

  it("US fall-back weekend counts every day", () => {
    // Clocks go back Sun 2026-11-01 02:00 CDT -> 01:00 CST.
    const attempts = [at(2026, 9, 31), at(2026, 10, 1), at(2026, 10, 2)];
    expect(studyStreak(attempts, new Date(2026, 10, 2, 20).getTime())).toBe(3);
  });

  it("late-night vs early-morning sessions key to their local dates", () => {
    // 11:30pm Tuesday and 6:00am Wednesday are different (consecutive) days.
    const attempts = [at(2026, 5, 9, 23), at(2026, 5, 10, 6)];
    expect(studyStreak(attempts, new Date(2026, 5, 10, 7).getTime())).toBe(2);
  });
});
