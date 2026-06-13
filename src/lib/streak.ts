import type { Attempt } from "../types";

const DAY_MS = 86_400_000;

function dayKey(ts: number): number {
  // Map the LOCAL calendar date through Date.UTC so day arithmetic is exact.
  // Flooring local-midnight epoch ms misbehaves on DST-change days in zones
  // where local midnight crosses the UTC date line (e.g. Europe/London):
  // spring-forward collapses two days into one key, fall-back skips a key.
  const d = new Date(ts);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/**
 * Freshness-aware streak for the parent dashboard. `stored` was computed at
 * the kid's LAST session (summaries are written only then), so it goes stale:
 * a "5-day streak" written Monday would still read 5 on Friday. `lastActive`
 * is bumped on every summary write; once more than one calendar day has
 * passed since then, the streak is over — show 0, not the stale value.
 * (lastActive is also bumped at sign-in without a session, so a stale value
 * can briefly survive a kid who logs in but never finishes a quiz — still
 * strictly fresher than the raw stored number.)
 */
export function displayStreak(
  stored: number,
  lastActive: number | null,
  now: number,
): number {
  if (lastActive === null) return 0;
  return dayKey(now) - dayKey(lastActive) > 1 ? 0 : stored;
}

/**
 * Consecutive calendar days with at least one attempt, ending today or
 * yesterday (so the streak isn't broken before the day's study session).
 */
export function studyStreak(attempts: Attempt[], now: number): number {
  if (attempts.length === 0) return 0;
  const days = new Set(attempts.map((a) => dayKey(a.startedAt)));
  const today = dayKey(now);
  let cursor = days.has(today) ? today : days.has(today - 1) ? today - 1 : -1;
  if (cursor === -1) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}
