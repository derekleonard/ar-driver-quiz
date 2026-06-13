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
